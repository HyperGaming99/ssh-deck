// Smoke-Test: Geheimnis wird verschlüsselt abgelegt und bleibt bei Update ohne secret erhalten; plain-Sammlung.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hosts, plain, keys } = require('./store');
const keyTools = require('./keys');
const serverStats = require('./serverstats');
{
  const out = '0.50 0.40 0.30 1/200 999\n---\n4\n---\nMemTotal:       8000000 kB\nMemFree: 1 kB\nMemAvailable:   2000000 kB\n---\nFilesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sda1 10000000 4000000 6000000 40% /\n---\n90061.5 1000.0\n';
  const r = serverStats.parse(out);
  assert.deepEqual(r.load, [0.5, 0.4, 0.3]);
  assert.equal(r.cores, 4);
  assert.equal(r.memUsed, 6000000 * 1024);
  assert.equal(r.diskPct, 40);
  assert.equal(r.uptime, 90061.5);
  assert.equal(serverStats.parse('Darwin'), null, 'kein Linux -> null');
  assert.equal(serverStats.parse(''), null);
}
import('./src/lib/snippetVars.mjs').then(({ vars, fill }) => {
  assert.deepEqual(vars('echo {{a}} {{ b:x y }} {{a:z}}'), [{ name: 'a', def: '' }, { name: 'b', def: 'x y ' }]);
  assert.equal(fill('ls {{d:/tmp}} {{d}} {{n}}', { d: '/v' }), 'ls /v /v ');
  assert.deepEqual(vars('ls -la'), []);
}).catch((e) => { console.error(e); process.exit(1); });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-'));
const file = path.join(dir, 'hosts.json');
const s = hosts(file, { encrypt: (x) => 'ENC:' + x, decrypt: (x) => x.slice(4) });

const id = s.save({ name: 'a', group: 'prod', host: 'h', user: 'u', secret: 'pw' });
assert(!fs.readFileSync(file, 'utf8').includes('"pw"'), 'Klartext in Datei');
assert.equal(s.get(id).secret, 'pw');
s.save({ id, name: 'b', group: 'prod', host: 'h', user: 'u' }); // ohne secret
assert.equal(s.get(id).secret, 'pw');
assert.equal(s.list()[0].secret, undefined);
assert.equal(s.list()[0].group, 'prod');
s.remove(id);
assert.equal(s.list().length, 0);

const p = plain(path.join(dir, 'sn.json'));
const sid = p.save({ name: 'ls', cmd: 'ls -la' });
p.save({ id: sid, name: 'ls2', cmd: 'ls' });
assert.equal(p.list().length, 1);
assert.equal(p.list()[0].name, 'ls2');

// Keychain: generieren, aus Verzeichnis importieren, Passphrase verschlüsselt, Install-Befehl
const g = keyTools.generate({ type: 'ed25519', comment: 'test' });
assert(g.fingerprint.startsWith('SHA256:') && g.publicKey.startsWith('ssh-ed25519 '));
const sshDir = path.join(dir, 'ssh');
fs.mkdirSync(sshDir);
fs.writeFileSync(path.join(sshDir, 'id_test'), g.privateKey);
fs.writeFileSync(path.join(sshDir, 'known_hosts'), 'example.com ssh-ed25519 AAAA\n');
const ks = keys(path.join(dir, 'keys.json'), { encrypt: (x) => 'ENC:' + x, decrypt: (x) => x.slice(4) });
assert.equal(keyTools.scan(sshDir, ks), 1);
assert.equal(keyTools.scan(sshDir, ks), 0, 'kein doppelter Import');
assert.equal(ks.list()[0].fingerprint, g.fingerprint);
const kid = ks.add({ name: 'gen', source: 'generated', privateKey: g.privateKey, passphrase: 'pp' });
assert(!fs.readFileSync(path.join(dir, 'keys.json'), 'utf8').includes('"pp"'), 'Passphrase im Klartext');
assert.equal(ks.get(kid).passphrase, 'pp');
assert.equal(ks.list().find((k) => k.id === kid).privateKey, undefined);
assert(keyTools.installCommand(g.publicKey).includes('authorized_keys'));
assert.equal(keyTools.installCommand("ssh-ed25519 AAAA x'; rm -rf ~"), null, 'Injection');

// Tombstones + raw/setRaw
const tp = plain(path.join(dir, 'tomb.json'));
const tid = tp.save({ name: 'x' });
tp.remove(tid);
assert.equal(tp.list().length, 0);
assert(tp.raw().find((r) => r.id === tid).deleted, 'Löschmarker bleibt für den Sync');
const hs2 = hosts(path.join(dir, 'h2.json'), { encrypt: (x) => 'ENC:' + x, decrypt: (x) => x.slice(4) });
hs2.setRaw([{ id: 'h', name: 'n', host: 'h', user: 'u', port: 22, secret: 'pw', updatedAt: 5 }]);
assert(fs.readFileSync(path.join(dir, 'h2.json'), 'utf8').includes('ENC:pw'), 'Secret lokal verschlüsselt');
assert.equal(hs2.raw()[0].secret, 'pw');

// Cloud-Sync: Verschlüsselung, Merge, Schlüsselableitung
const sync = require('./sync');
const keysA = sync.deriveKeys('A@x.de', 'geheim'), keysB = sync.deriveKeys('a@x.de ', 'geheim');
assert.deepEqual(keysA.enc, keysB.enc, 'E-Mail wird normalisiert');
assert.notEqual(keysA.auth, sync.deriveKeys('a@x.de', 'anders').auth);
assert.notEqual(keysA.auth, keysA.enc.toString('base64'), 'auth verrät den Datenschlüssel nicht');
const key = keysA.enc;
assert.deepEqual(sync.open(key, sync.seal(key, { a: 1 })), { a: 1 });
assert.throws(() => sync.open(sync.deriveKeys('a@x.de', 'falsch').enc, sync.seal(key, { a: 1 })), 'falsches Passwort muss scheitern');
const mg = sync.merge({ hosts: [{ id: '1', n: 'alt', updatedAt: 1 }, { id: '2', updatedAt: 5 }] }, { hosts: [{ id: '1', n: 'neu', updatedAt: 9 }, { id: '2', deleted: true, updatedAt: 3 }], snippets: [{ id: 's', updatedAt: 1 }] });
assert.equal(mg.hosts.find((r) => r.id === '1').n, 'neu');
assert(!mg.hosts.find((r) => r.id === '2').deleted, 'jüngerer lokaler Stand schlägt älteren Löschmarker');
assert.equal(mg.snippets.length, 1);

