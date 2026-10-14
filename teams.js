// Team-Tresore (geteilte Hosts, Snippets, Schlüssel …), Ende-zu-Ende verschlüsselt. Reine Logik, kein Electron.
// Jeder Nutzer hat ein X25519-Schlüsselpaar, das deterministisch aus seinem Datenschlüssel (enc) abgeleitet wird; der öffentliche Teil liegt beim Server.
// Ein Team hat einen zufälligen AES-256-Schlüssel. Er wird je Mitglied mit ECDH + HKDF + AES-GCM eingepackt ("wrapped"); der Server sieht nie den Teamschlüssel.
const crypto = require('crypto');
const { seal, open } = require('./sync');

const PKCS8_X25519 = Buffer.from('302e020100300506032b656e04220420', 'hex');
const SPKI_X25519 = Buffer.from('302a300506032b656e032100', 'hex');

// Schlüsselpaar aus dem Datenschlüssel: { priv: KeyObject, pub: base64 (32 Byte roh) }
function identity(encKey) {
  const seed = crypto.createHmac('sha256', encKey).update('ssh-deck/team-identity/v1').digest();
  const priv = crypto.createPrivateKey({ key: Buffer.concat([PKCS8_X25519, seed]), format: 'der', type: 'pkcs8' });
  const pub = crypto.createPublicKey(priv).export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');
  return { priv, pub };
}
const pubKey = (b64) => crypto.createPublicKey({ key: Buffer.concat([SPKI_X25519, Buffer.from(b64, 'base64')]), format: 'der', type: 'spki' });
const wrapKey = (priv, theirPub) => crypto.hkdfSync('sha256', crypto.diffieHellman({ privateKey: priv, publicKey: pubKey(theirPub) }), 'ssh-deck/team', 'wrap/v1', 32);

// teamKey (32 Byte) für einen Empfänger einpacken / als Empfänger auspacken
function wrap(teamKey, myPriv, theirPub) {
  return seal(Buffer.from(wrapKey(myPriv, theirPub)), { k: teamKey.toString('base64') });
}
function unwrap(wrapped, myPriv, senderPub) {
  return Buffer.from(open(Buffer.from(wrapKey(myPriv, senderPub)), wrapped).k, 'base64');
}
const newTeamKey = () => crypto.randomBytes(32);
// Kurzer Fingerabdruck eines öffentlichen Schlüssels zum Vergleichen (z. B. am Telefon): 5 Gruppen à 4 Zeichen
const fingerprint = (pub) => crypto.createHash('sha256').update(Buffer.from(pub, 'base64')).digest('hex').slice(0, 20).match(/.{4}/g).join(' ');

// Sammlungen -> nur Einträge eines Tresors. Personal = Einträge ohne vault oder vault 'personal'.
const inVault = (r, v) => (v === 'personal' ? !r.vault || r.vault === 'personal' : r.vault === v);
const only = (list, v) => list.filter((r) => inVault(r, v));
const without = (list, v) => list.filter((r) => !inVault(r, v));

// Tresor <-> lokale Speicher. stores = { hosts, groups, snippets, forwards, keys, known }; jeder Speicher hat raw()/setRaw().
// Persönlich: Hosts, Gruppen, Snippets, Forwarding, Known Hosts (SSH-Schlüssel bleiben auf dem Gerät). Team: dasselbe ohne Known Hosts, dafür mit den Schlüsseln des Teams.
const SHARED = ['hosts', 'groups', 'snippets', 'forwards'];
function snapshotVault(v, st) {
  const o = Object.fromEntries(SHARED.map((c) => [c, only(st[c].raw(), v)]));
  return v === 'personal' ? { ...o, known: st.known.raw() } : { ...o, keys: only(st.keys.raw(), v) };
}
function applyVault(v, snap, st) {
  for (const c of SHARED) st[c].setRaw([...without(st[c].raw(), v), ...(snap[c] || [])]);
  if (v === 'personal') st.known.setRaw(snap.known || []); else st.keys.setRaw([...without(st.keys.raw(), v), ...(snap.keys || [])]);
}
const purgeVault = (v, st) => { for (const c of [...SHARED, 'keys']) st[c].setRaw(without(st[c].raw(), v)); };

