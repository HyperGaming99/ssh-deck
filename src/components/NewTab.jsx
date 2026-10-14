import { useEffect, useRef, useState } from 'react';
import { Plug, Search, Terminal as TermIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import HostIcon from '@/components/HostIcon';
import { useT } from '@/i18n';

const KEY = api.platform === 'darwin' ? '⌘K' : 'Ctrl+K'; // Tastenkürzel zum Öffnen dieses Tabs

const Row = ({ icon, title, sub, onClick }) => (
  <button type="button" onClick={onClick}
    className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-start transition-colors hover:bg-accent">
    <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary [&>img]:size-6 [&>svg]:size-5">{icon}</div>
    <div className="min-w-0">
      <div className="truncate text-sm font-medium">{title}</div>
      {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  </button>
);
const Heading = ({ children }) => <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>;

// Neuer Tab: Suche über Hosts und offene Tabs, darunter die zuletzt verbundenen Hosts
export default function NewTab({ active, tabs, recent, onConnect, onSwitch }) {
  const t = useT();
  const [hosts, setHosts] = useState([]);
  const [q, setQ] = useState('');
  const input = useRef(null);
  useEffect(() => { if (active) { api.hosts.list().then(setHosts); input.current?.focus(); } }, [active]);

  const needle = q.trim().toLowerCase();
  const hostHits = needle ? hosts.filter((h) => [h.name, h.host, h.user, h.group, ...(h.tags || [])].join(' ').toLowerCase().includes(needle)) : [];
  const tabHits = needle ? tabs.filter((x) => x.kind !== 'new' && x.title.toLowerCase().includes(needle)) : [];
  const recents = recent.map((r) => hosts.find((h) => h.id === r.id)).filter(Boolean);
  const hostRow = (h) => <Row key={h.id} icon={<HostIcon slug={h.icon || h.autoIcon} />} title={h.name} sub={`${h.user}@${h.host}:${h.port}`} onClick={() => onConnect(h)} />;

  const enter = (e) => {
    if (e.key !== 'Enter') return;
    if (hostHits[0]) onConnect(hostHits[0]);
    else if (tabHits[0]) onSwitch(tabHits[0].sid);
  };

  return (
    <div className="flex h-full flex-col items-center overflow-auto px-6 pt-10">
      <div className="relative w-full max-w-3xl">
        <Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input ref={input} className="h-11 rounded-xl ps-11 pe-20" placeholder={t('Hosts oder Tabs suchen')} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={enter} />
        <kbd dir="ltr" className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{KEY}</kbd>
      </div>

      <div className="w-full max-w-3xl">
        {needle ? (
          <>
            {hostHits.length > 0 && <><Heading>{t('Hosts')}</Heading><div className="space-y-2">{hostHits.map(hostRow)}</div></>}
            {tabHits.length > 0 && (
              <>
                <Heading>{t('Offene Tabs')}</Heading>
                <div className="space-y-2">{tabHits.map((x) => <Row key={x.sid} icon={<TermIcon />} title={x.title} onClick={() => onSwitch(x.sid)} />)}</div>
              </>
            )}
            {!hostHits.length && !tabHits.length && <p className="mt-16 text-center text-sm text-muted-foreground">{t('Keine Treffer.')}</p>}
          </>
        ) : recents.length > 0 ? (
          <><Heading>{t('Zuletzt verwendete Sitzungen')}</Heading><div className="space-y-2">{recents.map(hostRow)}</div></>
        ) : (
          <div className="mt-28 flex flex-col items-center gap-2 text-center">
            <div className="mb-3 grid size-16 place-items-center rounded-2xl border bg-card"><Plug className="size-6" /></div>
            <h2 className="text-lg font-semibold">{t('Zuletzt verwendete Sitzungen')}</h2>
            <p className="text-sm text-muted-foreground">{t('Deine letzten Sitzungen erscheinen hier.')}</p>
            <p className="text-sm text-primary/70">{t('Starte inzwischen eine Verbindung mit {key}.', { key: KEY })}</p>
          </div>
        )}
      </div>
    </div>
  );
}