// Echter Server (in-memory SQLite) + Backend-Client
const { createServer, openDb } = require('./server/server');
const listen = (opts) => new Promise((res) => { const srv = createServer({ db: openDb(':memory:'), ...opts }); srv.listen(0, '127.0.0.1', () => res({ srv, url: `http://127.0.0.1:${srv.address().port}` })); });
(async () => {
  // ohne E-Mail-Code
  const { srv, url } = await listen({});
  const kA = sync.deriveKeys('a@x.de', 'pw-1'), kBad = sync.deriveKeys('a@x.de', 'pw-falsch');
  const reg = await new sync.Backend({ url }).register('a@x.de', kA.auth);
  assert(reg.token, 'Registrierung liefert Token');
  await assert.rejects(new sync.Backend({ url }).register('a@x.de', kA.auth), /bereits/);
  await assert.rejects(new sync.Backend({ url }).login('a@x.de', kBad.auth), /falsch/);
  await assert.rejects(new sync.Backend({ url }).login('niemand@x.de', kA.auth), /falsch/);
  await assert.rejects(new sync.Backend({ url, token: 'nope' }).getVault(), (e) => e.status === 401);
  { // Info-Seiten aus PAGES_DIR; fehlende Seite = 404, kein Zugriff außerhalb der Liste
    const pd = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-')); fs.writeFileSync(path.join(pd, 'privacy.html'), '<p>Mail: {{CONTACT_EMAIL}}</p>');
    const sp = await listen({ pagesDir: pd, contactEmail: 'a<b>@x.de' });
    const r = await fetch(sp.url + '/privacy'); const h = await r.text();
    assert.equal(r.status, 200); assert(/text\/html/.test(r.headers.get('content-type'))); assert(h.includes('a&lt;b&gt;@x.de'), 'E-Mail wird escaped eingesetzt');
    assert.equal((await fetch(sp.url + '/delete-account')).status, 404, 'Seite ohne Datei');
    assert.equal((await fetch(sp.url + '/../../etc/passwd')).status, 404);
    sp.srv.close();
  }
  { // Konto löschen: falsches Passwort, Team-Besitzer mit Mitgliedern blockiert, dann alles weg
    const db2 = openDb(':memory:'); const s2 = await listen({ db: db2 }); const bk = () => new sync.Backend({ url: s2.url });
    const kD = sync.deriveKeys('d@x.de', 'pw-d'), kE = sync.deriveKeys('e@x.de', 'pw-e');
    const tD = await bk().register('d@x.de', kD.auth); const tE = await bk().register('e@x.de', kE.auth);
    await new sync.Backend({ url: s2.url, token: tD.token }).putVault('blob', null);
    await assert.rejects(bk().deleteAccount('d@x.de', kE.auth), /falsch/);
    const dId = db2.prepare('select id from users where email = ?').get('d@x.de').id, eId = db2.prepare('select id from users where email = ?').get('e@x.de').id;
    db2.prepare("insert into teams (id, name, updated, created) values ('t1', 'Team', 1, 1)").run();
    db2.prepare("insert into team_members values ('t1', ?, 'owner', 'k', ?, 1, 1)").run(dId, dId);
    db2.prepare("insert into team_members values ('t1', ?, 'member', 'k', ?, 1, 1)").run(eId, dId);
    await assert.rejects(bk().deleteAccount('d@x.de', kD.auth), /Besitzer/);
    db2.prepare('delete from team_members where user_id = ?').run(eId);
    await bk().deleteAccount('d@x.de', kD.auth);
    for (const q of ['users', 'sessions', 'vault', 'team_members']) assert.equal(db2.prepare(`select count(*) c from ${q} where ${q === 'users' ? 'id' : 'user_id'} = ?`).get(dId).c, 0, q + ' geleert');
    assert.equal(db2.prepare('select count(*) c from teams where id = ?').get('t1').c, 0, 'eigenes Ein-Personen-Team gelöscht');
    await assert.rejects(new sync.Backend({ url: s2.url, token: tD.token }).getVault(), (e) => e.status === 401);
    await assert.rejects(bk().login('d@x.de', kD.auth), /falsch/);
    assert((await bk().login('e@x.de', kE.auth)), 'andere Konten bleiben');
    s2.srv.close();
  }


  // Zwei Geräte gleichen ab: beide loggen sich mit denselben Daten ein
  const token = await new sync.Backend({ url }).login('a@x.de', kA.auth);
  const run = (d) => sync.syncOnce({ cloud: new sync.Backend({ url, token }), key: kA.enc, local: { get: () => d.snap, set: (s) => { d.snap = s; } } });
  const d1 = { snap: { hosts: [{ id: 'h1', name: 'a', updatedAt: 10 }] } };
  const d2 = { snap: { hosts: [{ id: 'h2', name: 'b', updatedAt: 20 }], snippets: [{ id: 's1', updatedAt: 20 }] } };
  await run(d1);
  await run(d2);
  assert.deepEqual(d2.snap.hosts.map((h) => h.id).sort(), ['h1', 'h2'], 'Gerät 2 hat beide Hosts');
  await run(d1);
  assert.deepEqual(d1.snap.hosts.map((h) => h.id).sort(), ['h1', 'h2'], 'Gerät 1 bekommt h2');
  d2.snap.hosts = d2.snap.hosts.map((h) => (h.id === 'h1' ? { id: 'h1', deleted: true, updatedAt: Date.now() } : h));
  await run(d2);
  await run(d1);
  assert(d1.snap.hosts.find((h) => h.id === 'h1').deleted, 'Löschen kommt auf Gerät 1 an');

  // Server sieht nur Chiffretext
  const stored = (await new sync.Backend({ url, token }).getVault()).blob;
  assert(!Buffer.from(stored, 'base64').toString('latin1').includes('"hosts"'), 'Tresor ist verschlüsselt');
  // Konflikt: veraltete rev wird abgelehnt
  const bk = new sync.Backend({ url, token });
  assert.equal(await bk.putVault('x', 0), false);
  // Logout macht Token ungültig
  await bk.logout();
  await assert.rejects(bk.getVault(), (e) => e.status === 401);
  // falsches Passwort kann Tresor nicht lesen, auch mit gültigem Token
  const tok2 = await new sync.Backend({ url }).login('a@x.de', kA.auth);
  await assert.rejects(sync.syncOnce({ cloud: new sync.Backend({ url, token: tok2 }), key: kBad.enc, local: { get: () => ({}), set() {} } }));
  srv.close();

  // mit E-Mail-Code, Registrierung gesperrt
  let sent;
  const v = await listen({ verify: true, sendMail: async (to, code) => { sent = { to, code }; } });
  const bv = new sync.Backend({ url: v.url });
  assert.equal((await bv.register('v@x.de', kA.auth)).needsVerification, true);
  assert.equal(sent.to, 'v@x.de');
  await assert.rejects(bv.login('v@x.de', kA.auth), (e) => e.status === 403 && e.needsVerification);
  await assert.rejects(bv.verify('v@x.de', '000000'), /falsch/);
  assert((await bv.verify('v@x.de', sent.code)).length > 20, 'richtiger Code liefert Token');
  await assert.rejects(bv.verify('v@x.de', sent.code), /ungültig|abgelaufen/, 'Code nur einmal');
  assert((await bv.login('v@x.de', kA.auth)).length > 20);
  v.srv.close();
  const closed = await listen({ allowRegistration: false });
  await assert.rejects(new sync.Backend({ url: closed.url }).register('z@x.de', kA.auth), /deaktiviert/);
  closed.srv.close();
  console.log('sync ok');
})().catch((e) => { console.error(e); process.exit(1); });

