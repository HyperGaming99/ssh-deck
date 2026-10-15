// Ersetzt die Verbindung zum Hauptprozess durch Demo-Daten, damit die echte Oberfläche für den Trailer
// aufgenommen werden kann, ohne echte Hosts, Schlüssel oder Konten zu zeigen. Dieselbe API-Form wie preload.js.
const { contextBridge } = require('electron');

const now = Date.now(), H = 36e5, D = 864e5;
const fp = (seed) => { // deterministischer Fake-Fingerabdruck im SHA256:-Format
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let x = 2166136261; for (const c of seed) x = Math.imul(x ^ c.charCodeAt(0), 16777619) >>> 0;
  let s = 'SHA256:'; for (let i = 0; i < 43; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; s += A[x >>> 26]; } return s;
};

const groups = [{ id: 'g1', name: 'Production' }, { id: 'g2', name: 'Homelab' }, { id: 'g3', name: 'Cloud' }];
const h = (id, name, group, host, user, icon, tags = []) => ({ id, name, group, host, port: 22, user, autoIcon: icon, icon: '', tags, hasSecret: true, keyId: '' });
const hosts = [
  h('h1', 'web-prod-01', 'Production', 'web-prod-01.example.com', 'deploy', 'ubuntu-linux', ['nginx']),
  h('h2', 'db-primary', 'Production', 'db1.example.com', 'postgres', 'postgresql', ['postgres']),
  h('h3', 'k8s-control', 'Production', 'k8s.example.com', 'admin', 'kubernetes'),
  h('h4', 'proxmox', 'Homelab', '192.168.1.10', 'root', 'proxmox'),
  h('h5', 'nas', 'Homelab', '192.168.1.20', 'admin', 'synology'),
  h('h6', 'pi-hole', 'Homelab', '192.168.1.5', 'pi', 'raspberry-pi'),
  h('h7', 'edge-firewall', 'Homelab', '192.168.1.1', 'root', 'opnsense'),
  h('h8', 'ci-runner', 'Cloud', 'ci.example.com', 'runner', 'gitlab'),
  h('h9', 'aws-bastion', 'Cloud', 'bastion.example.com', 'ec2-user', 'aws'),
  h('h10', 'hetzner-vps', '', '203.0.113.42', 'root', 'hetzner'),
  h('h11', 'debian-mirror', '', '203.0.113.77', 'mirror', 'debian-linux', ['mirror']),
];
const keys = [
  { id: 'k1', name: 'deploy_ed25519', source: 'generated', type: 'ssh-ed25519', fingerprint: fp('k1'), publicKey: 'ssh-ed25519 AAAA…', encrypted: false },
  { id: 'k2', name: 'homelab_ed25519', source: 'imported', type: 'ssh-ed25519', fingerprint: fp('k2'), publicKey: 'ssh-ed25519 AAAA…', encrypted: false },
  { id: 'k3', name: 'work_rsa', source: 'imported', type: 'ssh-rsa', fingerprint: fp('k3'), publicKey: 'ssh-rsa AAAA…', encrypted: true },
  { id: 'k4', name: 'ci_ed25519', source: 'generated', type: 'ssh-ed25519', fingerprint: fp('k4'), publicKey: 'ssh-ed25519 AAAA…', encrypted: false },
];
const snippets = [
  { id: 's1', name: 'Restart nginx', cmd: 'sudo systemctl restart nginx' },
  { id: 's2', name: 'Disk usage', cmd: 'df -h' },
  { id: 's3', name: 'Follow app logs', cmd: 'journalctl -fu app' },
  { id: 's4', name: 'Clean up Docker', cmd: 'docker system prune -af' },
];
const fwd = [
  { id: 'f1', type: 'local', label: 'Postgres', hostId: 'h2', bindAddr: '127.0.0.1', bindPort: 5432, destHost: 'localhost', destPort: 5432, running: true },
  { id: 'f2', type: 'local', label: 'Intranet', hostId: 'h1', bindAddr: '127.0.0.1', bindPort: 8080, destHost: '10.0.0.4', destPort: 80, running: true },
  { id: 'f3', type: 'dynamic', label: 'SOCKS Proxy', hostId: 'h1', bindAddr: '127.0.0.1', bindPort: 1080, running: false },
];
const known = ['web-prod-01.example.com', 'db1.example.com', 'k8s.example.com', '192.168.1.10', '192.168.1.20', 'bastion.example.com', '203.0.113.42']
  .map((host, i) => ({ id: 'n' + i, host, port: 22, type: i % 4 === 3 ? 'ssh-rsa' : 'ssh-ed25519', fingerprint: fp(host), addedAt: now - i * D }));
const E = (name, dir, size, ago) => ({ name, dir, size, mtime: now - ago });
const remoteFiles = [E('releases', true, 0, 2 * D), E('shared', true, 0, 9 * D), E('config', true, 0, 4 * D), E('Dockerfile', false, 812, 3 * D), E('deploy.sh', false, 2310, D),
  E('nginx.conf', false, 1560, 6 * D), E('package.json', false, 1894, H), E('server.js', false, 7421, 5 * H), E('README.md', false, 3102, 12 * D), E('app.log', false, 4403311, 20 * 60000)];
