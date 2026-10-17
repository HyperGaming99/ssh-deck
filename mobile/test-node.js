// Prüft den Handy-Unterbau auf dem Desktop: main.js läuft über den electron-Ersatz, die Oberfläche spricht per JSON-Kanal.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
process.env.DECK_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-mobile-'));
const toNode = new EventEmitter(), toWeb = new EventEmitter();
global.__deckKs = true; // Keystore-Pfad wie auf Android, Gegenstelle simuliert unten
const ksKey = require('crypto').randomBytes(32);
const legacyKey = require('crypto').randomBytes(32);
fs.writeFileSync(path.join(process.env.DECK_DATA, '.secret-key'), legacyKey); // Altbestand: Klartext-Schlüssel
global.__deckChannel = { on: (e, f) => toNode.on(e, f), send: (s) => { const m = JSON.parse(s); if (m.t === 'ks') return ks(m); toWeb.emit('message', s); } };
const ksLog = [];
function ks(m) { // "Android Keystore": packt mit ksKey ein/aus
  const c = require('crypto'); const d = Buffer.from(m.data, 'base64'); ksLog.push(m.op);
  let out;
  if (m.op === 'wrap') { const iv = c.randomBytes(12), ci = c.createCipheriv('aes-256-gcm', ksKey, iv); const b = Buffer.concat([ci.update(d), ci.final()]); out = Buffer.concat([iv, ci.getAuthTag(), b]); }
  else { const de = c.createDecipheriv('aes-256-gcm', ksKey, d.subarray(0, 12)); de.setAuthTag(d.subarray(12, 28)); out = Buffer.concat([de.update(d.subarray(28)), de.final()]); }
  setImmediate(() => toNode.emit('message', JSON.stringify({ t: 'ksres', id: m.id, data: out.toString('base64') })));
}
require('./node/entry');

let n = 0;
const call = (ch, ...args) => new Promise((res, rej) => {
  const id = ++n;
  const f = (raw) => { const m = JSON.parse(raw); if (m.t === 'result' && m.id === id) { toWeb.off('message', f); m.ok ? res(m.value) : rej(new Error(m.error)); } };
  toWeb.on('message', f);
  toNode.emit('message', JSON.stringify({ t: 'invoke', id, ch, args }));
});

(async () => {
  await new Promise((r) => setTimeout(r, 500)); // Schlüssel entpacken, whenReady -> Handler registrieren
  assert.deepEqual(ksLog, ['wrap'], 'Altbestand wurde eingepackt');
  assert(!fs.existsSync(path.join(process.env.DECK_DATA, '.secret-key')), 'Klartext-Schlüssel ist gelöscht');
  assert(fs.existsSync(path.join(process.env.DECK_DATA, '.secret-key.ks')));
  const id = await call('hosts:save', { name: 'Pi', host: '10.0.0.5', user: 'pi', secret: 'geheim' });
  const list = await call('hosts:list');
  assert.equal(list.length, 1); assert.equal(list[0].name, 'Pi'); assert(list[0].hasSecret && !list[0].secret);
  const full = await call('hosts:get', id);
  assert(full.hasSecret && full.secret === undefined, 'Passwort geht nie an die Oberfläche');
  const raw = fs.readFileSync(path.join(process.env.DECK_DATA, 'hosts.json'), 'utf8');
  assert(!raw.includes('geheim') && JSON.parse(raw)[0].secret, 'Passwort liegt verschlüsselt');
  const { safeStorage } = require('./node/electron-shim');
  assert.equal(safeStorage.decryptString(Buffer.from(JSON.parse(raw)[0].secret, 'base64')), 'geheim', 'Entschlüsselung über den Ersatz');
  const { createDecipheriv } = require('crypto'); const blob = Buffer.from(JSON.parse(raw)[0].secret, 'base64');
  const d = createDecipheriv('aes-256-gcm', legacyKey, blob.subarray(0, 12)); d.setAuthTag(blob.subarray(12, 28));
  assert.equal(Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString(), 'geheim', 'der eingepackte Altschlüssel ist weiter der Datenschlüssel');
  await assert.rejects(call('gibt:es:nicht'), /Kein Handler/);
  console.log('mobile node ok');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
