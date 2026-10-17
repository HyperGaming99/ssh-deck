import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, Eye, EyeOff, LayoutGrid, List, Cloud, CloudOff, Fingerprint, Languages, ShieldCheck, Check, FileText, Palette, Settings as SettingsIcon, User, Folder, FolderPlus, Menu, Minus, Square, ArrowLeftRight, Code2, Copy, Download, Ellipsis, FileUp, FolderOpen, KeyRound, Lock, Moon, Pencil, Plus, RefreshCw, Search, Send, Server, Sun, PanelRight, Terminal as TermIcon, Trash2, Users, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import ShinyText from '@/components/ShinyText';
import SpotlightCard from '@/components/SpotlightCard';
import HostIcon from '@/components/HostIcon';
import FormDialog from '@/components/FormDialog';
import CredDialog from '@/components/CredDialog';
import Logo from '@/components/Logo';
import ErrorBoundary from '@/components/ErrorBoundary';
import KeychainCloud from '@/components/KeychainCloud';
import TeamsSettings from '@/components/TeamsSettings';
import TermPanel from '@/components/TermPanel';
import { vars, fill } from '@/lib/snippetVars.mjs';
import { FONTS, chromeVars, resolveTheme } from '@/lib/termThemes';
import ConnectScreen from '@/components/ConnectScreen';
import ForwardSheet from '@/components/ForwardSheet';
import HostSheet from '@/components/HostSheet';
import NewTab from '@/components/NewTab';
import HostKeyDialog from '@/components/HostKeyDialog';
import ImportDialog from '@/components/ImportDialog';
import KeyImportSheet from '@/components/KeyImportSheet';
import { maskFingerprint, maskHost } from '@/lib/censor.mjs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import Terminal, { writers, getPaste, setPaste } from '@/components/Terminal';
import SftpTab from '@/components/SftpTab';
import LoginScreen from '@/components/LoginScreen';
import LanguageSetup from '@/components/LanguageSetup';
import { I18nContext, LANGS, RTL, T, makeT, useLang, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { hideSplash } from '@/splash';

const SECTIONS = [
  ['hosts', T('Hosts'), Server],
  ['keychain', T('Keychain'), KeyRound],
  ['known', T('Known Hosts'), Fingerprint],
  ['snippets', T('Snippets'), Code2],
  ['forwards', T('Forwarding'), ArrowLeftRight],
  ['settings', T('Einstellungen'), SettingsIcon], // steht in der Navigation unten
];

// Tresor: "personal" oder die id eines Teams. Alle Listen zeigen nur den gewählten Tresor, neue Einträge landen darin.
const VaultCtx = createContext({ vault: 'personal', name: '', role: 'owner', writable: true, vaults: [] });
const useVault = () => useContext(VaultCtx);
const inV = (r, vault) => (r.vault || 'personal') === vault;
const matches = (q, ...vals) => vals.join(' ').toLowerCase().includes(q.toLowerCase());

function IconButton({ label, onClick, children }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" onClick={(e) => { e.stopPropagation(); onClick(); }}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// Karte mit Spotlight; icon darf beliebiger Node sein
function Item({ icon, title, sub, onClick, actions, dark, compact }) {
  return (
    <SpotlightCard theme={dark ? 'dark' : 'light'} className="cursor-pointer p-0!" onClick={onClick} style={{ borderRadius: 18 }}>
      <div className={cn('group relative flex items-center', compact ? 'gap-3 p-3' : 'gap-4 p-5')}>
        <div className={cn('grid shrink-0 place-items-center', compact ? 'size-11 rounded-lg bg-primary/10 text-primary' : 'size-14 rounded-xl bg-secondary [&>img]:size-9 [&>svg]:size-7')}>{icon}</div>
        <div className={cn('min-w-0 flex-1', compact ? 'space-y-0.5' : 'space-y-1')}>
          <div className={cn('truncate font-semibold', compact ? 'text-sm' : 'text-base')}>{title}</div>
          <div className={cn('truncate text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>{sub}</div>
        </div>
        {/* Aktionen schweben über der Karte statt Platz zu belegen: so bleibt der Text voll lesbar */}
        <div className="absolute end-3 top-1/2 flex -translate-y-1/2 rounded-xl border bg-card/95 p-0.5 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100">{actions}</div>
      </div>
    </SpotlightCard>
  );
}

// Tab als abgerundete Pille; onClose zeigt ein X
function Pill({ active, onClick, onClose, children }) {
  return (
    <div onClick={onClick}
      className={cn('flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-transparent px-3 text-sm text-muted-foreground transition-colors hover:bg-accent',
        active && 'border-border bg-background text-foreground shadow-sm')}>
      {children}
      {onClose && <X className="size-3.5 opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); onClose(); }} />}
    </div>
  );
}

function Toolbar({ q, setQ, label, onNew }) {
  const t = useT();
  return (
    <div className="mb-6 flex gap-3">
      <div className="relative max-w-md flex-1">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder={t('Suchen …')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {onNew && <Button onClick={onNew}><Plus className="size-4" />{label}</Button>}
    </div>
  );
}

const Empty = ({ children }) => <p className="mt-16 text-center text-sm text-muted-foreground">{children}</p>;

function HostsView({ dark, connect, openSftp, openForm, openHost, toast, rev }) {
  const t = useT();
  const { vault, writable, vaults } = useVault();
  const [hosts, setHosts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [q, setQ] = useState('');
  const [current, setCurrent] = useState(null); // Gruppenname oder null (oberste Ebene)
  const [importOpen, setImportOpen] = useState(false);
  const load = useCallback(() => { api.hosts.list().then((l) => setHosts(l.filter((h) => inV(h, vault)))); api.groups.list().then((l) => setGroups(l.filter((g) => inV(g, vault)))); }, [vault]);
  useEffect(() => { load(); }, [load, rev]);
  useEffect(() => setCurrent(null), [vault]);

  const edit = async (h = { port: 22, group: current ?? '', vault }) => {
    const values = h.id ? { ...h, ...(await api.hosts.get(h.id)) } : h;
    openHost({
      values, groups: await api.groups.list(), keys: await api.keys.list(), vaults,
      onSave: async (o) => { const id = await api.hosts.save(o); load(); return id; },
      onConnect: connect,
      onDelete: async (id) => { await api.hosts.remove(id); load(); },
    });
  };
  const newGroup = () => openForm({
    title: t('Neue Gruppe'), fields: [{ name: 'name', label: t('Name'), required: true }],
    onSubmit: async (v) => { const err = await api.groups.create(v.name, vault); err ? toast(err) : load(); },
  });
  const renameGroup = (g) => openForm({
    title: t('Gruppe umbenennen'), values: g, fields: [{ name: 'name', label: t('Name'), required: true }],
    onSubmit: async (v) => {
      const err = await api.groups.rename(g.id, v.name);
      if (err) return toast(err);
      if (current === g.name) setCurrent(v.name.trim());
      load();
    },
  });
  const removeGroup = async (g) => {
    if (!confirm(t('Gruppe „{name}“ löschen? Die Hosts bleiben erhalten.', { name: g.name }))) return;
    await api.groups.remove(g.id);
    if (current === g.name) setCurrent(null);
    load();
  };

  // Klonen / in einen anderen Tresor klonen oder verschieben
  const copyTo = async (h, target, move) => {
    const r = await api.hosts.copy(h.id, target, move, !move && target === vault ? `${h.name} (${t('Kopie')})` : undefined);
    if (r.error) return toast(r.error);
    toast((move ? t('Host verschoben.') : t('Host geklont.')) + (r.keyDropped ? ` ${t('Der Schlüssel gehört zu seinem Tresor und wurde nicht mitgenommen.')}` : ''));
    load();
  };
  const hostMenu = (h) => {
    const others = vaults.filter((x) => x.id !== vault);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label={t('Mehr')} onClick={(e) => e.stopPropagation()}><Ellipsis className="size-3.5" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {writable && <DropdownMenuItem onSelect={() => copyTo(h, vault, false)}><Copy className="size-4" />{t('Klonen')}</DropdownMenuItem>}
          {others.length > 0 && <>
            {writable && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs text-muted-foreground">{t('In Tresor klonen')}</DropdownMenuLabel>
            {others.map((x) => <DropdownMenuItem key={`c${x.id}`} onSelect={() => copyTo(h, x.id, false)}>{x.id === 'personal' ? <User className="size-4" /> : <Users className="size-4" />}{x.name}</DropdownMenuItem>)}
            {writable && <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">{t('In Tresor verschieben')}</DropdownMenuLabel>
              {others.map((x) => <DropdownMenuItem key={`m${x.id}`} onSelect={() => copyTo(h, x.id, true)}>{x.id === 'personal' ? <User className="size-4" /> : <Users className="size-4" />}{x.name}</DropdownMenuItem>)}
            </>}
          </>}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };
  const hostCard = (h) => (
    <Item key={h.id} dark={dark} icon={<HostIcon slug={h.icon || h.autoIcon} />} sub={`${h.user}@${h.host}:${h.port}`}
      title={<span className="flex items-center gap-2">{h.name}{(h.tags || []).slice(0, 2).map((tg) => <Badge key={tg} variant="secondary" className="px-1.5 py-0 text-xs">{tg}</Badge>)}</span>}
      onClick={() => connect(h)}
      actions={<><IconButton label="SFTP" onClick={() => openSftp(h)}><FolderOpen className="size-3.5" /></IconButton>
        {(writable || vaults.some((x) => x.id !== vault)) && hostMenu(h)}
        {writable && <><IconButton label={t('Bearbeiten')} onClick={() => edit(h)}><Pencil className="size-3.5" /></IconButton>
        <IconButton label={t('Löschen')} onClick={async () => { await api.hosts.remove(h.id); load(); }}><Trash2 className="size-3.5" /></IconButton></>}</>} />
  );
  const grid = (kids) => <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">{kids}</div>;
  const heading = (text) => <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{text}</h3>;

  const searching = q.trim() !== '';
  const found = hosts.filter((h) => matches(q, h.name, h.host, h.user, h.group, (h.tags || []).join(' ')));
  const inGroup = hosts.filter((h) => h.group === current);
  const ungrouped = hosts.filter((h) => !h.group || !groups.some((g) => g.name === h.group));

  return (
    <>
      <div className="mb-6 flex gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('Suchen …')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {writable && <>
        <Button variant="outline" onClick={() => setImportOpen(true)}><Download className="size-4" />{t('Importieren')}</Button>
        <Button variant="outline" onClick={newGroup}><FolderPlus className="size-4" />{t('Neue Gruppe')}</Button>
        <Button onClick={() => edit()}><Plus className="size-4" />{t('Neuer Host')}</Button></>}
      </div>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onDone={load} toast={toast} vault={vault} />
      {searching ? (
        <>{!found.length && <Empty>{t('Keine Treffer.')}</Empty>}{grid(found.map(hostCard))}</>
      ) : current !== null ? (
        <>
          <button className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onClick={() => setCurrent(null)}>
            <ChevronLeft className="size-4" />{t('Alle Hosts')}<span className="mx-1">/</span><span className="font-medium text-foreground">{current}</span>
          </button>
          {!inGroup.length && <Empty>{t('Diese Gruppe ist leer. Weise einem Host über „Bearbeiten“ diese Gruppe zu.')}</Empty>}
          {grid(inGroup.map(hostCard))}
        </>
      ) : (
        <>
          {groups.length > 0 && (
            <section className="mb-8">
              {heading(t('Gruppen'))}
              {grid(groups.map((g) => {
                const n = hosts.filter((h) => h.group === g.name).length;
                return (
                  <Item key={g.id} dark={dark} icon={<Folder className="size-5 text-primary" />} title={g.name} sub={t('{n} Server', { n })}
                    onClick={() => setCurrent(g.name)}
                    actions={writable && <><IconButton label={t('Umbenennen')} onClick={() => renameGroup(g)}><Pencil className="size-3.5" /></IconButton>
                      <IconButton label={t('Gruppe löschen')} onClick={() => removeGroup(g)}><Trash2 className="size-3.5" /></IconButton></>} />
                );
              }))}
            </section>
          )}
          {!hosts.length && !groups.length && <Empty>{t('Keine Hosts. Mit „Neuer Host“ anlegen.')}</Empty>}
          {ungrouped.length > 0 && <section>{heading(groups.length ? t('Ohne Gruppe') : t('Hosts'))}{grid(ungrouped.map(hostCard))}</section>}
        </>
      )}
    </>
  );
}

// Zensur-Schalter (Known Hosts, Schlüssel): standardmäßig an, Wahl wird gespeichert
function useCensor() {
  const [on, setOn] = useState(() => { try { return localStorage.getItem('censor') !== '0'; } catch { return true; } });
  const toggle = () => { const v = !on; setOn(v); try { localStorage.setItem('censor', v ? '1' : '0'); } catch { /* egal */ } };
  return [on, toggle];
}
function CensorButton({ on, toggle }) {
  const t = useT();
  return (
    <IconButton label={on ? t('Angaben anzeigen') : t('Angaben verbergen')} onClick={toggle}>
      {on ? <EyeOff className="size-4 text-muted-foreground" /> : <Eye className="size-4" />}
    </IconButton>
  );
}

function KeychainView({ dark, openForm, toast }) {
  const t = useT();
  const { vault, writable, vaults } = useVault();
  const [kc, setKc] = useState(null); // Cloud-Schlüsselbund-Status
  useEffect(() => { if (vault === 'personal') api.kc.status().then(setKc).catch(() => {}); }, [vault]);
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [censor, toggleCensor] = useCensor();
  const [layout, setLayoutState] = useState(() => { try { return localStorage.getItem('keyLayout') || 'grid'; } catch { return 'grid'; } });
  const setLayout = (v) => { setLayoutState(v); try { localStorage.setItem('keyLayout', v); } catch { /* egal */ } };
  const load = useCallback(() => api.keys.list().then((l) => setItems(l.filter((k) => inV(k, vault)))), [vault]);
  useEffect(() => { load(); }, [load]);

  const rename = (k) => openForm({
    title: t('Schlüssel umbenennen'), values: { name: k.name }, fields: [{ name: 'name', label: t('Name'), required: true }],
    onSubmit: async (v) => { await api.keys.rename(k.id, v.name); load(); },
  });
  const generate = () => openForm({
    title: t('Schlüssel generieren'), description: t('Erzeugt ein neues Schlüsselpaar. Der private Teil wird verschlüsselt gespeichert.'),
    values: { type: 'ed25519' }, submitLabel: t('Generieren'),
    fields: [
      { name: 'name', label: t('Name'), required: true },
      { name: 'type', label: t('Typ'), options: [['ed25519', t('ED25519 (empfohlen)')], ['rsa', 'RSA 4096'], ['ecdsa', 'ECDSA 256']] },
      { name: 'comment', label: t('Kommentar (optional)') },
      { name: 'passphrase', label: t('Passphrase (optional)'), type: 'password' },
    ],
    onSubmit: async (v) => { const err = await api.keys.generate({ ...v, vault }); err ? toast(err) : load(); },
  });
  // In einen anderen Tresor klonen/verschieben; im Team ist auch der private Teil für alle Mitglieder sichtbar
  const copyKey = async (k, target, move) => {
    if (target !== 'personal' && !confirm(t('Der private Schlüssel ist danach für alle Mitglieder des Teams sichtbar. Fortfahren?'))) return;
    const r = await api.keys.copy(k.id, target, move);
    if (r.error) return toast(r.error);
    toast(move ? t('Schlüssel verschoben.') : t('Schlüssel geklont.'));
    load();
  };
  const toggleCloud = async (k) => {
    const r = await api.kc.setKey(k.id, !k.cloud);
    if (r.error) return toast(r.error);
    toast(k.cloud ? t('Schlüssel aus der Cloud entfernt.') : t('Schlüssel in der Cloud gespeichert.'));
    load();
  };
  const keyMenu = (k) => {
    const others = vaults.filter((x) => x.id !== vault);
    const cloudOk = vault === 'personal' && kc?.enabled && writable;
    if (!others.length && !cloudOk) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label={t('Mehr')} onClick={(e) => e.stopPropagation()}><Ellipsis className="size-3.5" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {cloudOk && <DropdownMenuItem onSelect={() => toggleCloud(k)}><Cloud className="size-4" />{k.cloud ? t('Aus der Cloud entfernen') : t('In der Cloud speichern')}</DropdownMenuItem>}
          {cloudOk && others.length > 0 && <DropdownMenuSeparator />}
          {others.length > 0 && <DropdownMenuLabel className="text-xs text-muted-foreground">{t('In Tresor klonen')}</DropdownMenuLabel>}
          {others.map((x) => <DropdownMenuItem key={`c${x.id}`} onSelect={() => copyKey(k, x.id, false)}>{x.id === 'personal' ? <User className="size-4" /> : <Users className="size-4" />}{x.name}</DropdownMenuItem>)}
          {others.length > 0 && writable && !k.path && <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">{t('In Tresor verschieben')}</DropdownMenuLabel>
            {others.map((x) => <DropdownMenuItem key={`m${x.id}`} onSelect={() => copyKey(k, x.id, true)}>{x.id === 'personal' ? <User className="size-4" /> : <Users className="size-4" />}{x.name}</DropdownMenuItem>)}
          </>}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };
  const rescan = async () => { const n = await api.keys.rescan(); toast(n ? t('{n} neue(r) Schlüssel aus ~/.ssh importiert.', { n }) : t('Keine neuen Schlüssel in ~/.ssh.')); load(); };
  const toHost = async (k) => openForm({
    title: t('Auf Host exportieren'), description: t('Trägt den öffentlichen Schlüssel „{name}“ in ~/.ssh/authorized_keys ein.', { name: k.name }), submitLabel: t('Exportieren'),
    fields: [{ name: 'hostId', label: t('Host'), options: (await api.hosts.list()).map((h) => [h.id, `${h.name} (${h.user}@${h.host})`]) }],
    onSubmit: async (v) => { const err = await api.keys.toHost(k.id, v.hostId); toast(err || t('Schlüssel auf dem Host eingetragen.')); },
  });
  const passphrase = (k) => openForm({
    title: t('Passphrase für „{name}“', { name: k.name }), description: t('Wird verschlüsselt gespeichert und beim Verbinden verwendet.'), fields: [{ name: 'p', label: t('Passphrase'), type: 'password' }],
    onSubmit: async (v) => { await api.keys.setPassphrase(k.id, v.p); load(); },
  });
  const copy = async (k) => { await navigator.clipboard.writeText(k.publicKey); toast(t('Öffentlicher Schlüssel kopiert.')); };
  const list = items.filter((k) => matches(q, k.name, k.type, k.fingerprint));
  const short = (fp) => (fp ? (censor ? maskFingerprint(fp) : fp.slice(0, 22) + '…') : t('ohne öffentlichen Teil'));
  return (
    <>
      {/* Werkzeugleiste: geteilter „Neuer Schlüssel“-Knopf, Einlesen, Suche, Ansicht */}
      <div className="mb-8 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        {writable && <div className="flex">
          <Button className="rounded-e-none" onClick={generate}><Plus className="size-4" />{t('Neuer Schlüssel')}</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="rounded-s-none border-s border-primary-foreground/25 px-2" aria-label={t('Neuer Schlüssel')}><ChevronDown className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={generate}><Plus className="size-4" />{t('Schlüssel generieren')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setImportOpen(true)}><FileUp className="size-4" />{t('Schlüssel importieren')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>}
        {vault === 'personal' && <Button variant="ghost" onClick={rescan}><RefreshCw className="size-4" />{t('~/.ssh einlesen')}</Button>}
        <div className="ms-auto flex items-center gap-1">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 w-56 ps-9" placeholder={t('Suchen …')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <CensorButton on={censor} toggle={toggleCensor} />
          <IconButton label={t('Rasteransicht')} onClick={() => setLayout('grid')}><LayoutGrid className={cn('size-4', layout === 'grid' ? 'text-foreground' : 'text-muted-foreground')} /></IconButton>
          <IconButton label={t('Listenansicht')} onClick={() => setLayout('list')}><List className={cn('size-4', layout === 'list' ? 'text-foreground' : 'text-muted-foreground')} /></IconButton>
        </div>
      </div>
      <KeyImportSheet open={importOpen} onClose={() => setImportOpen(false)} onDone={load} toast={toast} vault={vault} />
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('Schlüssel')}</h3>
      {!list.length && <Empty>{t('Keine Schlüssel. Generiere einen oder lege Schlüssel in ~/.ssh ab.')}</Empty>}
      <div className={layout === 'grid' ? 'grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3' : 'space-y-2'}>
        {list.map((k) => (
          <Item key={k.id} dark={dark} compact icon={<KeyRound className="size-5" />}
            title={<span className="flex items-center gap-2">{k.name}<Badge variant="secondary">{k.source === 'generated' ? t('generiert') : t('importiert')}</Badge>{k.cloud && <Badge variant="outline"><Cloud className="me-1 size-3" />Cloud</Badge>}{k.publicOnly && <Badge variant="outline">{t('nur öffentlich')}</Badge>}{k.encrypted && <Lock className="size-3 text-muted-foreground" />}</span>}
            sub={`${k.type} · ${short(k.fingerprint)}`}
            onClick={() => k.publicKey && copy(k)}
            actions={<>
              {keyMenu(k)}
              {writable && k.encrypted && <IconButton label={t('Passphrase setzen')} onClick={() => passphrase(k)}><Lock className="size-3.5" /></IconButton>}
              {k.publicKey && <IconButton label={t('Öffentlichen Schlüssel kopieren')} onClick={() => copy(k)}><Copy className="size-3.5" /></IconButton>}
              {k.publicKey && <IconButton label={t('Auf Host exportieren')} onClick={() => toHost(k)}><Send className="size-3.5" /></IconButton>}
              {writable && <IconButton label={t('Schlüssel umbenennen')} onClick={() => rename(k)}><Pencil className="size-3.5" /></IconButton>}
              {!k.publicOnly && <IconButton label={t('Privaten Schlüssel speichern')} onClick={async () => { const err = await api.keys.exportPrivate(k.id); err && toast(err); }}><Download className="size-3.5" /></IconButton>}
              {writable && k.source !== 'imported' && <IconButton label={t('Löschen')} onClick={async () => { await api.keys.remove(k.id); load(); }}><Trash2 className="size-3.5" /></IconButton>}
            </>} />
        ))}
      </div>
    </>
  );
}

// Bekannte Server-Schlüssel (Known Hosts): verwalten, aus ~/.ssh/known_hosts importieren
function KnownHostsView({ dark, toast, rev }) {
  const t = useT();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [censor, toggleCensor] = useCensor();
  const load = useCallback(() => api.known.list().then(setItems), []);
  useEffect(() => { load(); }, [load, rev]);
  const importFile = async () => {
    const r = await api.known.import();
    toast(r.added ? t('{n} Einträge importiert.', { n: r.added }) : t('Keine neuen Einträge in ~/.ssh/known_hosts.'));
    load();
  };
  const copy = async (e) => { await navigator.clipboard.writeText(e.fingerprint); toast(t('Fingerabdruck kopiert.')); };
  const list = items.filter((e) => matches(q, e.host, e.type, e.fingerprint));
  return (
    <>
      <div className="mb-6 flex gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('Suchen …')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant="outline" onClick={importFile}><Download className="size-4" />{t('~/.ssh/known_hosts importieren')}</Button>
        <CensorButton on={censor} toggle={toggleCensor} />
      </div>
      {!list.length && <Empty>{items.length ? t('Keine Treffer.') : t('Noch keine bekannten Hosts. Sie werden beim ersten Verbinden gespeichert.')}</Empty>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4">
        {list.map((e) => (
          <Item key={e.id} dark={dark} icon={<Fingerprint />} title={`${censor ? maskHost(e.host) : e.host}${e.port === 22 ? '' : `:${e.port}`}`}
            sub={`${e.type} · ${censor ? maskFingerprint(e.fingerprint) : e.fingerprint}`} onClick={() => copy(e)}
            actions={<><IconButton label={t('Fingerabdruck kopieren')} onClick={() => copy(e)}><Copy className="size-3.5" /></IconButton>
              <IconButton label={t('Host vergessen')} onClick={async () => { await api.known.remove(e.id); load(); }}><Trash2 className="size-3.5" /></IconButton></>} />
        ))}
      </div>
    </>
  );
}

// Konto-Status; Anmelden passiert im Login-Bildschirm
function SyncView({ st, onLogin, onLogout }) {
  const t = useT();
  const lang = useLang();
  if (!st.configured) {
    return (
      <div className="flex max-w-2xl items-start gap-4 rounded-xl border bg-card p-5">
        <CloudOff className="mt-0.5 size-6 text-muted-foreground" />
        <div className="flex-1">
          <p className="font-medium">{t('Nicht angemeldet')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('Ohne Konto bleiben deine Daten nur auf diesem Gerät.')}</p>
          <Button className="mt-4" onClick={onLogin}>{t('Anmelden')}</Button>
        </div>
      </div>
    );
  }
  const when = st.lastSync ? new Date(st.lastSync).toLocaleString(lang) : t('noch nie');
  const label = { off: t('Nicht verbunden'), syncing: t('Synchronisiere …'), ok: t('Synchronisiert'), error: t('Fehler') }[st.status];
  return (
    <div className="max-w-2xl rounded-xl border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className={cn('grid size-10 place-items-center rounded-lg bg-secondary', st.status === 'error' && 'text-destructive', st.status === 'ok' && 'text-success')}>
          {st.status === 'syncing' ? <RefreshCw className="size-5 animate-spin" /> : st.status === 'error' ? <CloudOff className="size-5" /> : <Check className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{label}</p>
          <p className="truncate text-sm text-muted-foreground">{t('{email} · zuletzt {when}', { email: st.email, when })}</p>
          <p className="truncate text-xs text-muted-foreground">{st.server}</p>
        </div>
        <Button variant="outline" onClick={() => api.sync.now()} disabled={st.status === 'syncing'}><RefreshCw className="size-4" />{t('Jetzt synchronisieren')}</Button>
      </div>
      {st.error && <p className="mt-3 text-sm text-destructive">{t(st.error)}</p>}
      <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">{t('Gesynct werden Hosts (mit Passwörtern), Gruppen, Snippets und Forwarding-Regeln – Ende-zu-Ende verschlüsselt. Private Schlüssel bleiben auf dem Gerät. Der Abgleich läuft automatisch.')}</p>
      <div className="mt-3 flex justify-end">
        <Button variant="ghost" className="text-destructive" onClick={() => { if (confirm(t('Abmelden? Die lokalen Daten bleiben erhalten, der Sync stoppt auf diesem Gerät.'))) { api.sync.logout(); onLogout(); } }}>{t('Abmelden')}</Button>
      </div>
    </div>
  );
}

// Tor: Sync und/oder Server-Verbindungen über einen lokalen SOCKS5-Proxy (Einstellungen liegen pro Gerät im Hauptprozess)
function TorSettings() {
  const t = useT();
  const [c, setC] = useState({ sync: false, servers: false, host: '127.0.0.1', port: 9050 });
  const [res, setRes] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.settings.get().then((s) => s.tor && setC((o) => ({ ...o, ...s.tor }))); }, []);
  const save = (patch) => { const n = { ...c, ...patch }; setC(n); setRes(null); api.settings.set({ tor: n }); };
  const test = async () => {
    setBusy(true); setRes(null);
    const r = await api.tor.test();
    setBusy(false);
    setRes(r.state === 'ok' ? { ok: true, text: t('Tor-Verbindung funktioniert. Ausgangs-IP: {ip}', { ip: r.ip }) }
      : { text: r.state === 'notor' ? t('Der Proxy antwortet, aber die Verbindung läuft nicht über Tor.') : t('Tor-Proxy nicht erreichbar. Läuft Tor unter {address}?', { address: `${c.host}:${c.port}` }) });
  };
  const row = 'flex items-center justify-between gap-4 rounded-xl border bg-card p-4';
  return (
    <>
      <div className={row}>
        <div><p className="text-sm font-medium">{t('Cloud-Sync über Tor')}</p><p className="text-xs text-muted-foreground">{t('Verbindungen zum Sync-Server laufen über das Tor-Netzwerk; deine echte IP-Adresse bleibt verborgen.')}</p></div>
        <Switch checked={c.sync} onCheckedChange={(v) => save({ sync: v })} />
      </div>
      <div className={row}>
        <div><p className="text-sm font-medium">{t('Server über Tor')}</p><p className="text-xs text-muted-foreground">{t('SSH-, SFTP- und Forwarding-Verbindungen zu deinen Hosts laufen über Tor.')}</p></div>
        <Switch checked={c.servers} onCheckedChange={(v) => save({ servers: v })} />
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <p className="text-sm font-medium">{t('Tor-Proxy (SOCKS5)')}</p>
        <div className="flex gap-2" dir="ltr">
          <Input className="flex-1 font-mono" aria-label={t('Adresse')} value={c.host} onChange={(e) => save({ host: e.target.value })} />
          <Input className="w-24 font-mono" type="number" min="1" max="65535" aria-label={t('Port')} value={c.port} onChange={(e) => save({ port: +e.target.value })} />
          <Button variant="outline" onClick={test} disabled={busy}>{busy ? t('Bitte warten …') : t('Verbindung testen')}</Button>
        </div>
        {res && <p className={cn('text-sm', res.ok ? 'text-success' : 'text-destructive')}>{res.text}</p>}
        <p className="text-xs text-muted-foreground">{t('Tor muss lokal laufen (Linux: „sudo apt install tor“, Port 9050; der Tor Browser nutzt 9150). Adressen im lokalen Netz, etwa 192.168.x.x, verbinden direkt, weil Tor sie nicht erreicht. Fällt Tor aus, schlägt die Verbindung fehl – es gibt keinen Rückfall auf eine direkte Verbindung. Gilt für neue Verbindungen.')}</p>
      </div>
    </>
  );
}

const SETTINGS_TABS = [
  ['account', T('Konto & Sync'), User],
  ['appearance', T('Darstellung'), Palette],
  ['language', T('Sprache'), Languages],
  ['privacy', T('Datenschutz'), ShieldCheck],
  ['keychain', T('Cloud-Schlüsselbund'), KeyRound],
  ['teams', T('Teams'), Users],
  ['updates', T('Updates'), Download],
  ['files', T('Dateien öffnen'), FileText],
];

// Update-Einstellungen: Version, Prüfen, automatisch prüfen, Quelle, Installieren
function UpdatesSettings() {
  const t = useT();
  const [s, setS] = useState({ auto: true, repo: '', channel: 'stable' });
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [err, setErr] = useState('');
  const check = useCallback(async () => { setBusy(true); setErr(''); const r = await api.update.check(); setBusy(false); setRes(r); if (r.error) setErr(r.error); }, []);
  useEffect(() => { api.settings.get().then((x) => setS({ auto: x.updates?.auto !== false, repo: x.updates?.repo || '', channel: x.updates?.channel === 'dev' ? 'dev' : 'stable' })).then(check); }, [check]);
  const save = (p) => { const n = { ...s, ...p }; setS(n); api.settings.set({ updates: n }); };
  const [rel, setRel] = useState({ list: [], pick: '' }); // Versionswahl, auch ältere
  useEffect(() => { api.update.list().then((r) => r.list && setRel({ list: r.list, pick: '' })); }, []);
  const install = async (v) => { setInstalling(true); setErr(''); const r = await api.update.install(v); if (r.error) { setInstalling(false); setErr(r.error); } };
  const row = 'flex items-center justify-between gap-4 rounded-xl border bg-card p-4';
  return (
    <div className="max-w-xl space-y-3">
      <div className={row}>
        <div><p className="text-sm font-medium">{res?.current ? t('Version {v}', { v: res.current }) : 'SSH Deck'}</p>
          <p className={cn('text-xs', err ? 'text-destructive' : 'text-muted-foreground')}>
            {busy ? t('Suche läuft …') : installing ? t('Update wird installiert …') : err ? t(err) : res?.available ? t('Version {v} ist verfügbar.', { v: res.latest }) : res?.latest ? t('Du hast die neueste Version.') : ''}
          </p></div>
        <Button variant="outline" disabled={busy || installing} onClick={check}><RefreshCw className={cn('size-4', busy && 'animate-spin')} />{t('Jetzt prüfen')}</Button>
      </div>
      {res?.available && (
        <div className={cn(row, 'flex-col items-stretch')}>
          {res.notes && <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{res.notes}</pre>}
          {res.canInstall
            ? <Button disabled={installing} onClick={() => install()}>{installing ? t('Update wird installiert …') : t('Installieren und neu starten')}</Button>
            : <Button onClick={() => api.update.openPage()}>{t('Release-Seite öffnen')}</Button>}
        </div>
      )}
      <div className={row}>
        <p className="text-sm font-medium">{t('Automatisch nach Updates suchen')}</p>
        <Switch checked={s.auto} onCheckedChange={(v) => save({ auto: v })} />
      </div>
      {rel.list.length > 0 && (
        <div className={cn(row, 'flex-col items-stretch')}>
          <p className="text-sm font-medium">{t('Andere Version installieren (auch ältere)')}</p>
          <div className="flex gap-2">
            <select value={rel.pick} onChange={(e) => setRel({ ...rel, pick: e.target.value })} className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm">
              <option value="" />
              {rel.list.map((r) => <option key={r.version} value={r.version}>{r.version}{r.version === res?.current ? ' ✓' : ''}</option>)}
            </select>
            <Button disabled={!rel.pick || rel.pick === res?.current || installing} onClick={() => (res?.canInstall ? install(rel.pick) : api.update.openPage(rel.pick))}>
              {res?.canInstall ? t('Installieren und neu starten') : t('Release-Seite öffnen')}
            </Button>
          </div>
        </div>
      )}
      <div className={cn(row, 'flex-col items-stretch')}>
        <p className="text-sm font-medium">{t('Update-Kanal')}</p>
        <div className="grid grid-cols-2 rounded-lg bg-muted p-1 text-sm">
          {[['stable', t('Stabil')], ['dev', t('Dev (Vorabversionen)')]].map(([v, l]) => (
            <button key={v} type="button" onClick={() => { save({ channel: v }); setTimeout(check, 50); }}
              className={cn('rounded-md px-3 py-1.5', s.channel === v ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}>{l}</button>
          ))}
        </div>
        {s.channel === 'dev' && <p className="text-xs text-muted-foreground">{t('Dev-Versionen erscheinen bei jedem Push und können Fehler enthalten.')}</p>}
      </div>
      <div className={cn(row, 'flex-col items-stretch')}>
        <p className="text-sm font-medium">{t('Update-Quelle (GitHub: Besitzer/Repository)')}</p>
        <Input value={s.repo} placeholder="HyperGaming99/ssh-deck" autoComplete="off" onChange={(e) => save({ repo: e.target.value.trim() })} />
      </div>
    </div>
  );
}

// Tresor-Auswahl in der Kopfzeile: Persönlich oder eines der Teams
function VaultSwitcher({ vaults, vault, setVault, signedIn, onNew, onManage }) {
  const t = useT();
  const cur = vaults.find((x) => x.id === vault) || vaults[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-transparent bg-accent/60 px-3 text-sm hover:bg-accent">
          {cur.id === 'personal' ? <User className="size-4 text-muted-foreground" /> : <Users className="size-4 text-primary" />}
          <span className="max-w-32 truncate">{cur.name}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        {vaults.map((x) => (
          <DropdownMenuItem key={x.id} onSelect={() => setVault(x.id)}>
            {x.id === 'personal' ? <User className="size-4" /> : <Users className="size-4" />}
            <span className="flex-1 truncate">{x.name}</span>
            {x.role === 'viewer' && <span className="text-xs text-muted-foreground">{t('Betrachter')}</span>}
            {x.id === vault && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <div className="my-1 h-px bg-border" />
        {signedIn ? <DropdownMenuItem onSelect={onNew}><Plus className="size-4" />{t('Neues Team …')}</DropdownMenuItem>
          : <p className="px-2 py-1.5 text-xs text-muted-foreground">{t('Melde dich an, um Teams zu nutzen.')}</p>}
        <DropdownMenuItem onSelect={onManage}><SettingsIcon className="size-4" />{t('Teams verwalten')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Hinweisleiste unter der Kopfzeile, wenn eine neue Version bereitsteht
function UpdateBanner({ upd, onClose }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3 border-b bg-primary/10 px-4 py-2 text-sm">
      <Download className="size-4 text-primary" />
      <span className="flex-1">{t('Version {v} ist verfügbar.', { v: upd.latest })}</span>
      <Button size="sm" disabled={busy} onClick={() => (upd.canInstall ? (setBusy(true), api.update.install().then((r) => r.error && setBusy(false))) : api.update.openPage())}>
        {busy ? t('Update wird installiert …') : upd.canInstall ? t('Installieren und neu starten') : t('Release-Seite öffnen')}
      </Button>
      <Button size="sm" variant="ghost" onClick={onClose}>{t('Später')}</Button>
    </div>
  );
}

// Animationen (Glow, Übergänge) an/aus: Merkmal am <html>, das CSS blendet alles aus; liegt in localStorage
const getAnim = () => { try { return localStorage.getItem('anim') || 'on'; } catch { return 'on'; } };
const applyAnim = (v) => { document.documentElement.dataset.anim = v; try { localStorage.setItem('anim', v); } catch { /* egal */ } };
applyAnim(getAnim());

// Einstellungen mit eigener Seitenleiste (links Kategorien, rechts Inhalt)
function SettingsView({ st, dark, setDark, side, setSide, onLogin, onLogout, lang, setLang, settingsTab, teams, refreshTeams, vault, setVault, toast }) {
  const t = useT();
  const [tab, setTab] = useState(settingsTab || 'account');
  useEffect(() => { if (settingsTab) setTab(settingsTab); }, [settingsTab]);
  const [editors, setEditors] = useState([]);
  const [editor, setEditor] = useState('auto');
  useEffect(() => { api.editors.list().then(setEditors); api.settings.get().then((s) => setEditor(s.editor || 'auto')); }, []);
  const [paste, setPasteState] = useState(getPaste);
  const pickPaste = (v) => { setPasteState(v); setPaste(v); };
  const [anim, setAnim] = useState(getAnim);
  const pickAnim = (v) => { setAnim(v); applyAnim(v); };
  const pickEditor = (v) => { setEditor(v); api.settings.set({ editor: v }); };
  const row = 'flex items-center justify-between gap-4 rounded-xl border bg-card p-4';
  const seg = (opts, value, onChange) => (
    <div className={cn('grid rounded-lg bg-muted p-1 text-sm', opts.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      {opts.map(([v, l, Icon]) => (
        <button key={l} onClick={() => onChange(v)} className={cn('flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5', value === v ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}>
          {Icon && <Icon className="size-3.5" />}{l}
        </button>
      ))}
    </div>
  );
  return (
    <div className="flex gap-8">
      <aside className="w-48 shrink-0 space-y-1">
        {SETTINGS_TABS.map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn('relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent', tab === id && 'bg-accent text-foreground')}>
            {tab === id && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />}
            <Icon className="size-4" />{t(label)}
          </button>
        ))}
      </aside>
      <div className="min-w-0 max-w-2xl flex-1 space-y-3">
        {tab === 'account' && <SyncView st={st} onLogin={onLogin} onLogout={onLogout} />}
        {tab === 'appearance' && (
          <>
            <div className={row}>
              <div><p className="text-sm font-medium">{t('Design')}</p><p className="text-xs text-muted-foreground">{t('Hell oder dunkel')}</p></div>
              {seg([[false, t('Hell'), Sun], [true, t('Dunkel'), Moon]], dark, setDark)}
            </div>
            <div className={row}>
              <div><p className="text-sm font-medium">{t('Seitenleiste')}</p><p className="text-xs text-muted-foreground">{t('Stil der linken Navigation')}</p></div>
              {seg([['compact', t('Kompakt')], ['wide', t('Breit')], ['float', t('Schwebend')]], side, setSide)}
            </div>
            <div className={row}>
              <div><p className="text-sm font-medium">{t('Animationen')}</p><p className="text-xs text-muted-foreground">{t('Glow bei Hosts und Gruppen sowie Übergänge')}</p></div>
              {seg([['on', t('An')], ['off', t('Aus')]], anim, pickAnim)}
            </div>
            <div className={row}>
              <div><p className="text-sm font-medium">{t('Einfügen im Terminal')}</p><p className="text-xs text-muted-foreground">{t('Strg+V und Rechtsklick fügen die Zwischenablage ein')}</p></div>
              {seg([['ask', t('Nachfragen')], ['on', t('Erlauben')], ['off', t('Aus')]], paste, pickPaste)}
            </div>
          </>
        )}
        {tab === 'language' && (
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm font-medium">{t('Sprache der Oberfläche')}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3" dir="ltr">
              {LANGS.map(({ code, name, Flag }) => (
                <button key={code} onClick={() => setLang(code)}
                  className={cn('flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-start text-sm transition-colors hover:bg-accent', lang === code && 'border-primary bg-accent')}>
                  <Flag className="h-4 w-6 shrink-0 rounded-[3px] shadow-sm" />
                  <span className="truncate">{name}</span>
                  {lang === code && <Check className="ms-auto size-4 text-primary" />}
                </button>
              ))}
            </div>
          </div>
        )}
        {tab === 'privacy' && <TorSettings />}
        {tab === 'keychain' && <KeychainCloud st={st} toast={toast} goAccount={() => setTab('account')} />}
        {tab === 'teams' && <TeamsSettings st={st} teams={teams} refresh={refreshTeams} vault={vault} setVault={setVault} toast={toast} goAccount={() => setTab('account')} />}
        {tab === 'updates' && <UpdatesSettings />}
        {tab === 'files' && (
          <div className={row}>
            <div><p className="text-sm font-medium">{t('Standard-Editor')}</p><p className="text-xs text-muted-foreground">{t('Für „Öffnen“ und Doppelklick auf Dateien im SFTP')}</p></div>
            <Select value={editor} onValueChange={pickEditor}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t('Automatisch (VS Code, sonst System)')}</SelectItem>
                {editors.map((e) => <SelectItem key={e.cmd} value={e.cmd}>{e.name}</SelectItem>)}
                <SelectItem value="system">{t('Systemstandard')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}

function SnippetsView({ dark, runSnippet, openForm, rev }) {
  const t = useT();
  const { vault, writable } = useVault();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const load = useCallback(() => api.snippets.list().then((l) => setItems(l.filter((x) => inV(x, vault)))), [vault]);
  useEffect(() => { load(); }, [load, rev]);
  const edit = (s = {}) => openForm({
    title: s.id ? t('Snippet bearbeiten') : t('Neues Snippet'), values: s, description: t('Platzhalter: {{name}} oder {{name:Standardwert}} – wird beim Ausführen abgefragt.'),
    fields: [{ name: 'name', label: t('Name'), required: true }, { name: 'cmd', label: t('Befehl'), required: true }],
    onSubmit: async (v) => { await api.snippets.save({ ...v, id: s.id, vault: s.vault ?? vault }); load(); },
  });
  const list = items.filter((s) => matches(q, s.name, s.cmd));
  return (
    <>
      <Toolbar q={q} setQ={setQ} label={t('Neues Snippet')} onNew={writable ? () => edit() : null} />
      {!list.length && <Empty>{t('Keine Snippets.')}</Empty>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        {list.map((s) => (
          <Item key={s.id} dark={dark} icon={<TermIcon className="size-5 text-muted-foreground" />} title={s.name} sub={s.cmd} onClick={() => runSnippet(s.cmd)}
            actions={writable && <><IconButton label={t('Bearbeiten')} onClick={() => edit(s)}><Pencil className="size-3.5" /></IconButton>
              <IconButton label={t('Löschen')} onClick={async () => { await api.snippets.remove(s.id); load(); }}><Trash2 className="size-3.5" /></IconButton></>} />
        ))}
      </div>
    </>
  );
}

function ForwardsView({ dark, toast, rev }) {
  const t = useT();
  const { vault, writable } = useVault();
  const [rules, setRules] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState(null);
  const load = useCallback(() => { api.fwd.list().then((l) => setRules(l.filter((r) => inV(r, vault)))); api.hosts.list().then((l) => setHosts(l.filter((h) => inV(h, vault)))); }, [vault]);
  useEffect(() => { load(); }, [load, rev]);
  const hostName = (id) => hosts.find((h) => h.id === id)?.name ?? '?';
  const open = (rule = {}) => setSheet({ rule, hosts, onSave: async (v) => { await api.fwd.save({ ...v, vault: v.vault ?? vault }); load(); } });
  const sub = (r) => r.type === 'dynamic' ? t('SOCKS5-Proxy über {host}', { host: hostName(r.hostId) })
    : r.type === 'remote' ? `${hostName(r.hostId)}:${r.bindPort} → ${r.destHost}:${r.destPort}`
    : t('→ {target} über {host}', { target: `${r.destHost}:${r.destPort}`, host: hostName(r.hostId) });
  if (!hosts.length) return <Empty>{t('Erst einen Host anlegen.')}</Empty>;
  const list = rules.filter((r) => matches(q, r.label, hostName(r.hostId), r.destHost, r.bindPort));
  return (
    <>
      <Toolbar q={q} setQ={setQ} label={t('Neues Forwarding')} onNew={writable ? () => open() : null} />
      {!list.length && <Empty>{t('Keine Regeln.')}</Empty>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {list.map((r) => (
          <Item key={r.id} dark={dark} compact title={<span className="flex items-center gap-2"><span className={cn('size-2 rounded-full', r.running ? 'bg-success shadow-[0_0_8px] shadow-success' : 'bg-border')} />{r.label || `${r.type} ${r.bindPort}`}</span>} sub={sub(r)}
            icon={<span className="text-lg font-semibold uppercase">{(r.label || r.type || '?')[0]}</span>}
            onClick={async () => { const err = await api.fwd.toggle(r.id); if (err) toast(err); load(); }}
            actions={writable && <><IconButton label={t('Bearbeiten')} onClick={() => open(r)}><Pencil className="size-3.5" /></IconButton>
              <IconButton label={t('Löschen')} onClick={async () => { await api.fwd.remove(r.id); load(); }}><Trash2 className="size-3.5" /></IconButton></>} />
        ))}
      </div>
      <ForwardSheet spec={sheet} onClose={() => setSheet(null)} />
    </>
  );
}

export default function App() {
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('dark') === '1'; } catch { return false; } });
  const [section, setSection] = useState('hosts');
  const store = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const [termTheme, setTermTheme] = useState(() => store('termTheme', 'auto'));
  const [font, setFontState] = useState(() => store('termFont', { family: FONTS[0][0], size: 14 }));
  const [panel, setPanel] = useState(() => store('termPanel', true));
  const [history, setHistory] = useState({}); // sid -> eingegebene Befehle (nur im Speicher, nie gespeichert)
  const persist = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* egal */ } };
  const setTheme = (v) => { setTermTheme(v); persist('termTheme', v); };
  const setFont = (v) => { setFontState(v); persist('termFont', v); };
  const togglePanel = () => { setPanel(!panel); persist('termPanel', !panel); };
  const xtheme = useMemo(() => resolveTheme(termTheme, dark), [termTheme, dark]);
  const onCommand = useCallback((sid, c) => setHistory((h) => ({ ...h, [sid]: [...(h[sid] || []).filter((x) => x !== c), c].slice(-100) })), []);
  const [tabs, setTabs] = useState([]); // { sid, title, closed }
  const [active, setActive] = useState('home');
  const [form, setForm] = useState(null);
  const [hostForm, setHostForm] = useState(null); // Host-Details-Panel
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
    api.onData((sid, d) => writers.get(sid)?.(d));
    api.onEdit((m) => toast(m));
    api.onHostsChanged(() => setRev((r) => r + 1));
    api.onHostKey((info) => setHostKeys((q) => [...q, info]), (id) => setHostKeys((q) => q.filter((x) => x.id !== id)));
    api.sync.status().then(setSt);
    api.sync.onStatus(setSt);
    api.onCredAsk((a) => setCredAsks((q) => [...q, a]));
    api.update.onAvailable(setUpd);
    api.onStatus((sid, conn) => setTabs((prev) => prev.map((x) => (x.sid === sid ? { ...x, conn } : x))));
    api.onClosed((sid) => setTabs((prev) => prev.map((x) => (x.sid === sid ? { ...x, closed: true } : x))));
  }, []);

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
    setSeq(seq + 1);
    setTabs((prev) => [...prev, { sid, hostId: h.id, title: kind === 'sftp' ? t('{name} · SFTP', { name: h.name }) : h.name, kind }]);
    setActive(sid);
  };
  const editHost = async (id) => setHostForm({
    values: await api.hosts.get(id), groups: await api.groups.list(), keys: await api.keys.list(), vaults: vaults.filter((x) => x.writable),
    onSave: async (o) => { const i = await api.hosts.save(o); setRev((r) => r + 1); return i; },
    onConnect: connect, onDelete: async (i) => { await api.hosts.remove(i); setRev((r) => r + 1); },
  });
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
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && readyRef.current) { e.preventDefault(); openNewTab(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  const runSnippet = (cmd) => {
    const sid = tabs.some((x) => x.sid === active) ? active : tabs.at(-1)?.sid;
    if (!sid) return toast(t('Erst ein Terminal öffnen.'));
    const vs = vars(cmd);
    if (vs.length) setForm({ title: t('Snippet ausführen'), submitLabel: t('Ausführen'), fields: vs.map((v) => ({ name: v.name, label: v.name })), values: Object.fromEntries(vs.map((v) => [v.name, v.def])), onSubmit: (v) => api.input(sid, fill(cmd, v) + '\n') });
    else api.input(sid, cmd + '\n');
    setActive(sid);
  };

  useEffect(() => { if (st) hideSplash(); }, [st]); // erst wenn der Status da ist, ist die Oberfläche bereit
  const gate = st && lang !== null && !st.configured && !skip;
  readyRef.current = !!st && lang !== null && !gate; // ohne Konto zuerst der Login-Bildschirm
  const view = { hosts: HostsView, keychain: KeychainView, known: KnownHostsView, settings: SettingsView, snippets: SnippetsView, forwards: ForwardsView }[section];
  const View = view;
  return (
    <I18nContext.Provider value={i18n}>
    <TooltipProvider delayDuration={300}>
    <VaultCtx.Provider value={vctx}>
      <div className="flex h-full flex-col">
        <header dir="ltr" className={cn('flex h-12 shrink-0 items-center gap-2 border-b bg-sidebar [-webkit-app-region:drag]', mac ? 'pl-[88px]' : 'pl-2')}>
          {gate && <Logo className="ml-2 h-6 w-[19px]" />}
          {!gate && <div className="flex min-w-0 items-center gap-1.5 [-webkit-app-region:no-drag]">
            <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setNavOpen(!navOpen)} aria-label={t('Navigation')}><Menu className="size-4" /></Button>
            <Logo className="mx-1 h-6 w-[19px] shrink-0" />
            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
              <VaultSwitcher vaults={vaults} vault={activeV.id} setVault={setVault} signedIn={!!st?.configured}
                onNew={() => setForm({ title: t('Neues Team'), fields: [{ name: 'name', label: t('Name'), required: true }], submitLabel: t('Team erstellen'), onSubmit: async (v) => { const r = await api.team.create(v.name); if (r.error) return toast(r.error); await refreshTeams(); setVault(r.id); } })}
                onManage={() => { setSection('settings'); setSettingsTab('teams'); setActive('home'); setTimeout(() => setSettingsTab(null), 0); }} />
              <Pill active={active === 'home'} onClick={() => setActive('home')}><Server className="size-4 shrink-0" />{t('Hosts')}</Pill>
              <Pill active={active === 'sftp'} onClick={() => { setSftpMounted(true); setActive('sftp'); }}><FolderOpen className="size-4 shrink-0" />SFTP</Pill>
              {tabs.map((tab) => (
                <Pill key={tab.sid} active={active === tab.sid} onClick={() => setActive(tab.sid)} onClose={() => closeTab(tab.sid)}>
                  {tab.kind === 'sftp' ? <FolderOpen className="size-4 shrink-0" /> : tab.kind === 'new' ? <Search className="size-4 shrink-0" /> : <TermIcon className="size-4 shrink-0" />}
                  <span className="truncate">{tab.kind === 'new' ? t('Neuer Tab') : tab.title}</span>{tab.closed && <span className="text-xs opacity-60">{t('(getrennt)')}</span>}
                </Pill>
              ))}
            </div>
            <IconButton label={t('Neue Verbindung')} onClick={openNewTab}><Plus className="size-4" /></IconButton>
          </div>}
          <div className="ml-auto flex h-full items-center [-webkit-app-region:no-drag]">
            {tabs.find((x) => x.sid === active && (x.kind === 'ssh' || !x.kind)) && <Button variant="ghost" size="icon" className={cn('mr-1 size-8', panel && 'text-primary')} onClick={togglePanel} aria-label={t('Seitenleiste ein-/ausblenden')}><PanelRight className="size-4" /></Button>}
            <Button variant="ghost" size="icon" className="mr-1 size-8" onClick={() => setDark(!dark)} aria-label={t('Theme wechseln')}>
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            {!mac && <>
            <button className="grid h-full w-11 place-items-center text-muted-foreground hover:bg-accent" onClick={api.win.minimize} aria-label={t('Minimieren')}><Minus className="size-4" /></button>
            <button className="grid h-full w-11 place-items-center text-muted-foreground hover:bg-accent" onClick={api.win.toggleMax} aria-label={t('Maximieren')}><Square className="size-3.5" /></button>
            <button className="grid h-full w-11 place-items-center text-muted-foreground hover:bg-destructive hover:text-white" onClick={api.win.close} aria-label={t('Schließen')}><X className="size-4" /></button>
            </>}
          </div>
        </header>

        {upd && !gate && <UpdateBanner upd={upd} onClose={() => setUpd(null)} />}
        {st === null ? <div className="flex-1" /> : lang === null ? <LanguageSetup onPick={setLang} /> : gate ? <LoginScreen status={st} dark={dark} onSkip={() => chooseSkip(true)} /> : <div className="flex min-h-0 flex-1">
        {navOpen && !termActive && (
          <nav className={cn('flex shrink-0 flex-col gap-1 py-3', side === 'wide' ? 'w-56 items-stretch border-r bg-sidebar px-3' : 'items-stretch px-2',
            side === 'compact' && 'w-[84px] border-r bg-sidebar', side === 'float' && 'm-2 mr-0 w-[92px] rounded-2xl border bg-card shadow-sm')}>
            {SECTIONS.map(([id, label, Icon]) => {
              const on = active === 'home' && section === id;
              return (
                <button key={id} style={id === 'settings' ? { marginTop: 'auto' } : undefined} onClick={() => { setSection(id); setActive('home'); }}
                  className={cn('relative flex rounded-lg text-muted-foreground transition-colors hover:bg-accent',
                    side === 'wide' ? 'flex-row items-center gap-3 px-3 py-2 text-sm' : 'flex-col items-center gap-1 px-1 py-2 text-[10px] leading-none', on && 'bg-accent text-foreground')}>
                  {on && <span className="absolute inset-y-2 -left-1 w-0.5 rounded-full bg-primary" />}
                  <Icon className={side === 'wide' ? 'size-4' : 'size-5'} />{t(label)}
                </button>
              );
            })}
          </nav>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <div className={cn('absolute inset-0 overflow-auto p-8', active !== 'home' && 'hidden')}>
              <h1 className="mb-6 text-2xl font-semibold">
                <ShinyText text={t(SECTIONS.find(([id]) => id === section)[1])} color={dark ? '#8a8a8a' : '#52525b'} shineColor={dark ? '#ffffff' : '#2563eb'} speed={4} />
              </h1>
              <ErrorBoundary key={section + vault}><View settingsTab={settingsTab} teams={teams} refreshTeams={refreshTeams} vault={activeV.id} setVault={setVault} lang={lang} setLang={setLang} st={st} setDark={setDark} side={side} setSide={setSide} onLogin={() => chooseSkip(false)} onLogout={() => chooseSkip(false)} dark={dark} connect={connect} openSftp={(h) => connect(h, 'sftp')} runSnippet={runSnippet} openForm={setForm} openHost={setHostForm} toast={toast} rev={rev} /></ErrorBoundary>
            </div>
            <div className={cn('absolute inset-0 p-2', active !== 'sftp' && 'hidden')}>
              {sftpMounted && <SftpTab sid="sftp" hostId={null} active={active === 'sftp'} toast={toast} openForm={setForm} />}
            </div>
            {tabs.map((tab) => (
              <div key={tab.sid} className={cn('absolute inset-0', tab.kind !== 'ssh' && tab.kind && 'p-2', active !== tab.sid && 'hidden')}>
                {tab.kind === 'new'
                  ? <NewTab active={active === tab.sid} tabs={tabs} recent={recent} onConnect={(h) => { closeTab(tab.sid); connect(h); }} onSwitch={(sid) => { closeTab(tab.sid); setActive(sid); }} />
                  : tab.kind === 'sftp'
                    ? <SftpTab sid={tab.sid} hostId={tab.hostId} toast={toast} openForm={setForm} />
                    : (() => { const ready = tab.conn?.state === 'ready' || !tab.conn; return (
                      <div className="flex size-full">
                        <div className="relative min-w-0 flex-1 p-2" style={{ background: xtheme.background }}>
                          <Terminal sid={tab.sid} hostId={tab.hostId} active={active === tab.sid} theme={xtheme} font={font} attempt={tab.attempt} onCommand={onCommand} />
                          {tab.conn && tab.conn.state !== 'ready' && <ConnectScreen conn={tab.conn} onClose={() => closeTab(tab.sid)}
                            onAnswer={(a) => { api.answer(tab.sid, a); setTabs((p) => p.map((x) => (x.sid === tab.sid ? { ...x, conn: { ...x.conn, state: 'connecting' } } : x))); }}
                            onEdit={() => editHost(tab.hostId)}
                            onRetry={() => setTabs((p) => p.map((x) => (x.sid === tab.sid ? { ...x, conn: null, attempt: (x.attempt || 0) + 1 } : x)))} />}
                        </div>
                        {panel && ready && tab.conn && <TermPanel sid={tab.sid} hostId={tab.hostId} dark={dark} history={history[tab.sid] || []} themeId={termTheme} setThemeId={setTheme} font={font} setFont={setFont} toast={toast} rev={rev} />}
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
      {error && <div className="fixed bottom-5 right-5 rounded-lg border bg-foreground px-4 py-2.5 text-sm text-background shadow-lg">{error}</div>}
    </VaultCtx.Provider>
    </TooltipProvider>
    </I18nContext.Provider>
  );
}
