// Nimmt die echte Oberfläche (dist/) mit Demo-Daten auf und speichert Standbilder in trailer/shots/.
// Start: npx electron trailer/capture.js --no-sandbox
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = path.join(__dirname, 'shots');
app.commandLine.appendSwitch('force-device-scale-factor', '1.5'); // Aufnahmen in 2880x1620: scharf auch beim Heranzoomen
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'deck-trailer-'))); // nie die echten Daten anfassen
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: 1920, height: 1080, useContentSize: true, show: false, frame: false, backgroundColor: '#0a0a0a',
    webPreferences: { preload: path.join(__dirname, 'stub-preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false, offscreen: true },
  });
  // Fehler aus der Seite mit Text weiterreichen (js muss ein Ausdruck sein)
  win.webContents.setFrameRate(30);
  // Wartet auf einen frisch gezeichneten Frame (Offscreen-Rendering), damit die Aufnahme den aktuellen Stand zeigt
  const fresh = () => new Promise((r) => { const t = setTimeout(r, 1500); win.webContents.once('paint', () => { clearTimeout(t); r(); }); win.webContents.invalidate(); });
  const ex = async (js) => {
    const r = await win.webContents.executeJavaScript(`(async () => { try { return await (${js}); } catch (e) { return { __err: String(e && e.message || e) }; } })()`, true);
    if (r && r.__err) throw new Error(r.__err);
    return r;
  };
  const load = async () => { await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html')); await sleep(900); await ex("document.getElementById('splash')?.remove()"); await sleep(500); };
  const shot = async (name, rect) => {
    await sleep(450);
    await fresh(); await fresh();
    const img = await win.webContents.capturePage(rect);
    fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG());
    console.log(name, img.getSize().width + 'x' + img.getSize().height);
  };
  // Klickt das erste Element, dessen Text `text` enthält
  const click = (text, sel = 'button') => ex(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.trim().includes(${JSON.stringify(text)}));
    if (!el) throw new Error('nicht gefunden: ' + ${JSON.stringify(text)}); el.click(); return true; })()`);
  const fill = (placeholder, text) => ex(`(() => { const el = [...document.querySelectorAll('input')].find((e) => e.placeholder === ${JSON.stringify(placeholder)});
    if (!el) throw new Error('Feld fehlt: ' + ${JSON.stringify(placeholder)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const emit = (d) => ex(`window.api.__demo.emit('s1', ${JSON.stringify(d)})`);

  // Erststart: Sprache/Design/Login-Vorgaben setzen, dann neu laden
  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await ex("(() => { localStorage.setItem('lang','en'); localStorage.setItem('dark','1'); localStorage.setItem('skipLogin','1'); localStorage.setItem('sidebar','compact'); })()");
  await load();

  // 1) Hosts + Gruppen
  await shot('hosts');
  await click('Production', 'div.truncate');
  await sleep(1600); // Symbole der Karten (SVG) fertig laden lassen
  await shot('group');
  await click('All hosts');

  // 2) Neuer Host (Seitenpanel)
  await click('New host');
  await sleep(700);
  await fill('Hostname or IP address', 'db2.example.com');
  await fill('Name', 'db-replica');
  await fill('Tags (comma-separated)', 'postgres, replica');
  await fill('User', 'postgres');
  await shot('sheet');
  await ex("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await sleep(600);

  // 3) Terminal: echte Terminal-Komponente, Ausgabe wird eingespeist; feine Tipp-Zustände (alle 2 Zeichen) für flüssiges Tippen
  await click('Production', 'div.truncate'); // web-prod-01 liegt in dieser Gruppe
  await sleep(500);
  await click('web-prod-01', 'div.truncate');
  await sleep(900);
  const P = '\x1b[1;32mdeploy@web-prod-01\x1b[0m:\x1b[1;34m~\x1b[0m$ ';
  await emit('\x1b[2mLast login: Tue Oct 14 09:12:41 2026 from 203.0.113.9\x1b[0m\r\n\r\nWelcome to Ubuntu 24.04.2 LTS (GNU/Linux 6.8.0-48-generic x86_64)\r\n\r\n' + P);
  await shot('ty0');
  const typeCmd = async (tag, cmd, steps) => { // steps: Zeichenanzahlen, nach denen aufgenommen wird
    let at = 0;
    for (const n of steps) { await emit(cmd.slice(at, n)); at = n; await shot(`${tag}_${n}`); }
  };
  await typeCmd('ty1', 'systemctl status nginx', [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);
  await emit('\r\n\x1b[1;32m●\x1b[0m nginx.service - A high performance web server\r\n     Loaded: loaded (/lib/systemd/system/nginx.service; enabled)\r\n     Active: \x1b[1;32mactive (running)\x1b[0m since Mon 2026-10-13 21:04:11 UTC; 12h ago\r\n   Main PID: 1182 (nginx)\r\n      Tasks: 5 (limit: 9440)\r\n     Memory: 14.2M\r\n\r\n' + P);
  await shot('ty1_out');
  await typeCmd('ty2', 'docker ps', [2, 4, 6, 8, 9]);
  await emit('\r\nCONTAINER ID   IMAGE            STATUS          PORTS                  NAMES\r\n\x1b[1m3f9a1c2d8b11\x1b[0m   app:2026.10      Up 12 hours     0.0.0.0:8080->80/tcp   app\r\n\x1b[1m8c2e7a90f4d3\x1b[0m   postgres:16      Up 12 hours     5432/tcp               db\r\n\x1b[1m61bd0e5a7c92\x1b[0m   redis:7          Up 12 hours     6379/tcp               cache\r\n\r\n' + P);
  await shot('ty2_out');
  await typeCmd('ty3', 'tail -f /var/log/nginx/access.log', [6, 12, 18, 24, 30, 33]);
  await emit('\r\n');
  const lines = [['198.51.100.7', '/', 1307], ['198.51.100.12', '/api/v1/health', 1471], ['203.0.113.41', '/static/app.js', 1410], ['198.51.100.7', '/api/v1/hosts', 1818], ['203.0.113.9', '/favicon.ico', 1519]];
  let i = 0;
  for (const [ip, p, size] of lines) {
    i++;
    await emit(`\x1b[2m${ip}\x1b[0m - - [14/Oct/2026:09:2${i}:1${i + 2}] "GET ${p} HTTP/2.0" \x1b[1;32m200\x1b[0m ${size}\r\n`);
    await shot(`ty3_l${i}`);
  }

  // 4) SFTP aus der Host-Karte
  await click('Hosts', 'header div.cursor-pointer'); // zurück zur Übersicht
  await sleep(400);
  await ex(`(() => { const t = [...document.querySelectorAll('div.truncate')].find((e) => e.textContent.trim().startsWith('web-prod-01')); t.closest('.group').querySelector('button:has(svg.lucide-folder-open)').click(); })()`);
  await sleep(1100);
  console.log('Tabs:', JSON.stringify(await ex("document.querySelector('header').innerText")));
  await click('package.json', 'span');
  await click('app.log', 'span');
  await shot('sftp');

  // 5) Neuer Tab (Suche)
  await ex(`document.querySelector('header button:has(svg.lucide-plus)').click()`);
  await sleep(500);
  await shot('newtab');
  await click('Hosts', 'header div.cursor-pointer');
  await sleep(400);

  // 6) Seitenleiste: Keychain, Known Hosts, Snippets, Forwarding
  await click('Keychain', 'nav button'); await shot('keychain');
  await click('Known hosts', 'nav button'); await shot('known');
  await ex(`window.api.__demo.askHostKey({ id: 1, host: 'web-prod-01.example.com', port: 22, type: 'ssh-ed25519', fingerprint: 'SHA256:V9q3xYhK2mT8dPz1LwN4bRcF7eJ0aUoSgIiHtZkM5Xw' })`);
  await sleep(500); await shot('hostkey');
  await click('Cancel');
  await sleep(500);
  await ex(`window.api.__demo.askHostKey({ id: 2, host: 'db1.example.com', port: 22, type: 'ssh-ed25519', fingerprint: 'SHA256:Qm7LpA2sXcV9bT4nRkY1hEoJ6uZwDfG8iMt0aCxPq3U', old: 'SHA256:V9q3xYhK2mT8dPz1LwN4bRcF7eJ0aUoSgIiHtZkM5Xw' })`);
  await sleep(500); await shot('hostkey_changed');
  await click('Cancel');
  await sleep(500);
  await click('Snippets', 'nav button'); await shot('snippets');
  await click('Forwarding', 'nav button'); await shot('forwarding');

  // 7) Einstellungen
  await click('Settings', 'nav button'); await shot('settings_account');
  await click('Appearance', 'aside button'); await shot('settings_appearance');
  await click('Language', 'aside button'); await shot('settings_language');
  await click('Privacy', 'aside button');
  await sleep(300);
  await click('Test connection'); await sleep(700); await shot('settings_privacy');

  // 8) Helles Design
  await click('Hosts', 'nav button');
  await ex(`document.querySelector('[aria-label="Switch theme"]').click()`);
  await sleep(500); await shot('hosts_light');
  await ex(`document.querySelector('[aria-label="Switch theme"]').click()`);

  // 9) Spracheinrichtung (erster Start)
  await ex("localStorage.removeItem('lang')");
  await load();
  await shot('langsetup');

  win.destroy();
  app.quit();
}).catch((e) => { console.error('FEHLER', e); app.exit(1); });
