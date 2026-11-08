import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Cloud,
  Globe,
  Info,
  Lock,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { TorIcon, TorCircuit } from '@/components/TorIcon';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

// Tor: Sync und/oder Server-Verbindungen über den integrierten Tor-Daemon
export function TorSettings() {
  const t = useT();
  const [c, setC] = useState({ sync: false, servers: false });
  const [res, setRes] = useState(null); // { ok, ip, text }
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
          ip: r.ip,
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

  return (
    <div className="space-y-4">
      {/* 1. Hero Spotlight Card mit Tor Onion Icon */}
      <div className="relative overflow-hidden rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/15 via-card to-card p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative flex shrink-0 items-center justify-center rounded-2xl border border-purple-500/30 bg-background/80 p-2 shadow-md">
              <TorIcon className="size-10" />
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                  {t('Anonymes Onion-Routing')}
                </span>
                <span
                  className={cn(
                    'size-2 rounded-full',
                    isTorActive
                      ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]'
                      : 'bg-muted-foreground/40'
                  )}
                />
                <Badge
                  variant={isTorActive ? 'secondary' : 'outline'}
                  className={cn(
                    'text-[10px] font-mono px-1.5 py-0',
                    isTorActive && 'text-purple-600 dark:text-purple-300 border-purple-500/20 bg-purple-500/10'
                  )}
                >
                  .onion
                </Badge>
              </div>
              <h2 className="text-lg font-bold tracking-tight text-foreground">
                Tor Privacy Network
              </h2>
              <p className="text-xs text-muted-foreground">
                {t('Verbindungen über das weltweite Tor-Netzwerk verschleiern und Zensur umgehen')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
                isTorActive
                  ? 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-300'
                  : 'border-border bg-muted/40 text-muted-foreground'
              )}
            >
              <ShieldCheck className="size-3.5" />
              <span>{isTorActive ? t('Tor-Netzwerk aktiv') : t('Tor-Netzwerk inaktiv')}</span>
            </div>
          </div>
        </div>

        {/* Onion Circuit Visualisierung */}
        <div className="mt-4 pt-3 border-t border-purple-500/15">
          <TorCircuit active={isTorActive} exitIp={res?.ok ? res.ip : null} />
        </div>
      </div>

      {/* 2. Routing Schalter Cards */}
      <div className="space-y-2.5">
        {/* Schalter 1: Cloud-Sync */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-foreground/20">
          <div className="flex items-start gap-3 min-w-0">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Cloud className="size-4.5" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {t('Cloud-Sync über Tor')}
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                  Zero-Knowledge
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t('Verbindungen zum Sync-Server laufen über das Tor-Netzwerk; deine echte IP-Adresse bleibt verborgen.')}
              </p>
            </div>
          </div>
          <div className="self-end sm:self-center shrink-0">
            <Switch checked={c.sync} onCheckedChange={(v) => save({ sync: v })} />
          </div>
        </div>

        {/* Schalter 2: SSH & Server-Verbindungen */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-foreground/20">
          <div className="flex items-start gap-3 min-w-0">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Terminal className="size-4.5" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {t('Server über Tor')}
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal text-purple-600 dark:text-purple-400 border-purple-500/30">
                  SSH · SFTP · Forwarding
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t('SSH-, SFTP- und Forwarding-Verbindungen zu deinen Hosts laufen über Tor.')}
              </p>
            </div>
          </div>
          <div className="self-end sm:self-center shrink-0">
            <Switch checked={c.servers} onCheckedChange={(v) => save({ servers: v })} />
          </div>
        </div>
      </div>

      {/* 3. Sicherheitsmerkmale Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="flex flex-col gap-1 rounded-2xl border bg-card/60 p-3.5">
          <div className="flex items-center gap-2 text-foreground font-semibold text-xs">
            <TorIcon className="size-4" glow={false} />
            <span>{t('Onion-Routing (3 Hops)')}</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            3-Layer SOCKS5 Routing über Entry-, Middle- und Exit-Nodes.
          </p>
        </div>

        <div className="flex flex-col gap-1 rounded-2xl border bg-card/60 p-3.5">
          <div className="flex items-center gap-2 text-foreground font-semibold text-xs">
            <Shield className="size-4 text-emerald-500" />
            <span>{t('DNS-Leckschutz')}</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Hostnamen werden remote erst am Tor-Exit-Knoten aufgelöst.
          </p>
        </div>

        <div className="flex flex-col gap-1 rounded-2xl border bg-card/60 p-3.5">
          <div className="flex items-center gap-2 text-foreground font-semibold text-xs">
            <Globe className="size-4 text-blue-500" />
            <span>{t('Automatischer LAN-Bypass')}</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {t('Lokale Adressen (z. B. 192.168.x.x) bleiben im Heimnetzwerk')}
          </p>
        </div>
      </div>

      {/* 4. Verbindungstest & Diagnose */}
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h3 className="text-xs font-semibold text-foreground">
              {t('Verbindung testen')}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Überprüft den integrierten Tor-SOCKS5-Proxy und ermittelt die aktuelle Exit-IP.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={test}
            disabled={busy}
            className="h-9 gap-1.5 rounded-xl text-xs font-medium self-start sm:self-center"
          >
            <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} />
            {busy ? t('Bitte warten …') : t('Verbindung testen')}
          </Button>
        </div>

        {/* Testergebnis */}
        {res && (
          <div
            className={cn(
              'flex items-center gap-3 rounded-xl border p-3.5 text-xs transition-colors',
              res.ok
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-destructive/30 bg-destructive/10 text-destructive'
            )}
          >
            {res.ok ? (
              <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <ShieldAlert className="size-4 shrink-0 text-destructive" />
            )}
            <span className="font-medium leading-relaxed">{res.text}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default TorSettings;