// Übersetzungen: jeder Text im Code (t('…')) und jede Meldung aus Hauptprozess/Server steht in allen 15 Sprachdateien, Platzhalter stimmen
(() => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const used = new Set();
  for (const f of walk('src').filter((f) => /\.jsx?$/.test(f) && !f.includes(path.join('components', 'ui')))) {
    const s = fs.readFileSync(f, 'utf8');
    for (const m of s.matchAll(/\b[tT]\(\s*'((?:[^'\\]|\\.)*)'/g)) used.add(m[1].replace(/\\'/g, "'"));
    for (const m of s.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) used.add(m[1]);
  }
  const srv = fs.readFileSync('server/server.js', 'utf8'), mainJs = fs.readFileSync('main.js', 'utf8');
  const msgs = new Set([
    ...[...srv.matchAll(/fail\(\d+, '([^']+)'/g)].map((m) => m[1]).filter((m) => m !== 'blob fehlt'),
    ...[...mainJs.matchAll(/(?:error: |new Error\()'([^']+)'/g)].map((m) => m[1]),
    ...[...mainJs.matchAll(/return '([A-ZÄÖÜ][^']+)'/g)].map((m) => m[1]),
    ...[...fs.readFileSync('sync.js', 'utf8').matchAll(/new Error\('([^']+)'/g)].map((m) => m[1]),
    ...[...fs.readFileSync('importers.js', 'utf8').matchAll(/new Error\('([^']+)'/g)].map((m) => m[1]),
    ...[...fs.readFileSync('keys.js', 'utf8').matchAll(/new Error\('([^']+)'/g)].map((m) => m[1]),
    'Wähle zuerst einen Host.', // SftpTab
  ]);
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  const langs = fs.readdirSync('locales').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  assert.equal(langs.length, 15, '15 Sprachdateien (+ Deutsch als Schlüssel)');
  for (const l of langs) {
    const d = JSON.parse(fs.readFileSync(path.join('locales', l + '.json'), 'utf8'));
    for (const k of [...used, ...msgs]) {
      assert(d[k], `${l}: Übersetzung fehlt für „${k}“`);
      assert.equal(ph(d[k]), ph(k), `${l}: Platzhalter passen nicht bei „${k}“`);
    }
  }
  console.log(`i18n ok (${used.size} Texte + ${msgs.size} Meldungen × ${langs.length} Sprachen)`);
})();

// Tor: private Ziele direkt, Rest über SOCKS5 (echter Mini-Proxy im Test)
const torTools = require('./tor');
for (const h of ['localhost', '127.0.0.1', '10.0.0.50', '192.168.1.5', '172.20.0.1', '169.254.1.1', 'nas', 'pi.local', '::1', 'fd00::1']) assert(torTools.isPrivateHost(h), `${h} ist privat`);
for (const h of ['example.com', '8.8.8.8', '172.32.0.1', 'abcdefghij234567.onion', '2001:4860:4860::8888']) assert(!torTools.isPrivateHost(h), `${h} ist öffentlich`);
(async () => {
  const net = require('net');
  let seen;
  const echo = net.createServer((s) => s.pipe(s)).listen(0, '127.0.0.1');
  await new Promise((r) => echo.on('listening', r));
  // Minimaler SOCKS5-Server (ohne Login), merkt sich das angefragte Ziel und leitet an den Echo-Server weiter
  const proxy = net.createServer((c) => {
    c.once('data', () => {
      c.write(Buffer.from([5, 0]));
      c.once('data', (req) => {
        const atyp = req[3];
        const host = atyp === 3 ? req.subarray(5, 5 + req[4]).toString() : req.subarray(4, 8).join('.');
        const portAt = atyp === 3 ? 5 + req[4] : 8;
        seen = { atyp, host, port: req.readUInt16BE(portAt) };
        const up = net.connect(echo.address().port, '127.0.0.1', () => {
          c.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
          c.pipe(up); up.pipe(c);
        });
      });
    });
  }).listen(0, '127.0.0.1');
  await new Promise((r) => proxy.on('listening', r));
  const sock = await torTools.socksSocket({ host: '127.0.0.1', port: proxy.address().port }, 'abcdefghij234567.onion', 22);
  assert.equal(seen.atyp, 3, 'Hostname geht unaufgelöst an den Proxy (kein DNS-Leck)');
  assert.equal(seen.host, 'abcdefghij234567.onion');
  assert.equal(seen.port, 22);
  const got = await new Promise((r) => { sock.once('data', (d) => r(d.toString())); sock.write('ping'); });
  assert.equal(got, 'ping', 'Daten fließen durch den Proxy');
  sock.destroy(); proxy.close(); echo.close();
  console.log('tor ok');
})().catch((e) => { console.error(e); process.exit(1); });

// Known Hosts: echte ssh2-Verbindung liefert den Host-Schlüssel an hostVerifier
const knownTools = require('./known');
(async () => {
  const { Server, Client, utils } = require('ssh2');
  const hk = utils.generateKeyPairSync('ed25519');
  const expected = knownTools.fingerprint(Buffer.from(hk.public.split(' ')[1], 'base64'));
  const srv = new Server({ hostKeys: [hk.private] }, (c) => { c.on('error', () => {}); c.on('authentication', (ctx) => ctx.reject()); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const blob = await new Promise((res) => {
    const c = new Client();
    c.on('error', () => {});
    c.connect({ host: '127.0.0.1', port: srv.address().port, username: 'x', password: 'y', hostVerifier: (key) => { res(key); return false; } });
  });
  assert(Buffer.isBuffer(blob), 'hostVerifier bekommt den rohen Schlüssel');
  assert.equal(knownTools.keyType(blob), 'ssh-ed25519');
  assert.equal(knownTools.fingerprint(blob), expected, 'Fingerabdruck wie bei OpenSSH');
  srv.close();

  const entry = { id: '1', host: 'Example.com', port: 22, type: 'ssh-ed25519', fingerprint: expected, addedAt: 1 };
  assert.equal(knownTools.checkHostKey([entry], 'example.com', 22, blob).status, 'known', 'Host-Vergleich ohne Groß-/Kleinschreibung');
  assert.equal(knownTools.checkHostKey([], 'example.com', 22, blob).status, 'unknown');
  assert.equal(knownTools.checkHostKey([entry], 'example.com', 2222, blob).status, 'unknown', 'anderer Port = anderer Eintrag');
  const other = utils.generateKeyPairSync('ed25519');
  const otherBlob = Buffer.from(other.public.split(' ')[1], 'base64');
  const ch = knownTools.checkHostKey([entry], 'example.com', 22, otherBlob);
  assert.equal(ch.status, 'changed');
  assert.equal(ch.old, expected);

  const line = (h) => `${h} ${hk.public.trim().split(' ').slice(0, 2).join(' ')}`;
  const kh = [`# Kommentar`, line('a.example.com,10.0.0.5'), line('[b.example.com]:2222'), line('|1|abc=|def='), line('*.wild.com'), `@cert-authority ${line('ca.com')}`, 'kaputt'].join('\n');
  const p = knownTools.parseKnownHosts(kh);
  assert.deepEqual(p.entries.map((e) => `${e.host}:${e.port}`), ['a.example.com:22', '10.0.0.5:22', 'b.example.com:2222']);
  assert.equal(p.entries[0].fingerprint, expected);
  assert(p.skipped >= 4, 'gehasht/Muster/Marker/kaputt werden gezählt');
  console.log('known ok');
})().catch((e) => { console.error(e); process.exit(1); });

// OS-Icon aus os-release
const { osIcon } = require('./osicon');
assert.equal(osIcon('NAME="Ubuntu"\nID=ubuntu\nID_LIKE=debian\n'), 'ubuntu-linux');
assert.equal(osIcon('ID="rocky"\nID_LIKE="rhel centos fedora"'), 'rocky-linux');
assert.equal(osIcon('ID=pop\nID_LIKE="ubuntu debian"'), 'ubuntu-linux', 'Derivat über ID_LIKE');
assert.equal(osIcon('ID=somethingnew'), 'linux');
assert.equal(osIcon('Darwin\n'), 'apple');
assert.equal(osIcon(''), '');

// fav/lastUsed überleben save; touch ändert updatedAt nicht
const fid = s.save({ name: 'f', host: 'h', user: 'u', fav: true });
s.touch(fid);
const f1 = s.list().find((x) => x.id === fid);
assert(f1.fav === true && f1.lastUsed > 0, 'fav/lastUsed gesetzt');
const upd = JSON.parse(fs.readFileSync(file, 'utf8')).find((x) => x.id === fid).updatedAt;
s.touch(fid);
assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).find((x) => x.id === fid).updatedAt, upd, 'touch löst keinen Sync aus');
const lu = s.list().find((x) => x.id === fid).lastUsed; // nach dem zweiten touch
s.save({ id: fid, name: 'f2', host: 'h', user: 'u' }); // ohne fav/lastUsed
assert(s.list().find((x) => x.id === fid).fav && s.list().find((x) => x.id === fid).lastUsed === lu, 'überleben save');
s.save({ id: fid, name: 'f2', host: 'h', user: 'u', fav: false });
assert.equal(s.list().find((x) => x.id === fid).fav, false);

// ssh-Befehl und SSH-Config
(async () => {
  const S = await import('./src/lib/sshcmd.mjs');
  assert.equal(S.sshCommand({ host: 'h.io', user: 'me', port: 22 }), 'ssh me@h.io');
  assert.equal(S.sshCommand({ host: 'h.io', user: 'me', port: 2222, keyPath: '/k/id' }), 'ssh -p 2222 -i /k/id me@h.io');
  assert.equal(S.sshCommand({ host: '[::1]', user: 'me', port: '22' }), 'ssh me@::1');
  assert.equal(S.sshCommand({ host: 'h', user: 'me', keyPath: "/my keys/id" }), "ssh -i '/my keys/id' me@h");
  const c = S.sshConfig([{ name: 'Web Prod 1', host: '10.0.0.1', user: 'root', port: 2200, keyPath: '~/.ssh/k', secret: 'pw' }, { name: 'db', host: '::1', user: 'u', port: 22 }]);
  assert.equal(c, 'Host WebProd1\n  HostName 10.0.0.1\n  User root\n  Port 2200\n  IdentityFile ~/.ssh/k\n\nHost db\n  HostName ::1\n  User u\n');
  assert(!c.includes('pw'));
  console.log('sshcmd ok');
})().catch((e) => { console.error(e); process.exit(1); });

// Pfad-Helfer (Windows/Linux) und Laufwerksliste
(async () => {
  const P = await import('./src/lib/paths.mjs');
  assert.equal(P.joinPath('/var/www', 'app', '/'), '/var/www/app');
  assert.equal(P.joinPath('/', 'etc', '/'), '/etc');
  assert.equal(P.parentPath('/var/www/app', '/'), '/var/www');
  assert.equal(P.parentPath('/var', '/'), '/');
  assert.equal(P.parentPath('/', '/'), '/');
  assert.equal(P.joinPath('C:\\Users', 'leon', '\\'), 'C:\\Users\\leon');
  assert.equal(P.joinPath('C:\\', 'Users', '\\'), 'C:\\Users');
  assert.equal(P.parentPath('C:\\Users\\leon', '\\'), 'C:\\Users');
  assert.equal(P.parentPath('C:\\Users', '\\'), 'C:\\', 'Wurzel behält den Schrägstrich');
  assert.equal(P.parentPath('C:\\', '\\'), P.DRIVES, 'über C:\\ kommt die Laufwerksliste');
  assert.equal(P.joinPath(P.DRIVES, 'D:\\', '\\'), 'D:\\', 'Laufwerk aus der Liste öffnen');
  const sftpT = require('./sftp');
  assert.deepEqual(sftpT.listDrives((d) => d === 'C:\\' || d === 'E:\\'), ['C:\\', 'E:\\']);
  const dr = sftpT.listLocal('::drives', '/', { platform: 'win32', exists: (d) => d === 'C:\\' });
  assert.deepEqual(dr.entries.map((e) => [e.name, e.dir]), [['C:\\', true]]);
  console.log('paths ok');
})().catch((e) => { console.error(e); process.exit(1); });

// Host-Import: fünf Formate mit Beispieldateien
(() => {
  const imp = require('./importers');
  // ~/.ssh/config: Aliase, Muster werden übersprungen, Standardwerte aus "Host *", ~ wird ersetzt
  const cfg = imp.parseSshConfig(['Host *', '  User deploy', '  Port 2200', '', 'Host web db', '  HostName 10.0.0.5', '  IdentityFile ~/.ssh/id_ed25519', '',
    'Host staging', '  HostName=stage.example.com', '  User root', '  Port 22', '', 'Host *.internal', '  User x', '', 'Match host foo', '  User nope'].join('\n'), { home: '/home/u', defaultUser: 'me' });
  assert.deepEqual(cfg.hosts.map((h) => [h.name, h.host, h.port, h.user]), [['web', '10.0.0.5', 2200, 'deploy'], ['db', '10.0.0.5', 2200, 'deploy'], ['staging', 'stage.example.com', 22, 'root']]);
  assert.equal(cfg.hosts[0].keyPath, '/home/u/.ssh/id_ed25519');
  assert.equal(cfg.skipped, 1, '*.internal wird übersprungen');
  // CSV (Semikolon, Anführungszeichen, Telnet-Zeile)
  const csv = imp.parseCsv('Label;Hostname/IP;Port;Username;Groups;Tags;Protocol\n"Web; Prod";web.example.com;2222;deploy;Prod;nginx,eu;ssh\nTel;t.example.com;23;x;;;telnet\n;1.2.3.4;;root;;;\n');
  assert.deepEqual(csv.hosts.map((h) => [h.name, h.host, h.port, h.user, h.group]), [['Web; Prod', 'web.example.com', 2222, 'deploy', 'Prod'], ['1.2.3.4', '1.2.3.4', 22, 'root', '']]);
  assert.deepEqual(csv.hosts[0].tags, ['nginx', 'eu']);
  assert.equal(csv.skipped, 1);
  assert.throws(() => imp.parseCsv('a,b\n1,2'), /Host-Spalte/);
  // PuTTY: .reg in UTF-16 mit Kennzeichen, URL-kodierter Name, Port als dword
  const reg = '﻿Windows Registry Editor Version 5.00\r\n\r\n[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\My%20Server]\r\n"HostName"="srv.example.com"\r\n"PortNumber"=dword:000008ae\r\n"UserName"="admin"\r\n"Protocol"="ssh"\r\n\r\n[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\Default%20Settings]\r\n"HostName"=""\r\n\r\n[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\Serial]\r\n"HostName"="COM1"\r\n"Protocol"="serial"\r\n';
  const pr = imp.parsePutty(imp.decode(Buffer.from(reg, 'utf16le')), 'x.reg');
  assert.deepEqual(pr.hosts.map((h) => [h.name, h.host, h.port, h.user]), [['My Server', 'srv.example.com', 2222, 'admin']]);
  assert.equal(pr.skipped, 1, 'Serial wird übersprungen');
  assert.deepEqual(imp.parsePutty('HostName=nas.local\nPortNumber=22\nUserName=pi\nProtocol=ssh\n', 'NAS%20Pi').hosts.map((h) => [h.name, h.host, h.user]), [['NAS Pi', 'nas.local', 'pi']]);
  // MobaXterm
  const mx = imp.parseMobaXterm(['[Bookmarks]', 'SubRep=', 'ImgNum=42', '[Bookmarks_1]', 'SubRep=Servers\\Prod', 'ImgNum=41', 'web=#109#0%web.example.com%22%deploy%%-1%-1%%%%%0%0%0%', 'rdp=#91#4%win.example.com%3389%u%', '[Other]', 'x=#109#0%no.example.com%22%n%'].join('\r\n'));
  assert.deepEqual(mx.hosts.map((h) => [h.name, h.host, h.port, h.user, h.group]), [['web', 'web.example.com', 22, 'deploy', 'Prod']]);
  assert.equal(mx.skipped, 1);
  // SecureCRT
  const sc = imp.parseSecureCrt('S:"Protocol Name"=SSH2\nS:"Hostname"=crt.example.com\nD:"[SSH2] Port"=000008ae\nS:"Username"=ops\n', 'Prod DB.ini', 'Datacenter');
  assert.deepEqual(sc.hosts.map((h) => [h.name, h.host, h.port, h.user, h.group]), [['Prod DB', 'crt.example.com', 2222, 'ops', 'Datacenter']]);
  assert.equal(imp.parseSecureCrt('S:"Protocol Name"=Telnet\nS:"Hostname"=t\n', 't.ini').skipped, 1);
  assert.equal(imp.parseFiles('securecrt', [{ name: '__FolderData__.ini', dir: 'x', text: 'S:"Hostname"=a' }]).hosts.length, 0, 'Ordnerdatei wird ignoriert');
  assert.throws(() => imp.decode(Buffer.alloc(6 * 1024 * 1024)), /zu groß/);
  console.log('import ok');
})();

// Eigene Schlüssel einbinden (privat, öffentlich, verschlüsselt, passend/unpassend)
(() => {
  const plain1 = keyTools.generate({ type: 'ed25519', comment: 'a@b' });
  const locked = keyTools.generate({ type: 'ed25519', comment: 'locked', passphrase: 'geheim' });
  const other = keyTools.generate({ type: 'ed25519', comment: 'other' });
  const r1 = keyTools.importKey({ privateKey: plain1.privateKey });
  assert.equal(r1.fingerprint, plain1.fingerprint, 'öffentlicher Teil wird abgeleitet');
  assert(!r1.publicOnly && !r1.encrypted && r1.privateKey.endsWith('\n'));
  assert.equal(keyTools.importKey({ privateKey: plain1.privateKey.replace(/\n/g, '\r\n'), publicKey: plain1.publicKey }).fingerprint, plain1.fingerprint, 'CRLF + passendes Paar');
  const r2 = keyTools.importKey({ publicKey: plain1.publicKey });
  assert(r2.publicOnly && !r2.privateKey && r2.fingerprint === plain1.fingerprint, 'nur öffentlich');
  assert.throws(() => keyTools.importKey({ privateKey: plain1.privateKey, publicKey: other.publicKey }), /passen nicht zusammen/);
  assert.throws(() => keyTools.importKey({ privateKey: locked.privateKey }), /verschlüsselt/);
  assert.throws(() => keyTools.importKey({ privateKey: locked.privateKey, passphrase: 'falsch' }), /Passphrase falsch/);
  assert.equal(keyTools.importKey({ privateKey: locked.privateKey, passphrase: 'geheim' }).fingerprint, locked.fingerprint, 'richtige Passphrase');
  const r3 = keyTools.importKey({ privateKey: locked.privateKey, publicKey: locked.publicKey });
  assert(r3.encrypted && r3.fingerprint === locked.fingerprint, 'verschlüsselt, aber öffentlicher Teil angegeben');
  assert.throws(() => keyTools.importKey({}), /angeben/);
  assert.throws(() => keyTools.importKey({ publicKey: 'ssh-ed25519 kaputt' }), /ungültig/);
  assert.throws(() => keyTools.importKey({ privateKey: 'kein schlüssel' }), /ungültig oder nicht lesbar/);
  // Store: umbenennen
  const ks2 = keys(path.join(dir, 'keys2.json'), { encrypt: (x) => 'ENC:' + x, decrypt: (x) => x.slice(4) });
  const id2 = ks2.add({ name: 'alt', source: 'added', ...r1 });
  ks2.rename(id2, 'neu');
  assert.equal(ks2.list()[0].name, 'neu');
  console.log('keyimport ok');
})();

// Zensur: Fingerabdrücke und Hostnamen verdecken
(async () => {
  const C = await import('./src/lib/censor.mjs');
  assert.equal(C.maskFingerprint('SHA256:CYeCfgvlcGuzaFgWxyz'), 'SHA256:CYeC••••••••');
  assert.equal(C.maskFingerprint(''), '');
  assert(!C.maskFingerprint('SHA256:CYeCfgvlcGuzaFgWxyz').includes('Guza'), 'Rest ist nicht mehr sichtbar');
  assert.equal(C.maskHost('192.168.1.10'), '192.•••.•••.•••');
  assert.equal(C.maskHost('web-prod-01.example.com'), 'we•••.•••.com');
  assert.equal(C.maskHost('nas'), 'na•••');
  assert.equal(C.maskHost('db1.example.com'), 'db•••.•••.com');
  console.log('censor ok');
})().catch((e) => { console.error(e); process.exit(1); });

// Editor-Erkennung: Fake-PATH mit zwei ausführbaren Dateien
const editors = require('./editors');
const bin = path.join(dir, 'bin');
fs.mkdirSync(bin);
for (const n of ['gedit', 'code']) fs.writeFileSync(path.join(bin, n), '#!/bin/sh\n', { mode: 0o755 });
const found = editors.detect({ platform: 'linux', pathEnv: bin });
assert.deepEqual(found.map((e) => e.cmd), ['code', 'gedit'], 'VS Code zuerst');
assert.equal(editors.defaultEditor(found).cmd, 'code');
assert.equal(editors.defaultEditor(found.slice(1)), null, 'ohne VS Code: Systemstandard');
assert.equal(editors.pick('default', 'auto', found).cmd, 'code');
assert.equal(editors.pick('default', 'gedit', found).cmd, 'gedit', 'Einstellung gewinnt');
assert.equal(editors.pick('default', 'system', found), null);
assert.equal(editors.pick('default', 'weg', found), null, 'unbekannter Editor: Systemstandard');
assert.equal(editors.pick('gedit', 'code', found).cmd, 'gedit', 'explizite Wahl schlägt Einstellung');
// Windows/macOS: feste Orte bzw. Programme in /Applications (Dateisystem ersetzt)
const winEnv = { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local', ProgramFiles: 'C:\\Program Files', SystemRoot: 'C:\\Windows' };
const winHas = new Set(['C:\\Users\\u\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe', 'C:\\Windows\\System32\\notepad.exe']);
const win = editors.detect({ platform: 'win32', env: winEnv, exists: (p) => winHas.has(p) });
assert.deepEqual(win.map((e) => e.cmd), ['code', 'notepad'], 'Windows: VS Code + Notepad');
assert(win[0].bin.endsWith('Code.exe') && !win[0].args, 'Windows startet die .exe direkt');
const macHas = new Set(['/Applications/Visual Studio Code.app', '/System/Applications/TextEdit.app']);
const mac = editors.detect({ platform: 'darwin', env: { HOME: '/Users/u' }, exists: (p) => macHas.has(p) });
assert.deepEqual(mac.map((e) => e.cmd), ['code', 'textedit']);
assert.deepEqual(mac[0].args, ['-a', '/Applications/Visual Studio Code.app']);
assert.equal(mac[0].bin, '/usr/bin/open', 'macOS startet über open -a');

// SFTP: Mock auf lokalem Dateisystem (gleiche Callback-Signaturen wie ssh2)
const sftpTools = require('./sftp');
const cb = (fn) => (...a) => { const done = a.pop(); try { done(null, fn(...a)); } catch (e) { done(e); } };
const mock = {
  realpath: cb((p) => fs.realpathSync(p)),
  readdir: cb((p) => fs.readdirSync(p).map((f) => { const st = fs.statSync(path.join(p, f)); return { filename: f, attrs: Object.assign(st, { mtime: st.mtimeMs / 1000 }) }; })),
  stat: cb((p) => fs.statSync(p)), lstat: cb((p) => fs.lstatSync(p)),
  mkdir: cb((p) => fs.mkdirSync(p)), rmdir: cb((p) => fs.rmdirSync(p)), unlink: cb((p) => fs.unlinkSync(p)),
  rename: cb((a, b) => fs.renameSync(a, b)),
  createReadStream: (p) => fs.createReadStream(p), createWriteStream: (p) => fs.createWriteStream(p),
  fastPut: cb((l, r) => fs.copyFileSync(l, r)), fastGet: cb((r, l) => fs.copyFileSync(r, l)),
};
(async () => {
  const src = path.join(dir, 'src'), remote = path.join(dir, 'remote'), back = path.join(dir, 'back');
  for (const d of [path.join(src, 'proj/sub'), remote, back]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(src, 'proj/a.txt'), 'A');
  fs.writeFileSync(path.join(src, 'proj/sub/b.txt'), 'B');
  await sftpTools.upload(mock, path.join(src, 'proj'), remote);
  assert.equal(fs.readFileSync(path.join(remote, 'proj/sub/b.txt'), 'utf8'), 'B');
  const l = await sftpTools.list(mock, path.join(remote, 'proj'));
  assert.deepEqual(l.entries.map((e) => [e.name, e.dir]), [['sub', true], ['a.txt', false]]);
  await sftpTools.download(mock, path.join(remote, 'proj'), back);
  assert.equal(fs.readFileSync(path.join(back, 'proj/a.txt'), 'utf8'), 'A');
  await sftpTools.rename(mock, path.join(remote, 'proj'), path.join(remote, 'proj2'));
  await sftpTools.remove(mock, path.join(remote, 'proj2'));
  assert.equal(fs.readdirSync(remote).length, 0, 'rekursives Löschen');
  // Server -> Server (zwei Mock-Server auf lokalen Ordnern)
  const other = path.join(dir, 'other');
  fs.mkdirSync(other);
  await sftpTools.upload(mock, path.join(src, 'proj'), remote);
  await sftpTools.copy(mock, path.join(remote, 'proj'), mock, other);
  assert.equal(fs.readFileSync(path.join(other, 'proj/sub/b.txt'), 'utf8'), 'B');
  await sftpTools.remove(mock, path.join(remote, 'proj'));
  assert(!sftpTools.safeName('../x') && !sftpTools.safeName('..') && sftpTools.safeName('ok.txt'));
  assert(sftpTools.listLocal('', os.homedir()).entries.length >= 0);
  console.log('ok');
})();

// Anmeldung: Methoden vom Server erfragen, dann Schlüssel / Passwort / Code abfragen (echte ssh2-Server)
(async () => {
  const { Client, Server, utils } = require('ssh2');
  const { createAuth } = require('./auth');
  const good = utils.generateKeyPairSync('ed25519');
  const goodPub = utils.parseKey(good.public);
  const hostKey = utils.generateKeyPairSync('ed25519').private;
  const serve = (mode) => new Promise((res) => {
    const srv = new Server({ hostKeys: [hostKey] }, (c) => {
      c.on('authentication', (ctx) => {
        if (ctx.method === 'none') return ctx.reject(mode === 'key' ? ['publickey'] : mode === 'pw' ? ['password'] : ['keyboard-interactive']);
        if (mode === 'key' && ctx.method === 'publickey' && ctx.key.algo === goodPub.type && Buffer.compare(ctx.key.data, goodPub.getPublicSSH()) === 0 && (!ctx.signature || goodPub.verify(ctx.blob, ctx.signature, ctx.hashAlgo) === true)) return ctx.accept();
        if (mode === 'pw' && ctx.method === 'password' && ctx.password === 'geheim') return ctx.accept();
        if (mode === 'otp' && ctx.method === 'keyboard-interactive') return ctx.prompt([{ prompt: 'Code: ', echo: false }], (a) => (a[0] === '123456' ? ctx.accept() : ctx.reject()));
        ctx.reject(mode === 'key' ? ['publickey'] : mode === 'pw' ? ['password'] : ['keyboard-interactive']);
      }).on('ready', () => {});
    }).listen(0, '127.0.0.1', () => res(srv));
  });
  const login = (srv, h, keys, answers) => new Promise((resolve) => {
    const asked = [], log = [];
    const ask = async (kind, extra) => { asked.push(kind); const a = answers[kind]; return typeof a === 'function' ? a(extra) : a ?? null; };
    const auth = createAuth({ h: { user: 'u', ...h }, keys, ask, log: (m) => log.push(m) });
    const conn = new Client().on('keyboard-interactive', auth.onKeyboard).on('ready', () => { conn.end(); resolve({ ok: true, asked, auth, log }); }).on('error', (e) => resolve({ ok: false, asked, err: e.message, log }));
    conn.connect({ host: '127.0.0.1', port: srv.address().port, username: 'u', authHandler: auth.authHandler, tryKeyboard: true, readyTimeout: 5000 });
  });
  const noKeys = { list: () => [], get: () => null };
  const withKey = { list: () => [{ id: 'k1', name: 'work' }], get: (id) => (id === 'k1' ? { id, privateKey: good.private } : null) };

  const sPw = await serve('pw'), sKey = await serve('key'), sOtp = await serve('otp');
  let r = await login(sPw, {}, noKeys, { password: { secret: 'geheim', save: true } });
  assert(r.ok && r.asked.join() === 'password' && r.auth.save.secret === 'geheim', 'Passwort wird abgefragt');
  r = await login(sPw, { secret: 'geheim' }, noKeys, {});
  assert(r.ok && !r.asked.length, 'gespeichertes Passwort ohne Rückfrage');
  r = await login(sKey, {}, withKey, { key: { keyId: 'k1', save: true } });
  assert(r.ok && r.asked.join() === 'key' && r.auth.save.keyId === 'k1', 'Server verlangt Schlüssel: Keychain-Schlüssel wird gewählt');
  r = await login(sKey, { keyId: 'k1' }, withKey, {});
  assert(r.ok && !r.asked.length, 'gespeicherter Schlüssel ohne Rückfrage');
  r = await login(sKey, { secret: 'egal' }, noKeys, {});
  assert(!r.ok && !r.asked.length && r.log.some((l) => /no usable|no key|keychain/i.test(l)), 'ohne Schlüssel schlägt es mit Protokoll fehl');
  r = await login(sOtp, {}, noKeys, { otp: { secret: '123456' } });
  assert(r.ok && r.asked.join() === 'otp', 'Einmalcode (keyboard-interactive)');
  r = await login(sPw, {}, noKeys, { password: null });
  assert(!r.ok, 'Abbruch beendet die Anmeldung');
  r = await login(sPw, {}, noKeys, { password: { secret: 'falsch' } });
  assert(!r.ok && r.asked.length === 3, 'falsches Passwort: dreimal fragen, dann Schluss');
  [sPw, sKey, sOtp].forEach((s) => s.close());
  console.log('auth ok');
})().catch((e) => { console.error(e); process.exit(1); });

// Auto-Update: Release suchen, Paket laden, einspielen, bei Fehler zurückrollen (lokaler Server + echtes tar)
(async () => {
  const http = require('http');
  const { execFileSync } = require('child_process');
  const updater = require('./updater');
  assert(updater.isNewer('0.2.0', '0.1.9') && updater.isNewer('v1.0.0', '0.9.9') && !updater.isNewer('0.1.0', '0.1.0') && !updater.isNewer('0.1.0', '0.1.1'), 'Versionsvergleich');

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-upd-test-'));
  const mkPkg = (name, version, files) => { // Paket wie von GitHub: ein Oberordner
    const root = path.join(work, `${name}-${version}`, 'owner-repo-abc'); fs.mkdirSync(root, { recursive: true });
    for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), c); }
    const tgz = path.join(work, `${name}-${version}.tgz`); execFileSync('tar', ['-czf', tgz, '-C', path.dirname(root), 'owner-repo-abc']);
    return fs.readFileSync(tgz);
  };
  const good = mkPkg('ssh-deck', '0.2.0', { 'package.json': JSON.stringify({ name: 'ssh-deck', version: '0.2.0' }), 'main.js': '// neu', 'src/new.txt': 'neu' });
  const foreign = mkPkg('other', '9.9.9', { 'package.json': JSON.stringify({ name: 'other', version: '9.9.9' }), 'main.js': '' });
  let base;
  const srv = http.createServer((req, res) => {
    if (req.url === '/latest') return res.end(JSON.stringify({ tag_name: 'v0.2.0', body: 'Notizen', html_url: 'https://github.com/o/r/releases/tag/v0.2.0', tarball_url: base + '/good.tgz' }));
    if (req.url === '/missing') { res.statusCode = 404; return res.end('{}'); }
    if (req.url === '/good.tgz') return res.end(good);
    if (req.url === '/foreign.tgz') return res.end(foreign);
    res.statusCode = 500; res.end();
  }).listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
  const f = (u, i) => fetch(u.replace('https://', 'http://'), i); // Test-Server spricht nur http

  const l = await updater.latest({ url: base + '/latest' });
  assert.equal(l.version, '0.2.0'); assert.equal(l.notes, 'Notizen'); assert(l.tarball.endsWith('/good.tgz'));
  await assert.rejects(updater.latest({ url: base + '/missing' }), (e) => e.code === 'NOTFOUND');
  await assert.rejects(updater.latest({ repo: 'kein-repo' }), (e) => e.code === 'NOTFOUND');
  await assert.rejects(updater.latest({ url: 'http://127.0.0.1:1/x' }), (e) => e.code === 'NET');

  const mkApp = () => { const d = fs.mkdtempSync(path.join(work, 'app-')); fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'ssh-deck', version: '0.1.0' })); fs.writeFileSync(path.join(d, 'main.js'), '// alt'); fs.mkdirSync(path.join(d, 'node_modules')); fs.writeFileSync(path.join(d, 'node_modules', 'keep'), '1'); return d; };
  const calls = [], okExec = async (cmd, args) => { if (cmd !== 'tar') calls.push(`${cmd} ${args.join(' ')}`); else execFileSync(cmd, args); };
  const app1 = mkApp();
  const ver = await updater.install({ tarball: base.replace('http', 'https') + '/good.tgz', dir: app1, fetch: f, exec: okExec });
  assert.equal(ver, '0.2.0');
  assert.equal(fs.readFileSync(path.join(app1, 'main.js'), 'utf8'), '// neu', 'Dateien überlagert');
  assert(fs.existsSync(path.join(app1, 'src', 'new.txt')) && fs.existsSync(path.join(app1, 'node_modules', 'keep')), 'neue Dateien da, node_modules unberührt');
  assert(calls.some((c) => /run build/.test(c)), 'Build läuft');
  assert(!calls.some((c) => /install/.test(c)), 'nur neue Versionsnummer: kein npm install');

  const app2 = mkApp(); // anderes Projekt -> abgelehnt, nichts verändert
  await assert.rejects(updater.install({ tarball: base.replace('http', 'https') + '/foreign.tgz', dir: app2, fetch: f, exec: okExec }), (e) => e.code === 'PKG');
  assert.equal(fs.readFileSync(path.join(app2, 'main.js'), 'utf8'), '// alt');
  await assert.rejects(updater.install({ tarball: 'http://evil/x.tgz', dir: app2 }), (e) => e.code === 'PKG'); // nur https

  const app3 = mkApp(); // Build schlägt fehl -> alter Stand zurück
  const failBuild = async (cmd, args) => { if (cmd === 'tar') return execFileSync(cmd, args); if (args[0] === 'run' && !failBuild.done) { failBuild.done = true; throw new Error('boom'); } };
  await assert.rejects(updater.install({ tarball: base.replace('http', 'https') + '/good.tgz', dir: app3, fetch: f, exec: failBuild }), (e) => e.code === 'FAIL');
  assert.equal(fs.readFileSync(path.join(app3, 'main.js'), 'utf8'), '// alt', 'Rollback');
  srv.close(); fs.rmSync(work, { recursive: true, force: true });
  console.log('updater ok');
})().catch((e) => { console.error(e); process.exit(1); });

