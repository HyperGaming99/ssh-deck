import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowLeftRight, ArrowUp, Check, ChevronRight, Clock, Download,
  File, FileArchive, FileCode, FileImage, FileText, Folder, FolderPlus, HardDrive,
  Home, Minus, Pencil, RefreshCw, Search, Server, Trash2, Upload, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useLang, useT } from '@/i18n';
import { DRIVES, joinPath, parentPath } from '@/lib/paths.mjs';

const size = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`);
const fmtMb = (n) => {
  const mb = (n || 0) / 1048576;
  return mb >= 100 ? `${mb.toFixed(1)} MB` : mb >= 1 ? `${mb.toFixed(2)} MB` : `${mb.toFixed(2)} MB`;
};
const fmtSpeed = (bps) => {
  if (!bps || bps <= 0) return '0.0 MB/s';
  if (bps < 1048576 * 0.1) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${(bps / 1048576).toFixed(1)} MB/s`;
};
const fmtEta = (sec) => {
  if (sec === null || sec === undefined || !Number.isFinite(sec) || sec < 0) return null;
  if (sec <= 1) return '< 1s';
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  if (m < 60) return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  const h = Math.floor(m / 60), rm = m % 60;
  return `${h}h ${rm}m`;
};

const DRAG = 'application/x-deck-pane';
const ARCHIVE_EXT = /\.(zip|tar|gz|tgz|bz2|xz|7z|rar|deb|rpm|iso|apk|dmg)$/i;
const CODE_EXT = /\.(js|jsx|mjs|cjs|ts|tsx|py|sh|bash|zsh|json|yml|yaml|toml|xml|html|css|scss|rs|go|c|cpp|h|java|php|rb|sql|conf|ini|env|lock|dockerfile)$/i;
const IMG_EXT = /\.(png|jpe?g|gif|svg|webp|ico|bmp|avif)$/i;
const DOC_EXT = /\.(md|txt|log|csv|pdf|doc|docx|rtf)$/i;

function EntryIcon({ entry }) {
  if (entry.dir) {
    return (
      <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Folder className="size-4 fill-primary/15" />
      </div>
    );
  }
  const n = entry.name || '';
  if (ARCHIVE_EXT.test(n)) {
    return (
      <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-500">
        <FileArchive className="size-4" />
      </div>
    );
  }
  if (CODE_EXT.test(n) || /^dockerfile$/i.test(n)) {
    return (
      <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-sky-500/10 text-sky-500">
        <FileCode className="size-4" />
      </div>
    );
  }
  if (IMG_EXT.test(n)) {
    return (
      <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-500">
        <FileImage className="size-4" />
      </div>
    );
  }
  if (DOC_EXT.test(n)) {
    return (
      <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-violet-500/10 text-violet-500">
        <FileText className="size-4" />
      </div>
    );
  }
  return (
    <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
      <File className="size-4" />
    </div>
  );
}

// Zerlegt einen Pfad in anklickbare Segmente für die Breadcrumb-Navigation.
function pathSegments(p, sep) {
  if (!p || p === DRIVES) return [];
  if (sep === '\\') {
    const parts = p.split('\\').filter(Boolean);
    const out = [];
    let acc = '';
    for (let i = 0; i < parts.length; i++) {
      acc = i === 0 ? `${parts[0]}\\` : `${acc.replace(/\\$/, '')}\\${parts[i]}`;
      out.push({ label: parts[i], path: acc });
    }
    return out;
  }
  const parts = p.split('/').filter(Boolean);
  const out = [{ label: '/', path: '/' }];
  let acc = '';
  for (const part of parts) {
    acc += `/${part}`;
    out.push({ label: part, path: acc });
  }
  return out;
}

