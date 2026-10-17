import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUp, File, Folder, FolderPlus, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useLang, useT } from '@/i18n';
import { DRIVES, joinPath, parentPath } from '@/lib/paths.mjs';

const size = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`);
const DRAG = 'application/x-deck-pane';

// Eine Spalte: Quelle ('local' oder Host-ID) mit eigener SFTP-Sitzung, Pfad, Einträge, Auswahl.
function usePane(side, tabSid, initialSrc, toast) {
  const [src, setSrc] = useState(initialSrc);
  const [status, setStatus] = useState('connecting'); // 'ready' | 'connecting' | { error }
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState([]);
  const [sel, setSel] = useState(new Set());
  const psid = `${tabSid}:${side}`;
  const idle = src === ''; // noch kein Host gewählt
  const remote = src !== 'local' && !idle;

  const none = () => Promise.reject(new Error('Wähle zuerst einen Host.'));
  const ops = useMemo(() => (idle ? { list: none, mkdir: none, rename: none, remove: none } : remote
    ? { list: (p) => api.sftp.list(psid, p), mkdir: (p) => api.sftp.mkdir(psid, p), rename: (a, b) => api.sftp.rename(psid, a, b), remove: (p) => api.sftp.remove(psid, p) }
    : { list: api.local.list, mkdir: api.local.mkdir, rename: api.local.rename, remove: api.local.remove }), [idle, remote, psid]);

  const go = useCallback(async (p) => {
    try {
      const r = await ops.list(p);
      setPath(r.path); setEntries(r.entries); setSel(new Set());
    } catch (e) { toast(e.message); }
  }, [ops, toast]);

  useEffect(() => {
    let alive = true;
    setEntries([]); setPath('');
    if (idle) { setStatus('idle'); return; }
    setStatus('connecting');
    (remote ? api.sftp.open(psid, src) : Promise.resolve())
      .then(() => {
        if (!alive) return remote && api.sftp.close(psid); // Quelle wurde währenddessen gewechselt
        setStatus('ready');
        go(remote ? '.' : '');
      })
      .catch((e) => alive && setStatus({ error: e.message }));
    return () => { alive = false; if (remote) api.sftp.close(psid); };
  }, [src, psid]);

  const toggle = (name) => setSel((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const sep = remote ? '/' : api.platform === 'win32' ? '\\' : '/'; // lokal: Trenner des Systems
  return { join: (n) => joinPath(path, n, sep), up: () => parentPath(path, sep), shown: path === DRIVES ? '' : path, side, src, setSrc, idle, status, path, entries, sel, setSel, toggle, go, reload: () => go(path), ops, remote, psid };
}

function Pane({ pane, hosts, editors, onDropPane, onDropFiles, onTransfer, transferLabel, openForm, toast }) {
  const t = useT();
  const lang = useLang();
  const [draft, setDraft] = useState(null);
  const [over, setOver] = useState(false);
  const [only] = pane.sel;
  const act = async (fn) => { try { await fn(); pane.reload(); } catch (e) { toast(e.message); } };

  const newFolder = () => openForm({
    title: t('Neuer Ordner'), fields: [{ name: 'name', label: t('Name'), required: true }],
    onSubmit: (v) => act(() => pane.ops.mkdir(pane.join(v.name))),
  });
  const renameSel = () => openForm({
    title: t('Umbenennen'), values: { name: only }, fields: [{ name: 'name', label: t('Neuer Name'), required: true }],
    onSubmit: (v) => act(() => pane.ops.rename(pane.join(only), pane.join(v.name))),
  });
  const deleteSel = () => {
    const n = pane.sel.size;
    const msg = pane.remote ? t('{n} Element(e) auf dem Server endgültig löschen (Ordner samt Inhalt)?', { n }) : t('{n} Element(e) in den Papierkorb verschieben?', { n });
    if (confirm(msg)) act(async () => { for (const n of pane.sel) await pane.ops.remove(pane.join(n)); });
  };
  // Dateien öffnen: cmd = 'default' (VS Code, sonst System) | 'system' | Editor-Befehl. Remote: Änderungen werden automatisch hochgeladen.
  const openWith = async (cmd, names = [...pane.sel]) => {
    for (const n of names) {
      if (pane.entries.find((e) => e.name === n)?.dir) continue;
      const p = pane.join(n);
      try {
        await (pane.remote ? api.sftp.edit(pane.psid, p, cmd) : api.local.open(p, cmd));
        if (pane.remote) toast(t('{name} geöffnet – Speichern lädt automatisch hoch.', { name: n }));
      } catch (e) { toast(e.message); }
    }
  };
  const hasFile = [...pane.sel].some((n) => !pane.entries.find((e) => e.name === n)?.dir);
  const onlyIsDir = pane.entries.find((e) => e.name === only)?.dir;

  const drop = (e) => {
    e.preventDefault(); setOver(false);
    if (e.dataTransfer.files.length) return onDropFiles(pane, [...e.dataTransfer.files].map((f) => api.pathOf(f)));
    const from = e.dataTransfer.getData(DRAG);
    if (from && from !== pane.side) onDropPane(from, pane);
  };
  const dragStart = (e, name) => {
    if (!pane.sel.has(name)) pane.setSel(new Set([name]));
    e.dataTransfer.setData(DRAG, pane.side);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border bg-card transition-colors', over && 'border-primary bg-primary/5')}>
      <div className="flex items-center gap-1 border-b p-2">
        <Select value={pane.src} onValueChange={pane.setSrc}>
          <SelectTrigger className="h-7 w-36 shrink-0 text-xs"><SelectValue placeholder={t('Host wählen …')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="local">{t('Lokal')}</SelectItem>
            {hosts.filter((h) => h.protocol !== 'telnet').map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="size-7" onClick={() => pane.go(pane.up())}><ArrowUp className="size-4" /></Button>
        <Button variant="ghost" size="icon" className="size-7" onClick={pane.reload}><RefreshCw className="size-3.5" /></Button>
        <form className="min-w-0 flex-1" onSubmit={(e) => { e.preventDefault(); pane.go(draft); setDraft(null); }}>
          <Input className="h-7 font-mono text-xs" value={draft ?? pane.shown} onChange={(e) => setDraft(e.target.value)} onBlur={() => setDraft(null)} />
        </form>
        <Button variant="ghost" size="icon" className="size-7" title={t('Neuer Ordner')} onClick={newFolder}><FolderPlus className="size-4" /></Button>
        <Button variant="ghost" size="icon" className="size-7" title={t('Umbenennen')} disabled={pane.sel.size !== 1} onClick={renameSel}><Pencil className="size-3.5" /></Button>
        <Button variant="ghost" size="icon" className="size-7" title={pane.remote ? t('Löschen') : t('In den Papierkorb')} disabled={!pane.sel.size} onClick={deleteSel}><Trash2 className="size-3.5" /></Button>
      </div>

      <ContextMenu modal={false}>
        <ContextMenuTrigger asChild>
          <div className="min-h-0 flex-1 overflow-auto" onContextMenuCapture={(ev) => {
            const n = ev.target.closest('[data-name]')?.dataset.name;
            if (!n) pane.setSel(new Set());
            else if (!pane.sel.has(n)) pane.setSel(new Set([n]));
          }}>
        {pane.status === 'idle' && <p className="p-6 text-center text-sm text-muted-foreground">{t('Oben einen Host oder „Lokal“ wählen.')}</p>}
        {pane.status === 'connecting' && <p className="p-6 text-center text-sm text-muted-foreground">{t('Verbinde …')}</p>}
        {pane.status.error && <p className="p-6 text-center text-sm text-destructive">{t('Verbindungsfehler: {error}', { error: pane.status.error })}</p>}
        {pane.status === 'ready' && pane.entries.map((e) => (
          <div key={e.name} data-name={e.name} draggable onDragStart={(ev) => dragStart(ev, e.name)} onClick={() => pane.toggle(e.name)} onDoubleClick={() => (e.dir ? pane.go(pane.join(e.name)) : openWith('default', [e.name]))}
            className={cn('flex cursor-pointer select-none items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent', pane.sel.has(e.name) && 'bg-primary/10 hover:bg-primary/15')}>
            {e.dir ? <Folder className="size-4 shrink-0 text-primary" /> : <File className="size-4 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 flex-1 truncate">{e.name}</span>
            <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">{e.dir ? '' : size(e.size)}</span>
            <span className="hidden w-28 shrink-0 text-right text-xs text-muted-foreground xl:block">{new Date(e.mtime).toLocaleDateString(lang)}</span>
          </div>
        ))}
        {pane.status === 'ready' && !pane.entries.length && <p className="p-6 text-center text-sm text-muted-foreground">{t('Leer – Dateien hierher ziehen')}</p>}
                </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          {pane.sel.size > 0 && (
            <>
              {pane.sel.size === 1 && onlyIsDir && <ContextMenuItem onSelect={() => pane.go(pane.join(only))}>{t('Öffnen')}</ContextMenuItem>}
              {hasFile && <ContextMenuItem onSelect={() => openWith('default')}>{t('Öffnen')}</ContextMenuItem>}
              {hasFile && (
                <ContextMenuSub>
                  <ContextMenuSubTrigger>{t('Öffnen mit')}</ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    {editors.map((ed) => <ContextMenuItem key={ed.cmd} onSelect={() => openWith(ed.cmd)}>{ed.name}</ContextMenuItem>)}
                    <ContextMenuItem onSelect={() => openWith('system')}>{t('Standardprogramm')}</ContextMenuItem>
                  </ContextMenuSubContent>
                </ContextMenuSub>
              )}
              {transferLabel && <ContextMenuItem onSelect={onTransfer}>{transferLabel}</ContextMenuItem>}
              {pane.sel.size === 1 && <ContextMenuItem onSelect={renameSel}>{t('Umbenennen')}</ContextMenuItem>}
              <ContextMenuItem variant="destructive" onSelect={deleteSel}>{pane.remote ? t('Löschen') : t('In den Papierkorb')}</ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem onSelect={newFolder}>{t('Neuer Ordner')}</ContextMenuItem>
          <ContextMenuItem onSelect={() => pane.setSel(new Set(pane.entries.map((e) => e.name)))}>{t('Alles auswählen')}</ContextMenuItem>
          <ContextMenuItem onSelect={pane.reload}>{t('Aktualisieren')}</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <div className="border-t px-3 py-1 text-xs text-muted-foreground">{pane.sel.size ? t('{n} ausgewählt', { n: pane.sel.size }) : t('{n} Einträge', { n: pane.entries.length })}</div>
    </div>
  );
}

// hostId null = fester SFTP-Tab ohne vorgewählten Host; active lädt die Host-Liste neu, wenn der Tab angezeigt wird
export default function SftpTab({ sid, hostId, active = true, toast, openForm }) {
  const t = useT();
  const [hosts, setHosts] = useState([]);
  const [editors, setEditors] = useState([]);
  const [busy, setBusy] = useState(false);
  const left = usePane('L', sid, 'local', toast);
  const right = usePane('R', sid, hostId ?? '', toast);
  useEffect(() => { if (active) api.hosts.list().then(setHosts); }, [active]);
  useEffect(() => { api.editors.list().then(setEditors); }, []);

  // Lokal<->Server und Server<->Server (direkt durchgestreamt)
  const send = async (from, to, names) => {
    if (from.idle || to.idle) return toast(t('Wähle zuerst in beiden Spalten eine Quelle.'));
    if (!from.remote && !to.remote) return toast(t('Lokal → Lokal wird nicht unterstützt.'));
    setBusy(true);
    try {
      for (const name of names) {
        const p = from.join(name);
        if (!from.remote) await api.sftp.upload(to.psid, p, to.path);
        else if (!to.remote) await api.sftp.download(from.psid, p, to.path);
        else await api.sftp.copy(from.psid, p, to.psid, to.path);
      }
      toast(t('{n} Element(e) übertragen.', { n: names.length }));
      to.reload();
    } catch (e) { toast(e.message); }
    setBusy(false);
  };
  const panes = { L: left, R: right };
  const label = (from, to) => (from.idle || to.idle || (!from.remote && !to.remote) ? null : !from.remote ? t('Hochladen') : !to.remote ? t('Herunterladen') : t('Auf anderen Server kopieren'));
  const onDropPane = (fromSide, to) => { const from = panes[fromSide]; send(from, to, [...from.sel]); };
  const onDropFiles = async (to, paths) => {
    if (!to.remote) return toast(t('Dateien aus dem Dateimanager lassen sich auf eine Server-Spalte ziehen.'));
    setBusy(true);
    try { for (const p of paths) await api.sftp.upload(to.psid, p, to.path); toast(t('{n} Datei(en) hochgeladen.', { n: paths.length })); to.reload(); } catch (e) { toast(e.message); }
    setBusy(false);
  };

  return (
    <div dir="ltr" className="msftp flex h-full gap-3 p-3">
      <Pane pane={left} hosts={hosts} editors={editors} onDropPane={onDropPane} onDropFiles={onDropFiles} onTransfer={() => send(left, right, [...left.sel])} transferLabel={label(left, right)} openForm={openForm} toast={toast} />
      <div className="flex flex-col justify-center gap-2">
        <Button size="icon" title={t('Nach rechts übertragen')} disabled={busy || !left.sel.size} onClick={() => send(left, right, [...left.sel])}><ArrowLeft className="size-4 rotate-180" /></Button>
        <Button size="icon" title={t('Nach links übertragen')} disabled={busy || !right.sel.size} onClick={() => send(right, left, [...right.sel])}><ArrowLeft className="size-4" /></Button>
        {busy && <RefreshCw className="mx-auto size-4 animate-spin text-primary" />}
      </div>
      <Pane pane={right} hosts={hosts} editors={editors} onDropPane={onDropPane} onDropFiles={onDropFiles} onTransfer={() => send(right, left, [...right.sel])} transferLabel={label(right, left)} openForm={openForm} toast={toast} />
    </div>
  );
}
