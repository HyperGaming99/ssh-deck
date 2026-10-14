// SFTP-Operationen auf einem ssh2-SFTP-Objekt. Reine Logik, kein Electron.
const fs = require('fs');
const path = require('path');

const call = (s, m, ...a) => new Promise((res, rej) => s[m](...a, (e, r) => (e ? rej(e) : res(r))));
const safeName = (n) => n && n !== '.' && n !== '..' && !n.includes('/') && !n.includes('\0');

async function list(sftp, dir) {
  const real = await call(sftp, 'realpath', dir);
  const entries = (await call(sftp, 'readdir', real)).map((e) => ({
    name: e.filename, dir: e.attrs.isDirectory(), size: e.attrs.size, mtime: e.attrs.mtime * 1000,
  }));
  entries.sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name));
  return { path: real, entries };
}

// Lädt Datei oder Ordner (rekursiv) nach remoteDir hoch.
async function upload(sftp, local, remoteDir) {
  const remote = path.posix.join(remoteDir, path.basename(local));
  if (fs.statSync(local).isDirectory()) {
    await call(sftp, 'mkdir', remote).catch(() => {}); // existiert evtl. schon
    for (const f of fs.readdirSync(local)) await upload(sftp, path.join(local, f), remote);
  } else {
    await call(sftp, 'fastPut', local, remote);
  }
}

// Lädt Datei oder Ordner (rekursiv) nach localDir herunter.
async function download(sftp, remote, localDir) {
  const target = path.join(localDir, path.posix.basename(remote));
  if ((await call(sftp, 'stat', remote)).isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const e of await call(sftp, 'readdir', remote)) {
      // Servergelieferte Namen nie als Pfad vertrauen (../ würde außerhalb von target schreiben)
      if (safeName(e.filename)) await download(sftp, path.posix.join(remote, e.filename), target);
    }
  } else {
    await call(sftp, 'fastGet', remote, target);
  }
}

// Kopiert Datei oder Ordner (rekursiv) direkt von einem SFTP-Server auf einen anderen, ohne Zwischenspeicher.
async function copy(src, srcPath, dst, dstDir) {
  const target = path.posix.join(dstDir, path.posix.basename(srcPath));
  if ((await call(src, 'stat', srcPath)).isDirectory()) {
    await call(dst, 'mkdir', target).catch(() => {});
    for (const e of await call(src, 'readdir', srcPath)) {
      if (safeName(e.filename)) await copy(src, path.posix.join(srcPath, e.filename), dst, target);
    }
  } else {
    await new Promise((res, rej) => {
      const r = src.createReadStream(srcPath);
      const w = dst.createWriteStream(target);
      r.on('error', rej); w.on('error', rej); w.on('close', res);
      r.pipe(w);
    });
  }
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

// Verfügbare Laufwerke unter Windows ("C:\\", "D:\\", …)
function listDrives(exists = fs.existsSync) {
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `${l}:\\`).filter((d) => exists(d));
}

function listLocal(dir, home, { platform = process.platform, exists = fs.existsSync } = {}) {
  if (platform === 'win32' && dir === '::drives') {
    return { path: '::drives', entries: listDrives(exists).map((name) => ({ name, dir: true, size: 0, mtime: 0 })) };
  }
  const real = fs.realpathSync(path.resolve(dir || home));
  const entries = [];
  for (const d of fs.readdirSync(real, { withFileTypes: true })) {
    try {
      const st = fs.statSync(path.join(real, d.name));
      entries.push({ name: d.name, dir: st.isDirectory(), size: st.size, mtime: st.mtimeMs });
    } catch { /* kaputter Symlink o. ä. */ }
  }
  entries.sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name));
  return { path: real, entries };
}

module.exports = { list, upload, download, copy, put, remove, mkdir, rename, listLocal, listDrives, safeName };
