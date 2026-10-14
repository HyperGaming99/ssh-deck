// Cloud-Sync gegen den eigenen Server (server/server.js), Ende-zu-Ende verschlüsselt. Reine Logik, kein Electron.
const crypto = require('crypto');

// Aus E-Mail + Passwort zwei unabhängige Werte: auth (Login-Beweis, geht an den Server) und enc (Datenschlüssel, bleibt lokal).
// Der Server sieht das Passwort nie und kann aus auth den enc-Schlüssel nicht ableiten.
function deriveKeys(email, password) {
  const salt = crypto.createHash('sha256').update('ssh-deck/' + email.trim().toLowerCase()).digest();
  const master = crypto.scryptSync(password, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const part = (label) => crypto.createHmac('sha256', master).update(label).digest();
  return { enc: part('enc'), auth: part('auth').toString('base64') };
}

// base64( iv[12] | tag[16] | ciphertext ); open wirft bei falschem Schlüssel oder manipulierten Daten
function seal(key, obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
function open(key, b64) {
  const buf = Buffer.from(b64, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8'));
}

// Snapshot: { sammlung: [{ id, updatedAt, deleted?, ... }] }. Pro id gewinnt der jüngste Stand; bei Gleichstand der lokale.
// ponytail: Löschmarker älter als 90 Tage fallen weg; ein Gerät, das länger offline war, bringt Gelöschtes zurück.
function merge(local, remote, now = Date.now()) {
  const out = {};
  for (const col of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const m = new Map();
    for (const r of [...(local[col] || []), ...(remote[col] || [])]) {
      const o = m.get(r.id);
      if (!o || r.updatedAt > o.updatedAt) m.set(r.id, r);
    }
    out[col] = [...m.values()].filter((r) => !(r.deleted && now - r.updatedAt > 90 * 864e5));
  }
  return out;
}

// Kanonische Form zum Vergleichen: Sammlungen und Einträge nach id, Felder nach Name sortiert
const canon = (s) => JSON.stringify(Object.keys(s).sort().map((c) => [
  c, [...s[c]].sort((a, b) => (a.id < b.id ? -1 : 1)).map((r) => Object.fromEntries(Object.entries(r).sort())),
]));

// Ein Abgleich: Remote holen, mischen, lokal anwenden, zurückschreiben (mit Konflikt-Wiederholung).
async function syncOnce({ cloud, key, local }) {
  for (let i = 0; i < 4; i++) {
    const row = await cloud.getVault();
    const remote = row ? open(key, row.blob) : {};
    const merged = merge(local.get(), remote);
    local.set(merged);
    if (row && canon(merged) === canon(remote)) return merged; // nichts zu schreiben
    if (await cloud.putVault(seal(key, merged), row ? row.rev : null)) return merged;
  }
  throw new Error('Konflikt – bitte erneut synchronisieren.');
}

// HTTP-Client für server/server.js
class Backend {
  constructor({ url, token }, opts = {}) {
    this.url = url.replace(/\/+$/, '');
    this.token = token;
    this.fetch = opts.fetch || fetch;
  }
  async #req(method, p, body) {
    const res = await this.fetch(`${this.url}/api/${p}`, {
      method, body: body && JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...(this.token && { Authorization: `Bearer ${this.token}` }) },
    });
    const t = await res.text();
    let j = {};
    try { j = t ? JSON.parse(t) : {}; } catch { /* kein JSON */ }
    if (!res.ok) throw Object.assign(new Error(j.error || `HTTP ${res.status}`), { status: res.status, needsVerification: !!j.needsVerification });
    return j;
  }
  // Ergebnis: { token } oder { needsVerification: true }
  register(email, auth) { return this.#req('POST', 'register', { email, auth }); }
  async verify(email, code) { return (await this.#req('POST', 'verify', { email, code })).token; }
  async login(email, auth) { return (await this.#req('POST', 'login', { email, auth })).token; }
  logout() { return this.#req('POST', 'logout', {}); }
  async getVault() { return (await this.#req('GET', 'vault')).vault; }
  // prev null = erstes Schreiben. false = Konflikt (anderes Gerät war schneller).
  async putVault(blob, prev) {
    try { await this.#req('PUT', 'vault', { blob, prev }); return true; } catch (e) { if (e.status === 409) return false; throw e; }
  }
}

module.exports = { deriveKeys, seal, open, merge, syncOnce, Backend };
