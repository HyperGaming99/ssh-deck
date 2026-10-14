import { useState } from 'react';
import { FileSpreadsheet, FolderOpen, LayoutGrid, ShieldCheck, TerminalSquare } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

// [Format, Beschriftung, Symbol]; Beschriftungen sind Programmnamen und werden nicht übersetzt
const FORMATS = [['ssh', '~/.ssh/config', FolderOpen], ['csv', 'CSV / Termius', FileSpreadsheet], ['putty', 'PuTTY', TerminalSquare], ['mobaxterm', 'MobaXterm', LayoutGrid], ['securecrt', 'SecureCRT', ShieldCheck]];

// Schritt 1: Format wählen (Datei öffnet sich). Schritt 2: Vorschau mit Zahlen, dann importieren.
export default function ImportDialog({ open, onClose, onDone, toast, vault = 'personal' }) {
  const t = useT();
  const [data, setData] = useState(null);
  const [fmt, setFmt] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => { setData(null); setFmt(''); onClose(); };

  const pick = async (f) => {
    setBusy(true);
    const r = await api.importer.pick(f);
    setBusy(false);
    if (r.canceled) return;
    if (r.error) return toast(r.error);
    setFmt(f); setData(r);
  };
  const commit = async () => {
    setBusy(true);
    const n = await api.importer.commit(vault);
    setBusy(false);
    toast(t('{n} Hosts importiert.', { n }));
    onDone(); close();
  };
  const fresh = data ? data.hosts.filter((h) => !h.dup).length : 0;
  const dups = data ? data.hosts.length - fresh : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Hosts importieren')}</DialogTitle>
          <DialogDescription>{data ? t('{n} Hosts gefunden', { n: data.hosts.length }) : t('Übernimm Verbindungen aus anderen Programmen. Wähle ein Format, um den Import zu starten.')}</DialogDescription>
        </DialogHeader>

        {!data ? (
          <div className="space-y-4 py-2">
            <div className="flex flex-wrap justify-center gap-4">
              {FORMATS.map(([id, label, Icon]) => (
                <button key={id} disabled={busy} onClick={() => pick(id)} className="group flex w-28 flex-col items-center gap-2 text-sm">
                  <span className="grid size-16 place-items-center rounded-2xl border bg-card transition-colors group-hover:border-primary group-hover:bg-accent"><Icon className="size-7 text-muted-foreground group-hover:text-foreground" /></span>
                  <span className="text-center">{label}</span>
                </button>
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground">{t('Für CSV (auch die Vorlage von Termius) braucht die Tabelle eine Spalte „Hostname/IP“ oder „Host“. Weitere Spalten: Label, Port, Username, Groups, Tags, Protocol.')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.hosts.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t('Keine Hosts gefunden.')}</p>}
            {data.hosts.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-xl border">
                {data.hosts.map((h, i) => (
                  <div key={i} className={cn('flex items-center gap-3 border-b px-3 py-2 text-sm last:border-0', h.dup && 'opacity-45')}>
                    <span className={cn('min-w-0 flex-1 truncate font-medium', h.dup && 'line-through')}>{h.name}</span>
                    <span dir="ltr" className="truncate text-xs text-muted-foreground">{h.user ? `${h.user}@` : ''}{h.host}:{h.port}</span>
                    {h.group && <span className="shrink-0 rounded-md bg-secondary px-1.5 text-xs">{h.group}</span>}
                  </div>
                ))}
              </div>
            )}
            {dups > 0 && <p className="text-xs text-muted-foreground">{t('{n} davon sind schon vorhanden und werden übersprungen.', { n: dups })}</p>}
            {data.skipped > 0 && <p className="text-xs text-muted-foreground">{t('{n} Einträge wurden übersprungen (kein SSH oder keine Adresse).', { n: data.skipped })}</p>}
          </div>
        )}

        <DialogFooter>
          {data ? (
            <>
              <Button variant="outline" onClick={() => setData(null)}>{t('Zurück')}</Button>
              <Button disabled={busy || fresh === 0} onClick={commit}>{t('{n} importieren', { n: fresh })}</Button>
            </>
          ) : <Button variant="outline" onClick={close}>{t('Abbrechen')}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
