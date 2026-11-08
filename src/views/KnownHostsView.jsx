import { useCallback, useEffect, useState } from 'react';
import { Copy, Download, Fingerprint, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CensorButton, Empty, IconButton, Item, useCensor } from '@/components/common';
import { useT } from '@/i18n';
import { maskFingerprint, maskHost } from '@/lib/censor.mjs';
import { matches } from '@/lib/utils';

const mobile = !!window.api?.mobile;

// Bekannte Server-Schlüssel (Known Hosts): verwalten, aus ~/.ssh/known_hosts importieren
export function KnownHostsView({ dark, toast, rev }) {
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
        {!mobile && <Button variant="outline" onClick={importFile}><Download className="size-4" />{t('~/.ssh/known_hosts importieren')}</Button>}
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

export default KnownHostsView;
