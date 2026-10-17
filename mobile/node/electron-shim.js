// Ersatz für das Modul "electron" auf dem Handy (nodejs-mobile): so läuft main.js unverändert.
// Die Oberfläche (WebView) spricht über einen JSON-Kanal mit dieser Seite; siehe mobile/web/electron-web.js.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const DATA = process.env.DECK_DATA || path.join(require('rn-bridge').app.datadir(), 'ssh-deck'); // privater App-Speicher; os.tmpdir() ist auf Android nicht beschreibbar
process.env.HOME = process.env.HOME || DATA; // os.homedir() (z. B. ~/.ssh) soll nicht ins Leere zeigen
fs.mkdirSync(DATA, { recursive: true });

// Kanal: nodejs-mobile bringt "rn-bridge" mit, Tests setzen global.__deckChannel
const chan = global.__deckChannel || require('rn-bridge').channel;
let live = false; // main.js hat seine Handler registriert
const handlers = new Map(); // invoke
const listeners = new Map(); // send
const asks = new Map(); // Anfragen an das Handy (Dateiauswahl, Teilen, ...)
let askId = 0;

chan.on('message', (raw) => {
  let m; try { m = JSON.parse(raw); } catch { return; }
  const ev = { sender: { id: 1 } };
  if (m.t === 'hello') { if (live) chan.send(JSON.stringify({ t: 'ready' })); } // die Oberfläche fragt, bis wir da sind
  else if (m.t === 'invoke') {
    Promise.resolve().then(() => { const h = handlers.get(m.ch); if (!h) throw new Error(`Kein Handler: ${m.ch}`); return h(ev, ...(m.args || [])); })
      .then((value) => chan.send(JSON.stringify({ t: 'result', id: m.id, ok: true, value: value === undefined ? null : value })))
      .catch((e) => chan.send(JSON.stringify({ t: 'result', id: m.id, ok: false, error: String(e && e.message || e) })));
  } else if (m.t === 'send') (listeners.get(m.ch) || []).forEach((f) => f(ev, ...(m.args || [])));
  else if (m.t === 'res') { asks.get(m.id)?.(m.value); asks.delete(m.id); }
  else if (m.t === 'ksres') { ksReq.get(m.id)?.(m); ksReq.delete(m.id); }
});

const emit = (ch, ...args) => chan.send(JSON.stringify({ t: 'event', ch, args }));
const ask = (name, ...args) => new Promise((res) => { const id = ++askId; asks.set(id, res); chan.send(JSON.stringify({ t: 'req', id, name, args })); });

const ipcMain = {
  handle: (ch, fn) => handlers.set(ch, fn),
  on: (ch, fn) => listeners.set(ch, [...(listeners.get(ch) || []), fn]),
};

const win = Object.assign(new EventEmitter(), {
  webContents: { send: emit },
  isDestroyed: () => false, removeMenu() {}, loadFile() {}, show() {}, minimize() {}, maximize() {}, unmaximize() {}, isMaximized: () => false, close() {},
});
class BrowserWindow { constructor() { return win; } static fromWebContents() { return win; } }

const app = Object.assign(new EventEmitter(), {
  whenReady: () => Promise.resolve(),
  getPath: (n) => (n === 'temp' ? path.join(DATA, 'tmp') : DATA),
  getVersion: () => process.env.DECK_VERSION || '0.0.0',
  isPackaged: true,
  quit() {},
});
fs.mkdirSync(path.join(DATA, 'tmp'), { recursive: true });

// Geheimnisse: AES-256-GCM. Der Schlüssel liegt nur eingepackt (Android Keystore, AES-GCM, nicht auslesbar) neben den Daten.
// Das Ein-/Auspacken macht die Java-Seite (NodeBridgePlugin); Anfrage { t:'ks', id, op:'wrap'|'unwrap', data } -> { t:'ksres', id, data | error }.
// ponytail: Ist der Keystore nicht nutzbar, fällt es auf die Schlüsseldatei im privaten App-Speicher zurück (und loggt das).
const ksReq = new Map();
let ksId = 0;
const ks = (op, data) => new Promise((res, rej) => {
  const id = ++ksId;
  ksReq.set(id, (m) => (m.error ? rej(new Error(m.error)) : res(Buffer.from(m.data, 'base64'))));
  chan.send(JSON.stringify({ t: 'ks', id, op, data: data.toString('base64') }));
});
let secretKey;
const keyReady = (async () => {
  const plain = path.join(DATA, '.secret-key'), wrapped = plain + '.ks';
  const legacy = () => { try { secretKey = fs.readFileSync(plain); } catch { secretKey = crypto.randomBytes(32); fs.writeFileSync(plain, secretKey, { mode: 0o600 }); } };
  if (!(process.platform === 'android' || global.__deckKs)) return legacy();
  try {
    if (fs.existsSync(wrapped)) { try { secretKey = await ks('unwrap', fs.readFileSync(wrapped)); } catch { fs.rmSync(wrapped); } } // Keystore-Schlüssel verloren: neu anfangen, der Sync liefert die Daten wieder
    if (!secretKey) {
      const old = fs.existsSync(plain) ? fs.readFileSync(plain) : null; // Altbestand: Klartext-Schlüssel einpacken und löschen
      const k = old || crypto.randomBytes(32);
      fs.writeFileSync(wrapped, await ks('wrap', k), { mode: 0o600 });
      secretKey = k;
      if (old) { fs.writeFileSync(plain, crypto.randomBytes(32)); fs.rmSync(plain); }
    }
  } catch (e) { console.error('Keystore nicht nutzbar, Schlüsseldatei als Notlösung:', e.message); legacy(); }
})();
keyReady.then(() => chan.send(JSON.stringify({ t: 'boot' }))); // meldet dem Handy: Kanal steht
const safeStorage = {
  encryptString: (s) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', secretKey, iv); const b = Buffer.concat([c.update(String(s), 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), b]); },
  decryptString: (buf) => { const d = crypto.createDecipheriv('aes-256-gcm', secretKey, buf.subarray(0, 12)); d.setAuthTag(buf.subarray(12, 28)); return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8'); },
};

// Dateiauswahl/Speichern übernimmt das Handy (Android-Dateiauswahl); Antwort { path } bzw. null
const dialog = {
  showSaveDialog: async (_w, o = {}) => { const r = await ask('save', o.defaultPath ? path.basename(o.defaultPath) : 'datei'); return { canceled: !r, filePath: r || undefined }; },
  showOpenDialog: async (_w, o = {}) => { const r = await ask('open', o.properties || [], o.filters || []); return { canceled: !r || !r.length, filePaths: r || [] }; },
};
const shell = { openExternal: (u) => ask('openExternal', u), openPath: (p) => ask('openPath', p), trashItem: async (p) => fs.rmSync(p, { recursive: true, force: true }) };
const session = { fromPartition: () => ({ setProxy: async () => {} }) };

module.exports = { go: () => { live = true; }, keyReady, app, BrowserWindow, ipcMain, safeStorage, dialog, shell, session, emit, ask, DATA };
