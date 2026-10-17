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
    create table if not exists vault (user_id integer primary key, blob text not null, rev integer not null, updated integer not null);
    create table if not exists keyvault (user_id integer primary key, header text not null, blob text, rev integer not null default 0, updated integer not null);
    create table if not exists teams (id text primary key, name text not null, key_version integer not null default 1, blob text, rev integer not null default 0, updated integer not null, created integer not null);
    create table if not exists team_members (team_id text not null, user_id integer not null, role text not null, wrapped_key text not null, wrapped_by integer not null, key_version integer not null, joined integer not null, primary key (team_id, user_id));`);
  try { db.exec('alter table users add column pubkey text'); } catch { /* Spalte gibt es schon */ }
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
    // Konto samt aller Daten löschen (Google Play verlangt das). Bestätigung mit E-Mail + Passwort-Beweis wie beim Login, auch ohne Sitzung (Web-Anfrage).
    // Besitzer eines Teams mit weiteren Mitgliedern müssen das Team zuerst löschen (es gibt keine Übergabe, die Schlüssel gehören den Mitgliedern).
    'POST /api/account/delete': async (req, b) => {
      const { email, auth } = credentials(b);
      if (limited(`d:${ip(req)}:${email}`)) throw fail(429, 'Zu viele Versuche, bitte später erneut');
      const u = db.prepare('select id, salt, hash from users where email = ?').get(email);
      const ok = same(hashAuth(auth, u ? u.salt : Buffer.alloc(16)), u ? Buffer.from(u.hash) : Buffer.alloc(32, 1));
      if (!u || !ok) throw fail(401, 'E-Mail oder Passwort falsch');
      const owned = db.prepare("select t.id, t.name, (select count(*) from team_members x where x.team_id = t.id) as n from team_members m join teams t on t.id = m.team_id where m.user_id = ? and m.role = 'owner'").all(u.id);
      const shared = owned.find((t) => t.n > 1);
      if (shared) throw fail(409, `Du bist Besitzer des Teams „${shared.name}“ mit weiteren Mitgliedern. Lösche das Team zuerst.`);
      db.exec('begin');
      try {
        for (const t of owned) { db.prepare('delete from team_members where team_id = ?').run(t.id); db.prepare('delete from teams where id = ?').run(t.id); }
        for (const q of ['team_members', 'sessions', 'vault', 'keyvault']) db.prepare(`delete from ${q} where user_id = ?`).run(u.id);
        db.prepare('delete from users where id = ?').run(u.id);
        db.exec('commit');
      } catch (e) { db.exec('rollback'); throw e; }
      return {};
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
    // ---- Cloud-Schlüsselbund: SSH-Schlüssel mit eigenem Tresorschlüssel; der Server speichert nur Kopf (eingepackter Schlüssel, KDF-Parameter) und Chiffretext ----
    'GET /api/keyvault': async (req) => {
      const v = db.prepare('select header, blob, rev from keyvault where user_id = ?').get(userOf(req).id);
      return { vault: v ? { header: v.header, blob: v.blob, rev: v.rev || null } : null };
    },
    'PUT /api/keyvault': async (req, b) => {
      const { id } = userOf(req);
      if (typeof b.header !== 'string' || b.header.length > 4096) throw fail(400, 'Schlüssel fehlt');
      if (b.blob !== undefined && b.blob !== null && (typeof b.blob !== 'string' || b.blob.length > 8e6)) throw fail(400, 'blob fehlt');
      const cur = db.prepare('select rev from keyvault where user_id = ?').get(id);
      if ((cur ? cur.rev || null : null) !== (b.prev ?? null)) throw fail(409, 'Konflikt');
      const rev = (cur ? cur.rev : 0) + 1;
      db.prepare('insert or replace into keyvault values (?, ?, ?, ?, ?)').run(id, b.header, b.blob ?? null, rev, now());
      return { rev };
    },
    'DELETE /api/keyvault': async (req) => {
      db.prepare('delete from keyvault where user_id = ?').run(userOf(req).id);
      return {};
    },
    // ---- Teams: der Server speichert nur Chiffretext und eingepackte Schlüssel ----
    'PUT /api/me/pubkey': async (req, b) => {
      const { id } = userOf(req);
      if (typeof b.pubkey !== 'string' || Buffer.from(b.pubkey, 'base64').length !== 32) throw fail(400, 'Ungültiger öffentlicher Schlüssel');
      db.prepare('update users set pubkey = ? where id = ?').run(b.pubkey, id);
      return {};
    },
    'GET /api/users/lookup': async (req, b, url) => {
      const me = userOf(req);
      if (limited(`lookup:${me.id}`)) throw fail(429, 'Zu viele Versuche, bitte später erneut');
      const u = db.prepare('select id, email, pubkey, verified from users where email = ?').get(String(url.searchParams.get('email') || '').trim().toLowerCase());
      if (!u || !u.verified) throw fail(404, 'Nutzer nicht gefunden');
      if (!u.pubkey) throw fail(409, 'Nutzer hat die Team-Funktion noch nicht eingerichtet');
      return { userId: u.id, email: u.email, pubkey: u.pubkey };
    },
    'POST /api/teams': async (req, b) => {
      const me = userOf(req), name = String(b.name || '').trim();
      if (!name || name.length > 60) throw fail(400, 'Ungültiger Teamname');
      if (typeof b.wrappedKey !== 'string' || b.wrappedKey.length > 600) throw fail(400, 'Schlüssel fehlt');
      const id = crypto.randomUUID(), t = now();
      db.prepare('insert into teams (id, name, updated, created) values (?, ?, ?, ?)').run(id, name, t, t);
      db.prepare('insert into team_members values (?, ?, ?, ?, ?, 1, ?)').run(id, me.id, 'owner', b.wrappedKey, me.id, t);
      return { id };
    },
    'GET /api/teams': async (req) => {
      const me = userOf(req);
      const rows = db.prepare(`select t.id, t.name, t.rev, t.key_version as keyVersion, m.role, m.wrapped_key as wrappedKey, u.pubkey as wrapperPub,
        (select count(*) from team_members x where x.team_id = t.id) as members
        from team_members m join teams t on t.id = m.team_id join users u on u.id = m.wrapped_by where m.user_id = ?`).all(me.id);
      return { teams: rows };
    },
  };

  // Routen mit Parametern: [Methode, Muster, Handler(req, body, treffer, url)]
  const need = (req, teamId, manage = false) => {
    const me = userOf(req);
    const m = db.prepare('select * from team_members where team_id = ? and user_id = ?').get(teamId, me.id);
    const t = m && db.prepare('select * from teams where id = ?').get(teamId);
    if (!t) throw fail(404, 'Team nicht gefunden');
    if (manage && m.role !== 'owner' && m.role !== 'admin') throw fail(403, 'Keine Berechtigung');
    return { me, m, t };
  };
  const ASSIGNABLE = ['admin', 'member', 'viewer'];
  const dynamic = [
    ['GET', /^\/api\/teams\/([\w-]+)$/, async (req, b, [id]) => {
      const { t, m } = need(req, id);
      const members = db.prepare('select u.id as userId, u.email, u.pubkey, x.role from team_members x join users u on u.id = x.user_id where x.team_id = ? order by x.joined').all(id);
      return { team: { id, name: t.name, role: m.role, keyVersion: t.key_version }, members };
    }],
    ['GET', /^\/api\/teams\/([\w-]+)\/vault$/, async (req, b, [id]) => {
      const { t } = need(req, id);
      return { vault: { blob: t.blob, rev: t.rev ? t.rev : null, keyVersion: t.key_version } };
    }],
    // Optimistische Sperre wie beim persönlichen Tresor; Betrachter dürfen nicht schreiben
    ['PUT', /^\/api\/teams\/([\w-]+)\/vault$/, async (req, b, [id]) => {
      const { t, m } = need(req, id);
      if (m.role === 'viewer') throw fail(403, 'Keine Berechtigung');
      if (typeof b.blob !== 'string') throw fail(400, 'blob fehlt');
      if (b.keyVersion !== t.key_version || (t.rev || null) !== (b.prev ?? null)) throw fail(409, 'Konflikt');
      db.prepare('update teams set blob = ?, rev = ?, updated = ? where id = ?').run(b.blob, t.rev + 1, now(), id);
      return { rev: t.rev + 1 };
    }],
    ['POST', /^\/api\/teams\/([\w-]+)\/members$/, async (req, b, [id]) => {
      const { m, t } = need(req, id, true);
      const role = String(b.role || 'member');
      if (!ASSIGNABLE.includes(role) || (role === 'admin' && m.role !== 'owner')) throw fail(400, 'Ungültige Rolle');
      if (typeof b.wrappedKey !== 'string' || b.wrappedKey.length > 600) throw fail(400, 'Schlüssel fehlt');
      const u = db.prepare('select id, pubkey, verified from users where email = ?').get(String(b.email || '').trim().toLowerCase());
      if (!u || !u.verified) throw fail(404, 'Nutzer nicht gefunden');
      if (!u.pubkey) throw fail(409, 'Nutzer hat die Team-Funktion noch nicht eingerichtet');
      if (db.prepare('select 1 from team_members where team_id = ? and user_id = ?').get(id, u.id)) throw fail(409, 'Ist bereits Mitglied');
      db.prepare('insert into team_members values (?, ?, ?, ?, ?, ?, ?)').run(id, u.id, role, b.wrappedKey, userOf(req).id, t.key_version, now());
      return {};
    }],
    ['PATCH', /^\/api\/teams\/([\w-]+)\/members\/(\d+)$/, async (req, b, [id, uid]) => {
      const { m } = need(req, id, true);
      const target = db.prepare('select role from team_members where team_id = ? and user_id = ?').get(id, +uid);
      if (!target) throw fail(404, 'Nutzer nicht gefunden');
      if (target.role === 'owner' || !ASSIGNABLE.includes(b.role) || ((b.role === 'admin' || target.role === 'admin') && m.role !== 'owner')) throw fail(403, 'Keine Berechtigung');
      db.prepare('update team_members set role = ? where team_id = ? and user_id = ?').run(b.role, id, +uid);
      return {};
    }],
    // Nur sich selbst austragen (der Besitzer löscht das Team); andere entfernt man über "rotate", damit der Schlüssel wechselt
    ['DELETE', /^\/api\/teams\/([\w-]+)\/members\/(\d+)$/, async (req, b, [id, uid]) => {
      const { me, m } = need(req, id);
      if (+uid !== me.id) throw fail(403, 'Keine Berechtigung');
      if (m.role === 'owner') throw fail(400, 'Der Besitzer kann nicht entfernt werden');
      db.prepare('delete from team_members where team_id = ? and user_id = ?').run(id, me.id);
      return {};
    }],
    // Neuer Teamschlüssel (z. B. nach dem Entfernen von Mitgliedern): neuer Chiffretext + Schlüssel für alle Verbleibenden, atomar
    ['POST', /^\/api\/teams\/([\w-]+)\/rotate$/, async (req, b, [id]) => {
      const { me, t } = need(req, id, true);
      const remove = (Array.isArray(b.remove) ? b.remove : []).map(Number);
      const members = db.prepare('select user_id as id, role from team_members where team_id = ?').all(id);
      if (remove.some((u) => u === me.id || members.find((x) => x.id === u)?.role === 'owner' || !members.some((x) => x.id === u))) throw fail(403, 'Keine Berechtigung');
      if ((t.rev || null) !== (b.prev ?? null)) throw fail(409, 'Konflikt');
      if (typeof b.blob !== 'string') throw fail(400, 'blob fehlt');
      const keep = members.filter((x) => !remove.includes(x.id)).map((x) => x.id).sort();
      const given = (Array.isArray(b.wrapped) ? b.wrapped : []).map((w) => w.userId).sort();
      if (keep.length !== given.length || keep.some((u, i) => u !== given[i]) || b.wrapped.some((w) => typeof w.wrappedKey !== 'string' || w.wrappedKey.length > 600)) throw fail(400, 'Mitgliederliste unvollständig');
      const v = t.key_version + 1;
      db.exec('begin');
      try {
        for (const u of remove) db.prepare('delete from team_members where team_id = ? and user_id = ?').run(id, u);
        for (const w of b.wrapped) db.prepare('update team_members set wrapped_key = ?, wrapped_by = ?, key_version = ? where team_id = ? and user_id = ?').run(w.wrappedKey, me.id, v, id, w.userId);
        db.prepare('update teams set key_version = ?, blob = ?, rev = ?, updated = ? where id = ?').run(v, b.blob, t.rev + 1, now(), id);
        db.exec('commit');
      } catch (e) { db.exec('rollback'); throw e; }
      return { keyVersion: v };
    }],
    ['DELETE', /^\/api\/teams\/([\w-]+)$/, async (req, b, [id]) => {
      const { m } = need(req, id);
      if (m.role !== 'owner') throw fail(403, 'Keine Berechtigung');
      db.prepare('delete from team_members where team_id = ?').run(id);
      db.prepare('delete from teams where id = ?').run(id);
      return {};
    }],
  ];

  return http.createServer(async (req, res) => {
    const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    try {
      const url = new URL(req.url, 'http://x');
      let route = routes[`${req.method} ${url.pathname}`], match = [];
      if (!route) for (const [method, re, fn] of dynamic) { const m = method === req.method && re.exec(url.pathname); if (m) { route = fn; match = m.slice(1); break; } }
      if (!route) throw fail(404, 'Nicht gefunden');
      send(200, await route(req, req.method === 'GET' ? {} : await body(req), match.length ? match : url));
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
