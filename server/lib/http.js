// HTTP-, Rate-Limiting- und Sitzungs-Hilfsfunktionen für den Sync-Server.
const crypto = require('crypto');
const { sha, EMAIL, DAY } = require('./crypto');

const fail = (status, error, extra) => Object.assign(new Error(error), { status, extra });

const body = (req) => new Promise((ok, bad) => {
  const chunks = []; let n = 0;
  req.on('data', (c) => { n += c.length; if (n > 8e6) { bad(fail(413, 'Daten zu groß')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); } catch { bad(fail(400, 'Ungültiges JSON')); } });
});

function createContext({ db, trustProxy = false, sendMail = async () => {}, now = Date.now }) {
  const tries = new Map(); // einfache Bremse gegen Passwort-Raten: 10 Versuche / 10 Min je IP+E-Mail
  const limited = (key) => {
    const t = now();
    const a = (tries.get(key) || []).filter((x) => t - x < 600000);
    a.push(t); tries.set(key, a);
    return a.length > 10;
  };
  const ip = (req) => (trustProxy && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress;

  const issue = (userId) => {
    const token = crypto.randomBytes(32).toString('base64url');
    db.prepare('insert into sessions values (?, ?, ?)').run(sha(token), userId, now() + 90 * DAY);
    return token;
  };
  const userOf = (req) => {
    const t = (req.headers.authorization || '').replace(/^Bearer /, '');
    const s = t && db.prepare('select user_id, expires from sessions where token_hash = ?').get(sha(t));
    if (!s || s.expires < now()) throw fail(401, 'Nicht angemeldet');
    return { id: s.user_id, tokenHash: sha(t) };
  };
  const newCode = (userId, email) => {
    const code = String(crypto.randomInt(100000, 1000000));
    db.prepare('update users set code_hash = ?, code_expires = ?, code_tries = 0 where id = ?').run(sha(code), now() + 15 * 60000, userId);
    return sendMail(email, code);
  };
  const credentials = (b) => {
    const email = String(b.email || '').trim().toLowerCase();
    if (!EMAIL.test(email)) throw fail(400, 'Ungültige E-Mail-Adresse');
    if (typeof b.auth !== 'string' || b.auth.length < 20 || b.auth.length > 200) throw fail(400, 'Ungültige Anmeldedaten');
    return { email, auth: b.auth };
  };

  return { db, now, limited, ip, issue, userOf, newCode, credentials };
}

module.exports = { fail, body, createContext };
