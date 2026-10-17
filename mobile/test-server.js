// Wegwerf-SSH-Server zum Testen der Handy-App: Benutzer "test", Passwort "test", Fantasie-Shell (kein Zugriff aufs System).
// node mobile/test-server.js [port]   (Standard 2222)
const { Server, utils } = require('ssh2');
const port = +process.argv[2] || 2222;
const { private: privateKey } = utils.generateKeyPairSync('ed25519');
const cmds = { whoami: () => 'test', hostname: () => 'ssh-deck-testserver', uname: () => 'Linux ssh-deck-testserver 6.0.0 x86_64 GNU/Linux', date: () => new Date().toString(), pwd: () => '/home/test', ls: () => 'Dokumente  Downloads  notizen.txt', help: () => 'Befehle: whoami hostname uname date pwd ls echo <text> clear exit' };

new Server({ hostKeys: [privateKey] }, (client) => {
  client.on('authentication', (ctx) => (ctx.method === 'password' && ctx.username === 'test' && ctx.password === 'test' ? ctx.accept() : ctx.reject(['password'])));
  client.on('ready', () => client.on('session', (accept) => {
    const s = accept();
    s.on('pty', (a) => a && a()).on('window-change', (a) => a && a());
    s.on('shell', (a) => {
      const ch = a(); let line = '', pos = 0, esc = '', hi = -1; const hist = [];
      const prompt = () => ch.write('\x1b[32mtest@ssh-deck-testserver\x1b[0m:\x1b[34m~\x1b[0m$ ');
      const redraw = () => ch.write('\r\x1b[K' + '\x1b[32mtest@ssh-deck-testserver\x1b[0m:\x1b[34m~\x1b[0m$ ' + line + (pos < line.length ? `\x1b[${line.length - pos}D` : ''));
      ch.write('Willkommen auf dem SSH-Deck-Testserver. "help" zeigt die Befehle; Pfeile hoch/runter = Verlauf, links/rechts = Cursor.\r\n'); prompt();
      const run = () => {
        ch.write('\r\n'); const [cmd, ...rest] = line.trim().split(/\s+/);
        if (line.trim()) hist.push(line);
        hi = -1;
        if (cmd === 'exit') { ch.exit(0); return ch.end(); }
        if (cmd === 'clear') ch.write('\x1b[2J\x1b[H');
        else if (cmd === 'echo') ch.write(rest.join(' ') + '\r\n');
        else if (cmds[cmd]) ch.write(cmds[cmd]() + '\r\n');
        else if (cmd) ch.write(`${cmd}: Befehl nicht gefunden\r\n`);
        line = ''; pos = 0; prompt();
      };
      const key = (seq) => { // Escape-Folgen: Pfeile, Pos1/Ende, Entf
        if (seq === '[A' && hist.length) { hi = hi < 0 ? hist.length - 1 : Math.max(0, hi - 1); line = hist[hi]; pos = line.length; redraw(); }
        else if (seq === '[B') { hi = hi < 0 ? -1 : hi + 1; line = hi >= 0 && hi < hist.length ? hist[hi] : ''; if (hi >= hist.length) hi = -1; pos = line.length; redraw(); }
        else if (seq === '[C' && pos < line.length) { pos++; ch.write('\x1b[C'); }
        else if (seq === '[D' && pos > 0) { pos--; ch.write('\x1b[D'); }
        else if (seq === '[H') { pos = 0; redraw(); } else if (seq === '[F') { pos = line.length; redraw(); }
        else if (seq === '[3~' && pos < line.length) { line = line.slice(0, pos) + line.slice(pos + 1); redraw(); }
      };
      ch.on('data', (d) => { for (const c of String(d)) {
        if (esc) { esc += c; if (esc.length === 2 && c !== '[') esc = ''; else if (esc.length > 2 && /[A-Za-z~]/.test(c)) { key(esc.slice(1)); esc = ''; } continue; } // Escape-Folge bis zum Endbuchstaben sammeln
        if (c === '\x1b') { esc = '\x1b'; continue; }
        if (c === '\r') run();
        else if (c === '\x7f') { if (pos > 0) { line = line.slice(0, pos - 1) + line.slice(pos); pos--; redraw(); } }
        else if (c === '\x03') { line = ''; pos = 0; ch.write('^C\r\n'); prompt(); }
        else if (c === '\t') { /* keine Vervollständigung */ }
        else if (c >= ' ') { line = line.slice(0, pos) + c + line.slice(pos); pos++; if (pos === line.length) ch.write(c); else redraw(); }
      } });
    });
    s.on('exec', (a) => { const ch = a(); ch.write('nicht unterstützt\n'); ch.exit(1); ch.end(); });
  })).on('error', () => {});
}).listen(port, '0.0.0.0', () => console.log(`Testserver läuft auf Port ${port} (Benutzer test, Passwort test)`));