// Teams: Schlüsselaustausch, geteilter Tresor, Rollen, Entfernen mit neuem Schlüssel (echter Server, drei Nutzer)
(async () => {
  const teams = require('./teams');
  const { srv, url } = await listen({});
  const mk = async (email) => {
    const k = sync.deriveKeys(email, 'pw'), b = new sync.Backend({ url });
    const token = (await b.register(email, k.auth)).token, be = new sync.Backend({ url, token });
    return { email, api: new teams.TeamBackend(be), ident: teams.identity(k.enc) };
  };
  const [A, B, C] = [await mk('a@t.de'), await mk('b@t.de'), await mk('c@t.de')];
  await Promise.all([B, C].map((u) => u.api.setPubkey(u.ident.pub)));
  assert.equal(teams.identity(sync.deriveKeys('a@t.de', 'pw').enc).pub, A.ident.pub, 'Schlüsselpaar ist aus dem Passwort ableitbar (jedes Gerät gleich)');

  const { id, key } = await teams.createTeam(A.api, A.ident, 'Ops');
  await assert.rejects(teams.invite(A.api, A.ident, id, key, 'nobody@t.de', 'member'), /nicht gefunden/);
  const inv = await teams.invite(A.api, A.ident, id, key, 'b@t.de', 'member');
  assert.equal(inv.fingerprint, teams.fingerprint(B.ident.pub), 'Fingerabdruck zum Vergleichen');
  await teams.invite(A.api, A.ident, id, key, 'c@t.de', 'viewer');
  await assert.rejects(teams.invite(A.api, A.ident, id, key, 'b@t.de', 'member'), /bereits/);
  await assert.rejects(teams.invite(B.api, B.ident, id, key, 'a@t.de', 'member'), (e) => e.status === 403, 'Mitglied darf nicht einladen');

  // jeder Eingeladene bekommt den Teamschlüssel und kann den Tresor lesen/schreiben
  const rowOf = async (u) => (await u.api.list()).find((t) => t.id === id);
  const kB = teams.keyOf(B.ident, await rowOf(B)), kC = teams.keyOf(C.ident, await rowOf(C));
  assert(kB.equals(key) && kC.equals(key), 'Schlüssel kommt bei Mitgliedern an');
  const run = async (u, k, data) => { // wie runSync: lokal = { hosts: [...] }
    let local = { hosts: data };
    const row = await rowOf(u);
    await sync.syncOnce({ cloud: u.api.vault(id, row.keyVersion), key: k, local: { get: () => local, set: (m) => { local = m; } } });
    return local.hosts;
  };
  await run(A, key, [{ id: 'h1', name: 'web', updatedAt: 1 }]);
  assert.deepEqual((await run(B, kB, [{ id: 'h2', name: 'db', updatedAt: 2 }])).map((h) => h.id).sort(), ['h1', 'h2'], 'Mitglied sieht und ergänzt');
  assert.equal((await run(C, kC, [])).length, 2, 'Betrachter liest');
  await assert.rejects(run(C, kC, [{ id: 'h3', name: 'x', updatedAt: 3 }]), (e) => e.status === 403, 'Betrachter darf nicht schreiben');
  const stranger = await mk('d@t.de');
  await assert.rejects(stranger.api.get(id), (e) => e.status === 404, 'Fremde sehen das Team nicht');

  // B entfernen: Schlüssel wechselt, B ist draußen, A und C arbeiten weiter
  await assert.rejects(teams.removeMembers(B.api, B.ident, id, kB, [A.ident ? 1 : 0]), (e) => e.status === 403, 'Mitglied darf nicht entfernen');
  const members = (await A.api.get(id)).members, bId = members.find((m) => m.email === 'b@t.de').userId;
  const key2 = await teams.removeMembers(A.api, A.ident, id, key, [bId]);
  assert(!key2.equals(key));
  await assert.rejects(B.api.get(id), (e) => e.status === 404, 'B ist draußen');
  assert.equal((await B.api.list()).length, 0);
  assert(teams.keyOf(C.ident, await rowOf(C)).equals(key2), 'C bekommt den neuen Schlüssel');
  assert.equal((await run(C, key2, [])).length, 2, 'Daten sind unter dem neuen Schlüssel lesbar');
  const blob2 = (await C.api.vault(id, 2).getVault()).blob;
  assert.throws(() => sync.open(key, blob2), 'alter Schlüssel passt nicht mehr');

  // Rollen ändern, austreten, löschen
  const cId = members.find((m) => m.email === 'c@t.de').userId;
  await A.api.setRole(id, cId, 'member');
  await assert.rejects(C.api.setRole(id, cId, 'admin'), (e) => e.status === 403, 'Niemand befördert sich selbst');
  await C.api.leave(id, cId);
  assert.equal((await C.api.list()).length, 0);
  await assert.rejects(A.api.leave(id, members.find((m) => m.email === 'a@t.de').userId), /Besitzer/);
  await assert.rejects(C.api.remove(id), (e) => e.status === 404);
  await A.api.remove(id);
  assert.equal((await A.api.list()).length, 0);
  srv.close();
  console.log('teams ok');
})().catch((e) => { console.error(e); process.exit(1); });

