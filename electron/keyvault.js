// Cloud-Schlüsselbund: SSH-Schlüssel, die der Nutzer bewusst in die Cloud legt. Reine Logik, kein Electron.
// Schutz in zwei Schichten:
//   1. Ein zufälliger Tresorschlüssel (VK) verschlüsselt die Schlüssel. Er liegt nur eingepackt beim Server.
//   2. Eingepackt wird er mit einem Schlüssel aus Passwort UND Geheimschlüssel (SK). Der SK verlässt nie die Geräte; wer nur die Server-Datenbank hat,
//      kann das Passwort deshalb nicht offline erraten, auch wenn es schwach ist.
const crypto = require('crypto');
const { promisify } = require('util');
const { seal, open } = require('./sync');

const scrypt = promisify(crypto.scrypt);
const KDF = { N: 2 ** 17, r: 8, p: 1 }; // ~128 MB, rund eine Sekunde; die Werte stehen im Kopf, damit man sie später anheben kann
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford-Base32 (ohne I, L, O, U)

// Geheimschlüssel: 16 Zufallsbytes, lesbar als SD1-XXXXXX-XXXXX-XXXXX-XXXXX-XXXXX
function newSecretKey() {
  const bytes = crypto.randomBytes(16);
  let bits = '', out = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i < 128; i += 5) out += ALPHA[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return { bytes, text: 'SD1-' + out.replace(/^(.{6})(.{5})(.{5})(.{5})(.{5})$/, '$1-$2-$3-$4-$5') };
}
function parseSecretKey(text) {
  const raw = String(text).toUpperCase().replace(/^SD1-?/, '').replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(raw)) throw Object.assign(new Error('Geheimschlüssel ungültig'), { code: 'SK' });
  let bits = '';
  for (const c of raw) bits += ALPHA.indexOf(c).toString(2).padStart(5, '0');
  return Buffer.from(bits.slice(0, 128).match(/.{8}/g).map((x) => parseInt(x, 2)));
}
async function kek(password, sk, salt, kdf) {
  const master = await scrypt(password, salt, 32, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 512 * 1024 * 1024 });
  return crypto.createHmac('sha256', master).update(Buffer.concat([Buffer.from('ssh-deck/keychain/kek/v1'), sk])).digest();
}

// Neuer Schlüsselbund: { secretKey (Text für den Nutzer), vk (Buffer), header (String für den Server) }
async function create(password) {
  const sk = newSecretKey(), vk = crypto.randomBytes(32), salt = crypto.randomBytes(16);
  const header = { v: 1, kdf: { ...KDF }, salt: salt.toString('base64'), wrapped: seal(await kek(password, sk.bytes, salt, KDF), { vk: vk.toString('base64') }) };
  return { secretKey: sk.text, vk, header: JSON.stringify(header) };
}
// Auf einem neuen Gerät: Passwort + Geheimschlüssel -> Tresorschlüssel. Wirft bei falscher Eingabe (code 'WRONG') oder ungültigem Geheimschlüssel (code 'SK').
async function unlock(password, secretKey, headerText) {
  const h = JSON.parse(headerText), sk = parseSecretKey(secretKey);
  try { return Buffer.from(open(await kek(password, sk, Buffer.from(h.salt, 'base64'), h.kdf), h.wrapped).vk, 'base64'); }
  catch (e) { throw Object.assign(new Error('Passwort oder Geheimschlüssel falsch'), { code: 'WRONG' }); }
}

// Stand der Cloud-Schlüssel: nur Schlüssel mit cloud-Flag (auch Löschmarker), dazu Marker für bewusst entfernte
const snapshot = (rawKeys, tomb) => ({ keys: [...rawKeys.filter((k) => k.cloud), ...tomb.map((t) => ({ id: t.id, deleted: true, cloud: true, updatedAt: t.at }))] });
// Gemischten Stand lokal anwenden: lokale Schlüssel ohne cloud-Flag bleiben unberührt, Löschmarker löschen nur Cloud-Schlüssel
function apply(localKeys, merged) {
  const out = [...localKeys];
  for (const r of merged.keys || []) {
    const i = out.findIndex((k) => k.id === r.id), l = out[i];
    if (r.deleted) { if (l && l.cloud) out[i] = r; continue; }
    if (!l) out.push(r); else if (!l.cloud || r.updatedAt >= l.updatedAt) out[i] = { ...r, cloud: true };
  }
  return out;
}
module.exports = { create, unlock, newSecretKey, parseSecretKey, snapshot, apply, KDF };
