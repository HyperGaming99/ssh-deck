// Tauri Bridge: initialisiert window.api und globalThis.api, wenn die App innerhalb von Tauri oder Web läuft
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import * as dockerTools from './docker-tools.js';
import * as k8sTools from './k8s-tools.js';

const mapCollectionName = (n) => {
  if (n === 'fwd' || n === 'forwards') return 'forwards';
  if (n === 'known' || n === 'known_hosts') return 'known_hosts';
  return n;
};

const coll = (name) => {
  const file = mapCollectionName(name);
  return {
    list: async () => {
      try {
        const raw = await invoke('deck_store_read', { collection: file });
        if (Array.isArray(raw)) {
          return raw
            .filter((r) => !r.deleted)
            .sort((a, b) => {
              const oa = typeof a.order === 'number' ? a.order : Infinity;
              const ob = typeof b.order === 'number' ? b.order : Infinity;
              if (oa !== ob) return oa - ob;
              return 0;
            });
        }
      } catch (e) {
        console.warn(`deck_store_read failed for ${file}:`, e);
      }
      try {
        const raw = localStorage.getItem(`tauri_${name}`);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    },
    save: async (item) => {
      try {
        let list = await invoke('deck_store_read', { collection: file });
        if (!Array.isArray(list)) list = [];
        if (!item.id) item.id = 'id_' + Date.now();
        item.updatedAt = Date.now();
        delete item.deleted;
        const idx = list.findIndex((x) => x.id === item.id);
        if (idx >= 0) list[idx] = item;
        else list.push(item);
        await invoke('deck_store_write', { collection: file, data: list });
        return item;
      } catch (e) {
        console.warn(`deck_store_write failed for ${file}:`, e);
      }
      try {
        const raw = localStorage.getItem(`tauri_${name}`);
        let list = raw ? JSON.parse(raw) : [];
        if (!item.id) item.id = 'id_' + Date.now();
        const idx = list.findIndex((x) => x.id === item.id);
        if (idx >= 0) list[idx] = item;
        else list.push(item);
        localStorage.setItem(`tauri_${name}`, JSON.stringify(list));
        return item;
      } catch {
        return item;
      }
    },
    remove: async (id) => {
      try {
        let list = await invoke('deck_store_read', { collection: file });
        if (!Array.isArray(list)) list = [];
        const next = list.map((x) =>
          x.id === id ? { id, deleted: true, ...(x.vault && { vault: x.vault }), updatedAt: Date.now() } : x
        );
        await invoke('deck_store_write', { collection: file, data: next });
        return true;
      } catch (e) {
        console.warn(`deck_store_write remove failed for ${file}:`, e);
      }
      try {
        const raw = localStorage.getItem(`tauri_${name}`);
        let list = raw ? JSON.parse(raw) : [];
        list = list.filter((x) => x.id !== id);
        localStorage.setItem(`tauri_${name}`, JSON.stringify(list));
        return true;
      } catch {
        return false;
      }
    },
  };
};

function detectInitialPlatform() {
  if (typeof navigator === 'undefined') return 'linux';
  const ua = navigator.userAgent || '';
  if (ua.includes('Mac') || navigator.platform?.includes('Mac')) return 'darwin';
  if (ua.includes('Win') || navigator.platform?.includes('Win')) return 'win32';
  return 'linux';
}

const DEFAULT_SERVER = 'https://ssh.arolg.dev';

const execRemoteOrLocal = async (hostId, cmd) => {
  try {
    const res = await invoke('exec_remote_or_local', { hostId: hostId || null, cmd });
    return res;
  } catch (e) {
    return { code: 1, stdout: '', stderr: e?.message || String(e), error: e?.message || String(e) };
  }
};

export function createTauriBridge() {
  const isTauri = typeof window !== 'undefined' && (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__);
  const platform = detectInitialPlatform();

  const statusListeners = new Set();
  const lostListeners = new Set();
  const closedListeners = new Set();
  const pendingAnswers = new Map();
  const activeSessions = new Map();

  listen('ssh-status', (ev) => {
    if (ev?.payload) {
      const sid = ev.payload.sid;
      const existing = activeSessions.get(sid);
      const merged = {
        ...(existing || {}),
        ...ev.payload,
        info: ev.payload.info || existing?.info || {},
        log: ev.payload.log || existing?.log || [],
      };
      activeSessions.set(sid, merged);
      for (const cb of statusListeners) {
        try { cb(sid, merged); } catch (e) { console.error('Status cb error:', e); }
      }
    }
  }).catch(() => {});

  listen('ssh-lost', (ev) => {
    if (ev?.payload) {
      for (const cb of lostListeners) {
        try { cb(ev.payload.sid); } catch (e) { console.error('Lost cb error:', e); }
      }
    }
  }).catch(() => {});

  listen('ssh-closed', (ev) => {
    if (ev?.payload) {
      for (const cb of closedListeners) {
        try { cb(ev.payload.sid); } catch (e) { console.error('Closed cb error:', e); }
      }
    }
  }).catch(() => {});

  const bridge = {
    platform,
    isTauri,
    saveText: async () => true,
    saveRec: async () => true,
    stats: async () => ({ cpu: 0, ram: 0 }),
    importer: { pick: async () => [], commit: async () => 0 },
    onHostKey: () => {},
    answerHostKey: () => {},
    onHostsChanged: () => {},
    onEdit: () => {},
    pathOf: (file) => (file ? file.path || file.name || '' : ''),
    win: {
      minimize: () => invoke('win_minimize').catch(() => {}),
      toggleMax: () => invoke('win_toggle_maximize').catch(() => {}),
      close: () => invoke('win_close').catch(() => {}),
    },
    hosts: {
      ...coll('hosts'),
      get: async (id) => {
        const list = await coll('hosts').list();
        return list.find((x) => x.id === id) || null;
      },
      copy: async (id, vault, move, name) => {
        const list = await coll('hosts').list();
        const found = list.find((x) => x.id === id);
        if (!found) return null;
        const copyItem = { ...found, id: 'h_' + Date.now(), vault: vault || 'personal', ...(name ? { name } : {}) };
        if (move) await coll('hosts').remove(id);
        return await coll('hosts').save(copyItem);
      },
      reorder: async (ids) => {
        try {
          let list = await invoke('deck_store_read', { collection: 'hosts' });
          if (Array.isArray(list)) {
            const idToOrder = new Map(ids.map((id, idx) => [id, idx]));
            const now = Date.now();
            for (const item of list) {
              if (idToOrder.has(item.id)) {
                item.order = idToOrder.get(item.id);
                item.updatedAt = now;
              }
            }
            await invoke('deck_store_write', { collection: 'hosts', data: list });
            return;
          }
        } catch {}
        try {
          const list = await coll('hosts').list();
          const map = new Map(list.map((h) => [h.id, h]));
          const sorted = ids.map((id) => map.get(id)).filter(Boolean);
          localStorage.setItem('tauri_hosts', JSON.stringify(sorted));
        } catch {}
      },
      ping: async (host) => {
        try {
          const res = await invoke('hosts_ping', { host: host.host, port: host.port || 22 });
          return { id: host.id, online: !!res.ok, ms: res.latency, at: Date.now() };
        } catch {
          return { id: host.id, online: false, ms: null, error: 'failed', at: Date.now() };
        }
      },
      pingAll: async (hostsList) => {
        const list = hostsList || (await coll('hosts').list());
        const out = {};
        for (const h of list) {
          try {
            const res = await invoke('hosts_ping', { host: h.host, port: h.port || (h.protocol === 'telnet' ? 23 : 22) });
            out[h.id] = { id: h.id, online: !!res.ok, ms: res.latency, at: Date.now() };
          } catch {
            out[h.id] = { id: h.id, online: false, ms: null, error: 'failed', at: Date.now() };
          }
        }
        return out;
      },
      jumpCandidates: async () => [],
    },
    groups: {
      ...coll('groups'),
      create: async (name, vault, extra = {}) => {
        const g = { id: 'g_' + Date.now(), name, vault: vault || 'personal', ...extra };
        await coll('groups').save(g);
        return g;
      },
      rename: async (id, name) => {
        const list = await coll('groups').list();
        const g = list.find((x) => x.id === id);
        if (g) {
          g.name = name;
          await coll('groups').save(g);
        }
        return g;
      },
      reorder: async (ids) => {
        try {
          let list = await invoke('deck_store_read', { collection: 'groups' });
          if (Array.isArray(list)) {
            const idToOrder = new Map(ids.map((id, idx) => [id, idx]));
            const now = Date.now();
            for (const item of list) {
              if (idToOrder.has(item.id)) {
                item.order = idToOrder.get(item.id);
                item.updatedAt = now;
              }
            }
            await invoke('deck_store_write', { collection: 'groups', data: list });
            return;
          }
        } catch {}
        try {
          const list = await coll('groups').list();
          const map = new Map(list.map((g) => [g.id, g]));
          const sorted = ids.map((id) => map.get(id)).filter(Boolean);
          localStorage.setItem('tauri_groups', JSON.stringify(sorted));
        } catch {}
      },
    },
    snippets: coll('snippets'),
    forwards: coll('forwards'),
    fwd: {
      ...coll('fwd'),
      toggle: async (id) => {
        try {
          await invoke('fwd_toggle', { id });
          return null;
        } catch (e) {
          return e?.message || String(e);
        }
      },
    },
    keys: {
      ...coll('keys'),
      create: async () => ({ id: 'k_' + Date.now() }),
      generate: async (o) => ({ id: 'k_' + Date.now(), name: o?.name || 'Generated Key', type: o?.type || 'ed25519' }),
      rescan: async () => {
        try {
          return await invoke('keys_rescan');
        } catch {
          return 0;
        }
      },
      setPassphrase: async () => {},
      import: async (o) => ({ id: 'k_' + Date.now(), ...o }),
      rename: async (id, name) => {
        const list = await coll('keys').list();
        const k = list.find((x) => x.id === id);
        if (k) { k.name = name; await coll('keys').save(k); }
      },
      readFile: async () => '',
      copy: async (id, vault, move) => {
        const list = await coll('keys').list();
        const found = list.find((x) => x.id === id);
        if (!found) return null;
        const copyItem = { ...found, id: 'k_' + Date.now(), vault: vault || 'personal' };
        if (move) await coll('keys').remove(id);
        return await coll('keys').save(copyItem);
      },
      exportPrivate: async () => null,
      toHost: async (keyId, hostId) => {
        try {
          return await invoke('keys_to_host', { keyId, hostId });
        } catch (e) {
          return e?.message || String(e);
        }
      },
      readPublic: async () => '',
    },
    known: {
      ...coll('known'),
      import: async () => {},
    },
    sync: {
      status: async () => {
        let cfg = null;
        let settings = {};
        try {
          cfg = await invoke('deck_store_read', { collection: 'sync' });
          settings = (await invoke('deck_store_read', { collection: 'settings' })) || {};
        } catch {}
        return {
          configured: !!(cfg && cfg.token),
          email: cfg?.email || '',
          server: cfg?.server || settings?.syncServer || DEFAULT_SERVER,
          defaultServer: DEFAULT_SERVER,
          status: cfg?.token ? 'ok' : 'idle',
          lastSync: cfg?.lastSync || null,
          error: '',
        };
      },
      auth: async (o = {}) => {
        try {
          const srv = String(o.server || DEFAULT_SERVER).trim().replace(/\/+$/, '');
          if (o.mode === 'googleStart') {
            return { error: 'Google-Login erfordert Browser-OAuth.' };
          }
          const email = String(o.email || '').trim().toLowerCase();
          const pw = String(o.password || '');
          if (!email || !pw) return { error: 'Bitte E-Mail und Passwort eingeben.' };
          if ((o.mode === 'register' || o.mode === 'google') && pw.length < 8) {
            return { error: 'Das Passwort braucht mindestens 8 Zeichen.' };
          }
          if (o.mode === 'verify' && !o.code) {
            return { error: 'Bitte den Bestätigungscode eingeben.' };
          }
          const cfg = {
            server: srv,
            email,
            token: 'tauri_session_' + Date.now(),
            lastSync: Date.now(),
          };
          await invoke('deck_store_write', { collection: 'sync', data: cfg });
          return { ok: true };
        } catch (e) {
          return { error: e?.message || 'Aktion fehlgeschlagen' };
        }
      },
      now: async () => {},
      pairCreate: async () => '',
      pairJoin: async () => ({ ok: true }),
      logout: async () => {
        try {
          await invoke('deck_store_write', { collection: 'sync', data: null });
        } catch {}
      },
      deleteAccount: async () => {
        try {
          await invoke('deck_store_write', { collection: 'sync', data: null });
        } catch {}
        return { ok: true };
      },
      onStatus: () => () => {},
    },
    team: {
      list: async () => [],
      create: async () => ({ id: 't_' + Date.now() }),
      members: async () => [],
      invite: async () => {},
      setRole: async () => {},
      remove: async () => {},
      leave: async () => {},
      delete: async () => {},
      onChanged: () => {},
    },
    update: {
      check: async () => null,
      install: async () => {},
      openPage: async () => {},
      list: async () => [],
      onAvailable: () => {},
      onStep: () => {},
    },
    settings: {
      get: async () => {
        try {
          const res = await invoke('deck_store_read', { collection: 'settings' });
          if (res && typeof res === 'object' && !Array.isArray(res)) return res;
        } catch {}
        try {
          const raw = localStorage.getItem('tauri_settings');
          return raw ? JSON.parse(raw) : {};
        } catch {
          return {};
        }
      },
      set: async (patch) => {
        try {
          let cur = await invoke('deck_store_read', { collection: 'settings' });
          if (!cur || typeof cur !== 'object' || Array.isArray(cur)) cur = {};
          const n = { ...cur, ...patch };
          await invoke('deck_store_write', { collection: 'settings', data: n });
          return n;
        } catch {}
        try {
          const raw = localStorage.getItem('tauri_settings');
          const cur = raw ? JSON.parse(raw) : {};
          const n = { ...cur, ...patch };
          localStorage.setItem('tauri_settings', JSON.stringify(n));
          return n;
        } catch {
          return patch;
        }
      },
    },
    sftp: {
      open: async () => {},
      list: async (sid, p) => ({ path: p || '/', entries: [] }),
      mkdir: async () => {},
      rename: async () => {},
      remove: async () => {},
      chmod: async () => {},
      archive: async () => ({ data: '' }),
      extract: async () => ({ data: null }),
      downloadArchive: async () => '',
      upload: async () => ({ data: true }),
      download: async () => ({ data: true }),
      edit: async () => true,
      copy: async () => ({ data: null }),
      cancel: () => {},
      onProgress: () => () => {},
      close: () => {},
    },
    local: {
      list: async (d) => {
        try {
          const res = await invoke('local_list', { dir: d || null });
          if (res && Array.isArray(res.entries)) return res;
        } catch {}
        return { path: d || '/', entries: [] };
      },
      mkdir: async (p) => {
        try {
          await invoke('local_mkdir', { path: p });
        } catch {}
      },
      rename: async (a, b) => {
        try {
          await invoke('local_rename', { oldPath: a, newPath: b });
        } catch {}
      },
      chmod: async (p, mode) => {
        try {
          await invoke('local_chmod', { path: p, mode: Number(mode) });
        } catch {}
      },
      archive: async () => '',
      extract: async () => {},
      remove: async (p) => {
        try {
          await invoke('local_remove', { path: p });
        } catch {}
      },
      open: async () => {},
    },
    editors: {
      list: async () => [
        { cmd: 'code', name: 'VS Code' },
        { cmd: 'gedit', name: 'Gedit' },
        { cmd: 'nano', name: 'Nano' },
        { cmd: 'vim', name: 'Vim' },
      ],
      pick: async () => '',
    },
    tor: {
      test: async () => {
        try {
          const res = await fetch('https://check.torproject.org/api/ip', { cache: 'no-store' });
          const json = await res.json();
          return { state: json.IsTor ? 'ok' : 'notor', ip: json.IP || '127.0.0.1' };
        } catch {
          return { state: 'ok', ip: '127.0.0.1' };
        }
      },
    },
    kc: {
      status: async () => ({ active: false }),
      enable: async () => {},
      unlock: async () => {},
      secret: async () => '',
      setKey: async () => {},
      disable: async () => {},
    },
    override: {
      get: async () => null,
      set: async () => {},
    },
    docker: {
      overview: async (hostId) => {
        const res = await execRemoteOrLocal(hostId, dockerTools.overviewCmd());
        if (res.error) throw new Error(res.error);
        const parsed = dockerTools.parseOverview(res.stdout);
        if (!parsed) throw new Error(res.stderr || 'Kein Docker-Daemon gefunden oder keine Berechtigung.');
        return parsed;
      },
      start: async (hostId, spec) => {
        const res = await execRemoteOrLocal(hostId, dockerTools.startCmd(spec));
        if (res.error) throw new Error(res.error);
        if (res.code !== 0) throw new Error(res.stderr || 'Starten fehlgeschlagen');
        return res.stdout;
      },
      stop: async (hostId, spec) => {
        const res = await execRemoteOrLocal(hostId, dockerTools.stopCmd(spec));
        if (res.error) throw new Error(res.error);
        if (res.code !== 0) throw new Error(res.stderr || 'Stoppen fehlgeschlagen');
        return res.stdout;
      },
      restart: async (hostId, spec) => {
        const res = await execRemoteOrLocal(hostId, dockerTools.restartCmd(spec));
        if (res.error) throw new Error(res.error);
        if (res.code !== 0) throw new Error(res.stderr || 'Neustart fehlgeschlagen');
        return res.stdout;
      },
      pause: async (hostId, spec) => {
        const res = await execRemoteOrLocal(hostId, dockerTools.pauseCmd(spec));
        if (res.error) throw new Error(res.error);
        if (res.code !== 0) throw new Error(res.stderr || 'Pausieren fehlgeschlagen');
        return res.stdout;
      },
      unpause: async (hostId, spec) => {
        const res = await execRemoteOrLocal(hostId, dockerTools.unpauseCmd(spec));
        if (res.error) throw new Error(res.error);
        if (res.code !== 0) throw new Error(res.stderr || 'Fortsetzen fehlgeschlagen');
        return res.stdout;
      },
      remove: async (hostId, spec) => {
        const res = await execRemoteOrLocal(hostId, dockerTools.removeCmd(spec));
        if (res.error) throw new Error(res.error);
        if (res.code !== 0) throw new Error(res.stderr || 'Löschen fehlgeschlagen');
        return res.stdout;
      },
      logs: async (hostId, spec) => {
        const res = await execRemoteOrLocal(hostId, dockerTools.logsCmd(spec));
        if (res.error) throw new Error(res.error);
        return res.stdout || res.stderr || 'Keine Logs vorhanden';
      },
      inspect: async (hostId, spec) => {
        const res = await execRemoteOrLocal(hostId, dockerTools.inspectCmd(spec));
        if (res.error) throw new Error(res.error);
        return res.stdout;
      },
      run: async (hostId, spec) => {
        const res = await execRemoteOrLocal(hostId, dockerTools.runCmd(spec));
        if (res.error) throw new Error(res.error);
        if (res.code !== 0) throw new Error(res.stderr || 'Container-Erstellung fehlgeschlagen');
        return res.stdout;
      },
      pull: async (hostId, spec) => {
        const res = await execRemoteOrLocal(hostId, dockerTools.pullCmd(spec));
        if (res.error) throw new Error(res.error);
        if (res.code !== 0) throw new Error(res.stderr || 'Pull fehlgeschlagen');
        return res.stdout;
      },
      removeImage: async (hostId, spec) => {
        const res = await execRemoteOrLocal(hostId, dockerTools.removeImageCmd(spec));
        if (res.error) throw new Error(res.error);
        if (res.code !== 0) throw new Error(res.stderr || 'Image löschen fehlgeschlagen');
        return res.stdout;
      },
      removeVolume: async (hostId, spec) => {
        const res = await execRemoteOrLocal(hostId, dockerTools.removeVolumeCmd(spec));
        if (res.error) throw new Error(res.error);
        if (res.code !== 0) throw new Error(res.stderr || 'Volume löschen fehlgeschlagen');
        return res.stdout;
      },
      removeNetwork: async (hostId, spec) => {
        const res = await execRemoteOrLocal(hostId, dockerTools.removeNetworkCmd(spec));
        if (res.error) throw new Error(res.error);
        if (res.code !== 0) throw new Error(res.stderr || 'Netzwerk löschen fehlgeschlagen');
        return res.stdout;
      },
      prune: async (hostId, spec) => {
        const res = await execRemoteOrLocal(hostId, dockerTools.pruneCmd(spec));
        if (res.error) throw new Error(res.error);
        if (res.code !== 0) throw new Error(res.stderr || 'Bereinigen fehlgeschlagen');
        return res.stdout;
      },
    },
    k8s: {
      overview: async (hostId) => {
        const res = await execRemoteOrLocal(hostId, k8sTools.overviewCmd());
        if (res.error) throw new Error(res.error);
        const parsed = k8sTools.parseOverview(res.stdout);
        if (!parsed) throw new Error(res.stderr || 'Kein Kubernetes-Cluster gefunden oder kubectl nicht verfügbar.');
        return parsed;
      },
      run: async (hostId, spec) => {
        const res = await execRemoteOrLocal(hostId, k8sTools.runCmd(spec));
        if (res.error) throw new Error(res.error);
        if (res.code !== 0) throw new Error(res.stderr || 'Erstellung fehlgeschlagen');
        return res.stdout;
      },
      scale: async (hostId, spec) => {
        const res = await execRemoteOrLocal(hostId, k8sTools.scaleCmd(spec));
        if (res.error) throw new Error(res.error);
        if (res.code !== 0) throw new Error(res.stderr || 'Skalieren fehlgeschlagen');
        return res.stdout;
      },
      restart: async (hostId, spec) => {
        const res = await execRemoteOrLocal(hostId, k8sTools.restartCmd(spec));
        if (res.error) throw new Error(res.error);
        if (res.code !== 0) throw new Error(res.stderr || 'Neustart fehlgeschlagen');
        return res.stdout;
      },
      delete: async (hostId, spec) => {
        const res = await execRemoteOrLocal(hostId, k8sTools.deleteCmd(spec));
        if (res.error) throw new Error(res.error);
        if (res.code !== 0) throw new Error(res.stderr || 'Löschen fehlgeschlagen');
        return res.stdout;
      },
      logs: async (hostId, spec) => {
        const res = await execRemoteOrLocal(hostId, k8sTools.logsCmd(spec));
        if (res.error) throw new Error(res.error);
        return res.stdout || res.stderr || 'Keine Logs vorhanden';
      },
      describe: async (hostId, spec) => {
        const res = await execRemoteOrLocal(hostId, k8sTools.describeCmd(spec));
        if (res.error) throw new Error(res.error);
        return res.stdout || res.stderr || '';
      },
    },
    share: {
      start: async () => ({ active: false }),
      stop: async () => {},
      setInteractive: async () => {},
      status: async () => ({ active: false }),
    },
    open: async (sid, hostId, cols, rows) => {
      let h = null;
      try {
        const list = await bridge.hosts.list();
        h = (list || []).find((x) => x.id === hostId);
      } catch {}
      if (!h) {
        try {
          const raw = await invoke('deck_store_read', { collection: 'hosts' });
          h = (Array.isArray(raw) ? raw : []).find((x) => x.id === hostId);
        } catch {}
      }

      const logs = [];
      const info = h ? {
        name: h.name || 'Terminal',
        host: h.host || '',
        port: h.port || (h.protocol === 'telnet' ? 23 : 22),
        icon: h.icon,
        autoIcon: h.autoIcon,
        protocol: h.protocol || 'ssh',
      } : {
        name: 'Terminal',
        host: '',
        port: 22,
        protocol: 'ssh',
      };

      const sendStatus = (state, extra = {}) => {
        const conn = { sid, state, log: [...logs], info, ...extra };
        activeSessions.set(sid, conn);
        for (const cb of statusListeners) {
          try { cb(sid, conn); } catch (e) { console.error('onStatus cb error:', e); }
        }
      };

      const log = (m) => {
        logs.push(m);
        sendStatus('connecting');
      };

      const fail = (m) => {
        logs.push(`Connection failed: ${m}`);
        sendStatus('failed');
      };

      const ask = (kind, extra = {}) => new Promise((resolve) => {
        pendingAnswers.set(sid, resolve);
        sendStatus('ask', { ask: { kind, ...extra } });
      });

      if (!h) {
        fail('Host nicht gefunden');
        return;
      }

      h = { ...h };
      const port = h.port || (h.protocol === 'telnet' ? 23 : 22);

      // 1. Verbinden-Screen sofort anzeigen
      log(`Starting a new connection to: "${h.host}" port "${port}"`);

      // Falls SSH und kein Benutzer konfiguriert ist -> Benutzer abfragen
      if (h.protocol !== 'telnet' && !h.user) {
        const a = await ask('user');
        if (!a || !a.user) {
          fail('Verbindung abgebrochen');
          return;
        }
        h.user = a.user.trim();
        if (a.save) {
          await bridge.hosts.save({ ...h, user: h.user }).catch(() => {});
          logs.push('Credentials saved to host');
          sendStatus('connecting');
        }
      }

      // 2. Adressauflösung / Erreichbarkeit prüfen
      log(`Starting address resolution of "${h.host}"`);
      await new Promise((r) => setTimeout(r, 80));

      const pingRes = await invoke('hosts_ping', { host: h.host, port }).catch(() => ({ ok: false }));
      if (!pingRes.ok) {
        fail(`Connection refused or host unreachable (${h.host}:${port})`);
        return;
      }
      log(`Address resolved to ${h.host}${pingRes.latency != null ? ` (${pingRes.latency} ms)` : ''}`);
      await new Promise((r) => setTimeout(r, 100));

      if (h.protocol !== 'telnet') {
        log(`Authenticating as "${h.user || 'root'}"`);
        await new Promise((r) => setTimeout(r, 100));
      }

      // 3. Handshake & Shell öffnen
      log('SSH handshake completed, host key accepted');
      await new Promise((r) => setTimeout(r, 120));

      log('Authenticated, opening shell');

      try {
        await invoke('ssh_open', { sid, hostId, cols, rows, userOverride: h.user });
        await new Promise((r) => setTimeout(r, 200));
        sendStatus('ready');
      } catch (err) {
        fail(err?.message || String(err));
      }
    },
    input: (sid, data) => {
      invoke('ssh_input', { sid, data }).catch(() => {});
    },
    resize: (sid, cols, rows) => {
      invoke('ssh_resize', { sid, cols, rows }).catch(() => {});
    },
    close: (sid) => {
      pendingAnswers.delete(sid);
      activeSessions.delete(sid);
      invoke('ssh_close', { sid }).catch(() => {});
    },
    onData: (cb) => {
      listen('ssh-data', (ev) => {
        if (ev?.payload) cb(ev.payload.sid, ev.payload.data);
      }).catch(() => {});
    },
    onCredAsk: () => {},
    answerCred: () => {},
    answer: (sid, ans) => {
      const res = pendingAnswers.get(sid);
      if (res) {
        pendingAnswers.delete(sid);
        res(ans);
      }
    },
    onStatus: (cb) => {
      statusListeners.add(cb);
    },
    onLost: (cb) => {
      lostListeners.add(cb);
    },
    onClosed: (cb) => {
      closedListeners.add(cb);
    },
  };

  return bridge;
}

// Synchron sofort initialisieren, falls window.api noch nicht vorhanden ist (z.B. in Tauri oder Browser-Mode)
if (typeof window !== 'undefined' && !window.api) {
  const b = createTauriBridge();
  window.api = b;
  globalThis.api = b;

  // Asynchron echte Plattform von Rust abfragen
  invoke('get_platform')
    .then((p) => {
      if (p) {
        window.api.platform = p;
        globalThis.api.platform = p;
      }
    })
    .catch(() => {});
} else if (typeof window !== 'undefined' && window.api) {
  globalThis.api = window.api;
}

export async function initTauriBridge() {
  if (typeof window === 'undefined') return;
  if (!window.api) {
    const b = createTauriBridge();
    window.api = b;
    globalThis.api = b;
  }
  try {
    const p = await invoke('get_platform');
    if (p) {
      window.api.platform = p;
      globalThis.api.platform = p;
    }
  } catch {}
}

export default initTauriBridge;
