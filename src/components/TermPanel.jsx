import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, Check, ChevronRight, Clock, Activity, Code2, Palette, Plus, Minus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ForwardSheet from '@/components/ForwardSheet';
import FormDialog from '@/components/FormDialog';
import { vars, fill } from '@/lib/snippetVars.mjs';
import { AUTO, FONTS, THEMES } from '@/lib/termThemes';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

// Kleine Vorschau eines Farbschemas (Zeilen in Vorder-, Grün-, Blau- und Rotton)
const Swatch = ({ th }) => (
  <div className="flex h-[38px] w-[60px] shrink-0 flex-col justify-center gap-[5px] rounded-md border px-1.5" style={{ background: th.background }}>
    <div className="h-[3px] rounded-full" style={{ background: th.foreground, width: '85%' }} />
    <div className="flex gap-[3px]">{[th.green ?? th.foreground, th.foreground, th.blue ?? th.foreground].map((c, i) => <div key={i} className="h-[3px] flex-1 rounded-full" style={{ background: c }} />)}</div>
    <div className="h-[3px] rounded-full" style={{ background: th.red ?? th.foreground, width: '55%' }} />
  </div>
);

// Server-Status: fragt alle 5 s über den Hauptprozess ab, solange der Tab sichtbar ist (nur Linux)
const gb = (b) => (b / 1073741824).toFixed(1);
const Bar = ({ pct }) => <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-primary')} style={{ width: `${Math.min(100, pct)}%` }} /></div>;
const Stat = ({ title, value, pct }) => <div className="space-y-1.5 px-3 py-2"><div className="flex justify-between gap-2 text-sm"><span className="font-medium">{title}</span><span className="truncate text-muted-foreground tabular-nums">{value}</span></div>{pct != null && <Bar pct={pct} />}</div>;
function StatusTab({ sid }) {
  const t = useT();
  const [st, setSt] = useState(undefined); // undefined = lädt, null = nicht verfügbar
  useEffect(() => {
    let alive = true;
    const poll = () => api.stats(sid).then((r) => alive && setSt(r), () => alive && setSt(null));
    poll();
    const iv = setInterval(poll, 5000);
    return () => { alive = false; clearInterval(iv); };
  }, [sid]);
  if (st === undefined) return <p className="p-3 text-sm text-muted-foreground">{t('Lädt …')}</p>;
  if (!st) return <p className="p-3 text-sm text-muted-foreground">{t('Server-Status nicht verfügbar (nur Linux).')}</p>;
  const d = Math.floor(st.uptime / 86400), h = Math.floor((st.uptime % 86400) / 3600), m = Math.floor((st.uptime % 3600) / 60);
  return (
    <>
      <Stat title={t('CPU-Last')} value={`${st.load.map((x) => x.toFixed(2)).join(' · ')} (${st.cores} ${t('Kerne')})`} pct={(st.load[0] / st.cores) * 100} />
      <Stat title={t('Arbeitsspeicher')} value={`${gb(st.memUsed)} / ${gb(st.memTotal)} GB`} pct={(st.memUsed / st.memTotal) * 100} />
      <Stat title={t('Festplatte (/)')} value={`${gb(st.diskUsed)} / ${gb(st.diskTotal)} GB`} pct={st.diskPct} />
      <Stat title={t('Laufzeit')} value={`${d} ${t('Tage')} ${h} h ${m} min`} />
    </>
  );
}

