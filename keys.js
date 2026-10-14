// SSH-Schlüssel: generieren, beschreiben, ~/.ssh einlesen. Reine Logik, kein Electron.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { utils } = require('ssh2');

const fp = (blob) => 'SHA256:' + crypto.createHash('sha256').update(blob).digest('base64').replace(/=+$/, '');
const blobOf = (pub) => Buffer.from(pub.trim().split(/\s+/)[1], 'base64');
const keyType = (blob) => blob.subarray(4, 4 + blob.readUInt32BE(0)).toString(); // z. B. 'ssh-ed25519'

function generate({ type = 'ed25519', bits, comment = '', passphrase }) {
  const opts = { comment };
  if (type === 'rsa') opts.bits = bits || 4096;
  if (type === 'ecdsa') opts.bits = 256;
  if (passphrase) Object.assign(opts, { passphrase, cipher: 'aes256-ctr', rounds: 16 }); // ssh2 verlangt bei Passphrase einen Cipher
  const { private: privateKey, public: pub } = utils.generateKeyPairSync(type, opts);
  const publicKey = pub.trim();
  return { privateKey, publicKey, type: publicKey.split(' ')[0], fingerprint: fp(blobOf(publicKey)) };
}

// Beschreibt eine Private-Key-Datei; null, wenn es keine ist.
function describe(file) {
  const data = fs.readFileSync(file);
  if (!data.toString('latin1', 0, 100).includes('PRIVATE KEY')) return null;
  const parsed = utils.parseKey(data);
  const key = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!(key instanceof Error)) {
    const blob = key.getPublicSSH();
    return { type: key.type, publicKey: `${key.type} ${blob.toString('base64')}`, fingerprint: fp(blob), encrypted: false };
  }
  // verschlüsselt: öffentlichen Teil aus der .pub-Datei lesen
  const encrypted = /passphrase|encrypted/i.test(key.message);
  try {
    const pub = fs.readFileSync(file + '.pub', 'utf8').trim();
    return { type: pub.split(' ')[0], publicKey: pub, fingerprint: fp(blobOf(pub)), encrypted };
  } catch {
    return encrypted ? { type: '?', publicKey: '', fingerprint: '', encrypted } : null;
  }
}

// Importiert neue Private Keys aus dir (nur Verweis auf die Datei). Gibt Anzahl neuer Einträge zurück.
function scan(dir, store) {
  let files;
  try { files = fs.readdirSync(dir); } catch { return 0; }
  const known = new Set(store.list().map((k) => k.path));
  let added = 0;
  for (const f of files) {
    const p = path.join(dir, f);
    try {
      const st = fs.statSync(p);
      if (known.has(p) || f.endsWith('.pub') || !st.isFile() || st.size > 20000) continue;
      const d = describe(p);
      if (d) { store.add({ name: f, source: 'imported', path: p, ...d }); added++; }
    } catch { /* unlesbare Datei überspringen */ }
  }
  return added;
}

// Eigenen Schlüssel einbinden: privat (mit/ohne Passphrase), öffentlich oder beides. Liefert, was gespeichert werden soll.
// Der öffentliche Teil wird aus dem privaten abgeleitet; sind beide angegeben, müssen sie zusammenpassen.
function importKey({ privateKey = '', publicKey = '', passphrase = '' }) {
  privateKey = privateKey.replace(/\r\n/g, '\n').trim();
  publicKey = publicKey.trim();
  if (!privateKey && !publicKey) throw new Error('Bitte einen privaten oder öffentlichen Schlüssel angeben.');
  let pub = '', encrypted = false;
  if (publicKey) {
    const [type, b64, ...comment] = publicKey.split(/\s+/);
    let ok = false;
    try { const blob = Buffer.from(b64 || '', 'base64'); ok = blob.length > 8 && keyType(blob) === type; } catch { /* ungültig */ }
    if (!ok) throw new Error('Öffentlicher Schlüssel ungültig.');
    pub = [type, b64, ...comment].join(' ');
  }
  if (privateKey) {
    const parsed = utils.parseKey(privateKey + '\n', passphrase || undefined); // OpenSSH verlangt einen Zeilenumbruch am Ende
    const key = Array.isArray(parsed) ? parsed[0] : parsed;
    if (key instanceof Error) {
      if (!/passphrase|encrypted|decrypt|bad/i.test(key.message)) throw new Error('Privater Schlüssel ungültig oder nicht lesbar.');
      if (passphrase) throw new Error('Passphrase falsch.');
      if (!pub) throw new Error('Der Schlüssel ist verschlüsselt: Passphrase oder öffentlichen Schlüssel angeben.');
      encrypted = true; // privater Teil bleibt gesperrt, der öffentliche wurde angegeben
    } else {
      const blob = key.getPublicSSH();
      if (pub && !blobOf(pub).equals(blob)) throw new Error('Privater und öffentlicher Schlüssel passen nicht zusammen.');
      pub = pub || `${key.type} ${blob.toString('base64')}`;
    }
  }
  const blob = blobOf(pub);
  return { type: keyType(blob), publicKey: pub, fingerprint: fp(blob), privateKey: privateKey ? privateKey + '\n' : undefined, encrypted, publicOnly: !privateKey };
}

// Shell-Befehl, der publicKey idempotent in authorized_keys einträgt; null bei unsicheren Zeichen.
function installCommand(pub) {
  if (!/^[A-Za-z0-9@.+=/ _:-]+$/.test(pub)) return null;
  return `umask 077; mkdir -p ~/.ssh; touch ~/.ssh/authorized_keys; grep -qxF '${pub}' ~/.ssh/authorized_keys || echo '${pub}' >> ~/.ssh/authorized_keys`;
}

module.exports = { generate, describe, scan, installCommand, importKey };
