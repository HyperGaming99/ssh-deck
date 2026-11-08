import { useCallback, useEffect, useState } from 'react';
import {
  ChevronDown,
  Cloud,
  Copy,
  Download,
  Ellipsis,
  KeyRound,
  LayoutGrid,
  List,
  Lock,
  Pencil,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import KeyModalSheet from '@/components/KeyModalSheet';
import { CensorButton, Empty, IconButton, Item, useCensor } from '@/components/common';
import { inV, useVault } from '@/context/VaultContext';
import { useT } from '@/i18n';
import { maskFingerprint } from '@/lib/censor.mjs';
import { cn, matches } from '@/lib/utils';

const mobile = !!window.api?.mobile;

export function KeychainView({ dark, openForm, toast }) {
  const t = useT();
  const { vault, writable, vaults } = useVault();
  const [kc, setKc] = useState(null); // Cloud-Schlüsselbund-Status
  useEffect(() => { if (vault === 'personal') api.kc.status().then(setKc).catch(() => {}); }, [vault]);
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [keySheetOpen, setKeySheetOpen] = useState(false);
  const [keySheetTab, setKeySheetTab] = useState('generate');
  const [censor, toggleCensor] = useCensor();
  const [layout, setLayoutState] = useState(() => { try { return localStorage.getItem('keyLayout') || 'grid'; } catch { return 'grid'; } });
  const setLayout = (v) => { setLayoutState(v); try { localStorage.setItem('keyLayout', v); } catch { /* egal */ } };
  const load = useCallback(() => api.keys.list().then((l) => setItems(l.filter((k) => inV(k, vault)))), [vault]);
  useEffect(() => { load(); }, [load]);

  const rename = (k) => openForm({
    title: t('Schlüssel umbenennen'), values: { name: k.name }, fields: [{ name: 'name', label: t('Name'), required: true }],
    onSubmit: async (v) => { await api.keys.rename(k.id, v.name); load(); },
  });
  const generate = () => { setKeySheetTab('generate'); setKeySheetOpen(true); };
  const openImport = () => { setKeySheetTab('import'); setKeySheetOpen(true); };
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
          {writable && (
            <>
              {(cloudOk || others.length > 0) && <DropdownMenuSeparator />}
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={async () => { await api.keys.remove(k.id); load(); }}>
                <Trash2 className="size-4" />{t('Löschen')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };
  const rescan = async () => { const n = await api.keys.rescan(); toast(n ? t('{n} neue(r) Schlüssel aus ~/.ssh importiert.', { n }) : t('Keine neuen Schlüssel in ~/.ssh.')); load(); };
  const toHost = async (k) => openForm({
    title: t('Auf Host exportieren'), description: t('Trägt den öffentlichen Schlüssel „{name}“ in ~/.ssh/authorized_keys ein.', { name: k.name }), submitLabel: t('Exportieren'),
    fields: [{ name: 'hostId', label: t('Host'), options: (await api.hosts.list()).filter((h) => h.protocol !== 'telnet').map((h) => [h.id, `${h.name} (${h.user}@${h.host})`]) }],
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
              <DropdownMenuItem onSelect={openImport}><PenLine className="size-4" />{t('Schlüssel manuell eingeben')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>}
        {!mobile && vault === 'personal' && <Button variant="ghost" onClick={rescan}><RefreshCw className="size-4" />{t('~/.ssh einlesen')}</Button>}
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
      <KeyModalSheet open={keySheetOpen} initialTab={keySheetTab} onClose={() => setKeySheetOpen(false)} onDone={load} toast={toast} vault={vault} />
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
              {!mobile && !k.publicOnly && <IconButton label={t('Privaten Schlüssel speichern')} onClick={async () => { const err = await api.keys.exportPrivate(k.id); err && toast(err); }}><Download className="size-3.5" /></IconButton>}
              {writable && <IconButton label={t('Löschen')} onClick={async () => { await api.keys.remove(k.id); load(); }}><Trash2 className="size-3.5" /></IconButton>}
            </>} />
        ))}
      </div>
    </>
  );
}

export default KeychainView;
