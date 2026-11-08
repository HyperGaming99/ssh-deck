// SFTP-Operationen auf einem ssh2-SFTP-Objekt. Reine Logik, kein Electron.
const fs = require('fs');
const path = require('path');

const call = (s, m, ...a) => new Promise((res, rej) => s[m](...a, (e, r) => (e ? rej(e) : res(r))));
const safeName = (n) => n && n !== '.' && n !== '..' && !n.includes('/') && !n.includes('\0');

async function list(sftp, dir) {
  const real = await call(sftp, 'realpath', dir);
  const entries = (await call(sftp, 'readdir', real)).map((e) => ({
    name: e.filename, dir: e.attrs.isDirectory(), size: e.attrs.size, mtime: e.attrs.mtime * 1000, mode: (e.attrs.mode || 0) & 0o777,
  }));
  entries.sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name));
  return { path: real, entries };
}

// Lädt Datei(en) oder Ordner (rekursiv) nach remoteDir hoch; optional mit Fortschritt und Abbruch (opts: { onProgress, signal }).
function scanLocal(localPath, signal) {
  if (signal?.aborted) throw new Error('Abgebrochen');
  const st = fs.statSync(localPath);
  if (!st.isDirectory()) return { bytes: st.size || 0, files: 1 };
  let bytes = 0, files = 0;
  for (const f of fs.readdirSync(localPath)) {
    const r = scanLocal(path.join(localPath, f), signal);
    bytes += r.bytes; files += r.files;
  }
  return { bytes, files };
}

async function scanRemote(sftp, remotePath, signal) {
  if (signal?.aborted) throw new Error('Abgebrochen');
  const st = await call(sftp, 'stat', remotePath);
  if (!st.isDirectory()) return { bytes: st.size || 0, files: 1 };
  let bytes = 0, files = 0;
  for (const e of await call(sftp, 'readdir', remotePath)) {
    if (!safeName(e.filename)) continue;
    const r = await scanRemote(sftp, path.posix.join(remotePath, e.filename), signal);
    bytes += r.bytes; files += r.files;
  }
  return { bytes, files };
}

function makeTracker(opts = {}, totalBytes = 0, filesTotal = 0) {
  const startedAt = Date.now();
  let transferredBytes = 0, filesDone = 0, currentFile = '', lastEmit = 0;
  const samples = [{ t: startedAt, b: 0 }];
  const emit = (force = false) => {
    if (!opts.onProgress) return;
    const now = Date.now();
    if (!force && now - lastEmit < 50) return;
    lastEmit = now;
    samples.push({ t: now, b: transferredBytes });
    while (samples.length > 2 && now - samples[0].t > 2500) samples.shift();
    const dt = (now - samples[0].t) / 1000;
    const db = transferredBytes - samples[0].b;
    const elapsed = (now - startedAt) / 1000;
    const speedBps = dt >= 0.2 ? db / dt : elapsed > 0.03 ? transferredBytes / elapsed : 0;
    const rem = Math.max(0, totalBytes - transferredBytes);
    const etaSeconds = speedBps > 0 ? Math.ceil(rem / speedBps) : null;
    const percent = totalBytes > 0 ? Math.min(100, Math.round((transferredBytes / totalBytes) * 100)) : filesTotal > 0 ? Math.min(100, Math.round((filesDone / filesTotal) * 100)) : 0;
    opts.onProgress({ transferredBytes, totalBytes, filesDone, filesTotal, currentFile, speedBps, etaSeconds, percent, elapsedMs: now - startedAt });
  };
  return {
    signal: opts.signal,
    startFile(name) { currentFile = name; emit(true); },
    addChunk(n) { transferredBytes += n; emit(false); },
    endFile() { filesDone++; emit(true); },
    done() { transferredBytes = Math.max(transferredBytes, totalBytes); filesDone = filesTotal; },
  };
}