const localFiles = [E('src', true, 0, H), E('dist', true, 0, 2 * H), E('docs', true, 0, 7 * D), E('build.zip', false, 18874368, 30 * 60000), E('logo.svg', false, 5201, 9 * D),
  E('notes.md', false, 2411, 3 * H), E('report.pdf', false, 912004, 2 * D), E('package.json', false, 1894, H)];
let settings = { editor: 'auto', dark: true, tor: { sync: true, servers: true, host: '127.0.0.1', port: 9050 } };
const cb = { data: [], hostKey: [], status: [], teams: [] };
const demo = { manual: false, teams: [] }; // true: Verbindungsstatus von außen steuern (Aufnahme des Verbindungsbildschirms)
const ok = (v) => Promise.resolve(v);

contextBridge.exposeInMainWorld('api', {
  hosts: { list: () => ok(hosts), get: (id) => ok(hosts.find((x) => x.id === id)), save: () => ok('new'), remove: () => ok() },
  win: { minimize() {}, toggleMax() {}, close() {} },
  groups: { list: () => ok(groups), create: () => ok(null), rename: () => ok(null), remove: () => ok() },
  sync: { status: () => ok({ configured: true, email: 'alex@example.com', server: 'https://sync.example.com', status: 'ok', lastSync: now - 120000, error: '' }),
    auth: () => ok({ ok: true }), now: () => ok(), logout: () => ok(), onStatus: (f) => cb.status.push(f) },
  known: { list: () => ok(known), remove: () => ok(), import: () => ok({ added: 0, skipped: 0 }) },
  onHostKey: (ask) => cb.hostKey.push(ask),
  answerHostKey() {},
  tor: { test: () => ok({ state: 'ok', ip: '198.51.100.23' }) },
  kc: { status: () => ok({ signedIn: true, enabled: false, remote: false, keys: 0 }), enable: () => ok({ secretKey: 'SD1-ABCDEF-12345-GHJKM-NPQRS-TVWXY' }), unlock: () => ok({}), secret: () => ok({ secretKey: 'SD1-ABCDEF-12345-GHJKM-NPQRS-TVWXY' }), setKey: () => ok({}), disable: () => ok({}) },
  override: { get: () => ok({ keyId: '', user: '' }), set: () => ok() },
  team: { list: () => ok({ teams: demo.teams }), create: () => ok({}),
    members: () => ok({ role: 'owner', members: [{ userId: 1, email: 'alex@example.com', role: 'owner', fingerprint: '598c f244 12c8 20c9 68aa', me: true }, { userId: 2, email: 'sam@example.com', role: 'member', fingerprint: '91ab 03de 77f0 4c21 b8e5' }, { userId: 3, email: 'robin@example.com', role: 'viewer', fingerprint: '4d20 e9a1 3b67 f8c0 15d2' }] }), invite: () => ok({}), setRole: () => ok({}), remove: () => ok({}), leave: () => ok({}), delete: () => ok({}), onChanged: (f) => cb.teams.push(f) },
  update: { check: () => ok({ current: '0.1.0', latest: '0.1.0', available: false, canInstall: true }), install: () => ok({ ok: true }), openPage() {}, onAvailable() {}, onStep() {} },
  settings: { get: () => ok(settings), set: (p) => { settings = { ...settings, ...p }; return ok(); } },
  onHostsChanged() {},
  snippets: { list: () => ok(snippets), save: () => ok(), remove: () => ok() },
  keys: { list: () => ok(keys), rescan: () => ok(0), generate: () => ok(null), setPassphrase: () => ok(), remove: () => ok(), exportPrivate: () => ok(null), toHost: () => ok(null) },
  sftp: { open: () => ok(), list: (sid, p) => ok({ path: '/var/www/app', entries: remoteFiles }), mkdir: () => ok(), rename: () => ok(), remove: () => ok(), upload: () => ok(),
    download: () => ok(), edit: () => ok(), copy: () => ok(), close() {} },
  local: { list: () => ok({ path: '/home/alex/projects/app', entries: localFiles }), mkdir: () => ok(), rename: () => ok(), remove: () => ok(), open: () => ok() },
  editors: { list: () => ok([{ cmd: 'code', name: 'VS Code' }, { cmd: 'gnome-text-editor', name: 'Text Editor' }]) },
  onEdit() {},
  platform: 'linux',
  pathOf: () => '',
  fwd: { list: () => ok(fwd), save: () => ok(), remove: () => ok(), toggle: () => ok(null) },
  open(sid) { if (!demo.manual) cb.status.forEach((f) => f(sid, { state: 'ready', log: [], info: {} })); }, answer() {}, input() {}, resize() {}, close() {},
  onData: (f) => cb.data.push(f),
  onStatus: (f) => cb.status.push(f), onCredAsk() {}, answerCred() {},
  onClosed() {},
  // Nur für die Aufnahme: Terminalausgabe und Rückfragen von außen auslösen
  __demo: { setTeams: (t) => { demo.teams = t; cb.teams.forEach((f) => f()); }, setManual: (v) => { demo.manual = v; }, status: (sid, s) => cb.status.forEach((f) => f(sid, s)), emit: (sid, d) => cb.data.forEach((f) => f(sid, d)), askHostKey: (info) => cb.hostKey.forEach((f) => f(info)) },
});
