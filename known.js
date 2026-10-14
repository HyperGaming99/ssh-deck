// Known Hosts: Fingerabdruck, Prüfung und Import aus ~/.ssh/known_hosts. Reine Logik, kein Electron.
const crypto = require('crypto');

// SHA256-Fingerabdruck im OpenSSH-Format (base64 ohne Padding) aus dem Host-Schlüssel (SSH-Wire-Format)
const fingerprint = (blob) => 'SHA256:' + crypto.createHash('sha256').update(blob).digest('base64').replace(/=+$/, '');
const keyType = (blob) => blob.subarray(4, 4 + blob.readUInt32BE(0)).toString();

// entries: gespeicherte Einträge { id, host, port, type, fingerprint, addedAt }.
// known = Schlüssel stimmt; changed = gleicher Typ, anderer Schlüssel (möglicher Angriff); unknown = noch nie gesehen
function checkHostKey(entries, host, port, blob) {
  const h = host.toLowerCase(), type = keyType(blob), fp = fingerprint(blob);
  const same = entries.find((e) => e.host.toLowerCase() === h && e.port === port && e.type === type);
  if (!same) return { status: 'unknown', type, fingerprint: fp };
  if (same.fingerprint === fp) return { status: 'known', type, fingerprint: fp };
  return { status: 'changed', type, fingerprint: fp, old: same.fingerprint, id: same.id, addedAt: same.addedAt };
}

// Liest known_hosts. Gehashte Einträge (|1|…), Muster (* ? !) und @-Marker lassen sich nicht übernehmen und werden gezählt.
function parseKnownHosts(text) {
  const entries = [];
  let skipped = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [hosts, type, b64] = line.split(/\s+/);
    if (!b64 || line.startsWith('@')) { skipped++; continue; }
    let blob;
    try { blob = Buffer.from(b64, 'base64'); if (keyType(blob) !== type) throw new Error('Typ'); } catch { skipped++; continue; }
    for (const pat of hosts.split(',')) {
      if (pat.startsWith('|') || /[*?!]/.test(pat)) { skipped++; continue; }
      const m = pat.match(/^\[(.+)\]:(\d+)$/);
      entries.push({ host: (m ? m[1] : pat).toLowerCase(), port: m ? +m[2] : 22, type, fingerprint: fingerprint(blob), key: b64 });
    }
  }
  return { entries, skipped };
}

module.exports = { fingerprint, keyType, checkHostKey, parseKnownHosts };
