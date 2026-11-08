import { useCallback, useEffect, useState } from 'react';
import { Pencil, Terminal as TermIcon, Trash2 } from 'lucide-react';
import { Empty, IconButton, Item, Toolbar } from '@/components/common';
import { inV, useVault } from '@/context/VaultContext';
import { useT } from '@/i18n';
import { matches } from '@/lib/utils';

export function SnippetsView({ dark, runSnippet, openForm, rev }) {
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

export default SnippetsView;
