const { spawn } = require('child_process');
const { app, BrowserWindow, ipcMain, safeStorage, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const dns = require('dns');
const { Client } = require('ssh2');
const os = require('os');
const { hosts: makeHosts, keys: makeKeys, plain } = require('./store');
const keyTools = require('./keys');
const sftpTools = require('./sftp');
const editors = require('./editors');
const { osIcon } = require('./osicon');
const syncTools = require('./sync');
const torTools = require('./tor');
const knownTools = require('./known');
const importerTools = require('./importers');
const { createAuth } = require('./auth');
const updater = require('./updater');
const teamTools = require('./teams');
const kcTools = require('./keyvault');

const sessions = new Map(); // sid -> { conn, stream }
const sftps = new Map(); // sid -> { conn, sftp }
const edits = new Map(); // sid -> [{ watcher, dir }] geöffnete Remote-Dateien
const running = new Map(); // forward-id -> { conn, server }
let hosts, snippets, forwards, keys, groups, known, overrides;
let mainWin;
const crypt = {
  encrypt: (s) => safeStorage.encryptString(s).toString('base64'),
  decrypt: (s) => safeStorage.decryptString(Buffer.from(s, 'base64')),
};

// Geräte-Einstellungen (nicht gesynct), z. B. { editor: 'auto' | 'system' | 'code' | ... }
const readSettings = () => { try { return JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch { return {}; } };

// ---- Tor (optional): Sync und/oder Server-Verbindungen über einen lokalen SOCKS5-Proxy ----------------
// Kein Rückfall auf direkt: ist Tor an und nicht erreichbar, schlägt die Verbindung fehl. Lokale/private Ziele gehen direkt.
const torCfg = () => { const s = readSettings().tor || {}; return { sync: !!s.sync, servers: !!s.servers, host: s.host || '127.0.0.1', port: +s.port || 9050 }; };

// SSH-Verbindung; mit Tor über SOCKS5 (Hostname geht unaufgelöst an Tor)
function sshConnect(conn, cfg) {
  const tor = torCfg();
  if (!tor.servers || torTools.isPrivateHost(cfg.host)) return conn.connect(cfg);
  torTools.socksSocket(tor, cfg.host, cfg.port)
    .then((sock) => conn.connect({ ...cfg, sock }))
    .catch((e) => conn.emit('error', new Error(`Tor: ${e.message}`)));
}

// HTTP über Tor: eigene Sitzung mit festem SOCKS5-Proxy (Chromium löst Hostnamen beim Proxy auf)
async function torFetch(url, init) {
  const { host, port } = torCfg();
  const ses = session.fromPartition('tor-sync');
  await ses.setProxy({ proxyRules: `socks5://${host}:${port}` });
  return ses.fetch(url, init);
}
const backendOpts = (url) => (torCfg().sync && !torTools.isPrivateHost(new URL(url).hostname) ? { fetch: torFetch } : {});

// ---- Cloud-Sync ------------------------------------------------------------------------------------
// Gesynct werden Hosts (inkl. Passwörter), Gruppen, Snippets und Forwarding-Regeln; private Schlüssel nie.
const syncState = { status: 'off', lastSync: null, error: '', teamError: '', keychainError: '' }; // off | syncing | ok | error
let settingsFile, syncCfgFile, syncTimer, syncing = false, again = false;

const loadSyncCfg = () => { try { return JSON.parse(fs.readFileSync(syncCfgFile, 'utf8')); } catch { return null; } };
const saveSyncCfg = (c) => fs.writeFileSync(syncCfgFile, JSON.stringify(c), { mode: 0o600 });
const DEFAULT_SERVER = process.env.DECK_SERVER || 'http://localhost:8787';
const syncStatus = () => { const c = loadSyncCfg(); return { configured: !!c, email: c?.email, server: c?.server || DEFAULT_SERVER, ...syncState }; };
const send = (ch, ...a) => mainWin && !mainWin.isDestroyed() && mainWin.webContents.send(ch, ...a);
// Tresore: "personal" (Einträge ohne vault) und je Team ein eigener. Jeder Tresor wird für sich gesynct.
const stores = () => ({ hosts, groups, snippets, forwards, keys, known, overrides });
const vaultSnapshot = (v) => teamTools.snapshotVault(v, stores());
const applyVault = (v, s) => teamTools.applyVault(v, s, stores());
const snapshot = () => vaultSnapshot('personal'), applySnapshot = (s) => applyVault('personal', s);
const purgeVault = (v) => teamTools.purgeVault(v, stores());
const allSig = () => JSON.stringify([hosts.raw(), groups.raw(), snippets.raw(), forwards.raw(), keys.raw()]);

// ---- Teams (geteilte Tresore) ----
let teamsFile, kcFile;
const teamKeys = new Map(); // Teamschlüssel nur im Speicher; werden bei jedem Abgleich aus dem eingepackten Schlüssel des Servers geholt
const loadTeams = () => { try { return JSON.parse(fs.readFileSync(teamsFile, 'utf8')); } catch { return []; } };
const teamCtx = () => {
  const c = loadSyncCfg(); if (!c) return null;
  const ident = teamTools.identity(Buffer.from(crypt.decrypt(c.key), 'base64'));
  return { c, ident, api: new teamTools.TeamBackend(new syncTools.Backend({ url: c.server, token: crypt.decrypt(c.token) }, backendOpts(c.server))) };
};
async function refreshTeams(ctx) {
  const rows = await ctx.api.list();
  const out = rows.map((r) => {
    try { teamKeys.set(r.id, teamTools.keyOf(ctx.ident, r)); } catch { teamKeys.delete(r.id); }
    return { id: r.id, name: r.name, role: r.role, keyVersion: r.keyVersion, members: r.members };
  });
  for (const t of loadTeams()) if (!out.some((o) => o.id === t.id)) { purgeVault(t.id); teamKeys.delete(t.id); } // nicht mehr Mitglied: lokale Kopie entfernen
  fs.writeFileSync(teamsFile, JSON.stringify(out), { mode: 0o600 });
  return out;
}

// ---- Cloud-Schlüsselbund (siehe keyvault.js): Tresorschlüssel und Geheimschlüssel liegen nur lokal, mit safeStorage verschlüsselt ----
const kcLoad = () => { try { return JSON.parse(fs.readFileSync(kcFile, 'utf8')); } catch { return {}; } };
const kcSave = (o) => fs.writeFileSync(kcFile, JSON.stringify(o), { mode: 0o600 });
const kcCtx = () => {
  const c = loadSyncCfg(); if (!c) return null;
  return { c, enc: Buffer.from(crypt.decrypt(c.key), 'base64'), api: new syncTools.Backend({ url: c.server, token: crypt.decrypt(c.token) }, backendOpts(c.server)) };
};
const kcErr = (e) => {
  if (e.code === 'SK') return 'Geheimschlüssel ungültig';
  if (e.code === 'WRONG') return 'Passwort oder Geheimschlüssel falsch';
  if (e.message === 'fetch failed') return 'Server nicht erreichbar.';
  if (e.status === 404 && e.message === 'Nicht gefunden') return 'Der Server kennt noch keinen Cloud-Schlüsselbund. Bitte den Server aktualisieren.';
  return e.status ? e.message : 'Aktion fehlgeschlagen';
};
const clearCloudFlags = () => keys.raw().filter((k) => k.cloud && !k.deleted).forEach((k) => keys.setCloud(k.id, false));
async function syncKeychain(ctx) {
  const cfg = kcLoad(); if (!cfg.vk) return '';
  const vk = Buffer.from(crypt.decrypt(cfg.vk), 'base64');
  let header, gone = false;
  const cloud = {
    getVault: async () => {
      const r = (await ctx.api.request('GET', 'keyvault')).vault;
      if (!r) { gone = true; throw new Error(); }
      header = r.header;
      return { blob: r.blob || syncTools.seal(vk, { keys: [] }), rev: r.rev }; // noch leer: leerer Tresor
    },
    putVault: async (blob, prev) => { try { await ctx.api.request('PUT', 'keyvault', { header, blob, prev }); return true; } catch (e) { if (e.status === 409) return false; throw e; } },
  };
  try {
    await syncTools.syncOnce({ cloud, key: vk, local: { get: () => kcTools.snapshot(keys.raw(), kcLoad().tomb || []), set: (m) => keys.setRaw(kcTools.apply(keys.raw(), m)) } });
    if ((cfg.tomb || []).length) kcSave({ ...kcLoad(), tomb: [] }); // Löschmarker sind oben
    return '';
  } catch (e) {
    if (gone) { clearCloudFlags(); kcSave({}); return 'Der Cloud-Schlüsselbund wurde auf einem anderen Gerät ausgeschaltet.'; }
    return e.message === 'fetch failed' ? 'Server nicht erreichbar.' : e.message === 'Unsupported state or unable to authenticate data' ? 'Passwort oder Geheimschlüssel falsch' : e.message;
  }
}
// Jedes Team einzeln abgleichen; Betrachter lesen nur. Fehler eines Teams stoppen die anderen nicht.
async function syncTeams(ctx) {
  const errors = [];
  for (const t of await refreshTeams(ctx)) {
    const key = teamKeys.get(t.id);
    if (!key) { errors.push(`${t.name}: Teamschlüssel fehlt`); continue; }
    try {
      const cloud = ctx.api.vault(t.id, t.keyVersion);
      await syncTools.syncOnce({ cloud: t.role === 'viewer' ? { getVault: cloud.getVault, putVault: async () => true } : cloud, key, local: { get: () => vaultSnapshot(t.id), set: (s) => applyVault(t.id, s) } });
    } catch (e) { errors.push(`${t.name}: ${e.message}`); }
  }
  return errors.join(' · ');
}

async function runSync() {
  const c = loadSyncCfg();
  if (!c) return;
  if (syncing) { again = true; return; }
  syncing = true; syncState.status = 'syncing'; syncState.error = '';
  send('sync:status', syncStatus());
  try {
    const before = allSig();
    const cloud = new syncTools.Backend({ url: c.server, token: crypt.decrypt(c.token) }, backendOpts(c.server));
    await syncTools.syncOnce({ cloud, key: Buffer.from(crypt.decrypt(c.key), 'base64'), local: { get: snapshot, set: applySnapshot } });
    syncState.status = 'ok'; syncState.lastSync = Date.now();
    try { const ctx = teamCtx(); await ctx.api.setPubkey(ctx.ident.pub); syncState.teamError = await syncTeams(ctx); } catch (e) { syncState.teamError = e.message === 'fetch failed' ? 'Server nicht erreichbar.' : e.message; }
    try { syncState.keychainError = await syncKeychain(kcCtx()); } catch (e) { syncState.keychainError = e.message; }
    if (allSig() !== before) send('hosts:changed'); // andere Geräte haben etwas geändert
  } catch (e) {
    if (e.status === 401) { // Sitzung ungültig: zurück zum Login
      fs.rmSync(syncCfgFile, { force: true });
      syncState.status = 'off'; syncState.error = 'Sitzung abgelaufen – bitte neu anmelden.';
    } else {
      syncState.status = 'error';
      syncState.error = e.message === 'Unsupported state or unable to authenticate data' ? 'Die Cloud-Daten lassen sich mit diesem Passwort nicht entschlüsseln.' : /fetch failed/.test(e.message) ? 'Server nicht erreichbar.' : e.message;
    }
  }
  syncing = false;
  send('sync:status', syncStatus());
  if (again) { again = false; scheduleSync(); }
}
const scheduleSync = () => { if (!loadSyncCfg()) return; clearTimeout(syncTimer); syncTimer = setTimeout(runSync, 3000); };

// Änderungen über diese Kanäle lösen einen Sync aus
const MUTATING = new Set(['hosts:save', 'hosts:copy', 'hosts:remove', 'override:set', 'keys:copy', 'keys:generate', 'keys:import', 'keys:remove', 'keys:rename', 'keys:setPassphrase', 'groups:create', 'groups:rename', 'groups:remove', 'snippets:save', 'snippets:remove', 'fwd:save', 'fwd:remove', 'known:remove', 'known:import', 'import:commit']);
const handle = (ch, fn) => ipcMain.handle(ch, MUTATING.has(ch) ? async (...a) => { const r = await fn(...a); scheduleSync(); return r; } : fn);


// Keychain-Schlüssel hat Vorrang, dann keyPath (alt), sonst Passwort.
// ponytail: Agent-Auth fehlt.
// ---- Known Hosts: Host-Schlüssel prüfen, bei Unbekanntem/Geändertem den Nutzer fragen --------------------
const hostKeyAsk = new Map(); // id -> resolve
let hostKeySeq = 0;
function askHostKey(info) {
  return new Promise((resolve) => {
    const id = ++hostKeySeq;
    hostKeyAsk.set(id, resolve);
    send('hostkey:ask', { id, ...info });
    setTimeout(() => { if (hostKeyAsk.delete(id)) { resolve(false); send('hostkey:cancel', id); } }, 120000); // ohne Antwort: ablehnen
  });
}
const verifying = new Map(); // parallele Verbindungen zum selben Schlüssel fragen nur einmal
// ask (nur Terminal-Tabs): Rückfrage im Verbindungsbildschirm statt Dialog; Antwort { save } = merken, null = abbrechen
function verifyHostKey(host, port, blob, ask) {
  const r = knownTools.checkHostKey(known.list(), host, port, blob);
  if (r.status === 'known') return Promise.resolve(true);
  const k = `${host.toLowerCase()}:${port}:${r.fingerprint}`;
  if (verifying.has(k)) return verifying.get(k);
  const store = () => { known.save({ id: r.id, host: host.toLowerCase(), port, type: r.type, fingerprint: r.fingerprint, key: blob.toString('base64'), addedAt: r.addedAt || Date.now() }); scheduleSync(); };
  const info = { host, port, type: r.type, fingerprint: r.fingerprint, old: r.old };
  const p = (ask
    ? ask('hostkey', info).then((a) => { if (a?.save) store(); return !!a; })
    : askHostKey(info).then((ok) => { if (ok) store(); return ok; }))
    .finally(() => verifying.delete(k));
  verifying.set(k, p);
  return p;
}

// auth (aus withAuth): Anmeldung wird dynamisch verhandelt; ohne auth werden die gespeicherten Zugangsdaten direkt benutzt
function sshConfig(h, auth) {
  // hostVerifier mit 2 Argumenten ist asynchron; bei Fehler/Ablehnung wird die Verbindung abgebrochen
  const cfg = { host: h.host, port: h.port, username: h.user, readyTimeout: 120000, keepaliveInterval: 15000, keepaliveCountMax: 3,
    hostVerifier: (key, cb) => verifyHostKey(h.host, h.port, key, auth?.hostAsk).then(cb, () => cb(false)) };
  if (auth) return { ...cfg, authHandler: auth.authHandler, tryKeyboard: true };
  const k = h.keyId && keys.get(h.keyId);
  if (k && (k.privateKey || k.path)) { // reine öffentliche Schlüssel taugen nicht zum Anmelden
    cfg.privateKey = k.privateKey || fs.readFileSync(k.path);
    if (k.passphrase || h.secret) cfg.passphrase = k.passphrase || h.secret;
  } else if (h.keyPath) {
    cfg.privateKey = fs.readFileSync(h.keyPath);
    if (h.secret) cfg.passphrase = h.secret;
  } else cfg.password = h.secret;
  return cfg;
}
// Verhandelte Anmeldung für conn; Rückfragen über ask. persist(h) nach erfolgreicher Anmeldung übernimmt "Speichern"-Wünsche.
function withAuth(conn, h, ask, log = () => {}, inlineHostKey = false) {
  const auth = createAuth({ h, keys, ask, log });
  if (inlineHostKey) auth.hostAsk = ask;
  conn.on('keyboard-interactive', auth.onKeyboard);
  auth.persist = () => {
    const { secret, keyId, passphrase } = auth.save;
    if (!h.id || !(secret || keyId || passphrase)) return false;
    if (isTeamHost(h)) { // Team-Host: Schlüsselwahl nur für mich merken; Passwörter nie in den geteilten Eintrag schreiben
      if (keyId) overrides.save({ ...ownAccess(h.id), id: h.id, keyId });
      if (passphrase && (keyId || h.keyId)) keys.setPassphrase(keyId || h.keyId, passphrase);
      scheduleSync();
      return !!keyId;
    }
    const cur = hosts.get(h.id);
    if (secret || keyId) hosts.save({ ...cur, ...(secret && { secret }), ...(keyId && { keyId }) });
    if (passphrase && (keyId || h.keyId)) keys.setPassphrase(keyId || h.keyId, passphrase);
    scheduleSync(); send('hosts:changed');
    return true;
  };
  return auth;
}

// Trägt den öffentlichen Schlüssel in ~/.ssh/authorized_keys des Hosts ein. Rückgabe: Fehlertext oder null.
function installKey(k, h) {
  const cmd = keyTools.installCommand(k.publicKey);
  if (!cmd) return Promise.resolve('Öffentlicher Schlüssel fehlt oder enthält unzulässige Zeichen.');
  return new Promise((resolve) => {
    const conn = new Client();
    conn.on('ready', () => conn.exec(cmd, (err, stream) => {
      if (err) { conn.end(); return resolve(err.message); }
      stream.on('close', (code) => { conn.end(); resolve(code === 0 ? null : `Befehl endete mit Code ${code}`); }).resume();
    })).on('error', (e) => resolve(e.message));
    sshConnect(conn, sshConfig(h));
  });
}

// Öffnet file mit 'default' (laut Einstellung, sonst VS Code, sonst System), 'system' oder einem erkannten Editor. Nie beliebige Befehle aus dem Renderer.
function launch(file, cmd) {
  const ed = editors.pick(cmd, readSettings().editor, editors.detect());
  if (ed) spawn(ed.bin, [...(ed.args || []), file], { detached: true, stdio: 'ignore' }).unref();
  else shell.openPath(file);
}

// Remote-Datei bearbeiten: in Temp-Ordner laden, öffnen, bei jedem Speichern zurück hochladen.
async function editRemote(win, sid, remotePath, cmd) {
  const s = sftps.get(sid);
  if (!s) throw new Error('Nicht verbunden');
  const base = path.posix.basename(remotePath);
  if (!sftpTools.safeName(base)) throw new Error('Ungültiger Dateiname');
  const dir = fs.mkdtempSync(path.join(app.getPath('temp'), 'deck-edit-'));
  await sftpTools.download(s.sftp, remotePath, dir);
  let timer;
  // Ordner statt Datei beobachten: Editoren speichern oft per Umbenennen (neue Inode)
  const watcher = fs.watch(dir, (_, f) => {
    if (f !== base) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try { await sftpTools.put(s.sftp, path.join(dir, base), remotePath); if (!win.isDestroyed()) win.webContents.send('edit:saved', base); }
      catch (e) { if (!win.isDestroyed()) win.webContents.send('edit:error', `${base}: ${e.message}`); }
    }, 500);
  });
  edits.set(sid, [...(edits.get(sid) || []), { watcher, dir }]);
  launch(path.join(dir, base), cmd);
}
function stopEdits(sid) {
  for (const { watcher, dir } of edits.get(sid) || []) { watcher.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  edits.delete(sid);
}

// Liest das Betriebssystem des Servers und setzt das Host-Icon, falls noch keins gewählt/erkannt ist.
function detectOs(win, conn, h) {
  if (!h.id || h.icon || h.autoIcon) return;
  conn.exec('cat /etc/os-release 2>/dev/null || uname -s', (err, stream) => {
    if (err) return;
    let out = '';
    stream.on('data', (d) => { if (out.length < 8192) out += d; }).on('close', () => {
      const slug = osIcon(out);
      if (!slug || !fs.existsSync(path.join(__dirname, 'dist', 'icons', `${slug}.svg`))) return;
      hosts.setAutoIcon(h.id, slug);
      scheduleSync();
      if (!win.isDestroyed()) win.webContents.send('hosts:changed');
    });
    stream.stderr.resume();
  });
}

// Ergänzt einen fehlenden Benutzernamen per Rückfrage; ask(kind) -> Antwort | null (abgebrochen). "Speichern" schreibt ihn in den Host.
// Alles Weitere (Passwort, Schlüssel, Codes) verhandelt withAuth mit dem Server. Rückgabe { h, saved } oder null.
const isTeamHost = (h) => !!h.vault && h.vault !== 'personal';
const ownAccess = (id) => overrides.list().find((o) => o.id === id) || {};
async function completeCreds(h, ask) {
  h = { ...h };
  if (isTeamHost(h)) { const o = ownAccess(h.id); h = { ...h, ...(o.user && { user: o.user }), ...(o.keyId && { keyId: o.keyId }) }; } // Team-Host: mein eigener Zugang hat Vorrang
  if (h.user) return { h, saved: false };
  const a = await ask('user');
  if (!a) return null;
  h.user = a.user.trim();
  if (a.save && h.id) {
    if (isTeamHost(h)) overrides.save({ ...ownAccess(h.id), id: h.id, user: h.user }); // nicht in den geteilten Host schreiben
    else hosts.save({ ...hosts.get(h.id), user: h.user });
    scheduleSync(); send('hosts:changed');
  }
  return { h, saved: !!(a.save && h.id) };
}
// Rückfrage über einen Dialog (für SFTP und Forwarding, die keinen eigenen Verbindungsbildschirm haben)
const credAsks = new Map();
let credSeq = 0;
const dialogAsk = (name) => (kind, extra) => new Promise((res) => { const id = ++credSeq; credAsks.set(id, res); send('cred:ask', { id, kind, name, ...extra }); });

// Verbindungsaufbau mit Protokoll: die Oberfläche bekommt je Schritt ssh:status { state: connecting|ask|failed|ready, log, ask? }.
// Fehlen Benutzer oder Passwort/Schlüssel am Host, fragt die Oberfläche beim Verbinden nach (ssh:answer).
const pending = new Map(); // sid -> resolve(Antwort | null)
function connect(win, sid, h, cols, rows) {
  const conn = new Client();
  const logs = [];
  const info = { name: h.name, host: h.host, port: h.port, icon: h.icon, autoIcon: h.autoIcon };
  const send = (ch, ...a) => !win.isDestroyed() && win.webContents.send(ch, sid, ...a);
  const stale = () => sessions.get(sid)?.conn !== conn; // Sitzung wurde geschlossen oder neu gestartet
  const status = (state, extra) => !stale() && send('ssh:status', { state, log: [...logs], info, ...extra });
  const log = (m) => { logs.push(m); status('connecting'); };
  const fail = (m) => { logs.push(`Connection failed: ${m}`); status('failed'); };
  const ask = (kind, extra) => new Promise((res) => { pending.set(sid, res); status('ask', { ask: { kind, ...extra } }); });
  sessions.set(sid, { conn });
  let shell = false; // Shell lief schon: ein Ende ohne Nutzer-Aktion ist ein Verbindungsabbruch
  (async () => {
    h = { ...h };
    log(`Starting a new connection to: "${h.host}" port "${h.port}"`);
    const tor = torCfg();
    if (tor.servers && !torTools.isPrivateHost(h.host)) log(`Routing through Tor (${tor.host}:${tor.port})`);
    else if (!net.isIP(h.host)) {
      log(`Starting address resolution of "${h.host}"`);
      try { log(`Address resolved to ${(await dns.promises.lookup(h.host)).address}`); } catch (e) { return fail(`Address resolution finished with error: ${e.message}`); }
    }
    const done = await completeCreds(h, ask);
    if (!done) return;
    h = done.h;
    if (done.saved) log('Credentials saved to host');
    log(`Authenticating as "${h.user}"`);
    const auth = withAuth(conn, h, ask, log, true);
    conn.on('handshake', () => log('SSH handshake completed, host key accepted'));
    conn.on('ready', () => {
      log('Authenticated, opening shell');
      if (auth.persist()) log('Credentials saved to host');
      detectOs(win, conn, h);
      conn.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
        if (err) return fail(err.message);
        sessions.set(sid, { conn, stream });
        shell = true;
        status('ready');
        stream.on('data', (d) => send('ssh:data', d.toString('utf8')));
        stream.on('close', () => { if (!shell) return; shell = false; conn.end(); sessions.delete(sid); send('ssh:closed'); });
      });
    }).on('error', (e) => { if (!shell) fail(e.message); }) // nach dem Start folgt 'close' (z. B. Keepalive-Timeout)
      .on('close', () => { if (shell && !stale()) { shell = false; sessions.delete(sid); send('ssh:lost'); } });
    sshConnect(conn, sshConfig(h, auth));
  })();
}

