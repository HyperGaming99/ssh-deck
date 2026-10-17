// Nimmt für den zweiten Trailer (Terminal + Themes) die echte Oberfläche auf: trailer/shots2/*.png,
// dazu layout.js/json (Positionen für Mauszeiger) und themes.js (Farben fürs Terminal-Overlay).
// Start: npx electron trailer/capture2.js --no-sandbox
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = path.join(__dirname, 'shots2');
app.commandLine.appendSwitch('force-device-scale-factor', '1.5');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'deck-trailer2-')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Farben aus dem App-Code übernehmen (ES-Modul ohne Import-Zeilen, deshalb als Text auswerten)
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'termThemes.js'), 'utf8').replace(/export /g, '');
const TH = new Function(`${src}; return { THEMES, AUTO };`)();
fs.writeFileSync(path.join(__dirname, 'themes.js'), `window.TH = ${JSON.stringify(TH)};`);

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ width: 1920, height: 1080, useContentSize: true, show: false, frame: false, backgroundColor: '#0a0a0a',
    webPreferences: { preload: path.join(__dirname, 'stub-preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false, offscreen: true } });
  win.webContents.setFrameRate(30);
  const fresh = () => new Promise((r) => { const t = setTimeout(r, 1500); win.webContents.once('paint', () => { clearTimeout(t); r(); }); win.webContents.invalidate(); });
  const ex = async (js) => {
    const r = await win.webContents.executeJavaScript(`(async () => { try { return await (${js}); } catch (e) { return { __err: String(e && e.message || e) }; } })()`, true);
    if (r && r.__err) throw new Error(r.__err);
    return r;
  };
  const shot = async (name) => { await sleep(450); await fresh(); await fresh(); fs.writeFileSync(path.join(OUT, `${name}.png`), (await win.webContents.capturePage()).toPNG()); console.log(name); };
  // Rechteck (in 1920x1080-Koordinaten) des ersten Elements, dessen Text `text` enthält
  const rect = (text, sel = 'button') => ex(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.trim().includes(${JSON.stringify(text)}));
    if (!el) throw new Error('nicht gefunden: ' + ${JSON.stringify(text)}); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const click = (text, sel = 'button') => ex(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.trim().includes(${JSON.stringify(text)}));
    if (!el) throw new Error('nicht gefunden: ' + ${JSON.stringify(text)}); el.click(); return true; })()`);
  const emit = (d) => ex(`window.api.__demo.emit('s1', ${JSON.stringify(d)})`);
  const status = (s) => ex(`window.api.__demo.status('s1', ${JSON.stringify(s)})`);
  const L = { rows: {}, tabs: {} };

  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await ex("(() => { localStorage.setItem('lang','en'); localStorage.setItem('dark','1'); localStorage.setItem('skipLogin','1'); localStorage.setItem('sidebar','compact'); })()");
  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html')); await sleep(900);
  await ex("document.getElementById('splash')?.remove()"); await sleep(500);

  // 1) Hosts (Gruppe offen), dann verbinden mit Statusbildschirmen
  await click('Production', 'div.truncate'); await sleep(1600);
  await shot('hosts');
  L.hostCard = await rect('web-prod-01', 'div.truncate');
  await ex('window.api.__demo.setManual(true)');
  await click('web-prod-01', 'div.truncate'); await sleep(700);
  const info = { name: 'web-prod-01', host: 'web-prod-01.example.com', port: 22, autoIcon: 'ubuntu-linux' };
  await status({ state: 'connecting', info, log: ['Starting a new connection to: "web-prod-01.example.com" port "22"', 'Starting address resolution of "web-prod-01.example.com"', 'Address resolved to 203.0.113.42'] });
  await shot('c_log');
  await status({ state: 'ask', info, log: [], ask: { kind: 'hostkey', host: 'web-prod-01.example.com', port: 22, type: 'ssh-ed25519', fingerprint: 'SHA256:V9q3xYhK2mT8dPz1LwN4bRcF7eJ0aUoSgIiHtZkM5Xw' } });
  await shot('c_hk'); L.hkAdd = await rect('Add and continue'); L.hkContinue = await rect('Continue');
  await status({ state: 'ask', info, log: [], ask: { kind: 'key', alt: true, keys: [{ id: 'k1', name: 'deploy_ed25519' }, { id: 'k2', name: 'homelab_ed25519' }] } });
  await shot('c_key');
  await status({ state: 'ready', info, log: [] });
  await emit('root@web-prod-01:~# ');
  await sleep(500);

  // 2) Terminal-Fläche und Themes
  L.term = await ex(`(() => { const r = document.querySelector('.xterm').parentElement.getBoundingClientRect(); return { x: r.x - 8, y: r.y - 8, w: r.width + 16, h: r.height + 16 }; })()`);
  const THEMES = [['auto', 'Automatic'], ['tokyo', 'Tokyo Night'], ['dracula', 'Dracula'], ['nord', 'Nord'], ['gruvbox', 'Gruvbox Dark'], ['solarl', 'Solarized Light'],
    ['hackerg', 'Hacker Green'], ['monokai', 'Monokai'], ['onedark', 'One Dark'], ['hackerb', 'Hacker Blue']];
  for (const [id, name] of THEMES) { L.rows[id] = await rect(name); await click(name); await sleep(300); await shot(`th_${id}`); }
  await click('Tokyo Night'); await sleep(300);
  await shot('th_tokyo');
  L.fontRow = await rect('Font', 'button'); await click('Font', 'button'); await sleep(300);
  L.sizePlus = await ex(`(() => { const p = [...document.querySelectorAll('aside span')].find((e) => e.textContent === 'Font size').parentElement.querySelectorAll('button'); const r = p[1].getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  L.fontSelect = await ex(`(() => { const r = document.querySelector('aside [role=combobox]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  await shot('font');
  await click('Font', 'button'); await sleep(200);

  // 3) Befehle tippen (füllt den Verlauf), dann die Seitenleisten-Reiter
  await ex("document.querySelector('.xterm-helper-textarea').focus()");
  for (const cmd of ['ls -la', 'docker ps', 'git log --oneline']) {
    for (const ch of cmd) win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' }); await sleep(120);
  }
  for (const [id, title] of [['fwd', 'Forwarding'], ['snip', 'Snippets'], ['hist', 'History'], ['themes', 'Terminal themes']]) {
    L.tabs[id] = await ex(`(() => { const r = document.querySelector('aside button[title=${JSON.stringify(title)}]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  }
  for (const [id, title] of [['snip', 'Snippets'], ['hist', 'History'], ['fwd', 'Forwarding']]) {
    await ex(`document.querySelector('aside button[title=${JSON.stringify(title)}]').click()`); await sleep(300); await shot(`p_${id}`);
  }
  // Forwarding-Assistent: alle fünf Schritte mit ausgefüllten Werten (Art, Port, Zwischen-Host, Ziel, Name)
  const fillIn = (n, text) => ex(`(() => { const el = document.querySelectorAll('[role=dialog] input')[${n}]; if (!el) throw new Error('Eingabe fehlt: ${n}');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const dlgRect = (text) => ex(`(() => { const el = [...document.querySelectorAll('[role=dialog] button')].find((e) => e.textContent.trim() === ${JSON.stringify(text)}); if (!el) throw new Error('nicht gefunden: ' + ${JSON.stringify(text)});
    const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const dlgClick = (text) => ex(`(() => { [...document.querySelectorAll('[role=dialog] button')].find((e) => e.textContent.trim() === ${JSON.stringify(text)}).click(); return true; })()`);
  L.newFwd = await rect('New forwarding', 'aside button');
  await click('New forwarding', 'aside button'); await sleep(900); await shot('fw0');
  L.fwBtn = [await dlgRect('Continue')]; L.fwContinue = L.fwBtn[0];
  await dlgClick('Continue'); await sleep(500); await fillIn(0, '5432'); await sleep(200); await shot('fw1');
  L.fwBtn.push(await dlgRect('Continue')); await dlgClick('Continue'); await sleep(500);
  await ex(`document.querySelector('[role=dialog] [role=combobox]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }))`); await sleep(400);
  await ex(`(() => { const o = document.querySelectorAll('[role=option]'); (o[1] || o[0]).click(); return true; })()`); await sleep(500); await shot('fw2');
  L.fwBtn.push(await dlgRect('Continue')); await dlgClick('Continue'); await sleep(500);
  await fillIn(0, 'localhost'); await fillIn(1, '5432'); await sleep(200); await shot('fw3');
  L.fwBtn.push(await dlgRect('Continue')); await dlgClick('Continue'); await sleep(500);
  await fillIn(0, 'Postgres'); await sleep(200); await shot('fw4');
  L.fwBtn.push(await dlgRect('Done'));
  await ex("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");


  // 4) Rundgang durch die übrigen Bereiche (Fenster ohne Terminal-Theme)
  const fill = (placeholder, text) => ex(`(() => { const el = [...document.querySelectorAll('input')].find((e) => e.placeholder === ${JSON.stringify(placeholder)});
    if (!el) throw new Error('Feld fehlt: ' + ${JSON.stringify(placeholder)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const rectSel = (sel) => ex(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const esc = async () => { await ex("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))"); await sleep(600); };
  const T4 = {};
  await click('Hosts', 'header div.cursor-pointer'); await sleep(500);
  await click('All hosts'); await sleep(1600);
  await shot('hosts_all');
  T4.newHost = await rect('New host'); T4.importBtn = await rect('Import');
  await click('New host'); await sleep(700);
  await fill('Hostname or IP address', 'db2.example.com'); await fill('Name', 'db-replica'); await fill('Tags (comma-separated)', 'postgres, replica'); await fill('User', 'postgres');
  await shot('sheet'); await esc();
  await click('Import'); await sleep(700); await shot('import'); await esc();
  T4.plus = await rectSel('header button:has(svg.lucide-plus)');
  await ex(`document.querySelector('header button:has(svg.lucide-plus)').click()`); await sleep(500); await shot('newtab');
  await click('Hosts', 'header div.cursor-pointer'); await sleep(400);
  await click('Production', 'div.truncate'); await sleep(900);
  await ex(`(() => { const t = [...document.querySelectorAll('div.truncate')].find((e) => e.textContent.trim().startsWith('web-prod-01')); t.closest('.group').querySelector('button:has(svg.lucide-folder-open)').click(); return true; })()`);
  await sleep(1100);
  T4.sftpFrom = await rect('package.json', 'span'); T4.sftpTo = await rect('app.log', 'span');
  await click('package.json', 'span'); await click('app.log', 'span'); await shot('sftp');
  await click('Hosts', 'header div.cursor-pointer'); await sleep(400);
  await click('Keychain', 'nav button'); await sleep(500); await shot('keychain');
  T4.eye = await rectSel('main button:has(svg.lucide-eye-off)');
  await ex(`document.querySelector('main button:has(svg.lucide-eye-off)').click()`); await sleep(300); await shot('keychain_open');
  await ex(`document.querySelector('main button:has(svg.lucide-eye)').click()`); await sleep(300);
  await click('Known hosts', 'nav button'); await sleep(500); await shot('known');
  await click('Settings', 'nav button'); await sleep(500);
  T4.privacy = await rect('Privacy', 'aside button'); T4.language = await rect('Language', 'aside button');
  await click('Privacy', 'aside button'); await sleep(300); await click('Test connection'); await sleep(700); await shot('set_privacy');
  await click('Language', 'aside button'); await sleep(500); await shot('set_lang');
  // Neu: Darstellung (Animationen), Teams, Cloud-Schlüsselbund, Updates mit Versionswahl
  const NEW = {};
  await ex("window.api.__demo.setKcOn(true)");
  await ex("window.api.__demo.setTeams([{ id: 't1', name: 'Platform team', role: 'owner', members: 3 }, { id: 't2', name: 'Ops on-call', role: 'member', members: 5 }])"); await sleep(500);
  NEW.appearance = await rect('Appearance', 'aside button'); NEW.teams = await rect('Teams', 'aside button'); NEW.kc = await rect('Cloud keychain', 'aside button'); NEW.updates = await rect('Updates', 'aside button');
  await click('Appearance', 'aside button'); await sleep(500); await shot('set_app');
  // Schalter "Animationen" auf Aus: zweites Bild, damit man den Wechsel sieht (danach wieder an)
  const animBtn = (label) => ex(`(() => { const row = [...document.querySelectorAll('p')].find((e) => e.textContent.trim() === 'Animations').closest('div.rounded-xl'); [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}).click(); return true; })()`);
  NEW.animRow = await ex(`(() => { const el = [...document.querySelectorAll('p')].find((e) => e.textContent.trim() === 'Animations'); const r = el.closest('div.rounded-xl').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  NEW.animOff = await ex(`(() => { const row = [...document.querySelectorAll('p')].find((e) => e.textContent.trim() === 'Animations').closest('div.rounded-xl'); const b = [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Off'); const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  await animBtn('Off'); await sleep(400); await shot('set_app_off'); await animBtn('On'); await sleep(300);
  await click('Teams', 'aside button'); await sleep(700);
  try { NEW.teamRow = await rect('Platform team', 'button'); await click('Platform team', 'button'); } catch { NEW.teamRow = await rect('Platform team', 'div'); await click('Platform team', 'div'); }
  await sleep(900); await shot('set_teams');
  await click('Cloud keychain', 'aside button'); await sleep(700); await shot('set_kc');
  await click('Updates', 'aside button'); await sleep(1200); await shot('set_upd');
  NEW.vault = await rect('Personal', 'header button');
  await click('Hosts', 'nav button'); await sleep(600);
  await ex(`[...document.querySelectorAll('header button')].find((e) => e.textContent.trim().includes('Personal')).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }))`); await sleep(600); await shot('vault_menu');
  await ex("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))"); await sleep(400);
  await click('Settings', 'nav button'); await sleep(500);
  T4.NEW = NEW;
  await click('Hosts', 'nav button'); await sleep(600);
  T4.sun = await rectSel('[aria-label="Switch theme"]');
  await ex(`document.querySelector('[aria-label="Switch theme"]').click()`); await sleep(600); await shot('hosts_light');
  L.tour = T4;

  fs.writeFileSync(path.join(__dirname, 'layout.json'), JSON.stringify(L, null, 1));
  fs.writeFileSync(path.join(__dirname, 'layout.js'), `window.LAYOUT = ${JSON.stringify(L)};`);
  console.log('fertig'); app.quit();
}).catch((e) => { console.error('FEHLER', e); app.exit(1); });