// Tresore lokal: Team-Einträge bleiben getrennt vom persönlichen Tresor (Speicher, Löschmarker, Anwenden, Entfernen)
(() => {
  const teams = require('./teams');
  const { plain, hosts: mkHosts, keys: mkKeys } = require('./store');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-vault-'));
  const crypt = { encrypt: (x) => 'enc:' + x, decrypt: (x) => String(x).replace(/^enc:/, '') };
  const st = { hosts: mkHosts(path.join(dir, 'h.json'), crypt), groups: plain(path.join(dir, 'g.json')), snippets: plain(path.join(dir, 's.json')), forwards: plain(path.join(dir, 'f.json')), known: plain(path.join(dir, 'k.json')), keys: mkKeys(path.join(dir, 'keys.json'), crypt) };
  const mine = st.hosts.save({ name: 'privat', host: 'a', user: 'u', secret: 'pw1' });
  const shared = st.hosts.save({ name: 'team-host', host: 'b', user: 'u', secret: 'pw2', vault: 'T1' });
  st.keys.add({ name: 'team-key', privateKey: 'PRIV', vault: 'T1' }); st.keys.add({ name: 'mein-key', privateKey: 'PRIV2' });
  assert.equal(st.hosts.list().find((h) => h.id === shared).vault, 'T1', 'Host merkt sich den Tresor');
  assert.deepEqual(teams.snapshotVault('personal', st).hosts.map((h) => h.id), [mine], 'persönlicher Tresor enthält keine Team-Hosts');
  assert.deepEqual(teams.snapshotVault('T1', st).hosts.map((h) => h.id), [shared]);
  assert.equal(teams.snapshotVault('T1', st).hosts[0].secret, 'pw2', 'Passwort im Team-Tresor (der wird verschlüsselt übertragen)');
  assert(!('keys' in teams.snapshotVault('personal', st)) && teams.snapshotVault('T1', st).keys.length === 1, 'SSH-Schlüssel nur im Team-Tresor');
  assert.equal(teams.snapshotVault('T1', st).keys[0].privateKey, 'PRIV');

  // Löschen im Team hinterlässt einen Marker, der im Team-Tresor bleibt
  st.hosts.remove(shared);
  const tomb = teams.snapshotVault('T1', st).hosts.find((h) => h.id === shared);
  assert(tomb.deleted && tomb.vault === 'T1', 'Löschmarker behält den Tresor');
  assert.equal(teams.snapshotVault('personal', st).hosts.length, 1);

  // Anwenden eines Team-Stands berührt den persönlichen Tresor nicht
  teams.applyVault('T1', { hosts: [{ id: 'x1', name: 'neu', host: 'c', vault: 'T1', updatedAt: 5, secret: 'pw3' }], groups: [], snippets: [], forwards: [], keys: [] }, st);
  assert(st.hosts.list().some((h) => h.id === 'x1') && st.hosts.list().some((h) => h.id === mine), 'beide Tresore vorhanden');
  assert.equal(st.hosts.get('x1').secret, 'pw3', 'Passwort lokal wieder lesbar');
  teams.purgeVault('T1', st);
  assert.deepEqual(st.hosts.list().map((h) => h.id), [mine], 'Team verlassen: nur Team-Einträge verschwinden');
  assert.equal(st.keys.list().length, 1);
  console.log('vaults ok');
})();

