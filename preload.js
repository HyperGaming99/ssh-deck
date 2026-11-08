const { contextBridge, ipcRenderer, webUtils } = require('electron');

const coll = (p) => ({
  list: () => ipcRenderer.invoke(`${p}:list`),
  save: (x) => ipcRenderer.invoke(`${p}:save`, x),
  remove: (id) => ipcRenderer.invoke(`${p}:remove`, id),
});

// { data } | { error } -> Wert oder Exception
const unwrap = async (promise) => {
  const r = await promise;
  if (r.error) throw new Error(r.error);
  return r.data;
};
const sftpCall = (name) => (sid, ...a) => unwrap(ipcRenderer.invoke(`sftp:${name}`, sid, ...a));

contextBridge.exposeInMainWorld('api', {
  hosts: { ...coll('hosts'), get: (id) => ipcRenderer.invoke('hosts:get', id), copy: (id, vault, move, name) => ipcRenderer.invoke('hosts:copy', id, vault, move, name), jumpCandidates: (id, vault) => ipcRenderer.invoke('hosts:jumpCandidates', id, vault), reorder: (ids) => ipcRenderer.invoke('hosts:reorder', ids), ping: (h) => ipcRenderer.invoke('hosts:ping', h), pingAll: () => ipcRenderer.invoke('hosts:pingAll') },
  saveText: (name, text) => ipcRenderer.invoke('saveText', name, text),
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    toggleMax: () => ipcRenderer.send('win:toggleMax'),
    close: () => ipcRenderer.send('win:close'),
  },
  groups: {
    list: () => ipcRenderer.invoke('groups:list'),
    create: (n, vault, extra) => ipcRenderer.invoke('groups:create', n, vault, extra),
    save: (g) => ipcRenderer.invoke('groups:save', g),
    rename: (id, n) => ipcRenderer.invoke('groups:rename', id, n),
    remove: (id) => ipcRenderer.invoke('groups:remove', id),
    reorder: (ids) => ipcRenderer.invoke('groups:reorder', ids),
  },
  sync: {
    status: () => ipcRenderer.invoke('sync:status'),
    auth: (o) => ipcRenderer.invoke('auth:submit', o),
    now: () => ipcRenderer.invoke('sync:now'),
    pairCreate: (password) => ipcRenderer.invoke('pair:create', password),
    pairJoin: (code) => ipcRenderer.invoke('pair:join', code),
    logout: () => ipcRenderer.invoke('sync:logout'),
    deleteAccount: (password) => ipcRenderer.invoke('sync:deleteAccount', password),
    onStatus: (cb) => ipcRenderer.on('sync:status', (_, s) => cb(s)),
  },
  known: {
    list: () => ipcRenderer.invoke('known:list'),
    remove: (id) => ipcRenderer.invoke('known:remove', id),
    import: () => ipcRenderer.invoke('known:import'),
  },
  onHostKey: (ask, cancel) => { ipcRenderer.on('hostkey:ask', (_, info) => ask(info)); ipcRenderer.on('hostkey:cancel', (_, id) => cancel(id)); },
  answerHostKey: (id, ok) => ipcRenderer.send('hostkey:answer', id, ok),
  importer: { pick: (format) => ipcRenderer.invoke('import:pick', format), commit: (vault) => ipcRenderer.invoke('import:commit', vault) },
  tor: { test: () => ipcRenderer.invoke('tor:test') },
  override: { get: (id) => ipcRenderer.invoke('override:get', id), set: (id, o) => ipcRenderer.invoke('override:set', id, o) },
  kc: { status: () => ipcRenderer.invoke('kc:status'), enable: (pw) => ipcRenderer.invoke('kc:enable', pw), unlock: (pw, sk) => ipcRenderer.invoke('kc:unlock', pw, sk),
    secret: () => ipcRenderer.invoke('kc:secret'), setKey: (id, on) => ipcRenderer.invoke('kc:setKey', id, on), disable: () => ipcRenderer.invoke('kc:disable') },
  team: { list: () => ipcRenderer.invoke('team:list'), create: (n) => ipcRenderer.invoke('team:create', n), members: (id) => ipcRenderer.invoke('team:members', id),
    invite: (id, email, role) => ipcRenderer.invoke('team:invite', id, email, role), setRole: (id, u, role) => ipcRenderer.invoke('team:setRole', id, u, role),
    remove: (id, u) => ipcRenderer.invoke('team:remove', id, u), leave: (id) => ipcRenderer.invoke('team:leave', id), delete: (id) => ipcRenderer.invoke('team:delete', id),
    onChanged: (cb) => ipcRenderer.on('teams:changed', () => cb()) },
  update: { check: () => ipcRenderer.invoke('update:check'), install: (v) => ipcRenderer.invoke('update:install', v), openPage: (v) => ipcRenderer.invoke('update:openPage', v), list: () => ipcRenderer.invoke('update:list'),
    onAvailable: (cb) => ipcRenderer.on('update:available', (_, u) => cb(u)), onStep: (cb) => ipcRenderer.on('update:step', (_, s) => cb(s)) },
  settings: { get: () => ipcRenderer.invoke('settings:get'), set: (patch) => ipcRenderer.invoke('settings:set', patch) },
  onHostsChanged: (cb) => ipcRenderer.on('hosts:changed', cb),
  snippets: coll('snippets'),
  keys: {
    list: () => ipcRenderer.invoke('keys:list'),
    rescan: () => ipcRenderer.invoke('keys:rescan'),
    generate: (o) => ipcRenderer.invoke('keys:generate', o),
    setPassphrase: (id, p) => ipcRenderer.invoke('keys:setPassphrase', id, p),
    import: (o) => ipcRenderer.invoke('keys:import', o),
    rename: (id, name) => ipcRenderer.invoke('keys:rename', id, name),
    readFile: () => ipcRenderer.invoke('keys:readFile'),
    remove: (id) => ipcRenderer.invoke('keys:remove', id),
    copy: (id, vault, move) => ipcRenderer.invoke('keys:copy', id, vault, move),
    exportPrivate: (id) => ipcRenderer.invoke('keys:exportPrivate', id),
    toHost: (keyId, hostId) => ipcRenderer.invoke('keys:toHost', keyId, hostId),
  },
  sftp: {
    open: sftpCall('open'), list: sftpCall('list'), mkdir: sftpCall('mkdir'), rename: sftpCall('rename'),
    remove: sftpCall('remove'), chmod: sftpCall('chmod'), archive: sftpCall('archive'), extract: sftpCall('extract'),
    downloadArchive: sftpCall('downloadArchive'), upload: sftpCall('upload'), download: sftpCall('download'),
    edit: (sid, p, cmd) => unwrap(ipcRenderer.invoke('sftp:edit', sid, p, cmd)),
    copy: (a, pa, b, db) => unwrap(ipcRenderer.invoke('sftp:copy', a, pa, b, db)),
    cancel: (sid) => ipcRenderer.send('sftp:cancel', sid),
    onProgress: (cb) => {
      const fn = (_, p) => cb(p);
      ipcRenderer.on('sftp:progress', fn);
      return () => ipcRenderer.removeListener?.('sftp:progress', fn);
    },
    close: (sid) => ipcRenderer.send('sftp:close', sid),
  },
  local: {
    list: (d) => unwrap(ipcRenderer.invoke('local:list', d)),
    mkdir: (p) => unwrap(ipcRenderer.invoke('local:mkdir', p)),
    rename: (a, b) => unwrap(ipcRenderer.invoke('local:rename', a, b)),
    chmod: (p, mode) => unwrap(ipcRenderer.invoke('local:chmod', p, mode)),
    archive: (dir, names, format) => unwrap(ipcRenderer.invoke('local:archive', dir, names, format)),
    extract: (dir, name) => unwrap(ipcRenderer.invoke('local:extract', dir, name)),
    remove: (p) => unwrap(ipcRenderer.invoke('local:remove', p)),
    open: (p, cmd) => unwrap(ipcRenderer.invoke('local:open', p, cmd)),
  },
  editors: { list: () => ipcRenderer.invoke('editors:list'), pick: () => ipcRenderer.invoke('editors:pick') },
  onEdit: (cb) => { ipcRenderer.on('edit:saved', (_, n) => cb(`${n} gespeichert und hochgeladen.`)); ipcRenderer.on('edit:error', (_, m) => cb(m)); },
  platform: process.platform, // 'win32' | 'darwin' | 'linux': für Pfad-Trenner, Fensterknöpfe, Tastenkürzel
  pathOf: (file) => webUtils.getPathForFile(file), // Pfad einer aus dem Dateimanager gezogenen Datei
  fwd: { ...coll('fwd'), toggle: (id) => ipcRenderer.invoke('fwd:toggle', id) },
  k8s: {
    overview: (hostId) => unwrap(ipcRenderer.invoke('k8s:overview', hostId)),
    run: (hostId, spec) => unwrap(ipcRenderer.invoke('k8s:run', hostId, spec)),
    scale: (hostId, spec) => unwrap(ipcRenderer.invoke('k8s:scale', hostId, spec)),
    restart: (hostId, spec) => unwrap(ipcRenderer.invoke('k8s:restart', hostId, spec)),
    delete: (hostId, spec) => unwrap(ipcRenderer.invoke('k8s:delete', hostId, spec)),
    logs: (hostId, spec) => unwrap(ipcRenderer.invoke('k8s:logs', hostId, spec)),
    describe: (hostId, spec) => unwrap(ipcRenderer.invoke('k8s:describe', hostId, spec)),
  },
  docker: {
    overview: (hostId) => unwrap(ipcRenderer.invoke('docker:overview', hostId)),
    start: (hostId, spec) => unwrap(ipcRenderer.invoke('docker:start', hostId, spec)),
    stop: (hostId, spec) => unwrap(ipcRenderer.invoke('docker:stop', hostId, spec)),
    restart: (hostId, spec) => unwrap(ipcRenderer.invoke('docker:restart', hostId, spec)),
    pause: (hostId, spec) => unwrap(ipcRenderer.invoke('docker:pause', hostId, spec)),
    unpause: (hostId, spec) => unwrap(ipcRenderer.invoke('docker:unpause', hostId, spec)),
    remove: (hostId, spec) => unwrap(ipcRenderer.invoke('docker:remove', hostId, spec)),
    logs: (hostId, spec) => unwrap(ipcRenderer.invoke('docker:logs', hostId, spec)),
    inspect: (hostId, spec) => unwrap(ipcRenderer.invoke('docker:inspect', hostId, spec)),
    run: (hostId, spec) => unwrap(ipcRenderer.invoke('docker:run', hostId, spec)),
    pull: (hostId, spec) => unwrap(ipcRenderer.invoke('docker:pull', hostId, spec)),
    removeImage: (hostId, spec) => unwrap(ipcRenderer.invoke('docker:removeImage', hostId, spec)),
    removeVolume: (hostId, spec) => unwrap(ipcRenderer.invoke('docker:removeVolume', hostId, spec)),
    removeNetwork: (hostId, spec) => unwrap(ipcRenderer.invoke('docker:removeNetwork', hostId, spec)),
    prune: (hostId, spec) => unwrap(ipcRenderer.invoke('docker:prune', hostId, spec)),
  },
  share: {
    start: (sid, title) => ipcRenderer.invoke('share:start', sid, title),
    stop: (sid) => ipcRenderer.invoke('share:stop', sid),
    setInteractive: (sid, interactive) => ipcRenderer.invoke('share:setInteractive', sid, interactive),
    status: (sid) => ipcRenderer.invoke('share:status', sid),
  },
  open: (sid, id, cols, rows) => ipcRenderer.send('ssh:open', sid, id, cols, rows),
  stats: (sid) => ipcRenderer.invoke('stats:get', sid),
  input: (sid, d) => ipcRenderer.send('ssh:input', sid, d),
  resize: (sid, c, r) => ipcRenderer.send('ssh:resize', sid, c, r),
  close: (sid) => ipcRenderer.send('ssh:close', sid),
  onData: (cb) => ipcRenderer.on('ssh:data', (_, sid, d) => cb(sid, d)),
  onCredAsk: (cb) => ipcRenderer.on('cred:ask', (_, i) => cb(i)),
  answerCred: (id, a) => ipcRenderer.send('cred:answer', id, a),
  answer: (sid, a) => ipcRenderer.send('ssh:answer', sid, a),
  onStatus: (cb) => ipcRenderer.on('ssh:status', (_, sid, s) => cb(sid, s)),
  saveRec: (text, name) => ipcRenderer.invoke('rec:save', text, name),
  onLost: (cb) => ipcRenderer.on('ssh:lost', (_, sid) => cb(sid)),
  onClosed: (cb) => ipcRenderer.on('ssh:closed', (_, sid) => cb(sid)),
});
