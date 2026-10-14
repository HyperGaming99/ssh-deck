import { ShieldAlert, ShieldQuestion } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';

// Frage bei unbekanntem oder geändertem Host-Schlüssel. Schließen/Abbrechen = ablehnen (die Verbindung bricht ab).
export default function HostKeyDialog({ info, onAnswer }) {
  const t = useT();
  if (!info) return null;
  const changed = !!info.old;
  const host = info.port === 22 ? info.host : `${info.host}:${info.port}`;
  const Fp = ({ label, value }) => (
    <div className="space-y-1">
      {label && <p className="text-xs font-medium text-muted-foreground">{label}</p>}
      <p dir="ltr" className="break-all rounded-lg border bg-muted px-3 py-2 font-mono text-xs">{value}</p>
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onAnswer(false)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${changed ? 'text-destructive' : ''}`}>
            {changed ? <ShieldAlert className="size-5" /> : <ShieldQuestion className="size-5" />}
            {changed ? t('Host-Schlüssel hat sich geändert!') : t('Unbekannter Host')}
          </DialogTitle>
          <DialogDescription>
            {changed
              ? t('Der Schlüssel von {host} stimmt nicht mehr mit dem gespeicherten überein. Das kann ein Angriff (Man-in-the-Middle) sein – oder der Server wurde neu installiert.', { host })
              : t('Dem Server {host} wurde noch nicht vertraut. Prüfe den Fingerabdruck seines Schlüssels ({type}), bevor du verbindest:', { host, type: info.type })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {changed && <Fp label={t('Gespeichert')} value={info.old} />}
          <Fp label={changed ? t('Neu') : null} value={info.fingerprint} />
        </div>
        <DialogFooter>
          <Button variant="outline" autoFocus onClick={() => onAnswer(false)}>{t('Abbrechen')}</Button>
          <Button variant={changed ? 'destructive' : 'default'} onClick={() => onAnswer(true)}>{changed ? t('Ersetzen und verbinden') : t('Vertrauen und verbinden')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
