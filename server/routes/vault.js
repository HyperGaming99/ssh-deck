// Tresor-Routen: Persönlicher Tresor (/api/vault) und Cloud-Schlüsselbund (/api/keyvault).
const { fail } = require('../lib/http');

function createVaultRoutes(ctx) {
  const { db, now, userOf } = ctx;
  return {
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
  };
}

module.exports = { createVaultRoutes };