// Host klonen/verschieben zwischen Tresoren (gleiche Logik wie hosts:copy in main.js, hier mit echten Speichern)
(() => {
  const { plain, hosts: mkHosts } = require('./store');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-copy-'));
  const crypt = { encrypt: (x) => 'enc:' + x, decrypt: (x) => String(x).replace(/^enc:/, '') };
  const hosts = mkHosts(path.join(dir, 'h.json'), crypt);
  const vOf = (r) => (r && r.vault) || 'personal';
  const copy = (id, vault, move, name) => { // wie hosts:copy
    const h = hosts.get(id), same = vOf(h) === vault;
    const nid = hosts.save({ name: name || h.name, group: h.group, host: h.host, port: h.port, user: h.user, keyPath: h.keyPath, keyId: same ? h.keyId : '', icon: h.icon, tags: h.tags, secret: h.secret || undefined, ...(vault !== 'personal' && { vault }) });
    if (move) hosts.remove(id);
    return { id: nid, keyDropped: !!h.keyId && !same };
  };
  const a = hosts.save({ name: 'web', host: 'w', user: 'u', secret: 'pw', keyId: 'k1', tags: ['x'] });
  const c1 = copy(a, 'personal', false, 'web (copy)');
  assert.equal(hosts.get(c1.id).keyId, 'k1', 'Klon im selben Tresor behält den Schlüssel');
  const c2 = copy(a, 'T9', false);
  assert(c2.keyDropped && hosts.get(c2.id).keyId === '' && hosts.get(c2.id).vault === 'T9' && hosts.get(c2.id).secret === 'pw', 'Klon ins Team: Passwort mit, Schlüssel nicht');
  assert(hosts.list().some((h) => h.id === a), 'Original bleibt beim Klonen');
  const m = copy(c2.id, 'personal', true);
  assert(!hosts.list().some((h) => h.id === c2.id) && hosts.get(m.id).vault === undefined, 'Verschieben löscht das Original und nutzt den Zielort');
  assert(hosts.list().length === 3 && hosts.get(m.id).tags[0] === 'x');
  console.log('copy ok');
})();

