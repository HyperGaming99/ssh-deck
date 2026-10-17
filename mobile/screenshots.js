// Nimmt die Play-Store-Screenshots (Handy, 1080x1920) aus der echten Oberfläche mit Demodaten auf: mobile/shots/*.png
// Voraussetzung: npx vite build (dist/). Start: npx electron mobile/screenshots.js --no-sandbox
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = path.join(__dirname, 'shots');
app.commandLine.appendSwitch('force-device-scale-factor', '3');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'deck-shots-')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ width: 360, height: 640, useContentSize: true, show: false, frame: false, backgroundColor: '#0a0a0a',
    webPreferences: { preload: path.join(__dirname, 'screenshots-preload.js'), contextIsolation: true, sandbox: false, backgroundThrottling: false, offscreen: true } });
  win.webContents.setFrameRate(30);
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('KONSOLE', msg.slice(0, 220)); });
  const fresh = () => new Promise((r) => { const t = setTimeout(r, 1500); win.webContents.once('paint', () => { clearTimeout(t); r(); }); win.webContents.invalidate(); });
  const ex = async (js) => {
    const r = await win.webContents.executeJavaScript(`(async () => { try { return await (${js}); } catch (e) { return { __err: String(e && e.message || e) }; } })()`, true);
    if (r && r.__err) throw new Error(r.__err);
    return r;
  };
  const shot = async (name) => { await sleep(500); await fresh(); await fresh(); fs.writeFileSync(path.join(OUT, `${name}.png`), (await win.webContents.capturePage()).toPNG()); console.log(name); };
  const click = (text, sel = 'button') => ex(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => (e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent).trim().includes(${JSON.stringify(text)}));
    if (!el) throw new Error('nicht gefunden: ' + ${JSON.stringify(text)}); el.click(); return true; })()`);
  const emit = (d) => ex(`window.api.__demo.emit('s1', ${JSON.stringify(d)})`);
  const status = (s) => ex(`window.api.__demo.status('s1', ${JSON.stringify(s)})`);
  const type = async (text) => { for (const ch of text) win.webContents.sendInputEvent({ type: 'char', keyCode: ch }); await sleep(250); };
  const step = async (name, fn) => { try { await fn(); } catch (e) { console.log('FEHLER', name, e.message); } };

  const page = path.join(__dirname, '..', 'dist', 'index.html');
  await win.loadFile(page);
  await ex("(() => { localStorage.setItem('lang','en'); localStorage.setItem('dark','1'); localStorage.setItem('skipLogin','1'); })()");
  await win.loadFile(page); await sleep(1200);
  await ex("document.getElementById('splash')?.remove()"); await sleep(400);
  console.log('Seite:', JSON.stringify((await ex('document.body.innerText')).slice(0, 160)));
  console.log('mobile:', await ex('document.documentElement.dataset.mobile'), 'viewport', await ex('innerWidth + "x" + innerHeight'));

  if (process.env.EVAL) { await click('Keychain'); await sleep(900); console.log(JSON.stringify(await ex(process.env.EVAL), null, 1)); return app.quit(); } // Fehlersuche: JS in der Oberfläche auswerten
  await step('hosts', async () => { await click('Production', 'div.truncate'); await sleep(1400); await shot('1-hosts'); });
  const info = { name: 'web-prod-01', host: 'web-prod-01.example.com', port: 22, autoIcon: 'ubuntu-linux' };
  await step('hostkey', async () => {
    await ex('window.api.__demo.setManual(true)');
    await click('web-prod-01', 'div.truncate'); await sleep(700);
    await status({ state: 'ask', info, log: [], ask: { kind: 'hostkey', host: 'web-prod-01.example.com', port: 22, type: 'ssh-ed25519', fingerprint: 'SHA256:V9q3xYhK2mT8dPz1LwN4bRcF7eJ0aUoSgIiHtZkM5Xw' } });
    await shot('2-hostkey');
  });
  await step('terminal', async () => {
    const P = '\x1b[1;32mroot@web-prod-01\x1b[0m:\x1b[1;34m~\x1b[0m# ';
    await status({ state: 'ready', info, log: [] });
    await emit(P + 'uptime\r\n up 41 days,  3:22,  load: 0.08 0.11\r\n');
    await emit(P + 'docker ps\r\nIMAGE         STATUS       NAMES\r\nnginx:1.27    Up 3 days    web\r\npostgres:16   Up 3 days    db\r\n');
    await emit(P + 'df -h /\r\n/dev/sda1  80G  31G  46G  41%\r\n');
    await emit(P);
    await sleep(500); await shot('3-terminal');
  });
  await step('suggestions', async () => {
    await ex("document.querySelector('.xterm-helper-textarea').focus()");
    await type('git '); await emit('git '); await sleep(500); await shot('4-suggestions');
  });
  await step('panel', async () => {
    await click('side panel'); await sleep(500);
    await ex(`(() => { const b = [...document.querySelectorAll('aside button')].find((e) => /theme/i.test(e.getAttribute('title') || '')); b && b.click(); return !!b; })()`); await sleep(500);
    await shot('5-themes');
  });
  // frischer Start für die übrigen Ansichten
  await win.loadFile(page); await sleep(1200); await ex("document.getElementById('splash')?.remove()"); await sleep(400);
  await step('sftp', async () => {
    await click('Production', 'div.truncate'); await sleep(1200);
    await click('SFTP', 'button'); await sleep(1500); await shot('6-sftp');
  });
  await win.loadFile(page); await sleep(1200); await ex("document.getElementById('splash')?.remove()"); await sleep(400);
  for (const [file, label] of [['7-keychain', 'Keychain'], ['8-snippets', 'Snippets']]) {
    await step(label, async () => { await click(label); await sleep(1000); await shot(file); });
  }
  app.quit();
});