// Seitenleiste neben dem Terminal: Forwarding dieses Hosts, Snippets, Verlauf, Themes + Schrift
export default function TermPanel({ sid, hostId, dark, history, themeId, setThemeId, font, setFont, toast, rev }) {
  const t = useT();
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('termPanelTab') || 'themes'; } catch { return 'themes'; } });
  const [fontOpen, setFontOpen] = useState(false);
  const [rules, setRules] = useState([]);
  const [snippets, setSnippets] = useState([]);
  const [sheet, setSheet] = useState(null);
  const [form, setForm] = useState(null);
  // Snippet senden; bei {{Platzhaltern}} erst nach Eingabe der Werte
  const run = (cmd) => {
    const vs = vars(cmd);
    if (vs.length) setForm({ title: t('Snippet ausführen'), submitLabel: t('Ausführen'), fields: vs.map((v) => ({ name: v.name, label: v.name })), values: Object.fromEntries(vs.map((v) => [v.name, v.def])), onSubmit: (v) => api.input(sid, fill(cmd, v) + '\n') });
    else api.input(sid, cmd + '\n');
  };
  const pick = (x) => { setTab(x); try { localStorage.setItem('termPanelTab', x); } catch { /* egal */ } };
  const load = useCallback(() => { api.fwd.list().then((l) => setRules(l.filter((r) => r.hostId === hostId))); api.snippets.list().then(setSnippets); }, [hostId]);
  useEffect(() => { load(); }, [load, rev]);
  const TABS = [['fwd', t('Forwarding'), ArrowLeftRight], ['snip', t('Snippets'), Code2], ['hist', t('Verlauf'), Clock], ['status', t('Status'), Activity], ['themes', t('Terminal-Themes'), Palette]];
  const label = (r) => r.label || `${r.type} ${r.bindPort}`;
  const Row = ({ onClick, children }) => <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm hover:bg-accent">{children}</button>;

  return (
    <aside className="flex w-[300px] shrink-0 flex-col overflow-hidden border-s bg-sidebar">
      <div className="flex gap-1 p-3">
        {TABS.map(([id, title, Icon]) => (
          <button key={id} type="button" title={title} aria-label={title} onClick={() => pick(id)}
            className={cn('grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent', tab === id && 'bg-primary/15 text-primary')}><Icon className="size-4" /></button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {tab === 'themes' && (
          <>
            <Row onClick={() => setFontOpen(!fontOpen)}><span className="flex-1 font-medium">{t('Schriftart')}</span><ChevronRight className={cn('size-4 text-muted-foreground transition-transform', fontOpen && 'rotate-90')} /></Row>
            {fontOpen && (
              <div className="space-y-3 px-3 pb-3">
                <Select value={font.family} onValueChange={(v) => setFont({ ...font, family: v })}>
                  <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{FONTS.map(([v, n]) => <SelectItem key={v} value={v}>{n}</SelectItem>)}</SelectContent>
                </Select>
                <div className="flex items-center justify-between text-sm">
                  <span>{t('Schriftgröße')}</span>
                  <div className="flex items-center gap-2">
                    <button type="button" className="grid size-7 place-items-center rounded-md border hover:bg-accent" onClick={() => setFont({ ...font, size: Math.max(9, font.size - 1) })}><Minus className="size-3.5" /></button>
                    <span className="w-6 text-center tabular-nums">{font.size}</span>
                    <button type="button" className="grid size-7 place-items-center rounded-md border hover:bg-accent" onClick={() => setFont({ ...font, size: Math.min(28, font.size + 1) })}><Plus className="size-3.5" /></button>
                  </div>
                </div>
              </div>
            )}
            <p className="px-3 pb-1 pt-3 text-sm font-semibold">{t('Terminal-Themes')}</p>
            {[{ id: 'auto', name: t('Automatisch (App-Design)'), theme: dark ? AUTO.dark : AUTO.light }, ...THEMES].map((x) => (
              <Row key={x.id} onClick={() => setThemeId(x.id)}>
                <Swatch th={x.theme} /><span className="flex-1 truncate">{x.name}</span>{themeId === x.id && <Check className="size-4 text-primary" />}
              </Row>
            ))}
          </>
        )}
        {tab === 'snip' && (
          <>
            {!snippets.length && <p className="p-3 text-sm text-muted-foreground">{t('Keine Snippets.')}</p>}
            {snippets.map((s) => <Row key={s.id} onClick={() => run(s.cmd)}><div className="min-w-0"><div className="truncate font-medium">{s.name}</div><div className="truncate font-mono text-xs text-muted-foreground">{s.cmd}</div></div></Row>)}
          </>
        )}
        {tab === 'hist' && (
          <>
            {!history.length && <p className="p-3 text-sm text-muted-foreground">{t('Noch keine Befehle in dieser Sitzung.')}</p>}
            {[...history].reverse().map((c, i) => <Row key={i} onClick={() => api.input(sid, c)}><span className="truncate font-mono text-xs">{c}</span></Row>)}
          </>
        )}
        {tab === 'status' && <StatusTab sid={sid} />}
        {tab === 'fwd' && (
          <>
            <Row onClick={async () => setSheet({ rule: { hostId }, hosts: await api.hosts.list(), onSave: async (v) => { await api.fwd.save(v); load(); } })}><Plus className="size-4 text-primary" /><span className="font-medium">{t('Neues Forwarding')}</span></Row>
            {!rules.length && <p className="p-3 text-sm text-muted-foreground">{t('Keine Regeln.')}</p>}
            {rules.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg px-3 py-2">
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{label(r)}</div><div className="truncate text-xs text-muted-foreground">{r.type} · {r.bindAddr || '127.0.0.1'}:{r.bindPort}</div></div>
                <Switch checked={!!r.running} onCheckedChange={async () => { const err = await api.fwd.toggle(r.id); if (err) toast(err); load(); }} />
              </div>
            ))}
          </>
        )}
      </div>
      <ForwardSheet spec={sheet} onClose={() => setSheet(null)} />
      <FormDialog spec={form} onClose={() => setForm(null)} />
    </aside>
  );
}
