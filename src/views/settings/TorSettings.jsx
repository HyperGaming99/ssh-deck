import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { TorIcon } from '@/components/TorIcon';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

// Tor: Sync und/oder Server-Verbindungen über den integrierten Tor-Daemon
export function TorSettings() {
  const t = useT();
  const [c, setC] = useState({ sync: false, servers: false });
  const [res, setRes] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.settings.get().then((s) => s.tor && setC({ sync: !!s.tor.sync, servers: !!s.tor.servers }));
  }, []);

  const save = (patch) => {
    const n = { ...c, ...patch };
    setC(n);
    setRes(null);
    api.settings.set({ tor: n });
  };

  const test = async () => {
    setBusy(true);
    setRes(null);
    try {
      const r = await api.tor.test();
      if (r?.state === 'ok') {
        setRes({
          ok: true,
          text: t('Tor-Verbindung funktioniert. Ausgangs-IP: {ip}', { ip: r.ip }),
        });
      } else if (r?.state === 'notor') {
        setRes({
          ok: false,
          text: t('Der Proxy antwortet, aber die Verbindung läuft nicht über Tor.'),
        });
      } else {
        setRes({
          ok: false,
          text: t('Server nicht erreichbar.'),
        });
      }
    } catch {
      setRes({
        ok: false,
        text: t('Server nicht erreichbar.'),
      });
    } finally {
      setBusy(false);
    }
  };

  const isTorActive = c.sync || c.servers;
  const row = 'mrow flex items-center justify-between gap-4 rounded-xl border bg-card p-4';

  return (
    <div className="space-y-3">
      {/* Status-Kopfzeile */}
      <div className={row}>
        <div className="flex items-center gap-3">
          <TorIcon className="size-5 shrink-0" />
          <div>
            <p className="text-sm font-medium">{t('Anonymes Onion-Routing')}</p>
            <p className="text-xs text-muted-foreground">
              {t('Verbindungen über das weltweite Tor-Netzwerk verschleiern und Zensur umgehen')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('size-2 rounded-full', isTorActive ? 'bg-emerald-500' : 'bg-muted-foreground/30')} />
          <span className="text-xs text-muted-foreground">
            {isTorActive ? t('Tor-Netzwerk aktiv') : t('Tor-Netzwerk inaktiv')}
          </span>
        </div>
      </div>

      {/* Cloud-Sync */}
      <div className={row}>
        <div>
          <p className="text-sm font-medium">{t('Cloud-Sync über Tor')}</p>
          <p className="text-xs text-muted-foreground">
            {t('Verbindungen zum Sync-Server laufen über das Tor-Netzwerk; deine echte IP-Adresse bleibt verborgen.')}
          </p>
        </div>
        <Switch checked={c.sync} onCheckedChange={(v) => save({ sync: v })} />
      </div>

      {/* Server & SSH */}
      <div className={row}>
        <div>
          <p className="text-sm font-medium">{t('Server über Tor')}</p>
          <p className="text-xs text-muted-foreground">
            {t('SSH-, SFTP- und Forwarding-Verbindungen zu deinen Hosts laufen über Tor.')}
          </p>
        </div>
        <Switch checked={c.servers} onCheckedChange={(v) => save({ servers: v })} />
      </div>

      {/* Verbindungstest */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={test} disabled={busy} className="h-8 text-xs">
            {busy && <RefreshCw className="mr-1.5 size-3 animate-spin" />}
            {busy ? t('Bitte warten …') : t('Verbindung testen')}
          </Button>
          {res && (
            <p className={cn('text-xs font-medium', res.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
              {res.text}
            </p>
          )}
        </div>
        {isTorActive && (
          <span className="text-[11px] font-mono text-muted-foreground">
            127.0.0.1:9050 (.onion OK)
          </span>
        )}
      </div>
    </div>
  );
}

export default TorSettings;
