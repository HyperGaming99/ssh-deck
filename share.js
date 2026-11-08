// Live-Terminal-Sharing: Erlaubt das Teilen einer SSH-Sitzung im lokalen Netzwerk / Web (Zuschauen oder Co-Working)
const http = require('http');
const crypto = require('crypto');
const os = require('os');

class ShareServer {
  constructor({ sid, getSession, title = 'SSH Deck' }) {
    this.sid = sid;
    this.getSession = getSession;
    this.title = title;
    this.token = crypto.randomBytes(16).toString('hex');
    this.interactive = false;
    this.clients = new Set();
    this.buffer = '';
    this.server = null;
    this.port = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const qToken = url.searchParams.get('token');

        if (qToken !== this.token) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('Ungültiges Token oder Zugriff verweigert.');
        }

        // Endpoint 1: SSE Stream für Terminalausgabe
        if (url.pathname === '/stream') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          });

          const initPayload = JSON.stringify({
            title: this.title,
            interactive: this.interactive,
            history: this.buffer,
          });
          res.write(`event: init\ndata: ${initPayload}\n\n`);

          this.clients.add(res);
          this.broadcastViewers();

          req.on('close', () => {
            this.clients.delete(res);
            this.broadcastViewers();
          });
          return;
        }

        // Endpoint 2: Eingaben bei interaktivem Modus
        if (url.pathname === '/input' && req.method === 'POST') {
          if (!this.interactive) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Nur-Lese-Modus' }));
          }

          let body = '';
          req.on('data', (chunk) => {
            if (body.length < 65536) body += chunk;
          });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              const data = parsed.data;
              const session = this.getSession(this.sid);
              if (session && session.stream && data) {
                session.stream.write(data);
              }
            } catch {
              /* ignore */
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          });
          return;
        }

        // Endpoint 3: Web-Terminal-Oberfläche
        if (url.pathname === '/' || url.pathname === '/index.html') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(this.renderHtml());
        }

        res.writeHead(404);
        res.end();
      });

      this.server.listen(0, '0.0.0.0', () => {
        this.port = this.server.address().port;
        resolve({
          port: this.port,
          token: this.token,
          urls: this.getUrls(),
          interactive: this.interactive,
          viewers: this.clients.size,
        });
      });
      this.server.on('error', reject);
    });
  }

  stop() {
    for (const client of this.clients) {
      try {
        client.write(`event: closed\ndata: {}\n\n`);
        client.end();
      } catch {}
    }
    this.clients.clear();
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  setInteractive(val) {
    this.interactive = !!val;
    for (const client of this.clients) {
      try {
        client.write(`event: mode\ndata: ${JSON.stringify({ interactive: this.interactive })}\n\n`);
      } catch {}
    }
  }

  broadcastViewers() {
    const count = this.clients.size;
    for (const client of this.clients) {
      try {
        client.write(`event: viewers\ndata: ${JSON.stringify({ count })}\n\n`);
      } catch {}
    }
  }

  writeOutput(data) {
    this.buffer = (this.buffer + data).slice(-65536);
    const payload = JSON.stringify({ data });
    for (const client of this.clients) {
      try {
        client.write(`event: data\ndata: ${payload}\n\n`);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  getUrls() {
    const interfaces = os.networkInterfaces();
    const urls = [];
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          urls.push({
            name,
            ip: net.address,
            url: `http://${net.address}:${this.port}/?token=${this.token}`,
          });
        }
      }
    }
    urls.push({
      name: 'localhost',
      ip: '127.0.0.1',
      url: `http://127.0.0.1:${this.port}/?token=${this.token}`,
    });
    return urls;
  }

  renderHtml() {
    const safeTitle = String(this.title || 'SSH Deck').replace(/[<>&"]/g, '');
    return `<!DOCTYPE html>
<html lang="de" class="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle} · SSH Deck Live</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #18181b;
      --border: #27272a;
      --text: #f4f4f5;
      --muted: #71717a;
      --primary: #3b82f6;
      --emerald: #10b981;
      --amber: #f59e0b;
      --rose: #f43f5e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    header {
      background: var(--card);
      border-bottom: 1px solid var(--border);
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      font-weight: 600;
    }
    .brand svg {
      width: 20px;
      height: 20px;
      fill: var(--primary);
    }
    .badges {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.05);
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--emerald);
      box-shadow: 0 0 8px var(--emerald);
    }
    .dot.paused {
      background: var(--amber);
      box-shadow: 0 0 8px var(--amber);
    }
    .dot.closed {
      background: var(--rose);
      box-shadow: 0 0 8px var(--rose);
    }
    #term-container {
      flex: 1;
      overflow: auto;
      padding: 16px;
      background: #000000;
    }
    #term {
      font-family: "JetBrains Mono", "Fira Code", Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-all;
      color: #e4e4e7;
    }
    #cursor {
      display: inline-block;
      width: 8px;
      height: 15px;
      background: var(--primary);
      vertical-align: text-bottom;
      animation: blink 1s step-end infinite;
    }
    @keyframes blink { 50% { opacity: 0; } }
    .status-bar {
      border-top: 1px solid var(--border);
      padding: 6px 16px;
      font-size: 11px;
      color: var(--muted);
      display: flex;
      justify-content: space-between;
      background: var(--card);
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <svg viewBox="0 0 24 24"><path d="M4 17l6-6-6-6M12 19h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span>${safeTitle}</span>
    </div>
    <div class="badges">
      <span class="badge"><span id="live-dot" class="dot"></span> <span id="status-text">Live</span></span>
      <span class="badge" id="mode-badge">Zuschauen</span>
      <span class="badge" id="viewers-badge">1 Zuschauer</span>
    </div>
  </header>
  <div id="term-container" tabindex="0">
    <div id="term"></div><span id="cursor"></span>
  </div>
  <div class="status-bar">
    <span id="info-left">Verbunden mit SSH Deck Live</span>
    <span id="info-right">Strg+L zum Leeren</span>
  </div>

  <script>
    const term = document.getElementById('term');
    const container = document.getElementById('term-container');
    const liveDot = document.getElementById('live-dot');
    const statusText = document.getElementById('status-text');
    const modeBadge = document.getElementById('mode-badge');
    const viewersBadge = document.getElementById('viewers-badge');
    const infoRight = document.getElementById('info-right');
    const token = new URLSearchParams(location.search).get('token') || '';

    let isInteractive = false;
    let fullOutput = '';

    // Ansi cleaner / basic colorizer
    function cleanAnsi(text) {
      return text.replace(/\\x1b\\[[0-9;]*[a-zA-Z]/g, '');
    }

    function appendText(chunk) {
      fullOutput += chunk;
      term.textContent = cleanAnsi(fullOutput);
      container.scrollTop = container.scrollHeight;
    }

    const es = new EventSource('/stream?token=' + encodeURIComponent(token));

    es.addEventListener('init', (e) => {
      try {
        const init = JSON.parse(e.data);
        isInteractive = !!init.interactive;
        updateMode(isInteractive);
        if (init.history) appendText(init.history);
      } catch (err) {}
    });

    es.addEventListener('data', (e) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed.data) appendText(parsed.data);
      } catch (err) {}
    });

    es.addEventListener('mode', (e) => {
      try {
        const parsed = JSON.parse(e.data);
        isInteractive = !!parsed.interactive;
        updateMode(isInteractive);
      } catch (err) {}
    });

    es.addEventListener('viewers', (e) => {
      try {
        const parsed = JSON.parse(e.data);
        viewersBadge.textContent = parsed.count + (parsed.count === 1 ? ' Zuschauer' : ' Zuschauer');
      } catch (err) {}
    });

    es.addEventListener('closed', () => {
      liveDot.className = 'dot closed';
      statusText.textContent = 'Beendet';
      infoRight.textContent = 'Freigabe durch Host beendet';
      es.close();
    });

    es.onerror = () => {
      liveDot.className = 'dot closed';
      statusText.textContent = 'Getrennt';
    };

    function updateMode(interactive) {
      if (interactive) {
        modeBadge.textContent = '⌨️ Paired Programming';
        modeBadge.style.color = '#38bdf8';
        infoRight.textContent = 'Tippe direkt in dieses Terminal';
      } else {
        modeBadge.textContent = '👁️ Nur Zuschauen';
        modeBadge.style.color = '';
        infoRight.textContent = 'Schreibgeschützte Ansicht';
      }
    }

    // Interactive input
    window.addEventListener('keydown', (e) => {
      if (!isInteractive) return;
      if (e.ctrlKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        fullOutput = '';
        term.textContent = '';
        return;
      }
      let toSend = '';
      if (e.key === 'Enter') toSend = '\\r';
      else if (e.key === 'Backspace') toSend = '\\x7f';
      else if (e.key === 'Tab') { e.preventDefault(); toSend = '\\t'; }
      else if (e.key === 'ArrowUp') toSend = '\\x1b[A';
      else if (e.key === 'ArrowDown') toSend = '\\x1b[B';
      else if (e.key === 'ArrowRight') toSend = '\\x1b[C';
      else if (e.key === 'ArrowLeft') toSend = '\\x1b[D';
      else if (e.ctrlKey && e.key.length === 1) {
        const code = e.key.charCodeAt(0) - 96;
        if (code >= 1 && code <= 26) toSend = String.fromCharCode(code);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
        toSend = e.key;
      }

      if (toSend) {
        fetch('/input?token=' + encodeURIComponent(token), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: toSend }),
        }).catch(() => {});
      }
    });

    container.focus();
  </script>
</body>
</html>`;
  }
}

class ShareManager {
  constructor() {
    this.servers = new Map(); // sid -> ShareServer
  }

  async start(sid, getSession, title) {
    if (this.servers.has(sid)) {
      this.servers.get(sid).stop();
      this.servers.delete(sid);
    }
    const srv = new ShareServer({ sid, getSession, title });
    const info = await srv.start();
    this.servers.set(sid, srv);
    return info;
  }

  stop(sid) {
    const srv = this.servers.get(sid);
    if (srv) {
      srv.stop();
      this.servers.delete(sid);
      return true;
    }
    return false;
  }

  setInteractive(sid, interactive) {
    const srv = this.servers.get(sid);
    if (srv) {
      srv.setInteractive(interactive);
      return true;
    }
    return false;
  }

  getStatus(sid) {
    const srv = this.servers.get(sid);
    if (!srv) return null;
    return {
      active: true,
      port: srv.port,
      token: srv.token,
      urls: srv.getUrls(),
      interactive: srv.interactive,
      viewers: srv.clients.size,
    };
  }

  writeOutput(sid, data) {
    const srv = this.servers.get(sid);
    if (srv) {
      srv.writeOutput(data);
    }
  }

  stopAll() {
    for (const srv of this.servers.values()) {
      srv.stop();
    }
    this.servers.clear();
  }
}

const shareManager = new ShareManager();

module.exports = {
  shareManager,
};