// Eine Spalte: Quelle ('local' oder Host-ID) mit eigener SFTP-Sitzung, Pfad, Einträge, Suche, Sortierung, Mehrfachauswahl.
function usePane(side, tabSid, initialSrc, toast) {
  const [src, setSrc] = useState(initialSrc);
  const [status, setStatus] = useState('connecting'); // 'ready' | 'connecting' | 'idle' | { error }
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState([]);
  const [sel, setSel] = useState(new Set());
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'size' | 'mtime'
  const [sortAsc, setSortAsc] = useState(true);
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
      setPath(r.path); setEntries(r.entries); setSel(new Set()); setQuery('');
    } catch (e) { toast(e.message); }
  }, [ops, toast]);

  useEffect(() => {
    let alive = true;
    setEntries([]); setPath(''); setSel(new Set()); setQuery('');
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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries;
    const dirFactor = sortAsc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (a.dir !== b.dir) return b.dir - a.dir; // Ordner immer oben
      if (sortBy === 'size') return ((a.size || 0) - (b.size || 0)) * dirFactor || a.name.localeCompare(b.name);
      if (sortBy === 'mtime') return ((a.mtime || 0) - (b.mtime || 0)) * dirFactor || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name) * dirFactor;
    });
  }, [entries, query, sortBy, sortAsc]);

  const toggleSort = (col) => {
    if (sortBy === col) setSortAsc((v) => !v);
    else { setSortBy(col); setSortAsc(col === 'name'); }
  };

  const toggle = (name) => setSel((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const sep = remote ? '/' : api.platform === 'win32' ? '\\' : '/'; // lokal: Trenner des Systems
  return {
    join: (n) => joinPath(path, n, sep),
    up: () => parentPath(path, sep),
    home: () => (remote ? '.' : ''),
    shown: path === DRIVES ? '' : path,
    sep, side, src, setSrc, idle, status, path, entries, visible,
    sel, setSel, toggle, query, setQuery, sortBy, sortAsc, toggleSort,
    go, reload: () => go(path), ops, remote, psid,
  };
}

function TransferBanner({ transfer, onCancel }) {
  const t = useT();
  if (!transfer) return null;
  const { direction, currentFile, transferredBytes = 0, totalBytes = 0, filesDone = 0, filesTotal = 0, speedBps = 0, etaSeconds = null, percent = 0 } = transfer;
  const label = direction === 'upload' ? t('Hochladen') : direction === 'download' ? t('Herunterladen') : t('Auf anderen Server kopieren');
  const Icon = direction === 'upload' ? Upload : direction === 'download' ? Download : ArrowLeftRight;
  const etaText = fmtEta(etaSeconds);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-primary/25 bg-card/95 p-3 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
            <Icon className="size-4 animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">{label}</span>
              {filesTotal > 0 && (
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {t('{done} von {total} Dateien', { done: Math.min(filesDone + 1, filesTotal), total: filesTotal })}
                </span>
              )}
            </div>
            <div className="truncate font-mono text-xs text-muted-foreground">
              {currentFile || t('Lädt …')}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md bg-secondary px-2 py-1 font-mono font-medium text-foreground">
              {fmtMb(transferredBytes)} / {fmtMb(totalBytes)}
            </span>
            <span className="rounded-md bg-secondary px-2 py-1 font-mono text-muted-foreground">
              {fmtSpeed(speedBps)}
            </span>
            <span className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 font-mono text-muted-foreground">
              <Clock className="size-3" />
              {etaText ? t('Verbleibend: {time}', { time: etaText }) : t('Lädt …')}
            </span>
            <span className="w-10 text-right font-mono font-semibold text-primary">
              {percent}%
            </span>
          </div>
          <Button variant="destructive" size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={onCancel}>
            <X className="size-3.5" />
            {t('Abbrechen')}
          </Button>
        </div>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all duration-150 ease-out"
          style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
        />
      </div>
    </div>
  );
}

