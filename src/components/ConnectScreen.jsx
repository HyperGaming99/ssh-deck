import { useState } from 'react';
import { Fingerprint, Plug, Server, Terminal as TermIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AskForm from '@/components/AskForm';
import HostIcon from '@/components/HostIcon';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

// Verbindungsbildschirm über dem Terminal: Fortschritt, Protokoll, Rückfragen (Benutzer/Passwort) und Fehleransicht.
// conn = { state: connecting|ask|failed, ask?: user|password, log: string[], info }
export default function ConnectScreen({ conn, onAnswer, onClose, onEdit, onRetry }) {
  const t = useT();
  const [showLog, setShowLog] = useState(false);
  const failed = conn.state === 'failed', asking = conn.state === 'ask', hk = asking && conn.ask.kind === 'hostkey';
  const { info = {} } = conn;
  const past = (re) => conn.log.some((l) => re.test(l));
  const pct = failed ? 100 : hk ? 50 : past(/handshake/) ? 80 : 20; // Fortschritt: verbinden – Host-Schlüssel – Anmeldung
  const dot = (cls, icon) => <span className={cn('grid size-6 place-items-center rounded-full text-white', cls)}>{icon}</span>;
  const k = hk && conn.ask, changed = hk && !!k.old;
  const Fp = ({ label, value }) => <div className="space-y-1">{label && <p className="text-xs text-muted-foreground">{label}</p>}<p dir="ltr" className="break-all font-mono text-sm">{value}</p></div>;
  return (
    <div className="absolute inset-0 z-10 flex justify-center overflow-y-auto bg-background pt-[120px]">
      <div className="w-[396px] space-y-6 pb-10">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary/15 [&>img]:size-6">{info.icon || info.autoIcon ? <HostIcon slug={info.icon || info.autoIcon} /> : <Server className="size-5 text-primary" />}</div>
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{info.name}</div><div className="truncate text-xs text-muted-foreground">SSH {info.host}:{info.port}</div></div>
          {failed
            ? <Button variant="secondary" size="sm" onClick={() => navigator.clipboard?.writeText(conn.log.join('\n'))}>{t('Logs kopieren')}</Button>
            : <Button variant="secondary" size="sm" onClick={() => setShowLog(!showLog)}>{showLog ? t('Logs ausblenden') : t('Logs anzeigen')}</Button>}
        </div>
        <div className="relative flex items-center justify-between">
          <div className="absolute inset-x-3 h-0.5 rounded bg-border" />
          <div className={cn('absolute start-3 h-0.5 rounded transition-all', failed ? 'bg-destructive' : 'bg-primary', !asking && !failed && 'animate-pulse')} style={{ width: `calc((100% - 24px) * ${pct / 100})` }} />
          {dot(failed ? 'bg-destructive' : 'bg-primary', <Plug className="size-3.5" />)}
          {dot(failed ? 'bg-destructive' : pct >= 50 ? 'bg-primary' : 'bg-muted-foreground', <Fingerprint className="size-3.5" />)}
          {dot(failed ? 'bg-destructive' : 'bg-muted-foreground', <TermIcon className="size-3.5" />)}
        </div>
        {hk ? (
          <>
            <p className={cn('text-lg font-semibold', changed && 'text-destructive')}>{changed ? t('Host-Schlüssel hat sich geändert!') : t('Bist du sicher, dass du verbinden möchtest?')}</p>
            <p className="text-sm">{changed ? t('Der Schlüssel von {host} stimmt nicht mehr mit dem gespeicherten überein. Das kann ein Angriff (Man-in-the-Middle) sein – oder der Server wurde neu installiert.', { host: k.host })
              : t('Die Echtheit von {host} kann nicht bestätigt werden.', { host: k.host })}</p>
            {changed && <Fp label={t('Gespeichert')} value={k.old} />}
            <Fp label={changed ? t('Neu') : t('Fingerabdruck ({type}):', { type: k.type })} value={k.fingerprint} />
            {!changed && <p className="text-sm">{t('Soll er zur Liste bekannter Hosts hinzugefügt werden?')}</p>}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>{t('Schließen')}</Button>
              <Button variant="secondary" className="ms-auto" onClick={() => onAnswer({ save: false })}>{t('Weiter')}</Button>
              <Button variant={changed ? 'destructive' : 'default'} onClick={() => onAnswer({ save: true })}>{changed ? t('Ersetzen und verbinden') : t('Hinzufügen und weiter')}</Button>
            </div>
          </>
        ) : asking ? (
          <AskForm ask={conn.ask} cancelLabel={t('Schließen')} onAnswer={(a) => (a ? onAnswer(a) : onClose())} />
        ) : (
          <>
            {failed && <p className="text-center text-sm font-semibold text-destructive">{t('Verbindung fehlgeschlagen. Verbindungsprotokoll:')}</p>}
            {(failed || showLog || !asking) && <div dir="ltr" className="space-y-2 rounded-2xl bg-card p-5 text-sm">{conn.log.map((l, i) => <p key={i} className={cn(!failed && i < conn.log.length - 1 && 'text-muted-foreground')}>{l}</p>)}</div>}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>{t('Schließen')}</Button>
              {failed && <><Button variant="secondary" onClick={onEdit}>{t('Host bearbeiten')}</Button><Button className="ms-auto" onClick={onRetry}>{t('Neu starten')}</Button></>}
            </div>
          </>
        )}
        {asking && showLog && <div dir="ltr" className="space-y-2 rounded-2xl bg-card p-5 text-sm">{conn.log.map((l, i) => <p key={i}>{l}</p>)}</div>}
      </div>
    </div>
  );
}
