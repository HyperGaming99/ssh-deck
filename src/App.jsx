import { Fragment, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Boxes,
  Circle,
  Code2,
  Container,
  Fingerprint,
  FolderOpen,
  KeyRound,
  Lock,
  Menu,
  Minus,
  Moon,
  PanelRight,
  Plus,
  QrCode,
  Search,
  Server,
  Settings as SettingsIcon,
  Share2,
  Square,
  Sun,
  Terminal as TermIcon,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import Logo from '@/components/Logo';
import ShinyText from '@/components/ShinyText';
import ErrorBoundary from '@/components/ErrorBoundary';
import FormDialog from '@/components/FormDialog';
import HostSheet from '@/components/HostSheet';
import CredDialog from '@/components/CredDialog';
import HostKeyDialog from '@/components/HostKeyDialog';
import { PairSheet } from '@/components/PairQR';
import NewTab from '@/components/NewTab';
import ConnectScreen from '@/components/ConnectScreen';
import ReconnectBar from '@/components/ReconnectBar';
import KeyBar from '@/components/KeyBar';
import TermPanel from '@/components/TermPanel';
import SplitView, { MAX_PANES, SplitTools } from '@/components/SplitView';
import LoginScreen from '@/components/LoginScreen';
import LanguageSetup from '@/components/LanguageSetup';
import ShareDialog from '@/components/ShareDialog';
import { IconButton, LockScreen, Pill, UpdateBanner, VaultSwitcher } from '@/components/common';
import { VaultCtx } from '@/context/VaultContext';
import { DockerView, ForwardsView, HostsView, K8sView, KeychainView, KnownHostsView, SettingsView, SnippetsView } from '@/views';
import { I18nContext, RTL, T, makeT } from '@/i18n';
import { cn } from '@/lib/utils';
import { fill, vars } from '@/lib/snippetVars.mjs';
import { FONTS, chromeVars, resolveTheme } from '@/lib/termThemes';
import { bcast, startRec, stopRec, writers } from '@/lib/termState';
import { hideSplash } from '@/splash';

const SftpTab = lazy(() => import('@/components/SftpTab'));

const mobile = !!window.api?.mobile; // Android-App: Touch-Layout (CSS: html[data-mobile]); .mhide blendet Desktop-Funktionen dort aus
const Wrap = mobile ? 'div' : Fragment; // Handy: Terminal und Tastenleiste untereinander

const SECTIONS = [
  ['hosts', T('Hosts'), Server],
  ['docker', T('Docker'), Container],
  ['k8s', T('Kubernetes'), Boxes],
  ['keychain', T('Keychain'), KeyRound],
  ['known', T('Known Hosts'), Fingerprint],
  ['snippets', T('Snippets'), Code2],
  ['forwards', T('Forwarding'), ArrowLeftRight],
  ['settings', T('Einstellungen'), SettingsIcon], // steht in der Navigation unten
];

export default function App() {
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('dark') === '1'; } catch { return false; } });
  const [section, setSection] = useState('hosts');
  const store = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const [termTheme, setTermTheme] = useState(() => store('termTheme', 'auto'));
  const [font, setFontState] = useState(() => store('termFont', { family: FONTS[0][0], size: mobile ? 12 : 14 }));
  const [panel, setPanel] = useState(() => !mobile && store('termPanel', true)); // Handy: Panel startet zu (es liegt über dem Terminal)
  const [history, setHistory] = useState({}); // sid -> eingegebene Befehle (nur im Speicher, nie gespeichert)
  const persist = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* egal */ } };
  const setTheme = (v) => { setTermTheme(v); persist('termTheme', v); };
  const setFont = (v) => { setFontState(v); persist('termFont', v); };
  const togglePanel = () => { setPanel(!panel); if (!mobile) persist('termPanel', !panel); };
  const xtheme = useMemo(() => resolveTheme(termTheme, dark), [termTheme, dark]);
  const lastActiveRef = useRef({}); // sid -> timestamp der letzten Aktivität
  const onCommand = useCallback((sid, c) => {
    lastActiveRef.current[sid] = Date.now();
    setHistory((h) => ({ ...h, [sid]: [...(h[sid] || []).filter((x) => x !== c), c].slice(-100) }));
  }, []);
  const [tabs, setTabs] = useState([]); // { sid, title, kind, panes: [{ sid, conn, attempt, closed }], focus, dir }
  const [bc, setBc] = useState({ on: false, ids: [] }); // Broadcast: Eingabe an mehrere Sessions
  const updPane = (sid, f) => setTabs((prev) => prev.map((x) => (x.panes?.some((p) => p.sid === sid) ? { ...x, panes: x.panes.map((p) => (p.sid === sid ? { ...p, ...f(p) } : p)) } : x)));
  const [active, setActive] = useState('home');
  const [form, setForm] = useState(null);
  const [hostForm, setHostForm] = useState(null); // Host-Details-Panel
  const [shareTab, setShareTab] = useState(null); // Tab für Live-Sharing
  const [upd, setUpd] = useState(null); // neue Version verfügbar
  const [teams, setTeams] = useState([]);
  const [vault, setVaultState] = useState(() => store('vault', 'personal'));
  const [settingsTab, setSettingsTab] = useState(null);
  const [credAsks, setCredAsks] = useState([]); // Rückfragen nach Benutzer/Passwort (SFTP, Forwarding)
  const [hostKeys, setHostKeys] = useState([]); // Rückfragen zu unbekannten/geänderten Host-Schlüsseln (Warteschlange)
  const [recent, setRecent] = useState(() => { try { return JSON.parse(localStorage.getItem('recent') || '[]'); } catch { return []; } }); // zuletzt verbundene Hosts [{ id, at }]
  const [error, setError] = useState('');
  const [seq, setSeq] = useState(0);
  const mac = api.platform === 'darwin'; // macOS: eigene Ampel-Knöpfe des Systems, Cmd statt Ctrl
  const [navOpen, setNavOpen] = useState(true);
  const [side, setSideState] = useState(() => { try { return localStorage.getItem('sidebar') || 'compact'; } catch { return 'compact'; } }); // compact | wide | float
  const setSide = (v) => { setSideState(v); try { localStorage.setItem('sidebar', v); } catch { /* egal */ } };
  const [sftpMounted, setSftpMounted] = useState(false); // fester SFTP-Tab: erst beim ersten Öffnen aufbauen, dann im Hintergrund behalten
  const [st, setSt] = useState(null); // Sync-/Konto-Status; null = lädt
  const [skip, setSkip] = useState(() => { try { return localStorage.getItem('skipLogin') === '1'; } catch { return false; } });
  const chooseSkip = (v) => { setSkip(v); try { localStorage.setItem('skipLogin', v ? '1' : '0'); } catch { /* egal */ } };
  // Sprache: null = noch nie gewählt -> Einrichtung beim ersten Start (kein stilles Englisch)
  const [lang, setLangState] = useState(() => { try { return localStorage.getItem('lang'); } catch { return null; } });
  const setLang = (v) => { setLangState(v); try { localStorage.setItem('lang', v); } catch { /* egal */ } };
  const [sessTimeoutMin, setSessTimeoutMin] = useState(() => {
    try { return Number(localStorage.getItem('sessionTimeoutMin') || '0'); } catch { return 0; }
  });
  useEffect(() => {
    const onTimeoutCfg = () => {
      try { setSessTimeoutMin(Number(localStorage.getItem('sessionTimeoutMin') || '0')); } catch { /* egal */ }
    };
    window.addEventListener('session-timeout-cfg', onTimeoutCfg);
    return () => window.removeEventListener('session-timeout-cfg', onTimeoutCfg);
  }, []);

  const [dockerOn, setDockerOn] = useState(() => { try { return localStorage.getItem('dockerFeature') === '1'; } catch { return false; } });
  const [k8sOn, setK8sOn] = useState(() => { try { return localStorage.getItem('k8sFeature') === '1'; } catch { return false; } });
  useEffect(() => {
    const onDockerCfg = () => { try { setDockerOn(localStorage.getItem('dockerFeature') === '1'); } catch { /* egal */ } };
    window.addEventListener('docker-cfg', onDockerCfg);
    return () => window.removeEventListener('docker-cfg', onDockerCfg);
  }, []);
  useEffect(() => {
    if (!dockerOn && section === 'docker') setSection('hosts');
  }, [dockerOn, section]);
  useEffect(() => {
    const onCfg = () => { try { setK8sOn(localStorage.getItem('k8sFeature') === '1'); } catch { /* egal */ } };
    window.addEventListener('k8s-cfg', onCfg);
    return () => window.removeEventListener('k8s-cfg', onCfg);
  }, []);
  useEffect(() => {
    if (!k8sOn && section === 'k8s') setSection('hosts');
  }, [k8sOn, section]);
  const visibleSections = useMemo(() => SECTIONS.filter(([id]) => (id !== 'k8s' || k8sOn) && (id !== 'docker' || dockerOn)), [k8sOn, dockerOn]);
  const t = useMemo(() => makeT(lang), [lang]);
  const i18n = useMemo(() => ({ t, lang: lang || 'en' }), [t, lang]);
  const [rev, setRev] = useState(0); // erhöht sich, wenn der Server ein Betriebssystem-Icon gesetzt hat

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('dark', dark ? '1' : '0'); } catch { /* egal */ }
    api.settings.set({ dark }); // damit der Hauptprozess beim nächsten Start die richtige Fensterfarbe nimmt
  }, [dark]);
  useEffect(() => {
    document.documentElement.lang = lang || 'en';
    document.documentElement.dir = RTL.has(lang) ? 'rtl' : 'ltr';
  }, [lang]);
  useEffect(() => {
    api.onData((sid, d) => {
      lastActiveRef.current[sid] = Date.now();
      writers.get(sid)?.(d);
    });
    api.onEdit((m) => toast(m));
    api.onHostsChanged(() => setRev((r) => r + 1));
    api.onHostKey((info) => setHostKeys((q) => [...q, info]), (id) => setHostKeys((q) => q.filter((x) => x.id !== id)));
    api.sync.status().then(setSt);
    api.sync.onStatus(setSt);
    api.onCredAsk((a) => setCredAsks((q) => [...q, a]));
    if (!mobile) api.update.onAvailable(setUpd);
    api.onStatus((sid, conn) => updPane(sid, (p) => (conn.state === 'ready' ? { conn, tries: 0, lost: false, closed: false }
      : conn.state === 'failed' && p.tries ? { conn: null, lost: true } // Versuch nach Verbindungsabbruch gescheitert: weiter in der Leiste
      : { conn })));
    api.onLost((sid) => updPane(sid, () => ({ lost: true })));
    api.onClosed((sid) => updPane(sid, () => ({ closed: true })));
  }, []);

  useEffect(() => {
    if (sessTimeoutMin <= 0) return;
    const timeoutMs = sessTimeoutMin * 60 * 1000;
    const timer = setInterval(() => {
      const now = Date.now();
      for (const tab of tabs) {
        if (tab.kind && tab.kind !== 'ssh') continue;
        for (const pane of tab.panes || []) {
          if (pane.closed || !pane.conn || pane.conn.state !== 'ready') continue;
          const last = lastActiveRef.current[pane.sid] || (lastActiveRef.current[pane.sid] = now);
          if (now - last >= timeoutMs) {
            api.close(pane.sid);
            toast(t('Sitzung „{title}“ wegen Inaktivität getrennt.', { title: tab.title }));
          }
        }
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [sessTimeoutMin, tabs, t]);

  const sessions = tabs.flatMap((x) => (x.panes || []).filter((p) => !p.closed).map((p, i) => ({ sid: p.sid, label: x.panes.length > 1 ? `${x.title} (${i + 1})` : x.title })));
  const bcTargets = bc.on ? bc.ids.filter((id) => sessions.some((s) => s.sid === id)) : [];
  bcast.to = bcTargets;
  const termActive = tabs.some((x) => x.sid === active && (x.kind === 'ssh' || !x.kind));
  useEffect(() => { // solange ein Terminal offen ist, färbt das gewählte Theme das ganze Fenster (auch Dialoge)
    const vars = termActive && termTheme !== 'auto' ? chromeVars(xtheme) : null;
    const root = document.documentElement.style;
    if (!vars) return;
    for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
    return () => { for (const k of Object.keys(vars)) root.removeProperty(k); };
  }, [termActive, termTheme, xtheme]);
  const setVault = (v) => { setVaultState(v); persist('vault', v); setSection('hosts'); setActive('home'); };
  const refreshTeams = useCallback(() => { api.team.list().then((r) => setTeams(r.teams || [])).catch(() => {}); }, []);
  const vaults = useMemo(() => [{ id: 'personal', name: t('Persönlich'), writable: true }, ...teams.map((x) => ({ id: x.id, name: x.name, role: x.role, writable: x.role !== 'viewer' }))], [teams, t]);
  const activeV = vaults.find((x) => x.id === vault) || vaults[0];
  const vctx = useMemo(() => ({ vault: activeV.id, name: activeV.name, role: activeV.role || 'owner', writable: activeV.writable, vaults: vaults.filter((x) => x.writable) }), [activeV, vaults]);
  useEffect(() => { api.team.onChanged(refreshTeams); }, [refreshTeams]);
  useEffect(() => { refreshTeams(); }, [refreshTeams, rev, st?.configured]);
  const toast = (m) => { setError(t(m)); setTimeout(() => setError(''), 4000); }; // Meldungen aus Hauptprozess/Server (deutsch) werden hier mit übersetzt
  const connect = (h, kind = 'ssh') => {
    if (kind === 'ssh') {
      const next = [{ id: h.id, at: Date.now() }, ...recent.filter((r) => r.id !== h.id)].slice(0, 8);
      setRecent(next);
      try { localStorage.setItem('recent', JSON.stringify(next)); } catch { /* egal */ }
    }
    const sid = `s${seq + 1}`;
    lastActiveRef.current[sid] = Date.now();
    setSeq(seq + 1);
    setTabs((prev) => [...prev, { sid, hostId: h.id, title: kind === 'sftp' ? t('{name} · SFTP', { name: h.name }) : h.name, kind, ...(kind === 'ssh' && { panes: [{ sid }], focus: sid, dir: 'row' }) }]);
    setActive(sid);
  };
  const editHost = async (id) => setHostForm({
    values: await api.hosts.get(id), groups: await api.groups.list(), keys: await api.keys.list(), vaults: vaults.filter((x) => x.writable),
    onSave: async (o) => { const i = await api.hosts.save(o); setRev((r) => r + 1); return i; },
    onConnect: connect, onDelete: async (i) => { await api.hosts.remove(i); setRev((r) => r + 1); },
  });
  // Terminal teilen: neue SSH-Session zum selben Host als weiteres Pane (2 bis 4)
  const split = (dir) => {
    const tab = tabsRef.current.find((x) => x.sid === active);
    if (!tab?.panes || tab.panes.length >= MAX_PANES) return;
    const sid = `p${Date.now()}`;
    lastActiveRef.current[sid] = Date.now();
    setTabs((prev) => prev.map((x) => (x.sid === tab.sid ? { ...x, dir, panes: [...x.panes, { sid }], focus: sid } : x)));
  };
  const setFocus = (tabSid, sid) => setTabs((prev) => prev.map((x) => (x.sid === tabSid ? { ...x, focus: sid } : x)));
  const closePane = (tabSid, sid) => setTabs((prev) => prev.map((x) => {
    if (x.sid !== tabSid || x.panes.length < 2) return x;
    const panes = x.panes.filter((p) => p.sid !== sid);
    return { ...x, panes, focus: x.focus === sid ? panes.at(-1).sid : x.focus };
  }));
  const [recs, setRecs] = useState({}); // sid -> true, solange aufgezeichnet wird
  const toggleRec = async (tab) => { // zeichnet das fokussierte Pane auf
    const sid = tab.focus || tab.panes[0].sid;
    if (!recs[sid]) { startRec(sid); return setRecs((r) => ({ ...r, [sid]: true })); }
    setRecs((r) => ({ ...r, [sid]: false }));
    const text = stopRec(sid);
    if (text && await api.saveRec(text, tab.title.replace(/[\\/:*?"<>|]/g, '_'))) toast(t('Aufzeichnung gespeichert.'));
  };
  const reconnect = (sid) => updPane(sid, (p) => ({ lost: false, closed: false, conn: null, tries: (p.tries || 0) + 1, reconn: (p.reconn || 0) + 1 }));
  const closeTab = (sid) => {
    setTabs((prev) => prev.filter((x) => x.sid !== sid));
    setActive((a) => (a === sid ? 'home' : a));
  };
  // Neuer Tab (Suche + zuletzt verwendet); es gibt höchstens einen
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const openNewTab = () => {
    const ex = tabsRef.current.find((x) => x.kind === 'new');
    if (ex) return setActive(ex.sid);
    const sid = `n${Date.now()}`;
    setTabs((prev) => [...prev, { sid, kind: 'new', title: '' }]);
    setActive(sid);
  };
  const readyRef = useRef(false);
  const splitRef = useRef();
  splitRef.current = split;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setBc((b) => (b.on ? { ...b, on: false } : b));
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'E')) { e.preventDefault(); splitRef.current(e.key === 'D' ? 'row' : 'col'); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && readyRef.current) { e.preventDefault(); openNewTab(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  const runSnippet = (cmd) => {
    const tb = tabs.find((x) => x.sid === active) || tabs.at(-1);
    const sid = tb?.focus || tb?.sid;
    if (!sid) return toast(t('Erst ein Terminal öffnen.'));
    const vs = vars(cmd);
    if (vs.length) setForm({ title: t('Snippet ausführen'), submitLabel: t('Ausführen'), fields: vs.map((v) => ({ name: v.name, label: v.name })), values: Object.fromEntries(vs.map((v) => [v.name, v.def])), onSubmit: (v) => api.input(sid, fill(cmd, v) + '\n') });
    else api.input(sid, cmd + '\n');
    setActive(sid);
  };

  useEffect(() => { if (st) hideSplash(); }, [st]); // erst wenn der Status da ist, ist die Oberfläche bereit
  const [pairOpen, setPairOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [canLock, setCanLock] = useState(() => { try { return !!localStorage.getItem('lockPinHash'); } catch { return false; } });
  useEffect(() => {
    let timer = null;
    const resetTimer = () => {
      clearTimeout(timer);
      let mins = 0, hasPin = false;
      try {
        mins = Number(localStorage.getItem('autoLockMin') || '0');
        hasPin = !!localStorage.getItem('lockPinHash');
      } catch { /* egal */ }
      setCanLock(hasPin);
      if (mins > 0 && hasPin) timer = setTimeout(() => setLocked(true), mins * 60000);
    };
    const lockNow = () => { if (localStorage.getItem('lockPinHash')) setLocked(true); };
    const evs = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'lock-cfg'];
    evs.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    window.addEventListener('app-lock-now', lockNow);
    resetTimer();
    return () => {
      clearTimeout(timer);
      evs.forEach((ev) => window.removeEventListener(ev, resetTimer));
      window.removeEventListener('app-lock-now', lockNow);
    };
  }, []);
  const gate = st && lang !== null && !st.configured && !skip;
  readyRef.current = !!st && lang !== null && !gate; // ohne Konto zuerst der Login-Bildschirm
  const view = { hosts: HostsView, docker: DockerView, k8s: K8sView, keychain: KeychainView, known: KnownHostsView, settings: SettingsView, snippets: SnippetsView, forwards: ForwardsView }[section];
  const View = view;
  return (
    <I18nContext.Provider value={i18n}>
    <TooltipProvider delayDuration={300}>
    <VaultCtx.Provider value={vctx}>
      <div className="flex h-full flex-col">
        <header dir="ltr" className={cn('mhead flex h-12 shrink-0 items-center gap-2 border-b bg-sidebar [-webkit-app-region:drag]', mac ? 'pl-[88px]' : 'pl-2')}>
          {gate && <Logo className="ml-2 h-6 w-[19px]" />}
          {!gate && <div className="mtabs flex min-w-0 items-center gap-1.5 [-webkit-app-region:no-drag]">
            <Button variant="ghost" size="icon" className="mhide size-8 shrink-0" onClick={() => setNavOpen(!navOpen)} aria-label={t('Navigation')}><Menu className="size-4" /></Button>
            <Logo className="mhide mx-1 h-6 w-[19px] shrink-0" />
            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
              <VaultSwitcher vaults={vaults} vault={activeV.id} setVault={setVault} signedIn={!!st?.configured}
                onNew={() => setForm({ title: t('Neues Team'), fields: [{ name: 'name', label: t('Name'), required: true }], submitLabel: t('Team erstellen'), onSubmit: async (v) => { const r = await api.team.create(v.name); if (r.error) return toast(r.error); await refreshTeams(); setVault(r.id); } })}
                onManage={() => { setSection('settings'); setSettingsTab('teams'); setActive('home'); setTimeout(() => setSettingsTab(null), 0); }} />
              <Pill active={active === 'home'} onClick={() => setActive('home')}><Server className="size-4 shrink-0" />{t('Hosts')}</Pill>
              <Pill active={active === 'sftp'} onClick={() => { setSftpMounted(true); setActive('sftp'); }}><FolderOpen className="size-4 shrink-0" />SFTP</Pill>
              {tabs.map((tab) => (
                <Pill key={tab.sid} active={active === tab.sid} onClick={() => setActive(tab.sid)} onClose={() => closeTab(tab.sid)}>
                  {tab.kind === 'sftp' ? <FolderOpen className="size-4 shrink-0" /> : tab.kind === 'new' ? <Search className="size-4 shrink-0" /> : <TermIcon className="size-4 shrink-0" />}
                  {tab.panes?.some((p) => recs[p.sid]) && <Circle className="size-2.5 shrink-0 fill-red-500 text-red-500" />}<span className="truncate">{tab.kind === 'new' ? t('Neuer Tab') : tab.title}</span>{tab.panes?.every((p) => p.closed) && <span className="text-xs opacity-60">{t('(getrennt)')}</span>}
                </Pill>
              ))}
            </div>
            <IconButton label={t('Neue Verbindung')} onClick={openNewTab}><Plus className="size-4" /></IconButton>
          </div>}
          <div className="ml-auto flex h-full items-center [-webkit-app-region:no-drag]">
            {bc.on && <span className="mr-2 rounded-md bg-orange-500 px-2 py-1 text-xs font-semibold text-white">{t('Broadcast an {n}', { n: bcTargets.length })}</span>}
            {tabs.find((x) => x.sid === active && x.panes) && <SplitTools tab={tabs.find((x) => x.sid === active)} split={split} bc={bc} setBc={setBc} sessions={sessions} />}
            {tabs.find((x) => x.sid === active && (x.kind === 'ssh' || !x.kind)) && (() => { const tb = tabs.find((x) => x.sid === active); const on = recs[tb.focus || tb.panes[0].sid]; return <Button variant="ghost" size="icon" className={cn('mhide mr-1 size-8', on && 'text-red-500')} onClick={() => toggleRec(tb)} aria-label={on ? t('Aufzeichnung beenden') : t('Aufzeichnen')} title={on ? t('Aufzeichnung beenden') : t('Aufzeichnen')}><Circle className={cn('size-4', on && 'fill-current')} /></Button>; })()}
            {tabs.find((x) => x.sid === active && (x.kind === 'ssh' || !x.kind)) && <Button variant="ghost" size="icon" className={cn('mr-1 size-8', panel && 'text-primary')} onClick={togglePanel} aria-label={t('Seitenleiste ein-/ausblenden')}><PanelRight className="size-4" /></Button>}
            {tabs.find((x) => x.sid === active && (x.kind === 'ssh' || !x.kind)) && (
              <Button
                variant="ghost"
                size="icon"
                className="mhide mr-1 size-8"
                onClick={() => setShareTab(tabs.find((x) => x.sid === active))}
                aria-label={t('Sitzung live teilen')}
                title={t('Sitzung live teilen')}
              >
                <Share2 className="size-4" />
              </Button>
            )}
            {canLock && <Button variant="ghost" size="icon" className="mr-1 size-8" onClick={() => setLocked(true)} aria-label={t('Jetzt sperren')} title={t('Jetzt sperren')}><Lock className="size-4" /></Button>}
            <Button variant="ghost" size="icon" className="mr-1 size-8" onClick={() => setPairOpen(true)} aria-label={t('QR-Code koppeln')}><QrCode className="size-4" /></Button>
            <Button variant="ghost" size="icon" className="mr-1 size-8" onClick={() => setDark(!dark)} aria-label={t('Theme wechseln')}>
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            {!mac && !mobile && <>
            <button className="grid h-full w-11 place-items-center text-muted-foreground hover:bg-accent" onClick={api.win.minimize} aria-label={t('Minimieren')}><Minus className="size-4" /></button>
            <button className="grid h-full w-11 place-items-center text-muted-foreground hover:bg-accent" onClick={api.win.toggleMax} aria-label={t('Maximieren')}><Square className="size-3.5" /></button>
            <button className="grid h-full w-11 place-items-center text-muted-foreground hover:bg-destructive hover:text-white" onClick={api.win.close} aria-label={t('Schließen')}><X className="size-4" /></button>
            </>}
          </div>
        </header>
        <PairSheet open={pairOpen} onClose={() => setPairOpen(false)} signedIn={!!st?.configured} toast={toast} />
        {locked && <LockScreen onUnlock={() => setLocked(false)} />}

        {!mobile && upd && !gate && <UpdateBanner upd={upd} onClose={() => setUpd(null)} />}
        {st === null ? <div className="flex-1" /> : lang === null ? <LanguageSetup onPick={setLang} /> : gate ? <LoginScreen status={st} dark={dark} onSkip={() => chooseSkip(true)} onPair={() => setPairOpen(true)} /> : <div className="mroot flex min-h-0 flex-1">
        {(navOpen || mobile) && !termActive && (
          <nav className={cn('mnav flex shrink-0 flex-col gap-1 py-3', side === 'wide' ? 'w-56 items-stretch border-r bg-sidebar px-3' : 'items-stretch px-2',
            side === 'compact' && 'w-[84px] border-r bg-sidebar', side === 'float' && 'm-2 mr-0 w-[92px] rounded-2xl border bg-card shadow-sm')}>
            {visibleSections.map(([id, label, Icon]) => {
              const on = active === 'home' && section === id;
              return (
                <button key={id} style={id === 'settings' ? { marginTop: 'auto' } : undefined} onClick={() => { setSection(id); setActive('home'); }}
                  className={cn('relative flex rounded-lg text-muted-foreground transition-colors hover:bg-accent',
                    side === 'wide' ? 'flex-row items-center gap-3 px-3 py-2 text-sm' : 'flex-col items-center gap-1 px-1 py-2 text-[10px] leading-none', on && 'bg-accent text-foreground')}>
                  {on && <span className="mhide absolute inset-y-2 -left-1 w-0.5 rounded-full bg-primary" />}
                  <Icon className={side === 'wide' ? 'size-4' : 'size-5'} />{t(label)}
                </button>
              );
            })}
          </nav>
        )}

        <main className={cn('flex min-w-0 flex-1 flex-col', bc.on && 'ring-4 ring-inset ring-orange-500')}>
          <div className="relative min-h-0 flex-1">
            <div className={cn('mpad absolute inset-0 overflow-auto p-8', active !== 'home' && 'hidden')}>
              <h1 className="mb-6 text-2xl font-semibold">
                <ShinyText text={t((visibleSections.find(([id]) => id === section) || SECTIONS[0])[1])} color={dark ? '#8a8a8a' : '#52525b'} shineColor={dark ? '#ffffff' : '#2563eb'} speed={4} />
              </h1>
              <ErrorBoundary key={section + vault}><View settingsTab={settingsTab} teams={teams} refreshTeams={refreshTeams} vault={activeV.id} setVault={setVault} lang={lang} setLang={setLang} st={st} setDark={setDark} side={side} setSide={setSide} onLogin={() => chooseSkip(false)} onLogout={() => chooseSkip(false)} dark={dark} connect={connect} openSftp={(h) => connect(h, 'sftp')} runSnippet={runSnippet} openForm={setForm} openHost={setHostForm} toast={toast} rev={rev} /></ErrorBoundary>
            </div>
            <div className={cn('absolute inset-0 p-2', active !== 'sftp' && 'hidden')}>
              {sftpMounted && <Suspense fallback={null}><SftpTab sid="sftp" hostId={null} active={active === 'sftp'} toast={toast} openForm={setForm} /></Suspense>}
            </div>
            {tabs.map((tab) => (
              <div key={tab.sid} className={cn('absolute inset-0', tab.kind !== 'ssh' && tab.kind && 'p-2', active !== tab.sid && 'hidden')}>
                {tab.kind === 'new'
                  ? <NewTab active={active === tab.sid} tabs={tabs} recent={recent} onConnect={(h) => { closeTab(tab.sid); connect(h); }} onSwitch={(sid) => { closeTab(tab.sid); setActive(sid); }} />
                  : tab.kind === 'sftp'
                    ? <Suspense fallback={null}><SftpTab sid={tab.sid} hostId={tab.hostId} toast={toast} openForm={setForm} /></Suspense>
                    : (() => { const fp = tab.panes.find((p) => p.sid === tab.focus) || tab.panes[0]; const ready = fp.conn?.state === 'ready' || !fp.conn; return (
                      <div className="flex size-full">
                        <Wrap {...(mobile && { className: 'flex min-h-0 min-w-0 flex-1 flex-col' })}>
                        <SplitView tab={tab} active={active === tab.sid} theme={xtheme} font={font} onCommand={onCommand} setFocus={(sid) => setFocus(tab.sid, sid)} closePane={(sid) => closePane(tab.sid, sid)}
                          overlay={(p) => <>{p.lost && !p.conn && <ReconnectBar key={p.tries || 0} tries={p.tries || 0} onNow={() => reconnect(p.sid)} onCancel={() => updPane(p.sid, () => ({ lost: false, closed: true }))} />}{p.conn && p.conn.state !== 'ready' && <ConnectScreen conn={p.conn} onClose={() => (tab.panes.length > 1 ? closePane(tab.sid, p.sid) : closeTab(tab.sid))}
                            onAnswer={(a) => { api.answer(p.sid, a); updPane(p.sid, (q) => ({ conn: { ...q.conn, state: 'connecting' } })); }}
                            onEdit={() => editHost(tab.hostId)}
                            onRetry={() => updPane(p.sid, (q) => ({ conn: null, attempt: (q.attempt || 0) + 1 }))} />}</>} />
                        {mobile && ready && <KeyBar sid={fp.sid} />}
                        </Wrap>
                        {panel && ready && fp.conn && mobile && <div className="fixed inset-0 z-30 bg-black/40" onClick={togglePanel} />}
                        {panel && ready && fp.conn && <TermPanel onClose={togglePanel} sid={fp.sid} hostId={tab.hostId} dark={dark} history={history[fp.sid] || []} themeId={termTheme} setThemeId={setTheme} font={font} setFont={setFont} toast={toast} rev={rev} />}
                      </div>); })()}
              </div>
            ))}
          </div>
        </main>
        </div>}
      </div>
      <FormDialog spec={form} onClose={() => setForm(null)} />
      <HostSheet spec={hostForm} onClose={() => setHostForm(null)} />
      <CredDialog ask={credAsks[0]} onAnswer={(a) => { api.answerCred(credAsks[0].id, a); setCredAsks((q) => q.slice(1)); }} />
      <HostKeyDialog info={hostKeys[0]} onAnswer={(ok) => { api.answerHostKey(hostKeys[0].id, ok); setHostKeys((q) => q.slice(1)); }} />
      <ShareDialog open={!!shareTab} onClose={() => setShareTab(null)} tab={shareTab} toast={toast} />
      {error && <div className="fixed bottom-5 right-5 rounded-lg border bg-foreground px-4 py-2.5 text-sm text-background shadow-lg">{error}</div>}
    </VaultCtx.Provider>
    </TooltipProvider>
    </I18nContext.Provider>
  );
}
