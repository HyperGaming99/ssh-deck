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
          x.id === id ? { id, deleted: true, ...(x.path && { path: x.path }), ...(x.vault && { vault: x.vault }), updatedAt: Date.now() } : x
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
  const sftpSessions = new Map();
  const sftpProgressListeners = new Set();

  const shQuote = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";

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

  const CURRENT_APP_VERSION = '0.1.8';
  let cachedReleases = [];
  let lastUpdInfo = null;
  const updateListeners = [];
  const stepListeners = [];

  const splitSemVer = (v) => {
    const m = String(v).replace(/^v/i, '').match(/^(\d+)\.(\d+)(?:\.(\d+))?(?:-([\w.]+))?/);
    return m ? { core: [+m[1], +m[2], +(m[3] || 0)], pre: m[4] ? m[4].split('.') : null } : { core: [0, 0, 0], pre: null };
  };

  function cmpSemVer(a, b) {
    const x = splitSemVer(a), y = splitSemVer(b);
    for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] > y.core[i] ? 1 : -1;
    if (!x.pre || !y.pre) return x.pre === y.pre ? 0 : x.pre ? -1 : 1;
    for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
      const p = x.pre[i], q = y.pre[i];
      if (p === undefined || q === undefined) return p === undefined ? -1 : 1;
      const np = /^\d+$/.test(p), nq = /^\d+$/.test(q);
      if (np && nq) { if (+p !== +q) return +p > +q ? 1 : -1; } else if (np !== nq) return np ? -1 : 1; else if (p !== q) return p > q ? 1 : -1;
    }
    return 0;
  }

  const isSemVerNewer = (a, b) => cmpSemVer(a, b) > 0;
  const isSemVerAvailable = (latest, cur, prerelease) =>
    isSemVerNewer(latest, cur) || (prerelease && !splitSemVer(cur).pre && cmpSemVer(latest.replace(/-.*/, ''), cur) === 0);

  const cleanVer = (x) => String(x.tag_name || x.version || '').replace(/^v/i, '');

  async function fetchGitHubReleases(repo) {
    const targetRepo = repo && /^[\w.-]+\/[\w.-]+$/.test(String(repo).trim()) ? String(repo).trim() : 'HyperGaming99/ssh-deck';
    const url = `https://api.github.com/repos/${targetRepo}/releases?per_page=100`;
    let data = null;

    // 1. In Tauri: native curl via execRemoteOrLocal (bypasses browser CORS & unsafe headers)
    try {
      const curlRes = await execRemoteOrLocal(null, `curl -sL --max-time 8 -H "User-Agent: ssh-deck" -H "Accept: application/vnd.github+json" "${url}"`);
      if (curlRes?.stdout) {
        const parsed = JSON.parse(curlRes.stdout);
        if (Array.isArray(parsed)) {
          data = parsed;
        }
      }
    } catch (e) {
      console.warn('Native curl release fetch failed:', e);
    }

    // 2. Fallback: web fetch (do NOT pass user-agent in browser as it throws Refused to set unsafe header)
    if (!data || !Array.isArray(data)) {
      try {
        const res = await fetch(url, { headers: { accept: 'application/vnd.github+json' } });
        if (res.ok) {
          const parsed = await res.json();
          if (Array.isArray(parsed)) {
            data = parsed;
          }
        }
      } catch (err) {
        console.warn('Direct fetch failed:', err);
      }
    }

    if (!Array.isArray(data)) {
      throw new Error('Update-Quelle nicht erreichbar');
    }

    return data
      .filter((x) => !x.draft && /^\d+\.\d+/.test(cleanVer(x)))
      .sort((a, b) => cmpSemVer(cleanVer(b), cleanVer(a)));
  }

  function findAssetForPlatform(assets) {
    if (!Array.isArray(assets) || assets.length === 0) return null;
    const p = bridge.platform || 'linux';

    if (p === 'win32') {
      return assets.find((a) => /\.exe$/i.test(a.name)) ||
             assets.find((a) => /\.msi$/i.test(a.name));
    }
    if (p === 'darwin') {
      return assets.find((a) => /\.dmg$/i.test(a.name));
    }
    // Linux default: prefer .deb, then .AppImage
    return assets.find((a) => /_amd64\.deb$/i.test(a.name)) ||
           assets.find((a) => /\.deb$/i.test(a.name)) ||
           assets.find((a) => /\.AppImage$/i.test(a.name));
  }

  async function doCheckUpdate() {
    const cur = CURRENT_APP_VERSION;
    try {
      const s = await bridge.settings.get().catch(() => ({}));
      const upCfg = s?.updates || {};
      const repo = (upCfg.repo || 'HyperGaming99/ssh-deck').trim();
      const channel = upCfg.channel === 'dev' ? 'dev' : 'stable';

      const rawList = await fetchGitHubReleases(repo);
      cachedReleases = rawList;

      let target = null;
      if (channel === 'dev') {
        target = rawList.find((x) => !!x.prerelease || /-dev\./i.test(cleanVer(x)) || /-/.test(cleanVer(x))) || rawList[0];
      } else {
        target = rawList.find((x) => !x.prerelease && !/-dev\./i.test(cleanVer(x)) && !/-/.test(cleanVer(x))) || rawList[0];
      }

      if (!target) {
        lastUpdInfo = { current: cur, latest: cur, channel, available: false, canInstall: false };
        return lastUpdInfo;
      }

      const latestVer = cleanVer(target);
      const isPre = !!target.prerelease || /-dev\./i.test(latestVer) || /-/.test(latestVer);
      const available = isSemVerAvailable(latestVer, cur, isPre);
      const asset = findAssetForPlatform(target.assets);
      const canInstall = !!(asset && asset.browser_download_url);

      lastUpdInfo = {
        current: cur,
        latest: latestVer,
        channel,
        prerelease: isPre,
        available,
        notes: target.body || '',
        page: target.html_url || `https://github.com/${repo}/releases`,
        tarball: (asset && asset.browser_download_url) || target.tarball_url || '',
        canInstall,
      };

      if (available) {
        updateListeners.forEach((fn) => {
          try { fn({ latest: latestVer, canInstall }); } catch {}
        });
      }

      return lastUpdInfo;
    } catch (err) {
      return { current: cur, error: err?.message || 'Update-Quelle nicht erreichbar' };
    }
  }

  async function doListReleases() {
    const cur = CURRENT_APP_VERSION;
    try {
      const s = await bridge.settings.get().catch(() => ({}));
      const upCfg = s?.updates || {};
      const repo = (upCfg.repo || 'HyperGaming99/ssh-deck').trim();

      if (!cachedReleases || cachedReleases.length === 0) {
        cachedReleases = await fetchGitHubReleases(repo);
      }

      const list = cachedReleases.map((x) => {
        const version = cleanVer(x);
        const isDev = !!x.prerelease || /-dev\./i.test(version) || /-/.test(version);
        const asset = findAssetForPlatform(x.assets);
        return {
          version,
          name: x.name || version,
          prerelease: isDev,
          tarball: (asset && asset.browser_download_url) || x.tarball_url || '',
          canInstall: !!(asset && asset.browser_download_url),
          page: x.html_url || `https://github.com/${repo}/releases`,
          publishedAt: x.published_at || x.created_at || '',
          notes: x.body || '',
        };
      });

      return { current: cur, list };
    } catch (err) {
      return { current: cur, list: [], error: err?.message || 'Update-Quelle nicht erreichbar' };
    }
  }

  async function doOpenReleasePage(verOrUrl) {
    let url = '';
    if (verOrUrl && String(verOrUrl).startsWith('http')) {
      url = verOrUrl;
    } else if (verOrUrl) {
      const match = cachedReleases.find((x) => cleanVer(x) === String(verOrUrl));
      url = match?.html_url || `https://github.com/HyperGaming99/ssh-deck/releases/tag/v${verOrUrl}`;
    } else if (lastUpdInfo?.page) {
      url = lastUpdInfo.page;
    } else {
      url = 'https://github.com/HyperGaming99/ssh-deck/releases';
    }

    try {
      await execRemoteOrLocal(null, `xdg-open "${url}" || open "${url}"`);
    } catch {
      window.open(url, '_blank');
    }
  }

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
      check: doCheckUpdate,
      install: async (ver) => {
        stepListeners.forEach((fn) => { try { fn('download'); } catch {} });

        let target = null;
        if (ver) {
          target = (cachedReleases || []).find((x) => cleanVer(x) === String(ver));
        }
        if (!target) {
          target = lastUpdInfo ? (cachedReleases || []).find((x) => cleanVer(x) === lastUpdInfo.latest) : cachedReleases?.[0];
        }
        if (!target) {
          return { error: 'Kein passendes Release gefunden.' };
        }

        const asset = findAssetForPlatform(target.assets);
        if (!asset || !asset.browser_download_url) {
          await doOpenReleasePage(ver || target.tag_name);
          return { error: 'Kein passendes Installationspaket für diese Plattform gefunden.' };
        }

        stepListeners.forEach((fn) => { try { fn('install'); } catch {} });
        try {
          const res = await invoke('deck_update_apply', {
            downloadUrl: asset.browser_download_url,
            filename: asset.name,
          });
          return { ok: true, result: res };
        } catch (err) {
          return { error: String(err?.message || err) };
        }
      },
      openPage: doOpenReleasePage,
      list: doListReleases,
      onAvailable: (cb) => {
        if (typeof cb === 'function') updateListeners.push(cb);
      },
      onStep: (cb) => {
        if (typeof cb === 'function') stepListeners.push(cb);
      },
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
      open: async (psid, hostId) => {
        if (!hostId || hostId === 'local') throw new Error('Ungültiger Host');
        const list = await bridge.hosts.list().catch(() => []);
        const h = (list || []).find((x) => x.id === hostId);
        if (!h) throw new Error('Host nicht gefunden');
        if (h.protocol === 'telnet') throw new Error('SFTP gibt es nicht für Telnet.');

        const res = await execRemoteOrLocal(hostId, 'echo OK');
        if (res.code !== 0 && res.error) {
          throw new Error(res.error || res.stderr || 'Verbindung fehlgeschlagen');
        }
        sftpSessions.set(psid, hostId);
        return { data: null };
      },
      list: async (psid, dir) => {
        const hostId = sftpSessions.get(psid);
        if (!hostId) throw new Error('Nicht verbunden');

        const targetDir = dir && dir !== '.' ? dir : '~';
        const pyScript = `python3 -c "
import os, sys, json
try:
    p = os.path.realpath(os.path.expanduser(sys.argv[1]))
    entries = []
    for f in os.scandir(p):
        try:
            st = f.stat()
            entries.append({
                'name': f.name,
                'dir': f.is_dir(),
                'size': st.st_size,
                'mtime': int(st.st_mtime * 1000),
                'mode': st.st_mode & 0o777
            })
        except:
            pass
    entries.sort(key=lambda x: (not x['dir'], x['name'].lower()))
    print(json.dumps({'path': p, 'entries': entries}))
except Exception as e:
    print(json.dumps({'error': str(e)}))
" ${shQuote(targetDir)}`;

        const res = await execRemoteOrLocal(hostId, pyScript);
        if (res.code === 0 && res.stdout.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(res.stdout.trim());
            if (parsed.error) throw new Error(parsed.error);
            return parsed;
          } catch (e) {
            if (e.message && !e.message.includes('JSON')) throw e;
          }
        }

        const shScript = `cd ${targetDir === '~' ? '$HOME' : shQuote(targetDir)} 2>/dev/null && pwd && ls -la`;
        const shRes = await execRemoteOrLocal(hostId, shScript);
        if (shRes.code !== 0) throw new Error(shRes.stderr || 'Verzeichnis konnte nicht gelesen werden');

        const lines = shRes.stdout.trim().split('\n');
        const realPath = lines[0] || (dir || '/');
        const entries = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line || line.startsWith('total ')) continue;
          const match = line.match(/^([drwxls-]{10})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+[A-Za-z]+\s+\d+\s+[\d:]+\s+(.+)$/);
          if (match) {
            const modeStr = match[1];
            const isDir = modeStr.startsWith('d');
            const size = parseInt(match[2], 10) || 0;
            const name = match[3];
            if (name === '.' || name === '..') continue;
            entries.push({
              name,
              dir: isDir,
              size,
              mtime: Date.now(),
              mode: isDir ? 0o755 : 0o644,
            });
          }
        }
        entries.sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name));
        return { path: realPath, entries };
      },
      mkdir: async (psid, dir) => {
        const hostId = sftpSessions.get(psid);
        if (!hostId) throw new Error('Nicht verbunden');
        const res = await execRemoteOrLocal(hostId, `mkdir -p ${shQuote(dir)}`);
        if (res.code !== 0) throw new Error(res.stderr || 'Ordner erstellen fehlgeschlagen');
        return { data: null };
      },
      rename: async (psid, a, b) => {
        const hostId = sftpSessions.get(psid);
        if (!hostId) throw new Error('Nicht verbunden');
        const res = await execRemoteOrLocal(hostId, `mv ${shQuote(a)} ${shQuote(b)}`);
        if (res.code !== 0) throw new Error(res.stderr || 'Umbenennen fehlgeschlagen');
        return { data: null };
      },
      remove: async (psid, p) => {
        const hostId = sftpSessions.get(psid);
        if (!hostId) throw new Error('Nicht verbunden');
        const res = await execRemoteOrLocal(hostId, `rm -rf ${shQuote(p)}`);
        if (res.code !== 0) throw new Error(res.stderr || 'Löschen fehlgeschlagen');
        return { data: null };
      },
      chmod: async (psid, p, mode) => {
        const hostId = sftpSessions.get(psid);
        if (!hostId) throw new Error('Nicht verbunden');
        const oct = (Number(mode) & 0o777).toString(8);
        const res = await execRemoteOrLocal(hostId, `chmod ${oct} ${shQuote(p)}`);
        if (res.code !== 0) throw new Error(res.stderr || 'Berechtigungen ändern fehlgeschlagen');
        return { data: null };
      },
      archive: async (psid, dir, names, format = 'tar.gz') => {
        const hostId = sftpSessions.get(psid);
        if (!hostId) throw new Error('Nicht verbunden');
        const list = (Array.isArray(names) ? names : [names]).filter(Boolean);
        if (!list.length) throw new Error('Keine Dateien gewählt');
        const ext = format === 'zip' ? '.zip' : '.tar.gz';
        const outName = `${list.length === 1 ? list[0] : 'archive'}${ext}`;
        const quoted = list.map(shQuote).join(' ');
        const cmd = format === 'zip'
          ? `cd ${shQuote(dir)} && (zip -rq ${shQuote(outName)} -- ${quoted} || python3 -m zipfile -c ${shQuote(outName)} ${quoted})`
          : `tar -czf ${shQuote(dir + '/' + outName)} -C ${shQuote(dir)} -- ${quoted}`;
        const res = await execRemoteOrLocal(hostId, cmd);
        if (res.code !== 0) throw new Error(res.stderr || 'Archivieren fehlgeschlagen');
        return { data: outName };
      },
      extract: async (psid, dir, name) => {
        const hostId = sftpSessions.get(psid);
        if (!hostId) throw new Error('Nicht verbunden');
        const full = dir + '/' + name;
        let cmd;
        if (/\.zip$/i.test(name)) {
          cmd = `cd ${shQuote(dir)} && (unzip -oq ${shQuote(name)} || python3 -m zipfile -e ${shQuote(name)} .)`;
        } else if (/\.(tar\.gz|tgz)$/i.test(name)) {
          cmd = `tar -xzf ${shQuote(full)} -C ${shQuote(dir)}`;
        } else if (/\.tar$/i.test(name)) {
          cmd = `tar -xf ${shQuote(full)} -C ${shQuote(dir)}`;
        } else {
          throw new Error('Archivformat wird nicht unterstützt.');
        }
        const res = await execRemoteOrLocal(hostId, cmd);
        if (res.code !== 0) throw new Error(res.stderr || 'Entpacken fehlgeschlagen');
        return { data: null };
      },
      downloadArchive: async (psid, dir, names, localDir) => {
        const hostId = sftpSessions.get(psid);
        if (!hostId) throw new Error('Nicht verbunden');
        const list = (Array.isArray(names) ? names : [names]).filter(Boolean);
        if (!list.length) throw new Error('Keine Dateien gewählt');
        const outName = `${list.length === 1 ? list[0] : 'archive'}.tar.gz`;
        const dest = (localDir || '/home/leon') + '/' + outName;
        await invoke('scp_download_archive', { hostId, dir, names: list, target: dest });
        return { data: outName };
      },
      upload: async (psid, localPaths, remoteDir) => {
        const hostId = sftpSessions.get(psid);
        if (!hostId) throw new Error('Nicht verbunden');
        const paths = Array.isArray(localPaths) ? localPaths : [localPaths];
        for (const cb of sftpProgressListeners) cb({ sid: psid, direction: 'upload', filesDone: 0, filesTotal: paths.length, percent: 10 });
        await invoke('scp_upload', { hostId, localPaths: paths, remoteDir });
        for (const cb of sftpProgressListeners) cb({ sid: psid, direction: 'upload', filesDone: paths.length, filesTotal: paths.length, percent: 100, done: true });
        return { data: true };
      },
      download: async (psid, remotePaths, localDir) => {
        const hostId = sftpSessions.get(psid);
        if (!hostId) throw new Error('Nicht verbunden');
        const paths = Array.isArray(remotePaths) ? remotePaths : [remotePaths];
        for (const cb of sftpProgressListeners) cb({ sid: psid, direction: 'download', filesDone: 0, filesTotal: paths.length, percent: 10 });
        await invoke('scp_download', { hostId, remotePaths: paths, localDir: localDir || '.' });
        for (const cb of sftpProgressListeners) cb({ sid: psid, direction: 'download', filesDone: paths.length, filesTotal: paths.length, percent: 100, done: true });
        return { data: true };
      },
      edit: async (psid, p, cmd) => {
        const hostId = sftpSessions.get(psid);
        if (!hostId) throw new Error('Nicht verbunden');
        const base = p.split('/').filter(Boolean).pop() || 'file';
        const tmp = `/tmp/ssh_deck_edit_${Date.now()}_${base}`;
        await invoke('scp_download', { hostId, remotePaths: [p], localDir: tmp });
        const ed = cmd || 'xdg-open';
        await execRemoteOrLocal(null, `${ed} ${shQuote(tmp)}`);
        const rDir = p.substring(0, p.lastIndexOf('/')) || '/';
        await invoke('scp_upload', { hostId, localPaths: [tmp], remoteDir: rDir });
        return { data: true };
      },
      copy: async (fromPsid, paths, toPsid, destDir) => {
        const fromHostId = sftpSessions.get(fromPsid);
        const toHostId = sftpSessions.get(toPsid);
        if (!fromHostId || !toHostId) throw new Error('Nicht verbunden');
        const list = Array.isArray(paths) ? paths : [paths];
        if (fromHostId === toHostId) {
          const quoted = list.map(shQuote).join(' ');
          const res = await execRemoteOrLocal(fromHostId, `cp -r ${quoted} ${shQuote(destDir)}`);
          if (res.code !== 0) throw new Error(res.stderr || 'Kopieren fehlgeschlagen');
          return { data: null };
        }
        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          const base = item.split('/').filter(Boolean).pop() || 'item';
          const tmp = `/tmp/ssh_deck_copy_${Date.now()}_${base}`;
          await invoke('scp_download', { hostId: fromHostId, remotePaths: [item], localDir: tmp });
          await invoke('scp_upload', { hostId: toHostId, localPaths: [tmp], remoteDir: destDir });
          try { await invoke('local_remove', { path: tmp }); } catch {}
          for (const cb of sftpProgressListeners) cb({ sid: fromPsid, direction: 'copy', filesDone: i + 1, filesTotal: list.length, percent: Math.round(((i + 1) / list.length) * 100) });
        }
        for (const cb of sftpProgressListeners) cb({ sid: fromPsid, direction: 'copy', done: true, percent: 100 });
        return { data: null };
      },
      cancel: (sid) => {},
      onProgress: (cb) => {
        sftpProgressListeners.add(cb);
        return () => sftpProgressListeners.delete(cb);
      },
      close: (psid) => {
        sftpSessions.delete(psid);
      },
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
      archive: async (dir, names, format = 'tar.gz') => {
        const list = (Array.isArray(names) ? names : [names]).filter(Boolean);
        if (!list.length) return '';
        const ext = format === 'zip' ? '.zip' : '.tar.gz';
        const outName = `${list.length === 1 ? list[0] : 'archive'}${ext}`;
        const quoted = list.map(shQuote).join(' ');
        const cmd = format === 'zip'
          ? `cd ${shQuote(dir)} && zip -rq ${shQuote(outName)} -- ${quoted}`
          : `tar -czf ${shQuote(dir + '/' + outName)} -C ${shQuote(dir)} -- ${quoted}`;
        await execRemoteOrLocal(null, cmd);
        return outName;
      },
      extract: async (dir, name) => {
        const full = dir + '/' + name;
        let cmd;
        if (/\.zip$/i.test(name)) {
          cmd = `cd ${shQuote(dir)} && unzip -oq ${shQuote(name)}`;
        } else if (/\.(tar\.gz|tgz)$/i.test(name)) {
          cmd = `tar -xzf ${shQuote(full)} -C ${shQuote(dir)}`;
        } else if (/\.tar$/i.test(name)) {
          cmd = `tar -xf ${shQuote(full)} -C ${shQuote(dir)}`;
        } else {
          return;
        }
        await execRemoteOrLocal(null, cmd);
      },
      remove: async (p) => {
        try {
          await invoke('local_remove', { path: p });
        } catch {}
      },
      open: async (p, cmd) => {
        const ed = cmd || 'xdg-open';
        await execRemoteOrLocal(null, `${ed} ${shQuote(p)}`);
        return true;
      },
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
        if (!activeSessions.has(sid)) return;
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

      const pingRes = await invoke('hosts_ping', { host: h.host, port }).catch(() => ({ ok: false }));
      if (!activeSessions.has(sid)) return;
      if (!pingRes.ok) {
        fail(`Connection refused or host unreachable (${h.host}:${port})`);
        return;
      }
      log(`Address resolved to ${h.host}${pingRes.latency != null ? ` (${pingRes.latency} ms)` : ''}`);

      try {
        let hostKeyAnswer = null;
        if (h.protocol !== 'telnet') {
          log('Checking SSH host key');
          const key = await invoke('ssh_host_key', { sid, hostId, userOverride: h.user });
          if (!activeSessions.has(sid)) {
            await invoke('ssh_close', { sid });
            return;
          }
          if (key.status !== 'known') {
            hostKeyAnswer = await ask('hostkey', key);
            if (!hostKeyAnswer || !activeSessions.has(sid)) {
              await invoke('ssh_close', { sid });
              return;
            }
          }
          log('SSH host key accepted');
          log(`Authenticating as "${h.user || 'root'}"`);
        }
        await invoke('ssh_open', { sid, hostId, cols, rows, userOverride: h.user, hostKeyAnswer });
        if (!activeSessions.has(sid)) return;
        await new Promise((r) => setTimeout(r, 200));
        if (activeSessions.has(sid)) sendStatus('ready');
      } catch (err) {
        if (activeSessions.has(sid)) fail(err?.message || String(err));
      }
    },
    input: (sid, data) => {
      invoke('ssh_input', { sid, data }).catch(() => {});
    },
    resize: (sid, cols, rows) => {
      invoke('ssh_resize', { sid, cols, rows }).catch(() => {});
    },
    close: (sid) => {
      pendingAnswers.get(sid)?.(null);
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
  try { window.api = b; } catch {}
  try { globalThis.api = b; } catch {}

  // Asynchron echte Plattform von Rust abfragen
  invoke('get_platform')
    .then((p) => {
      if (p) {
        try { window.api.platform = p; } catch {}
        try { globalThis.api.platform = p; } catch {}
      }
    })
    .catch(() => {});
}

export async function initTauriBridge() {
  if (typeof window === 'undefined') return;
  if (!window.api) {
    const b = createTauriBridge();
    try { window.api = b; } catch {}
    try { globalThis.api = b; } catch {}
  }
  try {
    const p = await invoke('get_platform');
    if (p) {
      try { window.api.platform = p; } catch {}
      try { globalThis.api.platform = p; } catch {}
    }
  } catch {}
}

export default initTauriBridge;
