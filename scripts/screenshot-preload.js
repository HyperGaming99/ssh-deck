// Preload-Skript für automatisierte Desktop- und Mobile-Screenshots mit reichhaltigen Demodaten
const { contextBridge } = require('electron');

const now = Date.now(), H = 36e5, D = 864e5;
const fp = (seed) => {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let x = 2166136261;
  for (const c of seed) x = Math.imul(x ^ c.charCodeAt(0), 16777619) >>> 0;
  let s = 'SHA256:';
  for (let i = 0; i < 43; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    s += A[x >>> 26];
  }
  return s;
};

const groups = [
  { id: 'g1', name: 'Production', color: '#3b82f6', icon: 'server', order: 0 },
  { id: 'g2', name: 'Homelab', color: '#10b981', icon: 'shield', order: 1 },
  { id: 'g3', name: 'Cloud', color: '#8b5cf6', icon: 'cloud', order: 2 },
];

const h = (id, name, group, host, user, icon, tags = [], fav = false) => ({
  id, name, group, host, port: 22, user, autoIcon: icon, icon: '', tags, fav, hasSecret: true, keyId: '', order: 0,
});

const hosts = [
  h('h1', 'web-prod-01', 'Production', 'web-prod-01.example.com', 'deploy', 'ubuntu-linux', ['nginx', 'frontend'], true),
  h('h2', 'db-primary', 'Production', 'db1.example.com', 'postgres', 'postgresql', ['postgres', 'database'], true),
  h('h3', 'k8s-control', 'Production', 'k8s.example.com', 'admin', 'kubernetes', ['k8s', 'cluster']),
  h('h4', 'proxmox-node', 'Homelab', '192.168.1.10', 'root', 'proxmox', ['vm', 'pve']),
  h('h5', 'nas-storage', 'Homelab', '192.168.1.20', 'admin', 'synology', ['backup', 'nfs']),
  h('h6', 'pi-hole', 'Homelab', '192.168.1.5', 'pi', 'raspberry-pi', ['dns']),
  h('h7', 'edge-gateway', 'Homelab', '192.168.1.1', 'root', 'opnsense', ['firewall']),
  h('h8', 'ci-runner', 'Cloud', 'ci.example.com', 'runner', 'gitlab', ['docker']),
  h('h9', 'aws-bastion', 'Cloud', 'bastion.example.com', 'ec2-user', 'aws', ['bastion']),
  h('h10', 'hetzner-vps', '', '203.0.113.42', 'root', 'hetzner', ['staging']),
  h('h11', 'debian-mirror', '', '203.0.113.77', 'mirror', 'debian-linux', ['mirror']),
];