// Alte Regeln hatten nur Local-Forwarding (localPort/remoteHost/remotePort)
const normFwd = (r) => ({ type: 'local', bindAddr: '127.0.0.1', bindPort: r.localPort, destHost: r.remoteHost, destPort: r.remotePort, ...r });

// Minimaler SOCKS5-Server (nur CONNECT, ohne Anmeldung); jede Verbindung läuft über den SSH-Tunnel
function socksHandler(conn) {
  return (sock) => {
    sock.on('error', () => {});
    sock.once('data', (hello) => {
      if (hello[0] !== 5) return sock.destroy();
      sock.write(Buffer.from([5, 0]));
      sock.once('data', (req) => {
        if (req[0] !== 5 || req[1] !== 1) { sock.end(Buffer.from([5, 7, 0, 1, 0, 0, 0, 0, 0, 0])); return; }
        let host, off;
        if (req[3] === 1) { host = [...req.subarray(4, 8)].join('.'); off = 8; }
        else if (req[3] === 3) { host = req.subarray(5, 5 + req[4]).toString(); off = 5 + req[4]; }
        else if (req[3] === 4) { host = req.subarray(4, 20).toString('hex').match(/.{4}/g).join(':'); off = 20; }
        else return sock.destroy();
        const port = req.readUInt16BE(off);
        conn.forwardOut('127.0.0.1', 0, host, port, (e, s) => {
          if (e) return sock.end(Buffer.from([5, 5, 0, 1, 0, 0, 0, 0, 0, 0]));
          sock.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
          sock.pipe(s).pipe(sock); s.on('error', () => sock.destroy());
        });
      });
    });
  };
}

