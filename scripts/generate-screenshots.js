const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DOCS = path.join(__dirname, '..', 'docs');
app.commandLine.appendSwitch('force-device-scale-factor', '1.5');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'deck-shots-desktop-')));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(DOCS, { recursive: true });

  const win = new BrowserWindow({
    width: 1400,
    height: 850,
    useContentSize: true,
    show: false,
    frame: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'screenshot-preload.js'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
      offscreen: true,
    },
  });

  win.webContents.setFrameRate(30);

  const fresh = () => new Promise((r) => {
    const t = setTimeout(r, 1200);
    win.webContents.once('paint', () => { clearTimeout(t); r(); });
    win.webContents.invalidate();
  });

  const ex = async (js) => {
    const r = await win.webContents.executeJavaScript(`(async () => { try { return await (${js}); } catch (e) { return { __err: String(e && e.message || e) }; } })()`, true);
    if (r && r.__err) throw new Error(r.__err);
    return r;
  };

  const shot = async (fileName) => {
    await sleep(400);
    await fresh();
    await fresh();
    const img = await win.webContents.capturePage();
    const jpg = img.toJPEG(92);
    fs.writeFileSync(path.join(DOCS, fileName), jpg);
    console.log('Saved:', fileName, `(${jpg.length} bytes)`);
  };

  const click = (text, sel = 'button') => ex(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => (e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent || '').trim().includes(${JSON.stringify(text)}));
    if (!el) throw new Error('Element nicht gefunden: ' + ${JSON.stringify(text)});
    el.click();
    return true;
  })()`);

  const setLocalStorage = (obj) => ex(`(() => {
    for (const [k, v] of Object.entries(${JSON.stringify(obj)})) localStorage.setItem(k, v);
  })()`);

  const page = path.join(__dirname, '..', 'dist', 'index.html');

  // Initialisiere mit Desktop-Standard
  await win.loadFile(page);
  await setLocalStorage({
    lang: 'en',
    dark: '1',
    skipLogin: '1',
    k8sFeature: '1', // Kubernetes Tab aktiv für Screenshots
    sidebar: 'wide',
  });
  await win.loadFile(page);
  await sleep(1500);
  await ex("document.getElementById('splash')?.remove()");
  await sleep(400);

  console.log('--- Generiere Desktop-Screenshots ---');

  // 1. Hosts View
  try {
    await click('Hosts');
    await sleep(800);
    await shot('hosts.jpg');
  } catch (e) { console.error('hosts error:', e.message); }

  // 2. Kubernetes View
  try {
    await click('Kubernetes');
    await sleep(1000);
    await shot('k8s.jpg');
  } catch (e) { console.error('k8s error:', e.message); }

  // 3. Keychain View
  try {
    await click('Keychain');
    await sleep(800);
    await shot('keychain.jpg');
  } catch (e) { console.error('keychain error:', e.message); }

  // 4. Port Forwarding
  try {
    await click('Forwarding');
    await sleep(800);
    await shot('forwarding.jpg');
  } catch (e) { console.error('forwarding error:', e.message); }

  // 5. Snippets View
  try {
    await click('Snippets');
    await sleep(800);
    await shot('snippets.jpg');
  } catch (e) { console.error('snippets error:', e.message); }

  // 6. Settings View
  try {
    await click('Settings');
    await sleep(800);
    await click('Features');
    await sleep(600);
    await shot('settings.jpg');
  } catch (e) { console.error('settings error:', e.message); }

  // 7. Teams View in Settings
  try {
    await click('Teams');
    await sleep(800);
    await shot('teams.jpg');
  } catch (e) { console.error('teams error:', e.message); }

  // 8. SFTP View
  try {
    await click('SFTP', 'div.mtabs div');
    await sleep(1200);
    await shot('sftp.jpg');
  } catch (e) { console.error('sftp error:', e.message); }

  // 9. Light Theme View
  try {
    await setLocalStorage({ dark: '0' });
    await win.loadFile(page);
    await sleep(1200);
    await ex("document.getElementById('splash')?.remove()");
    await click('Hosts');
    await sleep(600);
    await shot('themes-light.jpg');
  } catch (e) { console.error('light theme error:', e.message); }

  // 10. Dark Theme Terminal mit aktiver Session
  try {
    await setLocalStorage({ dark: '1' });
    await win.loadFile(page);
    await sleep(1200);
    await ex("document.getElementById('splash')?.remove()");
    // Klicke auf web-prod-01 um Terminal zu öffnen
    await click('web-prod-01', 'div.truncate');
    await sleep(1000);
    // Simuliere Ausgabe
    const P = '\x1b[1;32mdeploy@web-prod-01\x1b[0m:\x1b[1;34m/var/www/app\x1b[0m$ ';
    await ex(`window.api.__demo.emit('s1', ${JSON.stringify(
      P + 'uptime\r\n 02:27:00 up 45 days, 14:12,  2 users,  load average: 0.12, 0.08, 0.05\r\n' +
      P + 'docker ps\r\nCONTAINER ID   IMAGE          COMMAND                  CREATED        STATUS        PORTS                               NAMES\r\n8a7b9c1d2e3f   nginx:1.27     "/docker-entrypoint.…"   2 days ago     Up 2 days     0.0.0.0:80->80/tcp, :::80->80/tcp   nginx-proxy\r\n3d4e5f6a7b8c   node:22-slim   "docker-entrypoint.s…"   2 days ago     Up 2 days     0.0.0.0:3000->3000/tcp              app-backend\r\n' +
      P + 'git status\r\nOn branch main\r\nYour branch is up to date with \'origin/main\'.\r\nnothing to commit, working tree clean\r\n' +
      P
    )})`);
    await sleep(500);
    await shot('themes-dark.jpg');
  } catch (e) { console.error('terminal error:', e.message); }

  // 11. Connect Screen (Host Key Check)
  try {
    await win.loadFile(page);
    await sleep(1200);
    await ex("document.getElementById('splash')?.remove()");
    await click('db-primary', 'div.truncate');
    await sleep(400);
    await ex(`window.api.__demo.status('s1', {
      state: 'ask',
      info: { name: 'db-primary', host: 'db1.example.com', port: 22, autoIcon: 'postgresql' },
      log: ['Connecting to db1.example.com:22...', 'SSH identification string received: SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.5'],
      ask: { kind: 'hostkey', host: 'db1.example.com', port: 22, type: 'ssh-ed25519', fingerprint: 'SHA256:7mP4xYhK2mT8dPz1LwN4bRcF7eJ0aUoSgIiHtZkM9Qz' }
    })`);
    await sleep(600);
    await shot('connect.jpg');
  } catch (e) { console.error('connect screen error:', e.message); }

  // 12. Vault Switcher Dropdown
  try {
    await win.loadFile(page);
    await sleep(1200);
    await ex("document.getElementById('splash')?.remove()");
    await ex("document.querySelector('header button')?.click()");
    await sleep(500);
    await shot('vaults.jpg');
  } catch (e) { console.error('vaults error:', e.message); }

  console.log('--- Fertig! ---');
  app.quit();
});