const keys = [
  { id: 'k1', name: 'id_ed25519_deploy', source: 'generated', type: 'ssh-ed25519', fingerprint: fp('k1'), publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI...', encrypted: false },
  { id: 'k2', name: 'id_homelab_vault', cloud: true, source: 'imported', type: 'ssh-ed25519', fingerprint: fp('k2'), publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI...', encrypted: false },
  { id: 'k3', name: 'work_rsa_legacy', source: 'imported', type: 'ssh-rsa', fingerprint: fp('k3'), publicKey: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAA...', encrypted: true },
  { id: 'k4', name: 'ci_ed25519_runner', source: 'generated', type: 'ssh-ed25519', fingerprint: fp('k4'), publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI...', encrypted: false },
];

const snippets = [
  { id: 's1', name: 'Restart Nginx', cmd: 'sudo systemctl restart nginx' },
  { id: 's2', name: 'Disk & Memory Usage', cmd: 'df -h && free -m' },
  { id: 's3', name: 'Follow App Logs', cmd: 'journalctl -fu app --lines=100' },
  { id: 's4', name: 'Prune Docker System', cmd: 'docker system prune -af --volumes' },
  { id: 's5', name: 'Git Pull & Rebuild', cmd: 'git pull origin main && npm run build' },
];

const fwd = [
  { id: 'f1', type: 'local', label: 'PostgreSQL DB', hostId: 'h2', bindAddr: '127.0.0.1', bindPort: 5432, destHost: 'localhost', destPort: 5432, running: true },
  { id: 'f2', type: 'local', label: 'Internal Dashboard', hostId: 'h1', bindAddr: '127.0.0.1', bindPort: 8080, destHost: '10.0.0.4', destPort: 80, running: true },
  { id: 'f3', type: 'dynamic', label: 'SOCKS5 Proxy (US)', hostId: 'h9', bindAddr: '127.0.0.1', bindPort: 1080, running: false },
];

const known = [
  { id: 'n1', host: 'web-prod-01.example.com', port: 22, type: 'ssh-ed25519', fingerprint: fp('web-prod'), addedAt: now - D },
  { id: 'n2', host: 'db1.example.com', port: 22, type: 'ssh-ed25519', fingerprint: fp('db1'), addedAt: now - 2 * D },
  { id: 'n3', host: 'k8s.example.com', port: 22, type: 'ssh-ed25519', fingerprint: fp('k8s'), addedAt: now - 3 * D },
  { id: 'n4', host: '192.168.1.10', port: 22, type: 'ssh-rsa', fingerprint: fp('pve'), addedAt: now - 5 * D },
  { id: 'n5', host: 'bastion.example.com', port: 22, type: 'ssh-ed25519', fingerprint: fp('bastion'), addedAt: now - 7 * D },
];

const k8sData = {
  nodes: [
    { name: 'k8s-master-01', ready: true, status: 'Ready', roles: ['control-plane', 'master'], version: 'v1.31.2', osImage: 'Ubuntu 24.04 LTS', arch: 'amd64', internalIp: '10.0.1.10' },
    { name: 'k8s-worker-01', ready: true, status: 'Ready', roles: ['worker'], version: 'v1.31.2', osImage: 'Ubuntu 24.04 LTS', arch: 'amd64', internalIp: '10.0.1.11' },
    { name: 'k8s-worker-02', ready: true, status: 'Ready', roles: ['worker'], version: 'v1.31.2', osImage: 'Ubuntu 24.04 LTS', arch: 'amd64', internalIp: '10.0.1.12' },
  ],
  pods: [
    { name: 'ingress-nginx-controller-7f89d4c9-x92kl', namespace: 'ingress-nginx', phase: 'Running', ready: '1/1', isReady: true, restarts: 0, image: 'registry.k8s.io/ingress-nginx/controller:v1.11.2', node: 'k8s-worker-01', ip: '10.244.1.15' },
    { name: 'frontend-web-6d8bf9c4f-7q2lw', namespace: 'default', phase: 'Running', ready: '1/1', isReady: true, restarts: 0, image: 'nginx:1.27-alpine', node: 'k8s-worker-02', ip: '10.244.2.33' },
    { name: 'frontend-web-6d8bf9c4f-v84nm', namespace: 'default', phase: 'Running', ready: '1/1', isReady: true, restarts: 0, image: 'nginx:1.27-alpine', node: 'k8s-worker-01', ip: '10.244.1.42' },
    { name: 'api-backend-559d864f7b-9k2px', namespace: 'default', phase: 'Running', ready: '1/1', isReady: true, restarts: 0, image: 'node:22-slim', node: 'k8s-worker-01', ip: '10.244.1.88' },
    { name: 'postgres-0', namespace: 'database', phase: 'Running', ready: '1/1', isReady: true, restarts: 0, image: 'postgres:16.4', node: 'k8s-worker-02', ip: '10.244.2.19' },
    { name: 'redis-cache-master-0', namespace: 'database', phase: 'Running', ready: '1/1', isReady: true, restarts: 0, image: 'redis:7.4-alpine', node: 'k8s-worker-01', ip: '10.244.1.64' },
  ],
  deployments: [
    { name: 'frontend-web', namespace: 'default', replicas: 2, readyReplicas: 2, updatedReplicas: 2, availableReplicas: 2, image: 'nginx:1.27-alpine' },
    { name: 'api-backend', namespace: 'default', replicas: 1, readyReplicas: 1, updatedReplicas: 1, availableReplicas: 1, image: 'node:22-slim' },
    { name: 'ingress-nginx-controller', namespace: 'ingress-nginx', replicas: 1, readyReplicas: 1, updatedReplicas: 1, availableReplicas: 1, image: 'registry.k8s.io/ingress-nginx/controller:v1.11.2' },
  ],
  services: [
    { name: 'kubernetes', namespace: 'default', type: 'ClusterIP', clusterIp: '10.96.0.1', externalIp: '-', ports: '443/TCP' },
    { name: 'frontend-svc', namespace: 'default', type: 'LoadBalancer', clusterIp: '10.96.14.88', externalIp: '203.0.113.150', ports: '80:31280/TCP, 443:31443/TCP' },
    { name: 'api-svc', namespace: 'default', type: 'ClusterIP', clusterIp: '10.96.220.10', externalIp: '-', ports: '3000/TCP' },
    { name: 'postgres-svc', namespace: 'database', type: 'ClusterIP', clusterIp: '10.96.50.4', externalIp: '-', ports: '5432/TCP' },
  ],
  namespaces: ['default', 'database', 'ingress-nginx', 'kube-system'],
};

const E = (name, dir, size, ago, mode = 0o644) => ({ name, dir, size, mtime: now - ago, mode: dir ? 0o755 : mode });
const remoteFiles = [
  E('releases', true, 0, 2 * D),
  E('shared', true, 0, 9 * D),
  E('config', true, 0, 4 * D),
  E('Dockerfile', false, 812, 3 * D, 0o644),
  E('deploy.sh', false, 2310, D, 0o755),
  E('nginx.conf', false, 1560, 6 * D, 0o644),
  E('package.json', false, 1894, H, 0o644),
  E('server.js', false, 7421, 5 * H, 0o755),
  E('README.md', false, 3102, 12 * D, 0o644),
  E('app.log', false, 4403311, 20 * 60000, 0o600),
];

const localFiles = [
  E('src', true, 0, H),
  E('dist', true, 0, 2 * H),
  E('docs', true, 0, 7 * D),
  E('build.zip', false, 18874368, 30 * 60000, 0o644),
  E('logo.svg', false, 5201, 9 * D, 0o644),
  E('notes.md', false, 2411, 3 * H, 0o644),
  E('report.pdf', false, 912004, 2 * D, 0o644),
  E('package.json', false, 1894, H, 0o644),
];

const cb = { data: [], hostKey: [], status: [], teams: [] };
const ok = (v) => Promise.resolve(v);

contextBridge.exposeInMainWorld('api', {
  hosts: {
    list: () => ok(hosts),
    get: (id) => ok(hosts.find((x) => x.id === id)),
    save: () => ok('new'),
    remove: () => ok(),
    reorder: () => ok(),
    copy: () => ok({}),
    ping: (h) => ok({ id: h?.id, online: true, ms: 24, at: Date.now() }),
    pingAll: () => {
      const res = {};
      for (const h of hosts) {
        res[h.id] = { id: h.id, online: h.id !== 'h10', ms: h.id === 'h1' ? 18 : h.id === 'h2' ? 24 : h.id === 'h3' ? 32 : h.id === 'h9' ? 112 : 54, at: Date.now() };
      }
      return ok(res);
    },
  },
  win: { minimize() {}, toggleMax() {}, close() {} },
  groups: {
    list: () => ok(groups),
    create: () => ok(null),
    save: () => ok(null),
    remove: () => ok(),
    reorder: () => ok(),
  },
  k8s: {
    overview: () => ok(k8sData),
    run: () => ok({ ok: true }),
    scale: () => ok({ ok: true }),
    restart: () => ok({ ok: true }),
    delete: () => ok({ ok: true }),
    logs: () => ok('2026-11-08T02:00:00Z [INFO] Server started on :80\n2026-11-08T02:00:01Z [INFO] Connected to redis:6379\n2026-11-08T02:00:05Z [INFO] Ready for traffic'),
    describe: () => ok('Name: frontend-web\nReplicas: 2\nStatus: Running'),
  },
  docker: {
    overview: () => ok({
      containers: [
        { id: 'c1a2b3c4', name: 'web-nginx', image: 'nginx:alpine', state: 'running', status: 'Up 4 hours', running: true, paused: false, ports: '0.0.0.0:80->80/tcp', created: '4 hours ago', size: '23MB', cpu: '0.12%', memory: '18.4MB / 16GB', memPct: '0.11%', netIO: '12MB / 4MB', pids: '3' },
        { id: 'd2e3f4a5', name: 'postgres-db', image: 'postgres:16', state: 'running', status: 'Up 12 days', running: true, paused: false, ports: '127.0.0.1:5432->5432/tcp', created: '12 days ago', size: '380MB', cpu: '0.45%', memory: '142MB / 16GB', memPct: '0.88%', netIO: '85MB / 92MB', pids: '8' },
        { id: 'f5a6b7c8', name: 'redis-cache', image: 'redis:7-alpine', state: 'running', status: 'Up 12 days', running: true, paused: false, ports: '127.0.0.1:6379->6379/tcp', created: '12 days ago', size: '35MB', cpu: '0.05%', memory: '24MB / 16GB', memPct: '0.15%', netIO: '34MB / 48MB', pids: '4' },
      ],
      images: [
        { id: 'img1', repository: 'nginx', tag: 'alpine', size: '23.5MB', created: '2 weeks ago' },
        { id: 'img2', repository: 'postgres', tag: '16', size: '379MB', created: '3 weeks ago' },
        { id: 'img3', repository: 'redis', tag: '7-alpine', size: '35.1MB', created: '1 month ago' },
      ],
      volumes: [
        { name: 'pgdata', driver: 'local', mountpoint: '/var/lib/docker/volumes/pgdata/_data', scope: 'local' },
        { name: 'redis_data', driver: 'local', mountpoint: '/var/lib/docker/volumes/redis_data/_data', scope: 'local' },
      ],
      networks: [
        { id: 'net1', name: 'bridge', driver: 'bridge', scope: 'local' },
        { id: 'net2', name: 'host', driver: 'host', scope: 'local' },
      ],
      info: { serverVersion: '27.3.1', operatingSystem: 'Ubuntu 24.04 LTS', arch: 'x86_64', cpus: 8, totalMemory: 16384 },
    }),
    start: () => ok({ ok: true }),
    stop: () => ok({ ok: true }),
    restart: () => ok({ ok: true }),
    pause: () => ok({ ok: true }),
    unpause: () => ok({ ok: true }),
    remove: () => ok({ ok: true }),
    logs: () => ok('[INFO] Server started\n[INFO] Connected to database\n[INFO] Listening on port 80'),
    inspect: () => ok('{\n  "Id": "c1a2b3c4",\n  "State": { "Running": true }\n}'),
    run: () => ok({ ok: true }),
    pull: () => ok({ ok: true }),
    removeImage: () => ok({ ok: true }),
    removeVolume: () => ok({ ok: true }),
    removeNetwork: () => ok({ ok: true }),
    prune: () => ok({ ok: true }),
  },
  sync: {
    status: () => ok({
      configured: true, email: 'alex@example.com', server: 'https://sync.example.com',
      defaultServer: 'https://sync.example.com', status: 'ok', lastSync: now - 120000, error: ''
    }),
    auth: () => ok({ ok: true }),
    now: () => ok(),
    logout: () => ok(),
    deleteAccount: () => ok({}),
    onStatus() {},
  },
  known: {
    list: () => ok(known),
    remove: () => ok(),
    import: () => ok({ added: 0, skipped: 0 }),
  },
  onHostKey: (ask) => cb.hostKey.push(ask),
  answerHostKey() {},
  tor: { test: () => ok({ state: 'ok', ip: '198.51.100.23' }) },
  kc: {
    status: () => ok({ signedIn: true, enabled: true, remote: true, keys: 2 }),
    enable: () => ok({ secretKey: 'SD1-ABCDEF-12345-GHJKM-NPQRS-TVWXY' }),
    unlock: () => ok({}),
    secret: () => ok({ secretKey: 'SD1-ABCDEF-12345-GHJKM-NPQRS-TVWXY' }),
    setKey: () => ok({}),
    disable: () => ok({}),
  },
  team: {
    list: () => ok({
      teams: [
        { id: 't1', name: 'DevOps Team', role: 'owner' },
        { id: 't2', name: 'Frontend Guild', role: 'member' }
      ]
    }),
    create: () => ok({}),
    members: () => ok({
      role: 'owner',
      members: [
        { userId: 1, email: 'alex@example.com', role: 'owner', fingerprint: '598c f244 12c8 20c9 68aa', me: true },
        { userId: 2, email: 'sam@example.com', role: 'member', fingerprint: '91ab 03de 77f0 4c21 b8e5' },
        { userId: 3, email: 'robin@example.com', role: 'viewer', fingerprint: '4d20 e9a1 3b67 f8c0 15d2' }
      ]
    }),
    invite: () => ok({}),
    setRole: () => ok({}),
    remove: () => ok({}),
    leave: () => ok({}),
    delete: () => ok({}),
    onChanged: (f) => cb.teams.push(f),
  },
  update: {
    check: () => ok({
      current: '0.1.8',
      latest: '0.1.9',
      available: true,
      channel: 'stable',
      prerelease: false,
      canInstall: true,
      notes: '### What is New in v0.1.9\n\n- **Kubernetes Manager**: Inspect nodes, pods, services and deployments right inside the app\n- **Group Customization**: Custom colors, icons and drag-and-drop reordering for server groups\n- **SFTP Permissions**: Toggle file permissions display on/off\n- **Enhanced Drag & Drop**: Easily rearrange hosts and move them between groups',
    }),
    list: () => ok({
      current: '0.1.8',
      list: [
        { version: '0.1.9', prerelease: false },
        { version: '0.1.8', prerelease: false },
        { version: '0.1.7', prerelease: false },
      ]
    }),
    install: () => ok({ ok: true }),
    openPage() {},
    onAvailable() {},
    onStep() {},
  },
  settings: {
    get: () => ok({
      editor: 'auto',
      customEditor: '',
      dark: true,
      tor: { sync: true, servers: false },
      updates: { auto: true, repo: 'HyperGaming99/ssh-deck', channel: 'stable' },
    }),
    set: () => ok(),
  },
  onHostsChanged() {},
  snippets: { list: () => ok(snippets), save: () => ok(), remove: () => ok() },
  keys: {
    list: () => ok(keys),
    rescan: () => ok(0),
    generate: () => ok(null),
    setPassphrase: () => ok(),
    remove: () => ok(),
    exportPrivate: () => ok(null),
    toHost: () => ok(null),
    rename: () => ok(),
  },
  sftp: {
    open: () => ok(),
    list: (sid, p) => ok({ path: '/var/www/app', entries: remoteFiles }),
    mkdir: () => ok(),
    rename: () => ok(),
    remove: () => ok(),
    upload: () => ok(),
    download: () => ok(),
    edit: () => ok(),
    copy: () => ok(),
    cancel() {},
    onProgress: () => () => {},
    close() {},
  },
  local: {
    list: () => ok({ path: '/home/alex/projects/app', entries: localFiles }),
    mkdir: () => ok(),
    rename: () => ok(),
    remove: () => ok(),
    open: () => ok(),
  },
  editors: {
    list: () => ok([
      { cmd: 'code', name: 'VS Code' },
      { cmd: 'gnome-text-editor', name: 'Text Editor' }
    ]),
    pick: () => ok({ path: '/usr/bin/code' }),
  },
  onEdit() {},
  platform: 'linux',
  pathOf: () => '',
  fwd: { list: () => ok(fwd), save: () => ok(), remove: () => ok(), toggle: () => ok(null) },
  open(sid) {
    setTimeout(() => {
      cb.status.forEach((f) => f(sid, { state: 'ready', log: [], info: {} }));
    }, 50);
  },
  answer() {},
  input() {},
  resize() {},
  close() {},
  onData: (f) => cb.data.push(f),
  onStatus: (f) => cb.status.push(f),
  onCredAsk() {},
  answerCred() {},
  onClosed() {},
  onLost() {},
  saveRec: async () => null,
  stats: async () => null,
  saveText: async () => null,
  __demo: {
    status: (sid, s) => cb.status.forEach((f) => f(sid, s)),
    emit: (sid, d) => cb.data.forEach((f) => f(sid, d)),
    askHostKey: (info) => cb.hostKey.forEach((f) => f(info)),
  },
});
