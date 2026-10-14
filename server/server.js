// SSH-Deck-Sync-Server: Konten + verschlüsselter Tresor. Der Server sieht nie Passwort oder Klartext.
// Start: node server/server.js   (Umgebung: PORT, DB_PATH, SMTP_URL, MAIL_FROM, VERIFY_EMAIL, ALLOW_REGISTRATION, TRUST_PROXY)
const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hashAuth = (auth, salt) => crypto.scryptSync(auth, salt, 32, { N: 2 ** 14, r: 8, p: 1 });
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
const DAY = 864e5;

function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    create table if not exists users (id integer primary key, email text unique not null, salt blob not null, hash blob not null,
      verified integer not null default 0, code_hash text, code_expires integer, code_tries integer not null default 0);
    create table if not exists sessions (token_hash text primary key, user_id integer not null, expires integer not null);
    create table if not exists vault (user_id integer primary key, blob text not null, rev integer not null, updated integer not null);`);
  return db;
}

function createServer({ db, verify = false, sendMail = async () => {}, allowRegistration = true, trustProxy = false, now = Date.now }) {
  const tries = new Map(); // einfache Bremse gegen Passwort-Raten: 10 Versuche / 10 Min je IP+E-Mail
  const limited = (key) => {
    const t = now();
    const a = (tries.get(key) || []).filter((x) => t - x < 600000);
    a.push(t); tries.set(key, a);
    return a.length > 10;
  };
  const fail = (status, error, extra) => Object.assign(new Error(error), { status, extra });
  const ip = (req) => (trustProxy && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress;

  const body = (req) => new Promise((ok, bad) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > 8e6) { bad(fail(413, 'Daten zu groß')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); } catch { bad(fail(400, 'Ungültiges JSON')); } });
  });

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

  const routes = {
    'POST /api/register': async (req, b) => {
      if (!allowRegistration) throw fail(403, 'Registrierung ist deaktiviert');
      const { email, auth } = credentials(b);
      const old = db.prepare('select id, verified from users where email = ?').get(email);
      if (old?.verified) throw fail(409, 'Diese E-Mail ist bereits registriert');
      const salt = crypto.randomBytes(16);
      const hash = hashAuth(auth, salt);
      let id;
      if (old) { db.prepare('update users set salt = ?, hash = ? where id = ?').run(salt, hash, old.id); id = old.id; } // unbestätigtes Konto neu starten
      else id = Number(db.prepare('insert into users (email, salt, hash, verified) values (?, ?, ?, ?)').run(email, salt, hash, verify ? 0 : 1).lastInsertRowid);
      if (!verify) return { token: issue(id) };
      await newCode(id, email);
      return { needsVerification: true };
    },
    'POST /api/verify': async (req, b) => {
      const email = String(b.email || '').trim().toLowerCase();
      if (limited(`v:${ip(req)}:${email}`)) throw fail(429, 'Zu viele Versuche, bitte später erneut');
      const u = db.prepare('select id, code_hash, code_expires, code_tries, verified from users where email = ?').get(email);
      if (!u || u.verified || !u.code_hash) throw fail(400, 'Code ungültig oder abgelaufen');
      if (u.code_tries >= 5 || u.code_expires < now()) throw fail(400, 'Code abgelaufen – bitte neu registrieren');
      db.prepare('update users set code_tries = code_tries + 1 where id = ?').run(u.id);
      if (!same(Buffer.from(sha(String(b.code || '').trim())), Buffer.from(u.code_hash))) throw fail(400, 'Code falsch');
      db.prepare('update users set verified = 1, code_hash = null where id = ?').run(u.id);
      return { token: issue(u.id) };
    },
    'POST /api/login': async (req, b) => {
      const { email, auth } = credentials(b);
      if (limited(`l:${ip(req)}:${email}`)) throw fail(429, 'Zu viele Versuche, bitte später erneut');
      const u = db.prepare('select id, salt, hash, verified from users where email = ?').get(email);
      const ok = same(hashAuth(auth, u ? u.salt : Buffer.alloc(16)), u ? Buffer.from(u.hash) : Buffer.alloc(32, 1)); // auch für unbekannte E-Mails rechnen
      if (!u || !ok) throw fail(401, 'E-Mail oder Passwort falsch');
      if (!u.verified) throw fail(403, 'E-Mail noch nicht bestätigt', { needsVerification: true });
      return { token: issue(u.id) };
    },
    'POST /api/logout': async (req) => {
      db.prepare('delete from sessions where token_hash = ?').run(userOf(req).tokenHash);
      return {};
    },
    'GET /api/vault': async (req) => {
      const v = db.prepare('select blob, rev from vault where user_id = ?').get(userOf(req).id);
      return { vault: v || null };
    },
    // Optimistische Sperre: prev = bisherige rev (null bei erstem Schreiben); sonst 409
    'PUT /api/vault': async (req, b) => {
      const { id } = userOf(req);
      if (typeof b.blob !== 'string') throw fail(400, 'blob fehlt');
      const cur = db.prepare('select rev from vault where user_id = ?').get(id);
      if ((cur ? cur.rev : null) !== (b.prev ?? null)) throw fail(409, 'Konflikt');
      const rev = (cur ? cur.rev : 0) + 1;
      db.prepare('insert or replace into vault values (?, ?, ?, ?)').run(id, b.blob, rev, now());
      return { rev };
    },
  };

  return http.createServer(async (req, res) => {
    const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    try {
      const route = routes[`${req.method} ${new URL(req.url, 'http://x').pathname}`];
      if (!route) throw fail(404, 'Nicht gefunden');
      send(200, await route(req, req.method === 'GET' ? {} : await body(req)));
    } catch (e) {
      if (!e.status) console.error(e);
      send(e.status || 500, { error: e.status ? e.message : 'Serverfehler', ...e.extra });
    }
  });
}

module.exports = { createServer, openDb };

if (require.main === module) {
  const env = process.env;
  const smtp = env.SMTP_URL;
  const verify = (env.VERIFY_EMAIL ?? (smtp ? '1' : '0')) === '1';
  let sendMail = async (to, code) => console.log(`[Bestätigungscode für ${to}] ${code}`); // ohne SMTP: Code im Server-Log
  if (smtp) {
    const mailer = require('nodemailer').createTransport(smtp); // npm i nodemailer (nur für den Server nötig)
    sendMail = (to, code) => mailer.sendMail({ from: env.MAIL_FROM || 'SSH Deck <noreply@localhost>', to, subject: 'Dein SSH-Deck-Code', text: `Dein Bestätigungscode: ${code}\n\nGültig für 15 Minuten.` });
  }
  const dbFile = env.DB_PATH || './data/deck.db';
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = openDb(dbFile);
  createServer({ db, verify, sendMail, allowRegistration: (env.ALLOW_REGISTRATION ?? '1') === '1', trustProxy: env.TRUST_PROXY === '1' })
    .listen(+env.PORT || 8787, env.HOST || '0.0.0.0', () => console.log(`SSH-Deck-Server läuft auf Port ${+env.PORT || 8787} (E-Mail-Code: ${verify ? 'an' : 'aus'})`));
}
