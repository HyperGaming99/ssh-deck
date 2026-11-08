// Verbindungswege: Proxy-Kette (SOCKS4/5, wie proxychains im strict-Modus) und Cloudflare Tunnel (cloudflared). Kein Electron.
const { SocksClient } = require('socks');
const { spawn } = require('child_process');
const { Duplex } = require('stream');

// "socks5://user:pass@host:1080", "socks4://host:1080" oder "host:1080" (= SOCKS5), eine Zeile je Proxy, # = Kommentar
function parseProxies(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
    let u;
    try { u = new URL(/^[a-z0-9]+:\/\//i.test(l) ? l : 'socks5://' + l); } catch { throw new Error(`Proxy ungültig: ${l}`); }
    const type = { 'socks5:': 5, 'socks5h:': 5, 'socks4:': 4, 'socks4a:': 4 }[u.protocol];
    if (!type) throw new Error(`Proxy-Art nicht unterstützt (nur SOCKS4/SOCKS5): ${l}`);
    if (!u.hostname) throw new Error(`Proxy ungültig: ${l}`);
    return { host: u.hostname.replace(/^\[|\]$/g, ''), port: +u.port || 1080, type, ...(u.username && { userId: decodeURIComponent(u.username) }), ...(u.password && { password: decodeURIComponent(u.password) }) };
  });
}

// TCP-Verbindung zu host:port über die ganze Kette; der Hostname geht unaufgelöst an den letzten Proxy
async function chainSocket(proxies, host, port) {
  const { socket } = await SocksClient.createConnectionChain({ proxies, command: 'connect', destination: { host, port }, timeout: 30000 });
  return socket;
}

// Cloudflare Tunnel: `cloudflared access ssh --hostname <host>` überträgt stdin/stdout zum Server (wie ProxyCommand)
function cloudflared(hostname, bin = 'cloudflared') {
  return new Promise((res, rej) => {
    const p = spawn(bin, ['access', 'ssh', '--hostname', hostname], { stdio: ['pipe', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-500); });
    p.once('error', (e) => rej(new Error(e.code === 'ENOENT' ? 'cloudflared nicht gefunden (Cloudflare Tunnel braucht das Programm „cloudflared“).' : e.message)));
    p.once('spawn', () => {
      const s = Duplex.from({ readable: p.stdout, writable: p.stdin });
      s.once('close', () => p.kill());
      p.once('exit', (code) => { if (code) s.destroy(new Error(`cloudflared: ${err.trim().split('\n').pop() || 'Exit ' + code}`)); else s.destroy(); });
      res(s);
    });
  });
}

module.exports = { parseProxies, chainSocket, cloudflared };