function Pane({ pane, hosts, editors, busy, onDropPane, onDropFiles, onTransfer, transferLabel, openForm, toast }) {
  const t = useT();
  const lang = useLang();
  const [draft, setDraft] = useState(null);
  const [over, setOver] = useState(false);
  const lastClickedRef = useRef(null);
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

  // Mehrfachauswahl: Klick schaltet um, Shift+Klick wählt einen ganzen Bereich auf einmal aus
  const handleSelect = (ev, name) => {
    ev.stopPropagation();
    const names = pane.visible.map((e) => e.name);
    if (ev.shiftKey && lastClickedRef.current && names.includes(lastClickedRef.current)) {
      const a = names.indexOf(lastClickedRef.current);
      const b = names.indexOf(name);
      const [start, end] = a < b ? [a, b] : [b, a];
      pane.setSel((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) next.add(names[i]);
        return next;
      });
    } else {
      pane.toggle(name);
    }
    lastClickedRef.current = name;
  };

  const allVisibleSelected = pane.visible.length > 0 && pane.visible.every((e) => pane.sel.has(e.name));
  const someVisibleSelected = !allVisibleSelected && pane.visible.some((e) => pane.sel.has(e.name));
  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      pane.setSel((prev) => {
        const next = new Set(prev);
        for (const e of pane.visible) next.delete(e.name);
        return next;
      });
    } else {
      pane.setSel((prev) => {
        const next = new Set(prev);
        for (const e of pane.visible) next.add(e.name);
        return next;
      });
    }
  };

  const selectedBytes = useMemo(() => {
    let sum = 0;
    for (const e of pane.entries) if (pane.sel.has(e.name) && !e.dir) sum += e.size || 0;
    return sum;
  }, [pane.entries, pane.sel]);

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

  const segments = useMemo(() => pathSegments(pane.shown, pane.sep), [pane.shown, pane.sep]);
  const TransferIcon = !pane.remote ? Upload : Download;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && e.target.tagName !== 'INPUT') {
          e.preventDefault();
          pane.setSel(new Set(pane.visible.map((x) => x.name)));
        } else if (e.key === 'Escape' && pane.sel.size) {
          pane.setSel(new Set());
        }
      }}
      tabIndex={-1}
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-xs transition-all outline-none',
        over && 'border-primary ring-2 ring-primary/20 bg-primary/5',
      )}
    >
      {/* Obere Werkzeugleiste: Quelle, Pfad-Navigation & Aktionen */}
      <div className="flex flex-col gap-2 border-b bg-muted/20 p-2.5">
        <div className="flex items-center gap-1.5">
          <Select value={pane.src} onValueChange={pane.setSrc}>
            <SelectTrigger className="h-8 w-44 shrink-0 gap-1.5 rounded-lg bg-background text-xs font-medium shadow-2xs">
              <span className="flex items-center gap-1.5 truncate">
                {pane.src === 'local' ? (
                  <HardDrive className="size-3.5 shrink-0 text-primary" />
                ) : (
                  <span className="relative flex size-2 shrink-0">
                    <span className={cn(
                      'size-2 rounded-full',
                      pane.status === 'ready' ? 'bg-emerald-500' : pane.status === 'connecting' ? 'bg-amber-500 animate-pulse' : pane.status?.error ? 'bg-destructive' : 'bg-muted-foreground/40',
                    )} />
                  </span>
                )}
                <SelectValue placeholder={t('Host wählen …')} />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="local">
                <span className="flex items-center gap-2"><HardDrive className="size-3.5 text-primary" />{t('Lokal')}</span>
              </SelectItem>
              {hosts.filter((h) => h.protocol !== 'telnet').map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  <span className="flex items-center gap-2"><Server className="size-3.5 text-muted-foreground" />{h.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center rounded-lg border bg-background p-0.5 shadow-2xs">
            <Button variant="ghost" size="icon" className="size-7 rounded-md" title={t('Startverzeichnis')} disabled={pane.idle} onClick={() => pane.go(pane.home())}>
              <Home className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7 rounded-md" title={t('Übergeordneter Ordner')} disabled={pane.idle} onClick={() => pane.go(pane.up())}>
              <ArrowUp className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7 rounded-md" title={t('Aktualisieren')} disabled={pane.idle} onClick={pane.reload}>
              <RefreshCw className={cn('size-3.5', pane.status === 'connecting' && 'animate-spin')} />
            </Button>
          </div>

          {/* Pfadleiste: Klickbare Breadcrumbs oder direkte Texteingabe */}
          {draft !== null ? (
            <form className="min-w-0 flex-1" onSubmit={(e) => { e.preventDefault(); pane.go(draft); setDraft(null); }}>
              <Input
                autoFocus
                className="h-8 rounded-lg bg-background font-mono text-xs"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => setDraft(null)}
                onKeyDown={(e) => { if (e.key === 'Escape') setDraft(null); }}
              />
            </form>
          ) : (
            <div
              onClick={() => !pane.idle && setDraft(pane.shown)}
              className="flex h-8 min-w-0 flex-1 cursor-text items-center gap-0.5 overflow-x-auto rounded-lg border bg-background px-2 font-mono text-xs shadow-2xs hover:border-ring/50"
            >
              {segments.length ? segments.map((seg, i) => (
                <div key={seg.path} className="flex shrink-0 items-center">
                  {i > 0 && <ChevronRight className="mx-0.5 size-3 text-muted-foreground/60" />}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); pane.go(seg.path); }}
                    className={cn(
                      'rounded px-1 py-0.5 transition-colors hover:bg-accent hover:text-foreground',
                      i === segments.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {seg.label}
                  </button>
                </div>
              )) : (
                <span className="truncate text-muted-foreground">{pane.shown || '…'}</span>
              )}
            </div>
          )}

          <div className="flex items-center rounded-lg border bg-background p-0.5 shadow-2xs">
            <Button variant="ghost" size="icon" className="size-7 rounded-md" title={t('Neuer Ordner')} disabled={pane.idle} onClick={newFolder}>
              <FolderPlus className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7 rounded-md" title={t('Umbenennen')} disabled={pane.sel.size !== 1} onClick={renameSel}>
              <Pencil className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7 rounded-md hover:text-destructive" title={pane.remote ? t('Löschen') : t('In den Papierkorb')} disabled={!pane.sel.size} onClick={deleteSel}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Zweite Zeile: Suchfeld & Schnellauswahl */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-7 rounded-lg bg-background pl-8 pr-7 text-xs"
              placeholder={t('Suchen …')}
              value={pane.query}
              disabled={pane.status !== 'ready'}
              onChange={(e) => pane.setQuery(e.target.value)}
            />
            {pane.query && (
              <button
                type="button"
                onClick={() => pane.setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          {pane.status === 'ready' && pane.visible.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 gap-1.5 rounded-lg px-2.5 text-xs"
              onClick={toggleAllVisible}
            >
              <Check className="size-3" />
              {allVisibleSelected ? t('Auswahl aufheben') : t('Alles auswählen')}
            </Button>
          )}
        </div>
      </div>

      {/* Tabellenkopf mit Master-Checkbox für Mehrfachauswahl & Sortierung */}
      {pane.status === 'ready' && (
        <div className="flex select-none items-center gap-2.5 border-b bg-muted/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <button
            type="button"
            onClick={toggleAllVisible}
            title={allVisibleSelected ? t('Auswahl aufheben') : t('Alles auswählen')}
            className={cn(
              'grid size-4 shrink-0 place-items-center rounded border transition-colors',
              allVisibleSelected || someVisibleSelected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-background hover:border-primary/60',
            )}
          >
            {allVisibleSelected && <Check className="size-3 stroke-[2.5]" />}
            {someVisibleSelected && <Minus className="size-3 stroke-[2.5]" />}
          </button>

          <button
            type="button"
            onClick={() => pane.toggleSort('name')}
            className="flex min-w-0 flex-1 items-center gap-1 text-left hover:text-foreground"
          >
            <span>{t('Name')}</span>
            {pane.sortBy === 'name' && (pane.sortAsc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
          </button>

          <button
            type="button"
            onClick={() => pane.toggleSort('size')}
            className="flex w-20 shrink-0 items-center justify-end gap-1 text-right hover:text-foreground"
          >
            <span>{t('Größe')}</span>
            {pane.sortBy === 'size' && (pane.sortAsc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
          </button>

          <button
            type="button"
            onClick={() => pane.toggleSort('mtime')}
            className="hidden w-28 shrink-0 items-center justify-end gap-1 text-right hover:text-foreground xl:flex"
          >
            <span>{t('Geändert')}</span>
            {pane.sortBy === 'mtime' && (pane.sortAsc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
          </button>
        </div>
      )}

      {/* Dateiliste */}
      <ContextMenu modal={false}>
        <ContextMenuTrigger asChild>
          <div
            className="min-h-0 flex-1 overflow-auto divide-y divide-border/40"
            onContextMenuCapture={(ev) => {
              const n = ev.target.closest('[data-name]')?.dataset.name;
              if (!n) pane.setSel(new Set());
              else if (!pane.sel.has(n)) pane.setSel(new Set([n]));
            }}
          >
            {pane.status === 'idle' && (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                <Server className="size-8 stroke-[1.5] opacity-40" />
                <p className="text-sm">{t('Oben einen Host oder „Lokal“ wählen.')}</p>
              </div>
            )}
            {pane.status === 'connecting' && (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                <RefreshCw className="size-6 animate-spin text-primary" />
                <p className="text-sm">{t('Verbinde …')}</p>
              </div>
            )}
            {pane.status.error && (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="text-sm text-destructive">{t('Verbindungsfehler: {error}', { error: pane.status.error })}</p>
                <Button variant="outline" size="sm" onClick={() => pane.setSrc(pane.src)}>{t('Aktualisieren')}</Button>
              </div>
            )}
            {pane.status === 'ready' && pane.visible.map((e) => {
              const selected = pane.sel.has(e.name);
              return (
                <div
                  key={e.name}
                  data-name={e.name}
                  draggable
                  onDragStart={(ev) => dragStart(ev, e.name)}
                  onClick={(ev) => handleSelect(ev, e.name)}
                  onDoubleClick={() => (e.dir ? pane.go(pane.join(e.name)) : openWith('default', [e.name]))}
                  className={cn(
                    'group flex cursor-pointer select-none items-center gap-2.5 px-3 py-1.5 text-sm transition-colors hover:bg-accent/60',
                    selected && 'bg-primary/10 hover:bg-primary/15',
                  )}
                >
                  <button
                    type="button"
                    onClick={(ev) => handleSelect(ev, e.name)}
                    className={cn(
                      'grid size-4 shrink-0 place-items-center rounded border transition-colors',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background opacity-70 group-hover:opacity-100 hover:border-primary/60',
                    )}
                  >
                    {selected && <Check className="size-3 stroke-[2.5]" />}
                  </button>

                  <EntryIcon entry={e} />

                  <span className={cn('min-w-0 flex-1 truncate', e.dir && 'font-medium')}>
                    {e.name}
                  </span>

                  <span className="w-20 shrink-0 text-right font-mono text-xs text-muted-foreground">
                    {e.dir ? '—' : size(e.size)}
                  </span>

                  <span className="hidden w-28 shrink-0 text-right text-xs text-muted-foreground xl:block">
                    {e.mtime ? new Date(e.mtime).toLocaleDateString(lang) : ''}
                  </span>
                </div>
              );
            })}
            {pane.status === 'ready' && !pane.entries.length && (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                <Folder className="size-8 stroke-[1.5] opacity-40" />
                <p className="text-sm">{t('Leer – Dateien hierher ziehen')}</p>
              </div>
            )}
            {pane.status === 'ready' && pane.entries.length > 0 && !pane.visible.length && (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                <Search className="size-7 stroke-[1.5] opacity-40" />
                <p className="text-sm">{t('Keine Treffer.')}</p>
              </div>
            )}
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
              {transferLabel && <ContextMenuItem disabled={busy} onSelect={onTransfer}>{transferLabel}</ContextMenuItem>}
              {pane.sel.size === 1 && <ContextMenuItem onSelect={renameSel}>{t('Umbenennen')}</ContextMenuItem>}
              <ContextMenuItem variant="destructive" onSelect={deleteSel}>{pane.remote ? t('Löschen') : t('In den Papierkorb')}</ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem onSelect={newFolder}>{t('Neuer Ordner')}</ContextMenuItem>
          <ContextMenuItem onSelect={() => pane.setSel(new Set(pane.visible.map((e) => e.name)))}>{t('Alles auswählen')}</ContextMenuItem>
          {pane.sel.size > 0 && <ContextMenuItem onSelect={() => pane.setSel(new Set())}>{t('Auswahl aufheben')}</ContextMenuItem>}
          <ContextMenuItem onSelect={pane.reload}>{t('Aktualisieren')}</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Fußzeile: Auswahl-Status, Gesamtgröße & Direkt-Übertragen */}
      <div className="flex min-h-9 items-center justify-between gap-2 border-t bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-2">
          {pane.sel.size > 0 ? (
            <>
              <span className="rounded-md bg-primary/15 px-2 py-0.5 font-medium text-primary">
                {t('{n} ausgewählt', { n: pane.sel.size })}
              </span>
              {selectedBytes > 0 && (
                <span className="font-mono text-muted-foreground">
                  ({fmtMb(selectedBytes)})
                </span>
              )}
              <button
                type="button"
                onClick={() => pane.setSel(new Set())}
                className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {t('Auswahl aufheben')}
              </button>
            </>
          ) : (
            <span>
              {pane.query.trim()
                ? `${pane.visible.length} / ${t('{n} Einträge', { n: pane.entries.length })}`
                : t('{n} Einträge', { n: pane.entries.length })}
            </span>
          )}
        </div>

        {pane.sel.size > 0 && transferLabel && (
          <Button
            size="sm"
            disabled={busy}
            onClick={onTransfer}
            className="h-6 gap-1.5 rounded-md px-2.5 text-xs"
          >
            <TransferIcon className="size-3" />
            {transferLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

// hostId null = fester SFTP-Tab ohne vorgewählten Host; active lädt die Host-Liste neu, wenn der Tab angezeigt wird
export default function SftpTab({ sid, hostId, active = true, toast, openForm }) {
  const t = useT();
  const [hosts, setHosts] = useState([]);
  const [editors, setEditors] = useState([]);
  const [transfer, setTransfer] = useState(null);
  const transferringRef = useRef(false);
  const left = usePane('L', sid, 'local', toast);
  const right = usePane('R', sid, hostId ?? '', toast);
  const busy = !!transfer;

  useEffect(() => { if (active) api.hosts.list().then(setHosts); }, [active]);
  useEffect(() => { api.editors.list().then(setEditors); }, []);

  useEffect(() => {
    if (!api.sftp.onProgress) return undefined;
    return api.sftp.onProgress((p) => {
      if (!p?.sid || !p.sid.startsWith(`${sid}:`)) return;
      if (p.done || !transferringRef.current) setTransfer(null);
      else setTransfer(p);
    });
  }, [sid]);

  const cancelTransfer = useCallback(() => {
    transferringRef.current = false;
    setTransfer(null);
    api.sftp.cancel?.(sid);
  }, [sid]);

  // Lokal<->Server und Server<->Server (direkt durchgestreamt, mit Live-Fortschritt und Abbruchfunktion)
  const send = async (from, to, names) => {
    if (!names.length) return;
    if (from.idle || to.idle) return toast(t('Wähle zuerst in beiden Spalten eine Quelle.'));
    if (!from.remote && !to.remote) return toast(t('Lokal → Lokal wird nicht unterstützt.'));
    const paths = names.map((name) => from.join(name));
    const direction = !from.remote ? 'upload' : !to.remote ? 'download' : 'copy';
    const targetSid = !from.remote ? to.psid : from.psid;
    let initBytes = 0;
    for (const n of names) {
      const e = from.entries.find((x) => x.name === n);
      if (e && !e.dir) initBytes += e.size || 0;
    }
    transferringRef.current = true;
    setTransfer({
      sid: targetSid,
      direction,
      currentFile: names[0],
      transferredBytes: 0,
      totalBytes: initBytes,
      filesDone: 0,
      filesTotal: names.length,
      speedBps: 0,
      etaSeconds: null,
      percent: 0,
    });
    try {
      if (!from.remote) await api.sftp.upload(to.psid, paths, to.path);
      else if (!to.remote) await api.sftp.download(from.psid, paths, to.path);
      else await api.sftp.copy(from.psid, paths, to.psid, to.path);
      from.setSel(new Set());
      toast(t('{n} Element(e) übertragen.', { n: names.length }));
      to.reload();
    } catch (e) {
      if (e.message === 'Abgebrochen') {
        toast(t('Übertragung abgebrochen.'));
        to.reload();
      } else {
        toast(e.message);
      }
    } finally {
      transferringRef.current = false;
      setTransfer(null);
    }
  };

  const panes = { L: left, R: right };
  const label = (from, to) => (from.idle || to.idle || (!from.remote && !to.remote) ? null : !from.remote ? t('Hochladen') : !to.remote ? t('Herunterladen') : t('Auf anderen Server kopieren'));
  const onDropPane = (fromSide, to) => { const from = panes[fromSide]; send(from, to, [...from.sel]); };
  const onDropFiles = async (to, paths) => {
    if (!paths.length) return;
    if (!to.remote) return toast(t('Dateien aus dem Dateimanager lassen sich auf eine Server-Spalte ziehen.'));
    transferringRef.current = true;
    setTransfer({
      sid: to.psid,
      direction: 'upload',
      currentFile: paths[0]?.split(/[\\/]/).pop() || '',
      transferredBytes: 0,
      totalBytes: 0,
      filesDone: 0,
      filesTotal: paths.length,
      speedBps: 0,
      etaSeconds: null,
      percent: 0,
    });
    try {
      await api.sftp.upload(to.psid, paths, to.path);
      toast(t('{n} Datei(en) hochgeladen.', { n: paths.length }));
      to.reload();
    } catch (e) {
      if (e.message === 'Abgebrochen') {
        toast(t('Übertragung abgebrochen.'));
        to.reload();
      } else {
        toast(e.message);
      }
    } finally {
      transferringRef.current = false;
      setTransfer(null);
    }
  };

  return (
    <div dir="ltr" className=" flex h-full flex-col gap-2.5 p-3">
      <TransferBanner transfer={transfer} onCancel={cancelTransfer} />
      <div className="msftp flex min-h-0 flex-1 gap-2.5">
        <Pane
          pane={left}
          hosts={hosts}
          editors={editors}
          busy={busy}
          onDropPane={onDropPane}
          onDropFiles={onDropFiles}
          onTransfer={() => send(left, right, [...left.sel])}
          transferLabel={label(left, right)}
          openForm={openForm}
          toast={toast}
        />
        <div className="flex flex-col justify-center gap-2">
          <Button
            size="icon"
            className="size-9 rounded-xl shadow-xs"
            title={t('Nach rechts übertragen')}
            disabled={busy || !left.sel.size}
            onClick={() => send(left, right, [...left.sel])}
          >
            <ArrowLeft className="size-4 rotate-180" />
          </Button>
          <Button
            size="icon"
            className="size-9 rounded-xl shadow-xs"
            title={t('Nach links übertragen')}
            disabled={busy || !right.sel.size}
            onClick={() => send(right, left, [...right.sel])}
          >
            <ArrowLeft className="size-4" />
          </Button>
          {busy && (
            <Button
              variant="destructive"
              size="icon"
              className="size-9 rounded-xl shadow-xs"
              title={t('Abbrechen')}
              onClick={cancelTransfer}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
        <Pane
          pane={right}
          hosts={hosts}
          editors={editors}
          busy={busy}
          onDropPane={onDropPane}
          onDropFiles={onDropFiles}
          onTransfer={() => send(right, left, [...right.sel])}
          transferLabel={label(right, left)}
          openForm={openForm}
          toast={toast}
        />
      </div>
    </div>
  );
}