// Port-Forwarding: local (lokaler Port -> Ziel über Host), remote (Port am Host -> Ziel von hier), dynamic (lokaler SOCKS5-Proxy)
function startForward(r) {
  r = normFwd(r);
  const found = hosts.get(r.hostId);
  if (!found) return Promise.reject(new Error('Host nicht gefunden'));
  return completeCreds(found, dialogAsk(found.name)).then((done) => new Promise((resolve, reject) => {
    if (!done) return reject(new Error('Abgebrochen'));
    const h = done.h;
    const conn = new Client();
    const auth = withAuth(conn, h, dialogAsk(h.name));
    const live = (extra) => { running.set(r.id, { conn, ...extra }); resolve(); };
    conn.on('ready', () => {
      auth.persist();
      if (r.type === 'remote') {
        conn.on('tcp connection', (info, accept) => {
          const up = accept(), s = net.connect(+r.destPort, r.destHost, () => up.pipe(s).pipe(up));
          s.on('error', () => up.destroy());
        });
        conn.forwardIn(r.bindAddr || '127.0.0.1', +r.bindPort, (e) => (e ? (conn.end(), reject(e)) : live({})));
        return;
      }
      const server = net.createServer(r.type === 'dynamic' ? socksHandler(conn)
        : (sock) => conn.forwardOut('127.0.0.1', 0, r.destHost, +r.destPort, (e, s) => (e ? sock.destroy() : sock.pipe(s).pipe(sock))));
      server.on('error', (e) => { conn.end(); reject(e); });
      server.listen(+r.bindPort, r.bindAddr || '127.0.0.1', () => live({ server }));
    }).on('error', reject);
    sshConnect(conn, sshConfig(h, auth));
  }));
}
function stopForward(id) {
  const f = running.get(id);
  if (f) { f.server?.close(); f.conn.end(); running.delete(id); }
}