// Schnelle, abbrechbare Dateiübertragung über sftp.open/write/read (16 parallele Blöcke à 32 KB, echter Netzwerk-Fortschritt).
function sftpPutFile(sftp, local, remote, size, tracker) {
  return new Promise((res, rej) => {
    if (tracker?.signal?.aborted) return rej(new Error('Abgebrochen'));
    let fd = null, handle = null, settled = false, offset = 0, written = 0, inflight = 0;
    const CHUNK = 32768, CONC = 16;

    const cleanup = (err) => {
      if (settled) return;
      settled = true;
      if (tracker?.signal) tracker.signal.removeEventListener('abort', onAbort);
      if (fd !== null) { try { fs.closeSync(fd); } catch {} fd = null; }
      const finishClose = () => {
        if (err) call(sftp, 'unlink', remote).catch(() => {}).finally(() => rej(err));
        else res();
      };
      if (handle) { const h = handle; handle = null; sftp.close(h, () => finishClose()); }
      else finishClose();
    };
    const onAbort = () => cleanup(new Error('Abgebrochen'));
    if (tracker?.signal) tracker.signal.addEventListener('abort', onAbort, { once: true });

    try { fd = fs.openSync(local, 'r'); } catch (e) { return cleanup(e); }
    sftp.open(remote, 'w', (err, h) => {
      if (settled) { if (h) sftp.close(h, () => {}); return; }
      if (err) return cleanup(err);
      handle = h;
      if (size <= 0) return cleanup(null);
      pump();
    });

    function pump() {
      while (!settled && inflight < CONC && offset < size) {
        const len = Math.min(CHUNK, size - offset);
        const pos = offset;
        offset += len;
        inflight++;
        const buf = Buffer.allocUnsafe(len);
        let bytesRead = 0;
        try { bytesRead = fs.readSync(fd, buf, 0, len, pos); } catch (e) { return cleanup(e); }
        if (bytesRead <= 0) { inflight--; if (inflight === 0) cleanup(null); break; }
        sftp.write(handle, buf, 0, bytesRead, pos, (err) => {
          inflight--;
          if (settled) return;
          if (err) return cleanup(err);
          written += bytesRead;
          tracker?.addChunk(bytesRead);
          if (written >= size || (offset >= size && inflight === 0)) cleanup(null);
          else pump();
        });
      }
    }
  });
}

function sftpGetFile(sftp, remote, target, size, tracker) {
  return new Promise((res, rej) => {
    if (tracker?.signal?.aborted) return rej(new Error('Abgebrochen'));
    let fd = null, handle = null, settled = false, offset = 0, readTotal = 0, inflight = 0, eof = false;
    const CHUNK = 32768, CONC = 16;

    const cleanup = (err) => {
      if (settled) return;
      settled = true;
      if (tracker?.signal) tracker.signal.removeEventListener('abort', onAbort);
      if (fd !== null) { try { fs.closeSync(fd); } catch {} fd = null; }
      const finishClose = () => {
        if (err) { try { fs.rmSync(target, { force: true }); } catch {} rej(err); }
        else res();
      };
      if (handle) { const h = handle; handle = null; sftp.close(h, () => finishClose()); }
      else finishClose();
    };
    const onAbort = () => cleanup(new Error('Abgebrochen'));
    if (tracker?.signal) tracker.signal.addEventListener('abort', onAbort, { once: true });

    try { fd = fs.openSync(target, 'w'); } catch (e) { return cleanup(e); }
    sftp.open(remote, 'r', (err, h) => {
      if (settled) { if (h) sftp.close(h, () => {}); return; }
      if (err) return cleanup(err);
      handle = h;
      if (size <= 0) return cleanup(null);
      pump();
    });

    function pump() {
      while (!settled && !eof && inflight < CONC && offset < size) {
        const len = Math.min(CHUNK, size - offset);
        const pos = offset;
        offset += len;
        inflight++;
        const buf = Buffer.allocUnsafe(len);
        sftp.read(handle, buf, 0, len, pos, (err, bytesRead) => {
          inflight--;
          if (settled) return;
          if (err && (!bytesRead || bytesRead <= 0)) {
            if (err.code === 1) { eof = true; if (inflight === 0) cleanup(null); return; } // STATUS_CODE.EOF
            return cleanup(err);
          }
          if (!bytesRead || bytesRead <= 0) {
            eof = true;
            if (inflight === 0) cleanup(null);
            return;
          }
          try { fs.writeSync(fd, buf, 0, bytesRead, pos); } catch (e) { return cleanup(e); }
          readTotal += bytesRead;
          tracker?.addChunk(bytesRead);
          if (readTotal >= size || (offset >= size && inflight === 0)) cleanup(null);
          else pump();
        });
      }
    }
  });
}

function streamPipe(r, w, tracker, cleanup) {
  return new Promise((res, rej) => {
    if (tracker?.signal?.aborted) {
      r.destroy(); w.destroy();
      return Promise.resolve(cleanup?.()).catch(() => {}).then(() => rej(new Error('Abgebrochen')));
    }
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      if (tracker?.signal) tracker.signal.removeEventListener('abort', onAbort);
      if (err) {
        r.destroy(); w.destroy();
        Promise.resolve(cleanup?.()).catch(() => {}).then(() => rej(err));
      } else res();
    };
    const onAbort = () => finish(new Error('Abgebrochen'));
    if (tracker?.signal) tracker.signal.addEventListener('abort', onAbort, { once: true });
    r.on('data', (chunk) => {
      if (tracker?.signal?.aborted) return onAbort();
      tracker?.addChunk(chunk.length);
    });
    r.on('error', finish);
    w.on('error', finish);
    w.on('close', () => finish(null));
    r.pipe(w);
  });
}

