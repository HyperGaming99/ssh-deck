import { Columns2, Radio, Rows2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Suspense, lazy } from 'react';
const Terminal = lazy(() => import('@/components/Terminal')); // xterm wird erst beim ersten Terminal geladen
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

export const MAX_PANES = 4;

// Panes eines Terminal-Tabs gleichmäßig nebeneinander (row) oder untereinander (col); tab.panes = [{ sid, conn, attempt, closed }]
export default function SplitView({ tab, active, theme, font, onCommand, setFocus, closePane, overlay }) {
  const t = useT();
  const multi = tab.panes.length > 1;
  return (
    <div className={cn('msplit flex min-h-0 min-w-0 flex-1', tab.dir === 'col' ? 'flex-col' : 'flex-row')}>
      {tab.panes.map((p) => {
        const on = tab.focus === p.sid;
        return (
          <div key={p.sid} onMouseDownCapture={() => !on && setFocus(p.sid)}
            className={cn('relative min-h-0 min-w-0 flex-1 p-2', multi && 'border-2', multi && (on ? 'border-primary' : 'border-transparent'))} style={{ background: theme.background }}>
            <Suspense fallback={null}><Terminal sid={p.sid} hostId={tab.hostId} active={active && on} theme={theme} font={font} attempt={p.attempt} reconn={p.reconn} onCommand={onCommand} /></Suspense>
            {multi && <button type="button" title={t('Pane schließen')} aria-label={t('Pane schließen')} onClick={() => closePane(p.sid)}
              className="absolute end-1 top-1 z-20 grid size-5 place-items-center rounded bg-background/60 text-muted-foreground opacity-60 hover:opacity-100"><X className="size-3" /></button>}
            {overlay(p)}
          </div>
        );
      })}
    </div>
  );
}

// Kopfzeilen-Knöpfe: Teilen (rechts/unten) und Broadcast an mehrere Sessions
// bc = { on, ids }, sessions = [{ sid, label }]
export function SplitTools({ tab, split, bc, setBc, sessions }) {
  const t = useT();
  const full = tab.panes.length >= MAX_PANES;
  const toggle = (sid) => setBc({ ...bc, ids: bc.ids.includes(sid) ? bc.ids.filter((x) => x !== sid) : [...bc.ids, sid] });
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="mr-1 size-8" aria-label={t('Terminal teilen')}><Columns2 className="size-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={full} onSelect={() => split('row')}><Columns2 className="size-4" />{t('Teilen → rechts')}<span className="ms-auto ps-4 text-xs text-muted-foreground">Ctrl+Shift+D</span></DropdownMenuItem>
          <DropdownMenuItem disabled={full} onSelect={() => split('col')}><Rows2 className="size-4" />{t('Teilen → unten')}<span className="ms-auto ps-4 text-xs text-muted-foreground">Ctrl+Shift+E</span></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className={cn('mr-1 size-8', bc.on && 'bg-orange-500 text-white hover:bg-orange-600 hover:text-white')} aria-label={t('An alle Sessions senden')}><Radio className="size-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuCheckboxItem checked={bc.on} onCheckedChange={(v) => setBc({ on: v, ids: v && !bc.ids.length ? sessions.map((s) => s.sid) : bc.ids })}>{t('An alle Sessions senden')}</DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t('Ziel-Sessions')}</DropdownMenuLabel>
          {sessions.map((s) => <DropdownMenuCheckboxItem key={s.sid} checked={bc.ids.includes(s.sid)} onSelect={(e) => e.preventDefault()} onCheckedChange={() => toggle(s.sid)}>{s.label}</DropdownMenuCheckboxItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
