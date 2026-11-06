// Tor/SOCKS5-Anbindung inkl. integriertem Tor-Daemon (Trezor-Suite-Tor-Paket auf Desktop, libtor.so auf Android).
const fs = require('fs');
const net = require('net');
const tls = require('tls');
const http = require('http');
const https = require('https');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const { SocksClient } = require('socks');

// Trezor-Suite-Tor-Pakete (aus trezor/trezor-suite suite/app-assets/files/bin/tor/update.sh)
const CRX_VER = '1_0_48';
const CRX_LINUX_ARM_VER = '1_0_17';
const TREZOR_TOR_URLS = {
  'darwin-x64': `https://tor.bravesoftware.com/release/cldoidikboihgcjfkhdeidbpclkineef/extension_${CRX_VER}.crx`,
  'darwin-arm64': `https://tor.bravesoftware.com/release/cldoidikboihgcjfkhdeidbpclkineef/extension_${CRX_VER}.crx`,
  'linux-x64': `https://tor.bravesoftware.com/release/biahpgbdmdkfgndcmfiipgcebobojjkp/extension_${CRX_VER}.crx`,
  'linux-arm64': `https://tor.bravesoftware.com/release/monolafkoghdlanndjfeebmdfkbklejg/extension_${CRX_LINUX_ARM_VER}.crx`,
  'win32-x64': `https://tor.bravesoftware.com/release/cpoalefficncklhjfpglfiplenlpccdb/extension_${CRX_VER}.crx`,
};

// Direkt statt über Tor: lokale/private Ziele erreicht Tor nicht (und sie verlassen das eigene Netz ohnehin nicht).
function isPrivateHost(host) {
  const h = String(host).toLowerCase().replace(/^\[|\]$/g, '');
  if (h.endsWith('.onion')) return false;
  if (h === 'localhost' || /\.(localhost|local|lan|internal|home|home\.arpa)$/.test(h)) return true;
  if (!h.includes('.') && !h.includes(':')) return true; // einfache Namen wie "nas" lösen nur lokal auf
  if (net.isIPv4(h)) {
    const [a, b] = h.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (net.isIPv6(h)) return h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h);
  return false;
}

// TCP-Verbindung zu host:port über einen SOCKS5-Proxy. Der Hostname geht unaufgelöst an den Proxy (kein DNS-Leck).
async function socksSocket(proxy, host, port) {
  const { socket } = await SocksClient.createConnection({
    proxy: { host: proxy.host, port: proxy.port, type: 5 }, command: 'connect', destination: { host, port }, timeout: 30000,
  });
  return socket;
}

// Prüft schnell per TCP-Handshake, ob unter host:port bereits ein Dienst lauscht.
function probePort(host, port, timeoutMs = 600) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    const done = (ok) => { s.destroy(); resolve(ok); };
    s.setTimeout(timeoutMs, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

// Entpackt die eigenständige Tor-Binärdatei aus einem CRX3-Paket (12-Byte-Kopf + Header + ZIP).
function extractCrxTor(buf) {
  if (buf.length < 16 || buf.subarray(0, 4).toString() !== 'Cr24') throw new Error('Ungültiges Tor-CRX-Paket');
  const hdrLen = buf.readUInt32LE(8);
  const zip = buf.subarray(12 + hdrLen);
  let off = 0;
  while (off + 30 <= zip.length && zip.readUInt32LE(off) === 0x04034b50) {
    const method = zip.readUInt16LE(off + 8);
    const compSize = zip.readUInt32LE(off + 18);
    const nameLen = zip.readUInt16LE(off + 26);
    const extraLen = zip.readUInt16LE(off + 28);
    const name = zip.subarray(off + 30, off + 30 + nameLen).toString();
    const dataStart = off + 30 + nameLen + extraLen;
    const comp = zip.subarray(dataStart, dataStart + compSize);
    if (name.startsWith('tor-') && !name.endsWith('torrc')) {
      return method === 8 ? zlib.inflateRawSync(comp) : Buffer.from(comp);
    }
    off = dataStart + compSize;
  }
  throw new Error('Keine Tor-Binärdatei im CRX-Paket gefunden');
}

let binPromise = null;
async function ensureTorBinary(dataDir) {
  // Auf Android liefert NodeBridgePlugin den Pfad zur mitgelieferten libtor.so über DECK_TOR_BIN
  if (process.env.DECK_TOR_BIN && fs.existsSync(process.env.DECK_TOR_BIN)) return process.env.DECK_TOR_BIN;
  const torDir = path.join(dataDir, 'tor');
  const binName = process.platform === 'win32' ? 'tor.exe' : 'tor';
  const binPath = path.join(torDir, binName);
  if (fs.existsSync(binPath) && fs.statSync(binPath).size > 100000) return binPath;
  if (binPromise) return binPromise;
  binPromise = (async () => {
    const key = `${process.platform}-${process.arch}`;
    const url = TREZOR_TOR_URLS[key];
    if (!url) return 'tor'; // Fallback auf System-Tor
    fs.mkdirSync(torDir, { recursive: true });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Tor-Download fehlgeschlagen (${res.status})`);
    const raw = extractCrxTor(Buffer.from(await res.arrayBuffer()));
    const tmp = `${binPath}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, raw, { mode: 0o755 });
    fs.renameSync(tmp, binPath);
    if (process.platform !== 'win32') fs.chmodSync(binPath, 0o755);
    return binPath;
  })().finally(() => { binPromise = null; });
  return binPromise;
}