async function uploadOne(sftp, local, remoteDir, tracker) {
  if (tracker?.signal?.aborted) throw new Error('Abgebrochen');
  const base = path.basename(local);
  const remote = path.posix.join(remoteDir, base);
  const st = fs.statSync(local);
  if (st.isDirectory()) {
    await call(sftp, 'mkdir', remote).catch(() => {}); // existiert evtl. schon
    for (const f of fs.readdirSync(local)) await uploadOne(sftp, path.join(local, f), remote, tracker);
  } else {
    tracker?.startFile(base);
    if (tracker && sftp.open && sftp.write) {
      await sftpPutFile(sftp, local, remote, st.size || 0, tracker);
    } else if (tracker && sftp.createWriteStream) {
      await streamPipe(fs.createReadStream(local), sftp.createWriteStream(remote), tracker, () => call(sftp, 'unlink', remote));
    } else {
      await call(sftp, 'fastPut', local, remote);
      tracker?.addChunk(st.size || 0);
    }
    tracker?.endFile();
  }
}

async function upload(sftp, local, remoteDir, opts) {
  const items = Array.isArray(local) ? local : [local];
  if (!opts) {
    for (const p of items) await uploadOne(sftp, p, remoteDir, null);
    return;
  }
  let totalBytes = 0, filesTotal = 0;
  for (const p of items) { const s = scanLocal(p, opts.signal); totalBytes += s.bytes; filesTotal += s.files; }
  const tracker = makeTracker(opts, totalBytes, filesTotal);
  for (const p of items) await uploadOne(sftp, p, remoteDir, tracker);
  tracker.done();
}

// Lädt Datei(en) oder Ordner (rekursiv) nach localDir herunter.
async function downloadOne(sftp, remote, localDir, tracker) {
  if (tracker?.signal?.aborted) throw new Error('Abgebrochen');
  const base = path.posix.basename(remote);
  const target = path.join(localDir, base);
  const st = await call(sftp, 'stat', remote);
  if (st.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const e of await call(sftp, 'readdir', remote)) {
      // Servergelieferte Namen nie als Pfad vertrauen (../ würde außerhalb von target schreiben)
      if (safeName(e.filename)) await downloadOne(sftp, path.posix.join(remote, e.filename), target, tracker);
    }
  } else {
    tracker?.startFile(base);
    if (tracker && sftp.open && sftp.read) {
      await sftpGetFile(sftp, remote, target, st.size || 0, tracker);
    } else if (tracker && sftp.createReadStream) {
      await streamPipe(sftp.createReadStream(remote), fs.createWriteStream(target), tracker, () => fs.rmSync(target, { force: true }));
    } else {
      await call(sftp, 'fastGet', remote, target);
      tracker?.addChunk(st.size || 0);
    }
    tracker?.endFile();
  }
}

async function download(sftp, remote, localDir, opts) {
  const items = Array.isArray(remote) ? remote : [remote];
  if (!opts) {
    for (const p of items) await downloadOne(sftp, p, localDir, null);
    return;
  }
  let totalBytes = 0, filesTotal = 0;
  for (const p of items) { const s = await scanRemote(sftp, p, opts.signal); totalBytes += s.bytes; filesTotal += s.files; }
  const tracker = makeTracker(opts, totalBytes, filesTotal);
  for (const p of items) await downloadOne(sftp, p, localDir, tracker);
  tracker.done();
}

// Kopiert Datei(en) oder Ordner (rekursiv) direkt von einem SFTP-Server auf einen anderen, ohne Zwischenspeicher.
async function copyOne(src, srcPath, dst, dstDir, tracker) {
  if (tracker?.signal?.aborted) throw new Error('Abgebrochen');
  const base = path.posix.basename(srcPath);
  const target = path.posix.join(dstDir, base);
  const st = await call(src, 'stat', srcPath);
  if (st.isDirectory()) {
    await call(dst, 'mkdir', target).catch(() => {});
    for (const e of await call(src, 'readdir', srcPath)) {
      if (safeName(e.filename)) await copyOne(src, path.posix.join(srcPath, e.filename), dst, target, tracker);
    }
  } else {
    tracker?.startFile(base);
    await streamPipe(src.createReadStream(srcPath), dst.createWriteStream(target), tracker, () => call(dst, 'unlink', target));
    tracker?.endFile();
  }
}