// ---- Auto-Update ---------------------------------------------------------------------------------------
// Quelle: package.json "updates.repo" (GitHub "Besitzer/Repo"), in den Einstellungen überschreibbar. Der Abruf läuft über Tor, wenn "Sync über Tor" an ist.
const updErr = (e) => {
  if (e.code === 'NOTFOUND') return 'Keine Veröffentlichung gefunden';
  if (e.code === 'NET') return 'Update-Quelle nicht erreichbar';
  if (e.code === 'PKG') return 'Ungültiges Update-Paket';
  return 'Update fehlgeschlagen';
};
const updFetch = (url, init) => (torCfg().sync && !torTools.isPrivateHost(new URL(url).hostname) ? torFetch : fetch)(url, init);
const updCfg = () => { const u = readSettings().updates || {}; return { auto: u.auto !== false, channel: u.channel === 'dev' ? 'dev' : 'stable', repo: u.repo || (require('./package.json').updates || {}).repo || '', url: process.env.SSH_DECK_UPDATE_URL }; };
let updInfo = null, updBusy = false;
// Installierte Version: nach einem Update steht hier die genaue Version (auch Dev-Build "0.1.4-dev.5"), denn package.json trägt nur die Basis "0.1.4"
const installedFile = () => path.join(app.getPath('userData'), 'installed-update.json');
const curVersion = () => {
  const base = require('./package.json').version;
  try { const i = JSON.parse(fs.readFileSync(installedFile(), 'utf8')); if (i.base === base) return i.version; } catch { /* nie per Update installiert */ }
  return base;
};
async function checkUpdate() {
  const cur = curVersion(), c = updCfg();
  try {
    const l = await updater.latest({ repo: c.repo, url: c.url, channel: c.channel, fetch: updFetch });
    updInfo = { current: cur, latest: l.version, channel: c.channel, prerelease: l.prerelease, available: updater.isNewer(l.version, cur), notes: l.notes, page: l.page, tarball: l.tarball, canInstall: !app.isPackaged };
  } catch (e) { return { current: cur, error: updErr(e) }; }
  if (updInfo.available) send('update:available', { latest: updInfo.latest, canInstall: updInfo.canInstall });
  return updInfo;
}
const publicUpd = (u) => { const { tarball, ...rest } = u; return rest; };