// Sucht einen freien lokalen TCP-Port, falls der Standardport 9050 bereits durch einen anderen Prozess belegt ist.
function findFreePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, host, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

let daemonProc = null;
let daemonPort = null;
let daemonPortFile = null;
let startPromise = null;

// Startet den integrierten Tor-Daemon (Trezor-Paket auf Desktop / libtor.so auf Android) und wartet bis "Bootstrapped 100%".
async function ensure(proxy = { host: '127.0.0.1', port: 9050 }, dataDir) {
  const host = proxy.host || '127.0.0.1';
  const port = +proxy.port || 9050;
  if (!dataDir || (host !== '127.0.0.1' && host !== 'localhost')) return { host, port };
  if (daemonProc && daemonPort && await probePort(host, daemonPort)) return { host, port: daemonPort };

  const workDir = path.join(dataDir, 'tor-data');
  const portFile = path.join(workDir, 'socks.port');
  try {
    const savedPort = +fs.readFileSync(portFile, 'utf8').trim();
    if (savedPort > 0 && await probePort(host, savedPort)) return { host, port: savedPort };
  } catch { /* noch kein laufender Daemon */ }

  if (startPromise) return startPromise;

  startPromise = (async () => {
    stop();
    const bin = await ensureTorBinary(dataDir);
    fs.mkdirSync(workDir, { recursive: true });
    try { fs.rmSync(path.join(workDir, 'lock'), { force: true }); } catch { /* egal */ }
    const listenPort = (await probePort(host, port)) ? await findFreePort(host) : port;
    daemonPort = listenPort;
    daemonPortFile = portFile;
    await new Promise((resolve, reject) => {
      const proc = spawn(bin, [
        '--SocksPort', `${host}:${listenPort}`,
        '--DataDirectory', workDir,
        '__OwningControllerProcess', String(process.pid),
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      daemonProc = proc;
      let settled = false;
      const finish = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        err ? reject(err) : resolve();
      };
      const timer = setTimeout(async () => {
        if (await probePort(host, listenPort)) finish();
        else finish(new Error('Zeitüberschreitung beim Starten von Tor'));
      }, 45000);
      const onOut = (chunk) => {
        const s = chunk.toString();
        if (s.includes('Bootstrapped 100%')) finish();
      };
      proc.stdout.on('data', onOut);
      proc.stderr.on('data', onOut);
      proc.once('error', (err) => {
        if (daemonProc === proc) daemonProc = null;
        finish(err);
      });
      proc.once('exit', (code) => {
        if (daemonProc === proc) daemonProc = null;
        if (!settled) finish(new Error(`Tor wurde vorzeitig beendet (Code ${code})`));
      });
    });
    try { fs.writeFileSync(portFile, String(listenPort)); } catch { /* egal */ }
    return { host, port: listenPort };
  })().finally(() => { startPromise = null; });

  return startPromise;
}

function stop() {
  if (daemonPortFile) {
    try { fs.rmSync(daemonPortFile, { force: true }); } catch { /* egal */ }
    daemonPortFile = null;
  }
  if (daemonProc) {
    try { daemonProc.kill(); } catch { /* egal */ }
    daemonProc = null;
    daemonPort = null;
  }
}

// HTTP/HTTPS-Request direkt über den SOCKS5-Proxy (funktioniert sowohl im Desktop-Hauptprozess als auch auf Android in nodejs-mobile).
async function socksFetch(proxy, url, init = {}, redirects = 3) {
  const u = new URL(url);
  const isHttps = u.protocol === 'https:';
  const port = +(u.port || (isHttps ? 443 : 80));
  const rawSock = await socksSocket(proxy, u.hostname, port);
  const agent = new (isHttps ? https.Agent : http.Agent)({ keepAlive: false });
  agent.createConnection = () => (isHttps ? tls.connect({ socket: rawSock, servername: u.hostname }) : rawSock);

  return new Promise((resolve, reject) => {
    const mod = isHttps ? https : http;
    const headers = { ...(init.headers || {}) };
    const body = init.body ? (Buffer.isBuffer(init.body) ? init.body : Buffer.from(String(init.body))) : null;
    if (body && !headers['content-length'] && !headers['Content-Length']) headers['Content-Length'] = body.length;
    const req = mod.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port,
      path: u.pathname + u.search,
      method: init.method || 'GET',
      headers,
      agent,
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        const nextUrl = new URL(res.headers.location, u).toString();
        socksFetch(proxy, nextUrl, init, redirects - 1).then(resolve, reject);
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const status = res.statusCode || 200;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          headers: { get: (k) => res.headers[String(k).toLowerCase()] || null },
          text: async () => buf.toString('utf8'),
          json: async () => JSON.parse(buf.toString('utf8')),
          arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        });
      });
    });
    req.setTimeout(30000, () => req.destroy(new Error('Tor-Zeitüberschreitung')));
    req.once('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

module.exports = { isPrivateHost, socksSocket, extractCrxTor, ensureTorBinary, ensure, stop, socksFetch };