// Cloud-Schlüsselbund: Passwort + Geheimschlüssel, zwei Geräte, Löschen, falsche Eingaben, Server sieht nur Chiffretext (echter Server)
(async () => {
  const kc = require('./keyvault');
  const { keys: mkKeys } = require('./store');
  const { srv, url } = await listen({});
  const crypt = { encrypt: (x) => 'enc:' + x, decrypt: (x) => String(x).replace(/^enc:/, '') };
  const k = sync.deriveKeys('kc@t.de', 'pw-kc');
  const api = new sync.Backend({ url, token: (await new sync.Backend({ url }).register('kc@t.de', k.auth)).token });
  const dev = () => mkKeys(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'deck-kc-')), 'k.json'), crypt);
  const A = dev(), B = dev();

  // Gerät A: einschalten
  const made = await kc.create('pw-kc');
  await api.request('PUT', 'keyvault', { header: made.header, blob: null, prev: null });
  assert(/^SD1-[0-9A-Z]{6}(-[0-9A-Z]{5}){4}$/.test(made.secretKey), 'Geheimschlüssel hat das lesbare Format');
  const id1 = A.add({ name: 'prod', privateKey: 'GEHEIM-PRIVAT', publicKey: 'ssh-ed25519 AAA', cloud: true });
  A.add({ name: 'lokal', privateKey: 'NUR-HIER' }); // ohne Cloud-Flag
  const cloudOf = (st) => ({ get: () => kc.snapshot(st.raw(), []), set: (m) => st.setRaw(kc.apply(st.raw(), m)) });
  const run = async (st, vk, tomb = []) => {
    let header;
    const cloud = {
      getVault: async () => { const r = (await api.request('GET', 'keyvault')).vault; header = r.header; return { blob: r.blob || sync.seal(vk, { keys: [] }), rev: r.rev }; },
      putVault: async (blob, prev) => { try { await api.request('PUT', 'keyvault', { header, blob, prev }); return true; } catch (e) { if (e.status === 409) return false; throw e; } },
    };
    await sync.syncOnce({ cloud, key: vk, local: { get: () => kc.snapshot(st.raw(), tomb), set: (m) => st.setRaw(kc.apply(st.raw(), m)) } });
  };
  await run(A, made.vk);
  const stored = (await api.request('GET', 'keyvault')).vault;
  assert(!stored.blob.includes('GEHEIM') && !Buffer.from(stored.blob, 'base64').toString('latin1').includes('GEHEIM-PRIVAT'), 'Server speichert nur Chiffretext');
  assert(!stored.header.includes(made.secretKey) && !JSON.stringify(JSON.parse(stored.header)).includes('pw-kc'), 'Geheimschlüssel und Passwort stehen nicht beim Server');

  // Gerät B: nur mit Passwort UND Geheimschlüssel
  await assert.rejects(kc.unlock('pw-kc', kc.newSecretKey().text, stored.header), (e) => e.code === 'WRONG', 'falscher Geheimschlüssel');
  await assert.rejects(kc.unlock('falsch', made.secretKey, stored.header), (e) => e.code === 'WRONG', 'falsches Passwort');
  const vkB = await kc.unlock('pw-kc', made.secretKey.toLowerCase(), stored.header); // Groß-/Kleinschreibung egal
  await run(B, vkB);
  assert.equal(B.get(id1).privateKey, 'GEHEIM-PRIVAT', 'Schlüssel kommt auf Gerät B an');
  assert.equal(B.list().length, 1, 'nicht eingeschaltete Schlüssel bleiben lokal');
  assert(B.list()[0].cloud, 'auf B als Cloud-Schlüssel markiert');

  // Löschen auf B verschwindet auch auf A; ein lokaler Schlüssel ohne Cloud-Flag wird nie gelöscht
  B.remove(id1); await run(B, vkB); await run(A, made.vk);
  assert.deepEqual(A.list().map((x) => x.name), ['lokal'], 'Löschmarker wirkt, lokaler Schlüssel bleibt');
  // Bewusst aus der Cloud nehmen: Gerät A behält ihn, Gerät B verliert ihn
  const id2 = A.add({ name: 'zweiter', privateKey: 'P2', cloud: true }); await run(A, made.vk); await run(B, vkB);
  assert.equal(B.list().length, 1);
  A.setCloud(id2, false); await run(A, made.vk, [{ id: id2, at: Date.now() + 5 }]); await run(B, vkB);
  assert(A.list().some((x) => x.id === id2) && !B.list().some((x) => x.id === id2 && !x.deleted), 'aus der Cloud entfernt: lokal bleibt er, andere Geräte verlieren ihn');
  assert.throws(() => kc.parseSecretKey('zu kurz'), (e) => e.code === 'SK');
  await api.request('DELETE', 'keyvault', {});
  assert.equal((await api.request('GET', 'keyvault')).vault, null, 'Ausschalten löscht die Cloud-Kopie');
  srv.close();
  console.log('keychain-cloud ok');
})().catch((e) => { console.error(e); process.exit(1); });