async function copy(src, srcPath, dst, dstDir, opts) {
  const items = Array.isArray(srcPath) ? srcPath : [srcPath];
  if (!opts) {
    for (const p of items) await copyOne(src, p, dst, dstDir, null);
    return;
  }
  let totalBytes = 0, filesTotal = 0;
  for (const p of items) { const s = await scanRemote(src, p, opts.signal); totalBytes += s.bytes; filesTotal += s.files; }
  const tracker = makeTracker(opts, totalBytes, filesTotal);
  for (const p of items) await copyOne(src, p, dst, dstDir, tracker);
  tracker.done();
}

async function remove(sftp, p) {
  if ((await call(sftp, 'lstat', p)).isDirectory()) {
    for (const e of await call(sftp, 'readdir', p)) if (safeName(e.filename)) await remove(sftp, path.posix.join(p, e.filename));
    await call(sftp, 'rmdir', p);
  } else {
    await call(sftp, 'unlink', p);
  }
}

// Schreibt eine lokale Datei an genau diesen Remote-Pfad (überschreibt).
const put = (sftp, local, remotePath) => call(sftp, 'fastPut', local, remotePath);
const mkdir = (sftp, p) => call(sftp, 'mkdir', p);
const rename = (sftp, a, b) => call(sftp, 'rename', a, b);
const chmod = (sftp, p, mode) => call(sftp, 'chmod', p, Number(mode) & 0o777);

const shQuote = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

// Baut den Shell-Befehl zum Packen (.tar.gz / .zip) ausgewählter Einträge in dir.
function archiveCmd(dir, names, format = 'tar.gz', outName = '') {
  const list = (Array.isArray(names) ? names : [names]).filter(Boolean);
  if (!list.length || !list.every(safeName)) throw new Error('Ungültiger Dateiname');
  const ext = format === 'zip' ? '.zip' : '.tar.gz';
  const base = outName || `${list.length === 1 ? list[0] : 'archive'}${ext}`;
  if (!safeName(base)) throw new Error('Ungültiger Dateiname');
  const args = list.map(shQuote).join(' ');
  if (format === 'zip') {
    return { outName: base, cmd: `cd ${shQuote(dir)} && (zip -rq ${shQuote(base)} -- ${args} 2>/dev/null || python3 -m zipfile -c ${shQuote(base)} ${args})` };
  }
  return { outName: base, cmd: `tar -czf ${shQuote(path.posix.join(dir, base))} -C ${shQuote(dir)} -- ${args}` };
}

// Baut den Shell-Befehl zum Entpacken eines Archivs (.tar.gz, .tgz, .tar, .zip) in dir.
function extractCmd(dir, name) {
  if (!safeName(name)) throw new Error('Ungültiger Dateiname');
  const full = path.posix.join(dir, name);
  if (/\.zip$/i.test(name)) {
    return `cd ${shQuote(dir)} && (unzip -oq ${shQuote(name)} 2>/dev/null || python3 -m zipfile -e ${shQuote(name)} .)`;
  }
  if (/\.(tar\.gz|tgz)$/i.test(name)) return `tar -xzf ${shQuote(full)} -C ${shQuote(dir)}`;
  if (/\.tar$/i.test(name)) return `tar -xf ${shQuote(full)} -C ${shQuote(dir)}`;
  throw new Error('Archivformat wird nicht unterstützt.');
}

// Verfügbare Laufwerke unter Windows ("C:\\", "D:\\", …)
function listDrives(exists = fs.existsSync) {
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `${l}:\\`).filter((d) => exists(d));
}

function listLocal(dir, home, { platform = process.platform, exists = fs.existsSync } = {}) {
  if (platform === 'win32' && dir === '::drives') {
    return { path: '::drives', entries: listDrives(exists).map((name) => ({ name, dir: true, size: 0, mtime: 0, mode: 0o755 })) };
  }
  const real = fs.realpathSync(path.resolve(dir || home));
  const entries = [];
  for (const d of fs.readdirSync(real, { withFileTypes: true })) {
    try {
      const st = fs.statSync(path.join(real, d.name));
      entries.push({ name: d.name, dir: st.isDirectory(), size: st.size, mtime: st.mtimeMs, mode: (st.mode || 0) & 0o777 });
    } catch { /* kaputter Symlink o. ä. */ }
  }
  entries.sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name));
  return { path: real, entries };
}

module.exports = { list, upload, download, copy, put, remove, mkdir, rename, chmod, archiveCmd, extractCmd, shQuote, listLocal, listDrives, safeName, scanLocal, scanRemote };
