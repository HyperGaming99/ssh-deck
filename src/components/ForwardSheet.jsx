import { useEffect, useState } from 'react';
import { ArrowLeft, BrickWall, Laptop, PanelRightClose, Server } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

export const TYPES = ['local', 'remote', 'dynamic'];
const typeLabel = { local: 'Local', remote: 'Remote', dynamic: 'Dynamic' };
const STEPS = { local: ['type', 'bind', 'host', 'dest', 'label'], remote: ['type', 'bind', 'host', 'dest', 'label'], dynamic: ['type', 'bind', 'host', 'label'] };

// Schema: Rechner – Firewall – Ziel oben, Zwischen-Host unten; nicht beteiligte Teile werden abgedunkelt
function Diagram({ hl }) {
  const dim = (id) => ({ opacity: !hl || hl.includes(id) ? 1 : 0.3, transition: 'opacity .2s' });
  const box = 'fill-secondary';
  return (
    <svg viewBox="0 0 300 150" className="mx-auto h-36 w-full max-w-[300px]">
      <g style={dim('client')}><rect x="22" y="14" width="46" height="46" rx="12" className={box} /><Laptop x="33" y="25" width="24" height="24" className="text-muted-foreground" /></g>
      <g style={dim('wall')}><line x1="76" y1="37" x2="118" y2="37" stroke="var(--destructive)" strokeWidth="2" /><BrickWall x="122" y="12" width="46" height="50" className="text-destructive" /></g>
      <g style={dim('dest')}><rect x="232" y="14" width="46" height="46" rx="12" className={box} /><Server x="243" y="25" width="24" height="24" className="text-muted-foreground" /></g>
      <g style={dim('host')} className="text-success">
        <line x1="108" y1="72" x2="128" y2="96" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
        <line x1="192" y1="72" x2="172" y2="96" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
        <rect x="127" y="96" width="46" height="46" rx="12" className={box} /><Server x="138" y="107" width="24" height="24" className="text-muted-foreground" />
      </g>
    </svg>
  );
}

const Field = ({ label, children }) => <label className="grid gap-1 text-xs text-primary">{label}{children}</label>;

