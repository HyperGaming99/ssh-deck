import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';

// Tor: Sync und/oder Server-Verbindungen über den integrierten Tor-Daemon (Einstellungen liegen pro Gerät im Hauptprozess)
export function TorSettings() {
  const t = useT();
  const [c, setC] = useState({ sync: false, servers: false });
  const [res, setRes] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.settings.get().then((s) => s.tor && setC({ sync: !!s.tor.sync, servers: !!s.tor.servers })); }, []);
  const save = (patch) => { const n = { ...c, ...patch }; setC(n); setRes(null); api.settings.set({ tor: n }); };
  const test = async () => {
    setBusy(true); setRes(null);
    const r = await api.tor.test();
    setBusy(false);
    setRes(r.state === 'ok' ? { ok: true, text: t('Tor-Verbindung funktioniert. Ausgangs-IP: {ip}', { ip: r.ip }) }
      : { text: r.state === 'notor' ? t('Der Proxy antwortet, aber die Verbindung läuft nicht über Tor.') : t('Server nicht erreichbar.') });
  };
  const row = 'mrow flex items-center justify-between gap-4 rounded-xl border bg-card p-4';
  return (
    <>
      <div className={row}>
        <div><p className="text-sm font-medium">{t('Cloud-Sync über Tor')}</p><p className="text-xs text-muted-foreground">{t('Verbindungen zum Sync-Server laufen über das Tor-Netzwerk; deine echte IP-Adresse bleibt verborgen.')}</p></div>
        <Switch checked={c.sync} onCheckedChange={(v) => save({ sync: v })} />
      </div>
      <div className={row}>
        <div><p className="text-sm font-medium">{t('Server über Tor')}</p><p className="text-xs text-muted-foreground">{t('SSH-, SFTP- und Forwarding-Verbindungen zu deinen Hosts laufen über Tor.')}</p></div>
        <Switch checked={c.servers} onCheckedChange={(v) => save({ servers: v })} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={test} disabled={busy}>{busy ? t('Bitte warten …') : t('Verbindung testen')}</Button>
        {res && <p className={cn('text-sm', res.ok ? 'text-success' : 'text-destructive')}>{res.text}</p>}
      </div>
    </>
  );
}

export default TorSettings;