// Update-Kanäle: SemVer-Vergleich mit Dev-Builds, Dev-Kanal wählt das höchste Release inkl. Vorabversionen (lokaler Server)
(async () => {
  const http = require('http');
  const updater = require('./updater');
  const lt = (a, b) => assert(updater.cmp(a, b) < 0 && updater.cmp(b, a) > 0, `${a} < ${b}`);
  lt('0.1.3-dev.2', '0.1.3-dev.10'); lt('0.1.3-dev.9', '0.1.3'); lt('0.1.3', '0.1.4-dev.1'); lt('0.1.2', '0.1.3-dev.1');
  assert.equal(updater.cmp('0.1.3', 'v0.1.3'), 0);
  assert(updater.isNewer('0.1.4-dev.1', '0.1.3') && !updater.isNewer('0.1.4-dev.1', '0.1.4'), 'Dev-Build ist älter als das spätere stabile Release');

  const list = [
    { tag_name: 'v0.1.3', prerelease: false, tarball_url: 'https://x/0.1.3', html_url: 'https://github.com/o/r/releases/tag/v0.1.3' },
    { tag_name: 'v0.1.4-dev.2', prerelease: true, tarball_url: 'https://x/dev2', html_url: 'https://github.com/o/r/releases/tag/v0.1.4-dev.2' },
    { tag_name: 'v0.1.4-dev.10', prerelease: true, tarball_url: 'https://x/dev10', html_url: 'https://github.com/o/r/releases/tag/v0.1.4-dev.10' },
    { tag_name: 'v0.1.9', prerelease: false, draft: true, tarball_url: 'https://x/draft' },
  ];
  const srv = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url.startsWith('/repos/o/r/releases/latest')) return res.end(JSON.stringify(list[0]));
    if (req.url.startsWith('/repos/o/r/releases')) return res.end(JSON.stringify(list));
    res.statusCode = 404; res.end('{}');
  }).listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const f = (u, i) => fetch(u.replace('https://api.github.com', base), i); // GitHub-Adresse auf den Testserver umleiten
  const stable = await updater.latest({ repo: 'o/r', fetch: f });
  assert.equal(stable.version, '0.1.3', 'Stabil: nur das neueste stabile Release');
  const dev = await updater.latest({ repo: 'o/r', channel: 'dev', fetch: f });
  assert.equal(dev.version, '0.1.4-dev.10', 'Dev: höchster Build (10 > 2), Entwürfe zählen nicht');
  assert(dev.prerelease && dev.tarball.endsWith('/dev10'));
  assert(updater.isNewer(dev.version, '0.1.4-dev.2') && !updater.isNewer(dev.version, '0.1.4-dev.10'), 'Dev-Update nur bei höherer Build-Nummer');
  assert(updater.available('0.1.4-dev.16', '0.1.4', true) && !updater.available('0.1.4-dev.16', '0.1.4-dev.16', true) && !updater.available('0.1.4-dev.16', '0.1.4', false), 'Quell-Installation 0.1.4 bekommt Dev-Builds von 0.1.4');
  srv.close();
  console.log('channels ok');
})().catch((e) => { console.error(e); process.exit(1); });

// Jump-Hosts: Kette, Schleifen, Tiefe; Telnet: IAC-Verhandlung
(() => {
  const jump = require('./jump');
  const telnet = require('./telnet');
  const L = [{ id: 'a' }, { id: 'b', jumpId: 'a' }, { id: 'c', jumpId: 'b' }, { id: 'd', jumpId: 'c' }, { id: 'e', jumpId: 'd' }, { id: 't', protocol: 'telnet' }];
  const get = (id) => L.find((x) => x.id === id);
  assert.deepEqual(jump.chain(get, get('c')).map((x) => x.id), ['a', 'b'], 'außen zuerst');
  assert.deepEqual(jump.chain(get, get('a')), []);
  assert.equal(jump.chain(get, get('d')).length, 3);
  assert.throws(() => jump.chain(get, get('e')), /max\. 3/);
  assert.throws(() => jump.chain(get, { id: 'a', jumpId: 'c' }), /Schleife/, 'a -> c -> b -> a');
  assert.throws(() => jump.chain(get, { id: 'x', jumpId: 'x' }), /Schleife/);
  assert.throws(() => jump.chain(get, { id: 'x', jumpId: 't' }), /Telnet/);
  assert.throws(() => jump.chain(get, { id: 'x', jumpId: 'zz' }), /nicht gefunden/);
  assert.deepEqual(jump.candidates(L, 'a').map((x) => x.id), [], 'b..e hängen an a (Schleife), t ist Telnet');
  assert(!jump.candidates(L, 'x').some((x) => x.id === 'e'), 'Tiefe 4 nicht wählbar');

  const IAC = 255;
  const st = telnet.newState(100, 30);
  let r = telnet.parse(st, Buffer.from([IAC, 251, 1, IAC, 251, 3, IAC, 253, 31, IAC, 253, 24, IAC, 251, 99, 65, IAC, IAC, 66, IAC]));
  assert.deepEqual([...r.data], [65, 255, 66], 'IAC IAC = Datenbyte 255; angefangene Sequenz wartet');
  assert.deepEqual([...r.reply], [IAC, 253, 1, IAC, 253, 3, IAC, 251, 31, IAC, 250, 31, 0, 100, 0, 30, IAC, 240, IAC, 252, 24, IAC, 254, 99], 'ECHO/SGA/NAWS an, Rest abgelehnt');
  r = telnet.parse(st, Buffer.from([251, 1, 67]));
  assert.deepEqual([...r.data], [67]);
  assert.equal(r.reply.length, 0, 'zweites WILL ECHO: keine erneute Antwort');
  telnet.parse(st, Buffer.from([IAC, 250, 24, 1, IAC]));
  r = telnet.parse(st, Buffer.from([240, 68]));
  assert.deepEqual([...r.data], [68], 'Unterverhandlung über Chunk-Grenze ignoriert');
  assert.deepEqual([...telnet.encode('a\r')], [97, 13, 0]);
  assert.deepEqual([...telnet.nawsFrame(255, 24)], [IAC, 250, 31, 0, 255, 255, 0, 24, IAC, 240], '255 in NAWS wird verdoppelt');
  console.log('jump/telnet ok');
})();

// Proxy-Kette / Cloudflare Tunnel
{
  const tp = require('./transport');
  const p = tp.parseProxies('# Kommentar\nsocks5://u:p%40w@a.example:9050\nsocks4://[::1]:1081\nb.example\n');
  assert.deepEqual(p[0], { host: 'a.example', port: 9050, type: 5, userId: 'u', password: 'p@w' });
  assert.deepEqual(p[1], { host: '::1', port: 1081, type: 4 });
  assert.deepEqual(p[2], { host: 'b.example', port: 1080, type: 5 });
  assert.throws(() => tp.parseProxies('http://x:8080'), /nicht unterstützt/);
  assert.deepEqual(tp.parseProxies(''), []);
  tp.cloudflared('x.example', '/nonexistent/cloudflared').then(() => assert.fail('sollte scheitern'), (e) => assert(/cloudflared nicht gefunden/.test(e.message)));
  const hs = hosts(path.join(dir, 'via.json'), { encrypt: (x) => x, decrypt: (x) => x });
  const vid = hs.save({ name: 'v', host: 'h', user: 'u', via: 'proxy', proxies: 'socks5://p:1' });
  assert.equal(hs.list()[0].via, 'proxy'); assert.equal(hs.list()[0].proxies, 'socks5://p:1');
  hs.save({ id: vid, name: 'v', host: 'h', user: 'u', via: 'cloudflared', proxies: 'x' });
  assert.equal(hs.list()[0].proxies, ''); assert.equal(hs.list()[0].via, 'cloudflared');
  console.log('transport ok');
}

// Handy-Unterbau (Node-Seite über den electron-Ersatz, Keystore-Schlüssel) in eigenem Prozess
console.log(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'mobile', 'test-node.js')], { encoding: 'utf8', timeout: 60000 }).trim());

// Befehlsvorschläge
import('./src/lib/suggest.mjs').then(({ suggest, COMMON }) => {
  assert.deepEqual(suggest('g', { history: ['git status'] }), [], 'unter 2 Zeichen keine Vorschläge');
  const r = suggest('git ', { history: ['git push', 'ls', 'git pull'], snippets: ['git stash pop'], common: ['git status', 'git pull'] });
  assert.deepEqual(r.map((x) => x.text + ':' + x.src), ['git pull:hist', 'git push:hist', 'git stash pop:snip', 'git status:common'], 'Verlauf neueste zuerst, dann Snippets, dann häufige; ohne Doppelte');
  assert.equal(suggest('git pull', { history: ['git pull'] }).length, 0, 'identische Zeile wird nicht vorgeschlagen');
  assert.equal(suggest('ls', { history: Array.from({ length: 9 }, (_, i) => 'ls ' + i) }).length, 5, 'höchstens 5');
  assert(COMMON.length > 50 && new Set(COMMON).size === COMMON.length, 'häufige Befehle ohne Doppelte');
  console.log('suggest ok');
});
