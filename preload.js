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
  hosts: { ...coll('hosts'), get: (id) => ipcRenderer.invoke('hosts:get', id), copy: (id, vault, move, name) => ipcRenderer.invoke('hosts:copy', id, vault, move, name), jumpCandidates: (id, vault) => ipcRenderer.invoke('hosts:jumpCandidates', id, vault) },
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    toggleMax: () => ipcRenderer.send('win:toggleMax'),
    close: () => ipcRenderer.send('win:close'),
  },
  groups: {
    list: () => ipcRenderer.invoke('groups:list'),
    create: (n, vault) => ipcRenderer.invoke('groups:create', n, vault),
    rename: (id, n) => ipcRenderer.invoke('groups:rename', id, n),
    remove: (id) => ipcRenderer.invoke('groups:remove', id),
  },
  sync: {
    status: () => ipcRenderer.invoke('sync:status'),
    auth: (o) => ipcRenderer.invoke('auth:submit', o),
    now: () => ipcRenderer.invoke('sync:now'),
    logout: () => ipcRenderer.invoke('sync:logout'),
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
  update: { check: () => ipcRenderer.invoke('update:check'), install: () => ipcRenderer.invoke('update:install'), openPage: () => ipcRenderer.invoke('update:openPage'),
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
    remove: sftpCall('remove'), upload: sftpCall('upload'), download: sftpCall('download'),
    edit: (sid, p, cmd) => unwrap(ipcRenderer.invoke('sftp:edit', sid, p, cmd)),
    copy: (a, pa, b, db) => unwrap(ipcRenderer.invoke('sftp:copy', a, pa, b, db)),
    close: (sid) => ipcRenderer.send('sftp:close', sid),
  },
  local: {
    list: (d) => unwrap(ipcRenderer.invoke('local:list', d)),
    mkdir: (p) => unwrap(ipcRenderer.invoke('local:mkdir', p)),
    rename: (a, b) => unwrap(ipcRenderer.invoke('local:rename', a, b)),
    remove: (p) => unwrap(ipcRenderer.invoke('local:remove', p)),
    open: (p, cmd) => unwrap(ipcRenderer.invoke('local:open', p, cmd)),
  },
  editors: { list: () => ipcRenderer.invoke('editors:list') },
  onEdit: (cb) => { ipcRenderer.on('edit:saved', (_, n) => cb(`${n} gespeichert und hochgeladen.`)); ipcRenderer.on('edit:error', (_, m) => cb(m)); },
  platform: process.platform, // 'win32' | 'darwin' | 'linux': für Pfad-Trenner, Fensterknöpfe, Tastenkürzel
  pathOf: (file) => webUtils.getPathForFile(file), // Pfad einer aus dem Dateimanager gezogenen Datei
  fwd: { ...coll('fwd'), toggle: (id) => ipcRenderer.invoke('fwd:toggle', id) },
  open: (sid, id, cols, rows) => ipcRenderer.send('ssh:open', sid, id, cols, rows),
  input: (sid, d) => ipcRenderer.send('ssh:input', sid, d),
  resize: (sid, c, r) => ipcRenderer.send('ssh:resize', sid, c, r),
  close: (sid) => ipcRenderer.send('ssh:close', sid),
  onData: (cb) => ipcRenderer.on('ssh:data', (_, sid, d) => cb(sid, d)),
  onCredAsk: (cb) => ipcRenderer.on('cred:ask', (_, i) => cb(i)),
  answerCred: (id, a) => ipcRenderer.send('cred:answer', id, a),
  answer: (sid, a) => ipcRenderer.send('ssh:answer', sid, a),
  onStatus: (cb) => ipcRenderer.on('ssh:status', (_, sid, s) => cb(sid, s)),
  onClosed: (cb) => ipcRenderer.on('ssh:closed', (_, sid) => cb(sid)),
});
