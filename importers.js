// Import von Hosts aus anderen Programmen (~/.ssh/config, CSV, PuTTY, MobaXterm, SecureCRT).
// Reine Textverarbeitung ohne Dateizugriffe; jede Funktion liefert { hosts, skipped }.
const MAX = 5 * 1024 * 1024;

// Datei -> Text. Windows-Exporte (.reg) sind meist UTF-16 mit Kennzeichen am Anfang.
function decode(buf) {
  if (buf.length > MAX) throw new Error('Datei ist zu groß.');
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf[0] === 0xfe && buf[1] === 0xff) { const b = Buffer.from(buf.subarray(2)); b.swap16(); return b.toString('utf16le'); }
  return buf.toString('utf8').replace(/^﻿/, '');
}

const str = (v, max = 255) => String(v ?? '').trim().slice(0, max);
// Ein Host: ohne Adresse kein Host (null); Port außerhalb 1-65535 -> 22
function clean(h) {
  const host = str(h.host);
  if (!host) return null;
  const port = Number(h.port);
  return { name: str(h.name) || host, host, port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 22, user: str(h.user, 64), group: str(h.group, 64), tags: (h.tags || []).map((t) => str(t, 32)).filter(Boolean), keyPath: str(h.keyPath, 500), secret: String(h.secret ?? '') };
}
const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

// ---- ~/.ssh/config ----
function parseSshConfig(text, { home = '', defaultUser = '' } = {}) {
  const blocks = []; let cur = null, skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z]+)\s*(?:=|\s)\s*(.+)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].replace(/\s+#.*$/, '').replace(/^"(.*)"$/, '$1').trim();
    if (key === 'host') { cur = { names: val.split(/\s+/), p: {} }; blocks.push(cur); }
    else if (key === 'match') cur = null; // Match-Blöcke werden nicht ausgewertet
    else if (cur && !(key in cur.p)) cur.p[key] = val; // wie bei ssh gilt der erste Wert
  }
  const stars = blocks.filter((b) => b.names.includes('*')).map((b) => b.p);
  const dflt = (k) => stars.map((p) => p[k]).find(Boolean);
  const expand = (p) => (p ? p.replace(/^~(?=$|[\\/])/, home) : '');
  const hosts = [];
  for (const b of blocks) {
    for (const name of b.names) {
      if (/[*?!]/.test(name)) { if (name !== '*') skipped++; continue; } // Muster sind keine konkreten Hosts
      const h = clean({ name, host: b.p.hostname || name, port: b.p.port || dflt('port'), user: b.p.user || dflt('user') || defaultUser, keyPath: expand(b.p.identityfile || dflt('identityfile')) });
      h ? hosts.push(h) : skipped++;
    }
  }
  return { hosts, skipped };
}

// ---- CSV (Komma, Semikolon oder Tab; Anführungszeichen erlaubt) ----
function csvRows(text, delim) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
function parseCsv(text) {
  const first = text.split(/\r?\n/, 1)[0];
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = csvRows(text, delim);
  const head = (rows[0] || []).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const find = (names) => head.findIndex((h) => names.includes(h));
  const col = { name: find(['label', 'name', 'title', 'alias', 'session', 'sessionname']), host: find(['hostnameip', 'hostname', 'host', 'address', 'ipaddress', 'ip', 'server', 'hostip']),
    port: find(['port']), user: find(['username', 'user', 'login']), group: find(['groups', 'group', 'folder', 'parentgroup']), tags: find(['tags', 'tag']),
    password: find(['password', 'pass']), proto: find(['protocol']), key: find(['keyfile', 'identityfile', 'sshkey', 'key']) };
  if (col.host < 0) throw new Error('Keine Host-Spalte gefunden.');
  const hosts = []; let skipped = 0;
  for (const r of rows.slice(1)) {
    const v = (i) => (i >= 0 ? r[i] || '' : '');
    if (col.proto >= 0 && v(col.proto).trim() && !/ssh/i.test(v(col.proto))) { skipped++; continue; } // z. B. Telnet
    const h = clean({ name: v(col.name), host: v(col.host), port: v(col.port), user: v(col.user), group: v(col.group), tags: v(col.tags).split(/[,;|]/), password: v(col.password), keyPath: v(col.key), secret: v(col.password) });
    h ? hosts.push(h) : skipped++;
  }
  return { hosts, skipped };
}

