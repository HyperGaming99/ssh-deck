// Tor/SOCKS5-Anbindung. Reine Logik, kein Electron.
const net = require('net');
const { SocksClient } = require('socks');

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

module.exports = { isPrivateHost, socksSocket };