app.whenReady().then(() => {
  const dir = app.getPath('userData');
  settingsFile = path.join(dir, 'settings.json');
  hosts = makeHosts(path.join(dir, 'hosts.json'), crypt);
  keys = makeKeys(path.join(dir, 'keys.json'), crypt);
  keyTools.scan(path.join(os.homedir(), '.ssh'), keys);
  groups = plain(path.join(dir, 'groups.json'));
  // Gruppen-Namen aus bestehenden Hosts übernehmen (frühere Versionen speicherten nur den Namen am Host)
  for (const g of new Set(hosts.list().map((h) => h.group).filter(Boolean))) {
    if (!groups.list().some((x) => x.name === g)) groups.save({ name: g });
  }
  snippets = plain(path.join(dir, 'snippets.json'));
  forwards = plain(path.join(dir, 'forwards.json'));
  known = plain(path.join(dir, 'known_hosts.json'));
  overrides = plain(path.join(dir, 'overrides.json')); // persönlicher Zugang zu Team-Hosts (eigener Schlüssel / Benutzer), nur für mich
  teamsFile = path.join(dir, 'teams.json');
  kcFile = path.join(dir, 'keychain-cloud.json');

  const win = new BrowserWindow({
    width: 1200, height: 740, minWidth: 720, minHeight: 480, show: false, icon: path.join(__dirname, 'assets', 'icon-512.png'),
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 18 } } : { frame: false }), // erst zeigen, wenn gezeichnet: kein weißer Blitz
    backgroundColor: readSettings().dark ? '#0a0a0a' : '#ffffff',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  mainWin = win;
  win.removeMenu();
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'dist', 'index.html'));

  const winOf = (e) => BrowserWindow.fromWebContents(e.sender);
  ipcMain.on('win:minimize', (e) => winOf(e).minimize());
  ipcMain.on('win:toggleMax', (e) => { const w = winOf(e); w.isMaximized() ? w.unmaximize() : w.maximize(); });
  ipcMain.on('win:close', (e) => winOf(e).close());
  syncCfgFile = path.join(dir, 'sync.json');
  settingsFile = path.join(dir, 'settings.json');
  // Prüft, ob die Verbindung über den Proxy wirklich aus dem Tor-Netz kommt
  handle('tor:test', async () => {
    try {
      const j = await (await torFetch('https://check.torproject.org/api/ip')).json();
      return j.IsTor ? { state: 'ok', ip: j.IP } : { state: 'notor' };
    } catch { return { state: 'down' }; }
  });
  handle('settings:get', () => readSettings());
  handle('settings:set', (_, patch) => { fs.writeFileSync(settingsFile, JSON.stringify({ ...readSettings(), ...patch })); });
  handle('update:check', async () => { const u = await checkUpdate(); return u.error ? u : publicUpd(u); });
  handle('update:openPage', () => { const u = updInfo; if (u && /^https:\/\/github\.com\//.test(u.page)) shell.openExternal(u.page); });
  handle('update:install', async () => {
    if (app.isPackaged) return { error: 'Update fehlgeschlagen' }; // installierte Pakete aktualisiert die Release-Seite
    if (!updInfo || !updInfo.available || updBusy) return { error: 'Update fehlgeschlagen' };
    updBusy = true;
    try {
      const base = await updater.install({ tarball: updInfo.tarball, dir: __dirname, fetch: updFetch, onStep: (step) => send('update:step', step) });
      fs.writeFileSync(installedFile(), JSON.stringify({ version: updInfo.latest, base })); // merkt sich z. B. den Dev-Build
    }
    catch (e) { updBusy = false; return { error: updErr(e) }; }
    setTimeout(() => { app.relaunch(); app.exit(0); }, 600);
    return { ok: true };
  });
  if (updCfg().auto) { setTimeout(checkUpdate, 8000); setInterval(() => updCfg().auto && checkUpdate(), 6 * 36e5); }
  // ---- Teams: Rückgabe { ... } oder { error } ----
  const teamErr = (e) => (e.message === 'fetch failed' ? 'Server nicht erreichbar.' : e.status === 404 && e.message === 'Nicht gefunden' ? 'Der Server kennt noch keine Teams. Bitte den Server aktualisieren.' : e.status ? e.message : 'Team-Aktion fehlgeschlagen');
  const teamKey = async (ctx, id) => { if (!teamKeys.has(id)) await refreshTeams(ctx); const k = teamKeys.get(id); if (!k) throw Object.assign(new Error('Schlüssel fehlt'), { status: 400 }); return k; };
  const teamDo = (fn, { sync = true } = {}) => async (_, ...a) => {
    const ctx = teamCtx();
    if (!ctx) return { error: 'Nicht angemeldet' };
    try { const r = await fn(ctx, ...a); if (sync) { send('teams:changed'); scheduleSync(); } return r ?? {}; } catch (e) { return { error: teamErr(e) }; }
  };
  ipcMain.handle('team:list', async () => {
    const ctx = teamCtx();
    if (!ctx) return { teams: loadTeams(), signedOut: true };
    try { await ctx.api.setPubkey(ctx.ident.pub); return { teams: await refreshTeams(ctx) }; } catch (e) { return { teams: loadTeams(), error: teamErr(e) }; }
  });
  ipcMain.handle('team:create', teamDo(async (ctx, name) => { const { id, key } = await teamTools.createTeam(ctx.api, ctx.ident, String(name || '')); teamKeys.set(id, key); await refreshTeams(ctx); return { id }; }));
  ipcMain.handle('team:members', teamDo(async (ctx, id) => {
    const r = await ctx.api.get(id);
    return { role: r.team.role, members: r.members.map((m) => ({ userId: m.userId, email: m.email, role: m.role, fingerprint: teamTools.fingerprint(m.pubkey), me: m.pubkey === ctx.ident.pub })) };
  }, { sync: false }));
  ipcMain.handle('team:invite', teamDo(async (ctx, id, email, role) => teamTools.invite(ctx.api, ctx.ident, id, await teamKey(ctx, id), String(email || '').trim(), role)));
  ipcMain.handle('team:setRole', teamDo((ctx, id, userId, role) => ctx.api.setRole(id, userId, role)));
  ipcMain.handle('team:remove', teamDo(async (ctx, id, userId) => { teamKeys.set(id, await teamTools.removeMembers(ctx.api, ctx.ident, id, await teamKey(ctx, id), [userId])); await refreshTeams(ctx); }));
  ipcMain.handle('team:leave', teamDo(async (ctx, id) => {
    const me = (await ctx.api.get(id)).members.find((m) => m.pubkey === ctx.ident.pub);
    await ctx.api.leave(id, me.userId); await refreshTeams(ctx); send('hosts:changed');
  }));
  ipcMain.handle('team:delete', teamDo(async (ctx, id) => { await ctx.api.remove(id); await refreshTeams(ctx); send('hosts:changed'); }));
  // ---- Cloud-Schlüsselbund: Rückgabe { ... } oder { error } ----
  const kcDo = (fn) => async (_, ...a) => { const ctx = kcCtx(); if (!ctx) return { error: 'Nicht angemeldet' }; try { return (await fn(ctx, ...a)) ?? {}; } catch (e) { return { error: kcErr(e) }; } };
  const kcPassword = (ctx, password) => { if (!syncTools.deriveKeys(ctx.c.email, String(password || '')).enc.equals(ctx.enc)) throw Object.assign(new Error('Passwort falsch'), { status: 400 }); };
  const kcStore = (vk, sk) => kcSave({ vk: crypt.encrypt(vk.toString('base64')), sk: crypt.encrypt(sk), tomb: [] });
  ipcMain.handle('kc:status', async () => {
    const ctx = kcCtx(), cfg = kcLoad();
    if (!ctx) return { signedIn: false };
    let remote = false; try { remote = !!(await ctx.api.request('GET', 'keyvault')).vault; } catch { /* Server alt oder offline */ }
    return { signedIn: true, enabled: !!cfg.vk, remote, keys: keys.raw().filter((k) => k.cloud && !k.deleted).length };
  });
  ipcMain.handle('kc:enable', kcDo(async (ctx, password) => {
    kcPassword(ctx, password);
    if ((await ctx.api.request('GET', 'keyvault')).vault) throw Object.assign(new Error('Es gibt schon einen Cloud-Schlüsselbund. Bitte auf diesem Gerät entsperren.'), { status: 409 });
    const { secretKey, vk, header } = await kcTools.create(String(password));
    await ctx.api.request('PUT', 'keyvault', { header, blob: null, prev: null });
    kcStore(vk, secretKey);
    return { secretKey };
  }));
  ipcMain.handle('kc:unlock', kcDo(async (ctx, password, secretKey) => {
    kcPassword(ctx, password);
    const v = (await ctx.api.request('GET', 'keyvault')).vault;
    if (!v) throw Object.assign(new Error('Kein Cloud-Schlüsselbund vorhanden.'), { status: 404 });
    const vk = await kcTools.unlock(String(password), secretKey, v.header);
    kcStore(vk, String(secretKey).trim());
    scheduleSync();
  }));
  ipcMain.handle('kc:secret', () => { const c = kcLoad(); return c.sk ? { secretKey: crypt.decrypt(c.sk) } : { error: 'Aktion fehlgeschlagen' }; });
  ipcMain.handle('kc:setKey', (_, id, on) => {
    const cfg = kcLoad(); if (!cfg.vk) return { error: 'Aktion fehlgeschlagen' };
    const k = keys.get(id); if (!k) return { error: 'Aktion fehlgeschlagen' };
    let content; if (on && !k.privateKey && k.path) { try { content = fs.readFileSync(k.path, 'utf8'); } catch { /* nur öffentlicher Teil */ } } // Schlüssel aus ~/.ssh: Inhalt übernehmen
    keys.setCloud(id, on, content);
    const tomb = (cfg.tomb || []).filter((t) => t.id !== id);
    kcSave({ ...cfg, tomb: on ? tomb : [...tomb, { id, at: Date.now() }] });
    scheduleSync();
    return {};
  });
  ipcMain.handle('kc:disable', kcDo(async (ctx) => { await ctx.api.request('DELETE', 'keyvault', {}); clearCloudFlags(); kcSave({}); }));
  handle('sync:status', () => syncStatus());
  handle('sync:now', () => { runSync(); });
  handle('sync:logout', async () => {
    const c = loadSyncCfg();
    if (c) await new syncTools.Backend({ url: c.server, token: crypt.decrypt(c.token) }, backendOpts(c.server)).logout().catch(() => {}); // Sitzung auch serverseitig beenden
    fs.rmSync(syncCfgFile, { force: true });
    Object.assign(syncState, { status: 'off', lastSync: null, error: '' });
    send('sync:status', syncStatus());
  });
  // Anmelden / Registrieren / Code bestätigen. Rückgabe: { ok } | { needsCode } | { error }
  handle('auth:submit', async (_, o) => {
    try {
      const url = String(o.server).trim().replace(/\/+$/, '');
      if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url) && !/^http:\/\/[a-z2-7]{16,56}\.onion(:|\/|$)/.test(url)) return { error: 'Die Server-Adresse muss mit https:// beginnen.' };
      const email = String(o.email).trim().toLowerCase();
      if (!email || !o.password) return { error: 'Bitte E-Mail und Passwort eingeben.' };
      if (o.mode === 'register' && o.password.length < 8) return { error: 'Das Passwort braucht mindestens 8 Zeichen.' };
      const keys = syncTools.deriveKeys(email, o.password);
      const b = new syncTools.Backend({ url }, backendOpts(url));
      let token;
      if (o.mode === 'register') {
        const r = await b.register(email, keys.auth);
        if (r.needsVerification) return { needsCode: true };
        token = r.token;
      } else if (o.mode === 'verify') token = await b.verify(email, o.code);
      else token = await b.login(email, keys.auth);
      saveSyncCfg({ server: url, email, token: crypt.encrypt(token), key: crypt.encrypt(keys.enc.toString('base64')) });
      syncState.error = '';
      runSync(); // Sync ist ab jetzt dauerhaft an
      return { ok: true };
    } catch (e) {
      if (e.needsVerification) return { error: 'E-Mail noch nicht bestätigt. Registriere dich erneut, dann kommt ein neuer Code.' };
      return { error: /fetch failed/.test(e.message) ? 'Server nicht erreichbar.' : e.message };
    }
  });
  handle('hosts:list', () => hosts.list());
  handle('hosts:get', (_, id) => { const h = hosts.get(id); return h && { ...h, secret: undefined, hasSecret: !!h.secret }; });
  const vOf = (r) => (r && r.vault) || 'personal';
  const ensureGroup = (name, vault) => { if (name && !groups.list().some((g) => g.name === name && vOf(g) === vault)) groups.save({ name, ...(vault !== 'personal' && { vault }) }); };
  // Wechselt ein Host den Tresor, entsteht er im neuen Tresor neu (neue id) und der alte bekommt einen Löschmarker; sonst würden zwei Tresore dieselbe id beanspruchen.
  handle('hosts:save', (_, h) => {
    const old = h.id && hosts.get(h.id), vault = h.vault || vOf(old);
    ensureGroup(h.group, vault);
    if (old && vOf(old) !== vault) {
      const id = hosts.save({ ...h, id: undefined, secret: h.secret ?? old.secret, vault: vault === 'personal' ? undefined : vault });
      hosts.remove(h.id);
      return id;
    }
    return hosts.save({ ...h, vault: vault === 'personal' ? undefined : vault });
  });
  // Klonen (Kopie bleibt neben dem Original) oder Verschieben (Original wird gelöscht) in einen Tresor. Schlüssel aus der Keychain gehören zu ihrem Tresor und gehen nicht mit.
  handle('hosts:copy', (_, id, vault = 'personal', move = false, name) => {
    const h = hosts.get(id);
    if (!h) return { error: 'Host nicht gefunden' };
    const same = vOf(h) === vault;
    ensureGroup(h.group, vault);
    const nid = hosts.save({ name: name || h.name, group: h.group, host: h.host, port: h.port, user: h.user, keyPath: h.keyPath, keyId: same ? h.keyId : '', icon: h.icon, tags: h.tags, secret: h.secret || undefined, ...(vault !== 'personal' && { vault }) });
    if (move) hosts.remove(id);
    return { id: nid, keyDropped: !!h.keyId && !same };
  });
  handle('override:get', (_, id) => { const o = ownAccess(id); return { keyId: o.keyId || '', user: o.user || '' }; });
  handle('override:set', (_, id, o) => { overrides.save({ id, keyId: o?.keyId || '', user: String(o?.user || '').trim() }); });
  handle('hosts:remove', (_, id) => hosts.remove(id));
  // Gruppen: Rückgabe null oder Fehlertext. Namen sind je Tresor eindeutig.
  const reGroup = (from, to, vault) => hosts.list().filter((h) => h.group === from && vOf(h) === vault).forEach((h) => hosts.save({ ...h, group: to }));
  // ---- Host-Import (Vorschau, dann übernehmen). Die geparsten Hosts bleiben im Hauptprozess; die Oberfläche sieht keine Passwörter. ----
  const IMPORT_FILTERS = {
    csv: [{ name: 'CSV', extensions: ['csv', 'txt'] }, { name: 'Alle Dateien', extensions: ['*'] }],
    putty: [{ name: 'PuTTY (.reg / Sitzungsdatei)', extensions: ['reg', '*'] }],
    mobaxterm: [{ name: 'MobaXterm (.mxtsessions / .ini)', extensions: ['mxtsessions', 'ini', 'txt'] }, { name: 'Alle Dateien', extensions: ['*'] }],
    securecrt: [{ name: 'SecureCRT (.ini)', extensions: ['ini'] }, { name: 'Alle Dateien', extensions: ['*'] }],
  };
  const dupKey = (h) => `${String(h.host).toLowerCase()}|${h.port}|${String(h.user).toLowerCase()}`;
  let lastImport = [];
  handle('import:pick', async (_, format) => {
    try {
      let files;
      if (format === 'ssh') {
        const p = path.join(os.homedir(), '.ssh', 'config');
        if (!fs.existsSync(p)) return { error: 'Keine Datei ~/.ssh/config gefunden.' };
        files = [p];
      } else {
        const r = await dialog.showOpenDialog(mainWin, { properties: ['openFile', 'multiSelections'], filters: IMPORT_FILTERS[format] });
        if (r.canceled) return { canceled: true };
        files = r.filePaths;
      }
      const parsed = importerTools.parseFiles(format, files.map((f) => ({ name: path.basename(f), dir: path.basename(path.dirname(f)), text: importerTools.decode(fs.readFileSync(f)) })),
        { home: os.homedir(), defaultUser: os.userInfo().username });
      const have = new Set(hosts.list().map(dupKey));
      lastImport = parsed.hosts.map((h) => ({ ...h, dup: have.has(dupKey(h)) }));
      return { hosts: lastImport.map(({ secret, ...h }) => h), skipped: parsed.skipped };
    } catch (e) { return { error: e.message }; }
  });
  handle('import:commit', (_, vault = 'personal') => {
    const have = new Set(hosts.list().filter((h) => vOf(h) === vault).map(dupKey));
    const keyByPath = new Map(keys.list().filter((k) => k.path).map((k) => [k.path, k.id]));
    let added = 0;
    for (const h of lastImport) {
      if (h.dup || have.has(dupKey(h))) continue;
      ensureGroup(h.group, vault); // Gruppen werden bei Bedarf angelegt
      const keyId = keyByPath.get(h.keyPath) || ''; // Schlüsseldatei aus ~/.ssh -> Keychain-Eintrag, sonst Pfad behalten
      hosts.save({ name: h.name, group: h.group, host: h.host, port: h.port, user: h.user, tags: h.tags, keyId, keyPath: keyId ? '' : h.keyPath, secret: h.secret || undefined, ...(vault !== 'personal' && { vault }) });
      have.add(dupKey(h)); added++;
    }
    lastImport = [];
    return added;
  });
  handle('known:list', () => known.list().sort((a, b) => a.host.localeCompare(b.host)));
  handle('known:remove', (_, id) => known.remove(id));
  // Übernimmt ~/.ssh/known_hosts (ohne gehashte Einträge und Muster); Rückgabe { added, skipped }
  handle('known:import', () => {
    let text = '';
    try { text = fs.readFileSync(path.join(os.homedir(), '.ssh', 'known_hosts'), 'utf8'); } catch { /* Datei fehlt */ }
    const { entries, skipped } = knownTools.parseKnownHosts(text);
    const have = known.list();
    let added = 0;
    for (const e of entries) {
      if (have.some((x) => x.host === e.host && x.port === e.port && x.type === e.type)) continue;
      known.save({ ...e, addedAt: Date.now() });
      added++;
    }
    return { added, skipped };
  });
  ipcMain.on('hostkey:answer', (_, id, ok) => { hostKeyAsk.get(id)?.(!!ok); hostKeyAsk.delete(id); });
  handle('groups:list', () => groups.list());
  handle('groups:create', (_, name, vault = 'personal') => {
    name = String(name).trim();
    if (!name) return 'Name fehlt';
    if (groups.list().some((g) => g.name === name && vOf(g) === vault)) return 'Gruppe existiert bereits';
    groups.save({ name, ...(vault !== 'personal' && { vault }) });
    return null;
  });
  handle('groups:rename', (_, id, name) => {
    name = String(name).trim();
    const g = groups.list().find((x) => x.id === id);
    if (!g || !name) return 'Ungültig';
    if (groups.list().some((x) => x.name === name && x.id !== id && vOf(x) === vOf(g))) return 'Gruppe existiert bereits';
    reGroup(g.name, name, vOf(g));
    groups.save({ ...g, name });
    return null;
  });
  handle('groups:remove', (_, id) => { // Hosts bleiben erhalten, nur ohne Gruppe
    const g = groups.list().find((x) => x.id === id);
    if (g) { reGroup(g.name, '', vOf(g)); groups.remove(id); }
  });
  handle('snippets:list', () => snippets.list());
  handle('snippets:save', (_, s) => snippets.save(s));
  handle('snippets:remove', (_, id) => snippets.remove(id));
  handle('fwd:list', () => forwards.list().map((r) => ({ ...normFwd(r), running: running.has(r.id) })));
  handle('fwd:save', (_, r) => forwards.save(r));
  handle('fwd:remove', (_, id) => { stopForward(id); forwards.remove(id); });
  handle('fwd:toggle', async (_, id) => {
    if (running.has(id)) { stopForward(id); return null; }
    try { await startForward(forwards.list().find((r) => r.id === id)); return null; } catch (e) { return e.message; }
  });
  handle('keys:list', () => keys.list());
  handle('keys:rescan', () => keyTools.scan(path.join(os.homedir(), '.ssh'), keys));
  handle('keys:generate', (_, o) => {
    try {
      const g = keyTools.generate(o);
      keys.add({ name: o.name, source: 'generated', type: g.type, publicKey: g.publicKey, fingerprint: g.fingerprint, privateKey: g.privateKey, passphrase: o.passphrase, encrypted: !!o.passphrase, ...(o.vault && o.vault !== 'personal' && { vault: o.vault }) });
      return null;
    } catch (e) { return e.message; }
  });
  // Eigenen Schlüssel einbinden (privat und/oder öffentlich); Rückgabe null oder Fehlertext
  handle('keys:import', (_, o) => {
    try {
      const name = String(o.name || '').trim();
      if (!name) return 'Name fehlt';
      const g = keyTools.importKey(o);
      keys.add({ name, source: 'added', type: g.type, publicKey: g.publicKey, fingerprint: g.fingerprint, privateKey: g.privateKey, passphrase: o.passphrase || undefined,
        encrypted: g.encrypted || !!o.passphrase, publicOnly: g.publicOnly, ...(o.vault && o.vault !== 'personal' && { vault: o.vault }) });
      return null;
    } catch (e) { return e.message; }
  });
  handle('keys:rename', (_, id, name) => { name = String(name || '').trim(); if (name) keys.rename(id, name); });
  // Schlüsseldatei lesen (klein, Text); eine daneben liegende .pub-Datei wird mitgeliefert
  handle('keys:readFile', async () => {
    const r = await dialog.showOpenDialog(mainWin, { properties: ['openFile'], defaultPath: path.join(os.homedir(), '.ssh') });
    if (r.canceled) return { canceled: true };
    try {
      const f = r.filePaths[0], pubFile = `${f}.pub`;
      if (fs.statSync(f).size > 65536) return { error: 'Schlüssel ist zu groß.' };
      const pub = fs.existsSync(pubFile) && fs.statSync(pubFile).size <= 65536 ? fs.readFileSync(pubFile, 'utf8') : '';
      return { text: fs.readFileSync(f, 'utf8'), pub, name: path.basename(f) };
    } catch (e) { return { error: e.message }; }
  });
  handle('keys:setPassphrase', (_, id, p) => keys.setPassphrase(id, p));
  handle('keys:remove', (_, id) => keys.remove(id));
  // Schlüssel klonen/verschieben in einen anderen Tresor (z. B. ins Team: dann sehen alle Mitglieder auch den privaten Teil). Schlüssel aus ~/.ssh lassen sich nur klonen.
  handle('keys:copy', (_, id, vault = 'personal', move = false) => {
    const k = keys.get(id);
    if (!k) return { error: 'Schlüssel oder Host nicht gefunden' };
    let privateKey = k.privateKey;
    if (!privateKey && k.path) { try { privateKey = fs.readFileSync(k.path, 'utf8'); } catch { /* Datei fehlt: nur öffentlicher Teil */ } }
    if (move && k.path) return { error: 'Update fehlgeschlagen' };
    const { id: _id, updatedAt: _u, hasPassphrase: _h, path: _p, ...rest } = k;
    keys.add({ ...rest, privateKey, publicOnly: privateKey ? undefined : k.publicOnly, vault: vault === 'personal' ? undefined : vault });
    if (move) keys.remove(id);
    return {};
  });
  handle('keys:exportPrivate', async (_, id) => {
    const k = keys.get(id);
    const { filePath } = await dialog.showSaveDialog(win, { defaultPath: k.name });
    if (!filePath) return null;
    try { fs.writeFileSync(filePath, k.privateKey || fs.readFileSync(k.path), { mode: 0o600 }); return null; } catch (e) { return e.message; }
  });
  handle('keys:toHost', (_, keyId, hostId) => {
    const k = keys.get(keyId), h = hosts.get(hostId);
    return k && h ? installKey(k, h) : 'Schlüssel oder Host nicht gefunden';
  });
  // SFTP: Antworten immer { data } | { error }
  handle('sftp:open', async (_, sid, hostId) => {
    const found = hosts.get(hostId);
    if (!found) return { error: 'Host nicht gefunden' };
    const done = await completeCreds(found, dialogAsk(found.name));
    if (!done) return { error: 'Abgebrochen' };
    const h = done.h;
    return new Promise((resolve) => {
    const conn = new Client();
    const auth = withAuth(conn, h, dialogAsk(h.name));
    conn.on('ready', () => conn.sftp((e, sftp) => {
      auth.persist();
      if (e) { conn.end(); return resolve({ error: e.message }); }
      sftps.set(sid, { conn, sftp });
      resolve({ data: null });
    })).on('error', (e) => resolve({ error: e.message }));
    sshConnect(conn, sshConfig(h, auth));
    });
  });
  const sftpOp = (name, fn) => handle(`sftp:${name}`, async (_, sid, ...a) => {
    const s = sftps.get(sid);
    if (!s) return { error: 'Nicht verbunden' };
    try { return { data: await fn(s.sftp, ...a) }; } catch (e) { return { error: e.message }; }
  });
  sftpOp('list', sftpTools.list);
  sftpOp('mkdir', sftpTools.mkdir);
  sftpOp('rename', sftpTools.rename);
  sftpOp('remove', sftpTools.remove);
  sftpOp('upload', sftpTools.upload);
  sftpOp('download', sftpTools.download);
  ipcMain.on('sftp:close', (_, sid) => { stopEdits(sid); sftps.get(sid)?.conn.end(); sftps.delete(sid); });
  handle('sftp:edit', async (_, sid, p, cmd) => { try { await editRemote(win, sid, p, cmd); return { data: null }; } catch (e) { return { error: e.message }; } });
  handle('editors:list', () => editors.detect().map(({ cmd, name }) => ({ cmd, name })));
  handle('sftp:copy', async (_, a, pa, b, db) => {
    const x = sftps.get(a), y = sftps.get(b);
    if (!x || !y) return { error: 'Nicht verbunden' };
    try { await sftpTools.copy(x.sftp, pa, y.sftp, db); return { data: null }; } catch (e) { return { error: e.message }; }
  });
  const localOp = (name, fn) => handle(`local:${name}`, async (_, ...a) => {
    try { return { data: await fn(...a) }; } catch (e) { return { error: e.message }; }
  });
  localOp('list', (d) => sftpTools.listLocal(d, os.homedir()));
  localOp('mkdir', (p) => fs.mkdirSync(p));
  localOp('rename', (a, b) => fs.renameSync(a, b));
  localOp('open', (p, cmd) => launch(p, cmd));
  localOp('remove', (p) => shell.trashItem(p)); // Papierkorb statt endgültig löschen
  ipcMain.handle('rec:save', async (_, text, name) => { // Aufzeichnung (asciicast v2) speichern
    const { filePath } = await dialog.showSaveDialog(win, { defaultPath: `${name}.cast`, filters: [{ name: 'asciicast', extensions: ['cast'] }] });
    if (!filePath) return null;
    fs.writeFileSync(filePath, text);
    return filePath;
  });
  ipcMain.on('ssh:open', (_, sid, id, cols, rows) => { const h = hosts.get(id); if (h) connect(win, sid, h, cols, rows); });
  ipcMain.on('ssh:input', (_, sid, d) => sessions.get(sid)?.stream?.write(d));
  ipcMain.on('cred:answer', (_, id, a) => { credAsks.get(id)?.(a); credAsks.delete(id); });
  ipcMain.on('ssh:answer', (_, sid, a) => { pending.get(sid)?.(a); pending.delete(sid); });
  ipcMain.on('ssh:resize', (_, sid, cols, rows) => sessions.get(sid)?.stream?.setWindow(rows, cols, 0, 0));
  ipcMain.on('ssh:close', (_, sid) => { pending.get(sid)?.(null); pending.delete(sid); sessions.get(sid)?.conn.end(); sessions.delete(sid); });
});

app.whenReady().then(() => {
  // erst nach dem Aufbau oben: Start-Sync, regelmäßig und beim Fokussieren
  if (loadSyncCfg()) runSync();
  setInterval(scheduleSync, 5 * 60 * 1000);
  mainWin.on('focus', scheduleSync);
});
app.on('before-quit', () => [...edits.keys()].forEach(stopEdits));
app.on('window-all-closed', () => app.quit());