// spec: { rule (bestehend oder {}), hosts, onSave }
export default function ForwardSheet({ spec, onClose }) {
  const t = useT();
  const [v, setV] = useState({});
  const [step, setStep] = useState(0);
  const [skip, setSkip] = useState(false);
  useEffect(() => { setV(spec?.rule ?? {}); setStep(0); setSkip(false); }, [spec]);
  if (!spec) return null;
  const editing = !!spec.rule.id || skip;
  const type = v.type || 'local', steps = STEPS[type], cur = editing ? 'all' : steps[step];
  const set = (k, x) => setV((o) => ({ ...o, [k]: x }));
  const remote = type === 'remote';
  const hl = { type: null, bind: remote ? ['host'] : ['client'], host: ['host'], dest: remote ? ['client'] : ['dest'], label: null, all: null }[cur];
  const bindOk = +v.bindPort > 0, hostOk = !!v.hostId, destOk = !!v.destHost && +v.destPort > 0;
  const ok = { type: true, bind: bindOk, host: hostOk, dest: destOk, label: true, all: bindOk && hostOk && (type === 'dynamic' || destOk) }[cur];
  const next = () => setStep((s) => s + 1);
  const save = async () => { await spec.onSave({ ...v, type, label: v.label?.trim() || `${typeLabel[type]} ${v.bindPort}` }); onClose(); };

  const desc = { local: t('Local Forwarding macht einen Port des Servers so zugänglich, als wäre er lokal.'), remote: t('Remote Forwarding macht einen lokalen Dienst über einen Port des Servers erreichbar.'),
    dynamic: t('Dynamic Forwarding startet einen lokalen SOCKS5-Proxy, der den Verkehr über den Server leitet.') };
  const bindFields = (
    <>
      <Field label={`${remote ? t('Port') : t('Lokaler Port')} *`}><Input type="number" autoFocus value={v.bindPort ?? ''} onChange={(e) => set('bindPort', e.target.value)} /></Field>
      <Field label={t('Bind-Adresse')}><Input placeholder="127.0.0.1" value={v.bindAddr ?? ''} onChange={(e) => set('bindAddr', e.target.value)} /></Field>
    </>
  );
  const hostField = (
    <Select value={v.hostId ?? ''} onValueChange={(x) => set('hostId', x)}>
      <SelectTrigger><SelectValue placeholder={t('Auswählen …')} /></SelectTrigger>
      <SelectContent>{spec.hosts.filter((h) => h.protocol !== 'telnet').map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
    </Select>
  );
  const destFields = (
    <>
      <Field label={`${t('Zieladresse')} *`}><Input autoFocus value={v.destHost ?? ''} onChange={(e) => set('destHost', e.target.value)} /></Field>
      <Field label={`${t('Ziel-Port')} *`}><Input type="number" value={v.destPort ?? ''} onChange={(e) => set('destPort', e.target.value)} /></Field>
    </>
  );
  const labelField = <Field label={t('Bezeichnung')}><Input autoFocus value={v.label ?? ''} placeholder={`${typeLabel[type]} ${v.bindPort ?? ''}`} onChange={(e) => set('label', e.target.value)} /></Field>;

  const heading = {
    type: [t('Art des Port-Forwardings wählen:'), null],
    bind: [remote ? t('Port und Bind-Adresse auf dem Server festlegen:') : t('Lokalen Port und Bind-Adresse festlegen:'),
      type === 'dynamic' ? t('Dieser Port wird auf diesem Rechner als SOCKS5-Proxy geöffnet.') : remote ? t('Dieser Port wird auf dem Server geöffnet und leitet den Verkehr an diesen Rechner.') : t('Dieser Port wird auf diesem Rechner geöffnet und leitet den Verkehr an den Zielhost.')],
    host: [t('Zwischen-Host wählen:'), t('Dieser Server dient als Zwischenstation, über die der Tunnel läuft.')],
    dest: [t('Ziel festlegen:'), t('IP-Adresse/Hostname und Port des Ziels, an das der Verkehr geleitet wird.')],
    label: [t('Bezeichnung festlegen:'), null],
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-sm [&>button]:hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div><SheetTitle className="text-sm">{editing ? t('Forwarding bearbeiten') : t('Neues Forwarding')}</SheetTitle><SheetDescription className="sr-only">{desc[type]}</SheetDescription></div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><PanelRightClose className="size-5" /></button>
        </div>
        <div className="m-3 overflow-y-auto rounded-xl bg-secondary/40 p-4">
          {!editing && step > 0 && <button type="button" onClick={() => setStep(step - 1)} className="mb-3 flex items-center gap-1.5 text-sm font-medium text-primary"><ArrowLeft className="size-4" />{t('Zurück')}</button>}
          <Diagram hl={hl} />
          <div className="mt-4 grid gap-3">
            {editing ? (
              <>
                <div className="flex gap-1 rounded-lg border p-0.5">{TYPES.map((x) => <button key={x} type="button" onClick={() => set('type', x)} className={cn('flex-1 rounded-md py-1 text-sm', type === x ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>{typeLabel[x]}</button>)}</div>
                {labelField}{bindFields}{hostField}{type !== 'dynamic' && destFields}
                <Button disabled={!ok} onClick={save}>{t('Speichern')}</Button>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">{heading[cur][0]}</p>
                {cur === 'type' && (
                  <>
                    <div className="flex gap-1 rounded-lg border p-0.5">{TYPES.map((x) => <button key={x} type="button" onClick={() => set('type', x)} className={cn('flex-1 rounded-md py-1 text-sm', type === x ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}>{typeLabel[x]}</button>)}</div>
                    <p className="text-sm">{desc[type]}</p>
                  </>
                )}
                {heading[cur][1] && <p className="text-sm">{heading[cur][1]}</p>}
                {cur === 'bind' && bindFields}{cur === 'host' && hostField}{cur === 'dest' && destFields}{cur === 'label' && labelField}
                <Button disabled={!ok} onClick={cur === 'label' ? save : next}>{cur === 'label' ? t('Fertig') : t('Weiter')}</Button>
                {cur === 'type' && <Button variant="secondary" onClick={() => setSkip(true)}>{t('Assistent überspringen')}</Button>}
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
