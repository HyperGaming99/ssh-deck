// Speicher: JSON-Dateien. Hosts mit verschlüsseltem Geheimnis (Electron safeStorage), sonst plain.
const fs = require('fs');
const crypto = require('crypto');

const rd = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; } };
const wr = (file, d) => fs.writeFileSync(file, JSON.stringify(d, null, 2), { mode: 0o600 });

// Einfache Sammlung. Jeder Eintrag trägt updatedAt; Löschen hinterlässt einen Marker { id, deleted, updatedAt } für den Cloud-Sync.
const plain = (file) => {
  const all = () => rd(file);
  return {
    raw: () => all().map((r) => (r.updatedAt ? r : { ...r, updatedAt: 1 })), // alte Einträge ohne Zeitstempel zählen als älteste
    setRaw: (arr) => wr(file, arr),
    list: () => all().filter((r) => !r.deleted),
    save: (r) => {
      const rec = { ...r, id: r.id || crypto.randomUUID(), updatedAt: Date.now() };
      delete rec.deleted;
      const a = all();
      wr(file, a.some((x) => x.id === rec.id) ? a.map((x) => (x.id === rec.id ? rec : x)) : [...a, rec]);
      return rec.id;
    },
    // Löschmarker behält den Tresor (vault), damit er im richtigen Tresor weitersynct
    remove: (id) => wr(file, all().map((x) => (x.id === id ? { id, deleted: true, ...(x.vault && { vault: x.vault }), ...(x.cloud && { cloud: true }), updatedAt: Date.now() } : x))),
  };
};

// Für den Sync: nicht entschlüsselbare Geheimnisse (anderer System-Schlüsselbund) werden ausgelassen statt den ganzen Sync zu kippen
const tryDec = (crypt, v) => { try { return crypt.decrypt(v); } catch { return undefined; } };

const hosts = (file, crypt) => {
  const base = plain(file);
  return {
    list: () => base.list().map(({ secret, ...h }) => ({ ...h, hasSecret: !!secret })),
    // Passwort nicht entschlüsselbar (anderer System-Schlüsselbund): trotzdem liefern, damit „Bearbeiten“ aufgeht; Passwort neu eingeben
    get: (id) => { const h = base.list().find((x) => x.id === id); if (!h) return h; try { return { ...h, secret: h.secret ? crypt.decrypt(h.secret) : '' }; } catch { return { ...h, secret: '', secretLost: true }; } },
    // secret === undefined: bestehendes Geheimnis behalten
    save: (h) => {
      const old = base.list().find((x) => x.id === h.id);
      const secret = h.secret === undefined ? (old ? old.secret : '') : (h.secret ? crypt.encrypt(h.secret) : '');
      return base.save({ id: h.id, name: h.name, group: h.group || '', host: h.host, port: +h.port || 22, user: h.user, keyPath: h.keyPath || '', keyId: h.keyId || '', icon: h.icon || '', tags: Array.isArray(h.tags) ? h.tags.map(String) : (old ? old.tags || [] : []), autoIcon: old ? old.autoIcon || '' : '', fav: h.fav === undefined ? !!old?.fav : !!h.fav, lastUsed: h.lastUsed || old?.lastUsed || 0, secret, ...((h.vault || old?.vault) && { vault: h.vault || old.vault }) });
    },
    // Zuletzt verwendet: nur lokal speichern, updatedAt bleibt (löst keinen Sync aus; geht beim nächsten echten Speichern mit)
    touch: (id) => { const a = base.raw(); const h = a.find((x) => x.id === id && !x.deleted); if (h) { h.lastUsed = Date.now(); base.setRaw(a); } },
    // vom Server erkanntes Betriebssystem-Icon (icon = manuelle Wahl hat Vorrang)
    setAutoIcon: (id, slug) => { const h = base.list().find((x) => x.id === id); if (h) base.save({ ...h, autoIcon: slug }); },
    // für den Sync: Geheimnisse im Klartext raus (der Sync verschlüsselt selbst), beim Einlesen lokal neu verschlüsseln
    raw: () => base.raw().map((r) => (r.secret ? { ...r, secret: tryDec(crypt, r.secret) } : r)),
    setRaw: (arr) => base.setRaw(arr.map((r) => (r.secret ? { ...r, secret: crypt.encrypt(r.secret) } : r))),
    remove: base.remove,
  };
};

// Schlüssel: Private Keys (nur generierte) und Passphrasen verschlüsselt.
const keys = (file, crypt) => {
  const base = plain(file);
  const sec = (s) => (s ? crypt.encrypt(s) : undefined);
  const find = (id) => base.list().find((x) => x.id === id);
  return {
    list: () => base.list().map(({ privateKey, passphrase, ...k }) => ({ ...k, hasPassphrase: !!passphrase })),
    get: (id) => { const k = find(id); return k && { ...k, privateKey: k.privateKey ? crypt.decrypt(k.privateKey) : undefined, passphrase: k.passphrase ? crypt.decrypt(k.passphrase) : '' }; },
    add: (k) => base.save({ ...k, privateKey: sec(k.privateKey), passphrase: sec(k.passphrase) }),
    setPassphrase: (id, p) => { const k = find(id); if (k) base.save({ ...k, passphrase: sec(p) }); },
    rename: (id, name) => { const k = find(id); if (k) base.save({ ...k, name }); },
    // Cloud-Schlüsselbund: Schlüssel ein-/ausschalten; privateKey (Klartext) nur, wenn er noch nicht gespeichert ist (Schlüssel aus ~/.ssh)
    setCloud: (id, on, privateKey) => { const k = find(id); if (k) base.save({ ...k, cloud: !!on, ...(privateKey && { privateKey: sec(privateKey) }) }); },
    // für Team-Tresore: Schlüssel samt privatem Teil im Klartext raus (der Tresor wird mit dem Teamschlüssel verschlüsselt), lokal wieder verschlüsseln
    raw: () => base.raw().map((r) => ({ ...r, privateKey: r.privateKey ? tryDec(crypt, r.privateKey) : undefined, passphrase: r.passphrase ? tryDec(crypt, r.passphrase) : undefined })),
    setRaw: (arr) => base.setRaw(arr.map((r) => ({ ...r, privateKey: sec(r.privateKey), passphrase: sec(r.passphrase) }))),
    remove: base.remove,
  };
};

module.exports = { plain, hosts, keys };
