import { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import ForwardSheet from '@/components/ForwardSheet';
import { Empty, IconButton, Item, Toolbar } from '@/components/common';
import { inV, useVault } from '@/context/VaultContext';
import { useT } from '@/i18n';
import { cn, matches } from '@/lib/utils';

export function ForwardsView({ dark, toast, rev }) {
  const t = useT();
  const { vault, writable } = useVault();
  const [rules, setRules] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState(null);
  const load = useCallback(() => {
    api.fwd.list().then((l) => setRules(l.filter((r) => inV(r, vault))));
    api.hosts.list().then((l) => setHosts(l.filter((h) => inV(h, vault))));
  }, [vault]);
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

export default ForwardsView;