// ---- PuTTY: Registry-Export (.reg) oder Sitzungsdatei (~/.putty/sessions/NAME) ----
function parsePutty(text, filename = '') {
  const hosts = []; let skipped = 0;
  const add = (s) => { if (s.protocol && !/^ssh$/i.test(s.protocol)) skipped++; else { const h = clean(s); h ? hosts.push(h) : skipped++; } };
  if (/Windows Registry Editor/i.test(text.slice(0, 200))) {
    let cur = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      const sec = line.match(/^\[HKEY_[^\]]*\\Sessions\\([^\\\]]+)\]$/i);
      if (sec) { if (cur) add(cur); const name = safeDecode(sec[1]); cur = name === 'Default Settings' ? null : { name }; continue; }
      if (line.startsWith('[')) { if (cur) add(cur); cur = null; continue; }
      const m = cur && line.match(/^"([^"]+)"=(.*)$/);
      if (!m) continue;
      const v = m[2], s = v.replace(/^"(.*)"$/, '$1').replace(/\\\\/g, '\\'), k = m[1].toLowerCase();
      if (k === 'hostname') cur.host = s; else if (k === 'username') cur.user = s; else if (k === 'protocol') cur.protocol = s;
      else if (k === 'portnumber') { const d = v.match(/^dword:([0-9a-f]+)/i); if (d) cur.port = parseInt(d[1], 16); }
    }
    if (cur) add(cur);
  } else {
    const p = {};
    for (const line of text.split(/\r?\n/)) { const m = line.match(/^([^=]+)=(.*)$/); if (m) p[m[1].trim().toLowerCase()] = m[2].trim(); }
    add({ name: safeDecode(filename), host: p.hostname, port: p.portnumber, user: p.username, protocol: p.protocol });
  }
  return { hosts, skipped };
}

// ---- MobaXterm: MobaXterm.ini / .mxtsessions, Abschnitte [Bookmarks…], SSH = "#109#0%host%port%user%…" ----
function parseMobaXterm(text) {
  const hosts = []; let skipped = 0, section = '', group = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const sec = line.match(/^\[(.+)\]$/);
    if (sec) { section = sec[1]; group = ''; continue; }
    if (!/^Bookmarks/i.test(section)) continue;
    const m = line.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    if (m[1] === 'SubRep') { group = m[2].split('\\').filter(Boolean).pop() || ''; continue; }
    if (m[1] === 'ImgNum') continue;
    if (m[2].startsWith('#109#')) { const f = m[2].split('%'); const h = clean({ name: m[1], host: f[1], port: f[2], user: f[3], group }); h ? hosts.push(h) : skipped++; }
    else if (m[2].startsWith('#')) skipped++; // RDP, VNC, Telnet …
  }
  return { hosts, skipped };
}

// ---- SecureCRT: eine .ini-Datei je Sitzung ----
function parseSecureCrt(text, name = '', dir = '') {
  const g = (re) => (text.match(re) || [])[1];
  const proto = g(/^S:"Protocol Name"=(.*)$/m);
  if (proto && !/^SSH/i.test(proto.trim())) return { hosts: [], skipped: 1 };
  const portHex = g(/^D:"\[SSH2\] Port"=([0-9a-f]+)/im);
  const h = clean({ name: name.replace(/\.ini$/i, ''), host: g(/^S:"Hostname"=(.*)$/m), port: portHex ? parseInt(portHex, 16) : 22, user: g(/^S:"Username"=(.*)$/m), group: /^sessions$/i.test(dir) ? '' : dir });
  return h ? { hosts: [h], skipped: 0 } : { hosts: [], skipped: 1 };
}

// files: [{ name, dir, text }]
function parseFiles(format, files, opts = {}) {
  const out = { hosts: [], skipped: 0 };
  const merge = (r) => { out.hosts.push(...r.hosts); out.skipped += r.skipped; };
  for (const f of files) {
    if (format === 'ssh') merge(parseSshConfig(f.text, opts));
    else if (format === 'csv') merge(parseCsv(f.text));
    else if (format === 'putty') merge(parsePutty(f.text, f.name));
    else if (format === 'mobaxterm') merge(parseMobaXterm(f.text));
    else if (format === 'securecrt') { if (!/^__FolderData__/i.test(f.name)) merge(parseSecureCrt(f.text, f.name, f.dir)); }
    else throw new Error('Unbekanntes Format');
  }
  return out;
}

module.exports = { decode, parseSshConfig, parseCsv, parsePutty, parseMobaXterm, parseSecureCrt, parseFiles };
