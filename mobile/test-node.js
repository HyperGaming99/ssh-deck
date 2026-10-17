// Prüft den Handy-Unterbau auf dem Desktop: main.js läuft über den electron-Ersatz, die Oberfläche spricht per JSON-Kanal.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
process.env.DECK_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-mobile-'));
const toNode = new EventEmitter(), toWeb = new EventEmitter();
global.__deckChannel = { on: (e, f) => toNode.on(e, f), send: (s) => toWeb.emit('message', s) };
require('./node/entry');

let n = 0;
const call = (ch, ...args) => new Promise((res, rej) => {
  const id = ++n;
  const f = (raw) => { const m = JSON.parse(raw); if (m.t === 'result' && m.id === id) { toWeb.off('message', f); m.ok ? res(m.value) : rej(new Error(m.error)); } };
  toWeb.on('message', f);
  toNode.emit('message', JSON.stringify({ t: 'invoke', id, ch, args }));
});

(async () => {
  await new Promise((r) => setTimeout(r, 300)); // whenReady -> Handler registrieren
  const id = await call('hosts:save', { name: 'Pi', host: '10.0.0.5', user: 'pi', secret: 'geheim' });
  const list = await call('hosts:list');
  assert.equal(list.length, 1); assert.equal(list[0].name, 'Pi'); assert(list[0].hasSecret && !list[0].secret);
  const full = await call('hosts:get', id);
  assert(full.hasSecret && full.secret === undefined, 'Passwort geht nie an die Oberfläche');
  const raw = fs.readFileSync(path.join(process.env.DECK_DATA, 'hosts.json'), 'utf8');
  assert(!raw.includes('geheim') && JSON.parse(raw)[0].secret, 'Passwort liegt verschlüsselt');
  const { safeStorage } = require('./node/electron-shim');
  assert.equal(safeStorage.decryptString(Buffer.from(JSON.parse(raw)[0].secret, 'base64')), 'geheim', 'Entschlüsselung über den Ersatz');
  await assert.rejects(call('gibt:es:nicht'), /Kein Handler/);
  console.log('mobile node ok');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
