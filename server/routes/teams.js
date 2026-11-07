// Team-Routen: Öffentliche Schlüssel, Nutzer-Suche, Teams verwalten, Mitglieder, Rollen und Schlüssel-Rotation.
const crypto = require('crypto');
const { fail } = require('../lib/http');

const ASSIGNABLE = ['admin', 'member', 'viewer'];

function createTeamRoutes(ctx) {
  const { db, now, limited, userOf } = ctx;

  const need = (req, teamId, manage = false) => {
    const me = userOf(req);
    const m = db.prepare('select * from team_members where team_id = ? and user_id = ?').get(teamId, me.id);
    const t = m && db.prepare('select * from teams where id = ?').get(teamId);
    if (!t) throw fail(404, 'Team nicht gefunden');
    if (manage && m.role !== 'owner' && m.role !== 'admin') throw fail(403, 'Keine Berechtigung');
    return { me, m, t };
  };

  const routes = {
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

  return { routes, dynamic };
}

module.exports = { createTeamRoutes };
