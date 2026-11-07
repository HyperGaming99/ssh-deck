// Konto-Routen: Registrieren, E-Mail-Code bestätigen, Anmelden, Abmelden und Konto löschen.
const crypto = require('crypto');
const { sha, hashAuth, same } = require('../lib/crypto');
const { fail } = require('../lib/http');

function createAuthRoutes(ctx, { verify = false, allowRegistration = true }) {
  const { db, now, limited, ip, issue, userOf, newCode, credentials } = ctx;
  return {
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
  };
}

module.exports = { createAuthRoutes };