// Wer darf was
const ROLES = ['owner', 'admin', 'member', 'viewer'];
const can = { write: (role) => role !== 'viewer', manage: (role) => role === 'owner' || role === 'admin' };

class TeamBackend {
  constructor(backend) { this.b = backend; } // Backend aus sync.js (nutzt dessen #req über request())
  list() { return this.b.request('GET', 'teams').then((r) => r.teams); }
  create(name, wrappedKey) { return this.b.request('POST', 'teams', { name, wrappedKey }); }
  get(id) { return this.b.request('GET', `teams/${id}`); }
  invite(id, email, role, wrappedKey) { return this.b.request('POST', `teams/${id}/members`, { email, role, wrappedKey }); }
  setRole(id, userId, role) { return this.b.request('PATCH', `teams/${id}/members/${userId}`, { role }); }
  leave(id, userId) { return this.b.request('DELETE', `teams/${id}/members/${userId}`, {}); }
  rotate(id, body) { return this.b.request('POST', `teams/${id}/rotate`, body); }
  remove(id) { return this.b.request('DELETE', `teams/${id}`, {}); }
  lookup(email) { return this.b.request('GET', `users/lookup?email=${encodeURIComponent(email)}`); }
  setPubkey(pubkey) { return this.b.request('PUT', 'me/pubkey', { pubkey }); }
  // Für syncOnce: derselbe Vertrag wie beim persönlichen Tresor
  vault(id, keyVersion) {
    return {
      getVault: async () => { const v = (await this.b.request('GET', `teams/${id}/vault`)).vault; return v && v.blob ? v : null; },
      putVault: async (blob, prev) => { try { await this.b.request('PUT', `teams/${id}/vault`, { blob, prev, keyVersion }); return true; } catch (e) { if (e.status === 409) return false; throw e; } },
    };
  }
}

// ---- Abläufe (von der App und den Tests benutzt) -----------------------------------------------------
// ident = identity(enc); api = TeamBackend. Gibt jeweils den Teamschlüssel zurück bzw. wirft bei Serverfehlern.
async function createTeam(api, ident, name) {
  await api.setPubkey(ident.pub);
  const key = newTeamKey();
  const { id } = await api.create(name, wrap(key, ident.priv, ident.pub));
  return { id, key };
}
// Schlüssel einer Zeile aus GET /teams auspacken; wrapperPub = öffentlicher Schlüssel dessen, der ihn eingepackt hat
const keyOf = (ident, row) => unwrap(row.wrappedKey, ident.priv, row.wrapperPub);

async function invite(api, ident, teamId, key, email, role) {
  const who = await api.lookup(email);
  await api.invite(teamId, email, role, wrap(key, ident.priv, who.pubkey));
  return { userId: who.userId, fingerprint: fingerprint(who.pubkey) };
}
// Mitglieder entfernen: neuer Teamschlüssel, Daten neu verschlüsselt, Schlüssel für alle Verbleibenden neu eingepackt
async function removeMembers(api, ident, teamId, oldKey, removeIds) {
  const [{ members }, vault] = await Promise.all([api.get(teamId), api.vault(teamId, 0).getVault()]);
  const key = newTeamKey();
  const keep = members.filter((m) => !removeIds.includes(m.userId));
  const body = {
    remove: removeIds, prev: vault ? vault.rev : null,
    blob: seal(key, vault ? open(oldKey, vault.blob) : {}),
    wrapped: keep.map((m) => ({ userId: m.userId, wrappedKey: wrap(key, ident.priv, m.pubkey) })),
  };
  await api.rotate(teamId, body);
  return key;
}

module.exports = { snapshotVault, applyVault, purgeVault, createTeam, keyOf, invite, removeMembers, identity, wrap, unwrap, newTeamKey, fingerprint, inVault, only, without, ROLES, can, TeamBackend };
