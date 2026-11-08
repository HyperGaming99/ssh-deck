// Tauri Bridge: initialisiert window.api und globalThis.api, wenn die App innerhalb von Tauri oder Web läuft
import { invoke } from '@tauri-apps/api/core';

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

export function createTauriBridge() {
  const isTauri = typeof window !== 'undefined' && (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__);
  const platform = detectInitialPlatform();

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
          return await invoke('hosts_ping', { host: host.host, port: host.port || 22 });
        } catch {
          return { ok: false, latency: null };
        }
      },
      pingAll: async (hostsList) => {
        const list = hostsList || (await coll('hosts').list());
        const out = {};
        for (const h of list) {
          try {
            out[h.id] = await invoke('hosts_ping', { host: h.host, port: h.port || 22 });
          } catch {
            out[h.id] = { ok: false, latency: null };
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
      toggle: async () => true,
    },
    keys: {
      ...coll('keys'),
      create: async () => ({ id: 'k_' + Date.now() }),
      generate: async (o) => ({ id: 'k_' + Date.now(), name: o?.name || 'Generated Key', type: o?.type || 'ed25519' }),
      rescan: async () => 0,
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
      toHost: async () => null,
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
      mkdir: async () => {},
      rename: async () => {},
      chmod: async () => {},
      archive: async () => '',
      extract: async () => {},
      remove: async () => {},
      open: async () => {},
    },
    editors: {
      list: async () => [],
      pick: async () => '',
    },
    tor: {
      test: async () => ({ state: 'ok', ip: '127.0.0.1' }),
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
      overview: async () => ({ containers: [], images: [], volumes: [], networks: [], info: {} }),
      start: async () => {},
      stop: async () => {},
      restart: async () => {},
      pause: async () => {},
      unpause: async () => {},
      remove: async () => {},
      logs: async () => '',
      inspect: async () => '{}',
      run: async () => {},
      pull: async () => {},
      removeImage: async () => {},
      removeVolume: async () => {},
      removeNetwork: async () => {},
      prune: async () => {},
    },
    k8s: {
      overview: async () => ({ nodes: [], pods: [], deployments: [], services: [], namespaces: [] }),
      run: async () => {},
      scale: async () => {},
      restart: async () => {},
      delete: async () => {},
      logs: async () => '',
      describe: async () => '',
    },
    share: {
      start: async () => ({ active: false }),
      stop: async () => {},
      setInteractive: async () => {},
      status: async () => ({ active: false }),
    },
    open: () => {},
    input: () => {},
    resize: () => {},
    close: () => {},
    onData: () => {},
    onCredAsk: () => {},
    answerCred: () => {},
    answer: () => {},
    onStatus: () => {},
    onLost: () => {},
    onClosed: () => {},
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
