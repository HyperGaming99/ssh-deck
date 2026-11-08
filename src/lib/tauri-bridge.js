// Tauri Bridge: initialisiert window.api, wenn die App innerhalb von Tauri läuft
import { invoke } from '@tauri-apps/api/core';

export async function initTauriBridge() {
  if (typeof window === 'undefined') return;
  if (!window.__TAURI_INTERNALS__) return; // Läuft in Electron oder reinem Browser

  let platform = 'linux';
  try {
    platform = await invoke('get_platform');
  } catch {}

  const coll = (name) => ({
    list: async () => {
      try {
        const raw = localStorage.getItem(`tauri_${name}`);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    },
    save: async (item) => {
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
        const raw = localStorage.getItem(`tauri_${name}`);
        let list = raw ? JSON.parse(raw) : [];
        list = list.filter((x) => x.id !== id);
        localStorage.setItem(`tauri_${name}`, JSON.stringify(list));
        return true;
      } catch {
        return false;
      }
    },
  });

  window.api = {
    platform,
    isTauri: true,
    win: {
      minimize: () => invoke('win_minimize'),
      toggleMax: () => invoke('win_toggle_maximize'),
      close: () => invoke('win_close'),
    },
    hosts: {
      ...coll('hosts'),
      get: async (id) => {
        const list = await coll('hosts').list();
        return list.find((x) => x.id === id) || null;
      },
      reorder: async (ids) => {
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
        const out = {};
        for (const h of hostsList) {
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
          const list = await coll('groups').list();
          const map = new Map(list.map((g) => [g.id, g]));
          const sorted = ids.map((id) => map.get(id)).filter(Boolean);
          localStorage.setItem('tauri_groups', JSON.stringify(sorted));
        } catch {}
      },
    },
    snippets: coll('snippets'),
    forwards: coll('forwards'),
    keys: {
      ...coll('keys'),
      create: async () => ({ id: 'k_' + Date.now() }),
      readPublic: async () => '',
    },
    known: {
      list: async () => [],
      remove: async () => {},
      import: async () => {},
    },
    sync: {
      status: async () => ({ configured: false }),
      auth: async () => {},
      now: async () => {},
      logout: async () => {},
      onStatus: () => {},
    },
    team: {
      list: async () => [],
      onChanged: () => {},
    },
    update: {
      check: async () => null,
      onAvailable: () => {},
      onStep: () => {},
    },
    settings: {
      get: async () => {
        try {
          const raw = localStorage.getItem('tauri_settings');
          return raw ? JSON.parse(raw) : {};
        } catch {
          return {};
        }
      },
      set: async (patch) => {
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
    editors: {
      list: async () => [],
    },
    tor: {
      test: async () => ({ state: 'ok', ip: '127.0.0.1' }),
    },
    kc: {
      status: async () => ({ active: false }),
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
}

export default initTauriBridge;
