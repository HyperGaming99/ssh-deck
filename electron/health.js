// Health- & Latenz-Check für Server (TCP-Connect auf den Zielport)
const net = require('net');

function pingHost(h, timeout = 3000) {
  return new Promise((resolve) => {
    const host = (h?.host || '').trim();
    const port = Number(h?.port) || (h?.protocol === 'telnet' ? 23 : 22);
    if (!host) {
      return resolve({ id: h?.id, online: false, ms: null, error: 'no host', at: Date.now() });
    }

    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (online, error = null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      const ms = Date.now() - start;
      resolve({ id: h.id, online, ms: online ? ms : null, error, at: Date.now() });
    };

    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false, 'timeout'));
    socket.once('error', (err) => finish(false, err.code || err.message));

    try {
      socket.connect(port, host);
    } catch (err) {
      finish(false, err.message);
    }
  });
}

// Mehrere Hosts parallel mit Concurrency-Begrenzung prüfen
async function pingHosts(list, concurrency = 5, timeout = 3000) {
  const results = {};
  const queue = [...list];

  const worker = async () => {
    while (queue.length > 0) {
      const h = queue.shift();
      if (!h || !h.id) continue;
      const res = await pingHost(h, timeout);
      results[h.id] = res;
    }
  };

  const pool = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker());
  await Promise.all(pool);
  return results;
}

module.exports = { pingHost, pingHosts };
