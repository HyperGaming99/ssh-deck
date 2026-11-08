import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpCircle,
  Check,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  GitBranch,
  GitFork,
  History,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';
import ReleaseNotes from './ReleaseNotes';

// Update-Einstellungen: Version, Prüfen, automatisch prüfen, Quelle, Installieren
export function UpdatesSettings() {
  const t = useT();
  const [s, setS] = useState({ auto: true, repo: '', channel: 'stable' });
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [err, setErr] = useState('');
  const [rel, setRel] = useState({ list: [], pick: '' }); // Versionswahl, auch ältere

  const check = useCallback(async () => {
    setBusy(true); setErr('');
    const r = await api.update.check();
    setBusy(false); setRes(r);
    if (r?.error) setErr(r.error);
    api.update.list().then((l) => l?.list && setRel((prev) => ({ ...prev, list: l.list })));
  }, []);

  useEffect(() => {
    api.settings.get().then((x) => setS({
      auto: x.updates?.auto !== false,
      repo: x.updates?.repo || '',
      channel: x.updates?.channel === 'dev' ? 'dev' : 'stable'
    })).then(check);
  }, [check]);

  const save = (p) => { const n = { ...s, ...p }; setS(n); api.settings.set({ updates: n }); };

  useEffect(() => {
    api.update.list().then((r) => r?.list && setRel({ list: r.list, pick: '' }));
  }, []);

  const install = async (v) => {
    setInstalling(true); setErr('');
    const r = await api.update.install(v);
    if (r?.error) { setInstalling(false); setErr(r.error); }
  };

  const isDevRel = (r) => !!r.prerelease || /-dev\./i.test(r.version) || /-/.test(r.version);
  const channelList = useMemo(() => {
    return rel.list.filter((r) => (s.channel === 'dev' ? isDevRel(r) : !isDevRel(r)));
  }, [rel.list, s.channel]);

  useEffect(() => {
    if (rel.pick && !channelList.some((r) => r.version === rel.pick)) {
      setRel((prev) => ({ ...prev, pick: '' }));
    }
  }, [channelList, rel.pick]);

  const currentVer = res?.current || '0.1.8';

  return (
    <div className="max-w-xl space-y-4">
      {/* 1. Hero Version Card */}
      <div className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm">
        <div className="pointer-events-none absolute -right-12 -top-12 size-36 rounded-full bg-primary/10 blur-2xl" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
              {res?.available ? (
                <ArrowUpCircle className="size-6 text-amber-500 animate-bounce" />
              ) : (
                <ShieldCheck className="size-6 text-emerald-500" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">SSH Deck</h2>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border">
                  v{currentVer}
                </span>
                <span className={cn(
                  'text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full',
                  s.channel === 'dev'
                    ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                    : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                )}>
                  {s.channel === 'dev' ? 'Dev Channel' : 'Stable'}
                </span>
              </div>

              <div className="mt-1.5 flex items-center gap-2 text-xs">
                {busy ? (
                  <span className="flex items-center gap-1.5 text-primary">
                    <RefreshCw className="size-3 animate-spin" />
                    {t('Wird geprüft …')}
                  </span>
                ) : installing ? (
                  <span className="flex items-center gap-1.5 text-primary">
                    <RefreshCw className="size-3 animate-spin" />
                    {t('Update wird installiert …')}
                  </span>
                ) : err ? (
                  <span className="flex items-center gap-1.5 text-destructive font-medium">
                    <AlertTriangle className="size-3.5" />
                    {t(err)}
                  </span>
                ) : res?.available ? (
                  <span className="flex items-center gap-1.5 text-amber-500 font-medium">
                    <span className="relative flex size-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full size-2 bg-amber-500" />
                    </span>
                    {t('Version {v} ist verfügbar.', { v: res.latest })}
                  </span>
                ) : res?.latest ? (
                  <span className="flex items-center gap-1.5 text-emerald-500 font-medium">
                    <CheckCircle2 className="size-3.5" />
                    {t('Du hast die neueste Version.')}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t('Version {v}', { v: currentVer })}</span>
                )}
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={busy || installing}
            onClick={check}
            className="self-start sm:self-center gap-2 font-medium shadow-sm hover:border-primary/50 transition-all"
          >
            <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} />
            {t('Jetzt prüfen')}
          </Button>
        </div>
      </div>

      {/* 2. Highlight Box wenn Update verfügbar */}
      {res?.available && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-primary/10 pb-3">
            <div className="flex items-center gap-2.5">
              <Sparkles className="size-5 text-primary" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {t('Version {v} ist verfügbar.', { v: res.latest })}
                </h3>
                <p className="text-xs text-muted-foreground">Neues Release auf GitHub bereit</p>
              </div>
            </div>
            {res.canInstall ? (
              <Button size="sm" disabled={installing} onClick={() => install()} className="gap-2">
                <Download className="size-4" />
                {installing ? t('Update wird installiert …') : t('Installieren und neu starten')}
              </Button>
            ) : (
              <Button size="sm" onClick={() => api.update.openPage()} className="gap-2">
                <ExternalLink className="size-4" />
                {t('Release-Seite öffnen')}
              </Button>
            )}
          </div>

          {res.notes && (
            <div className="space-y-1.5 pt-1">
              <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <GitBranch className="size-3.5 text-primary" />
                Changelog &amp; Release Notes:
              </p>
              <ReleaseNotes text={res.notes} />
            </div>
          )}
        </div>
      )}

      {/* 3. Update-Kanal (Visuelle Karten-Auswahl) */}
      <div className="space-y-2 pt-1">
        <h3 className="text-sm font-semibold">{t('Update-Kanal')}</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Stabil Card */}
          <button
            type="button"
            onClick={() => { save({ channel: 'stable' }); setTimeout(check, 50); }}
            className={cn(
              'group relative flex flex-col justify-between rounded-2xl border p-4 text-start transition-all',
              s.channel === 'stable'
                ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm'
                : 'border-border bg-card hover:border-zinc-500/40 hover:bg-accent/40'
            )}
          >
            <div className="flex items-start justify-between w-full">
              <div className="flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t('Stabil')}</p>
                  <span className="text-[10px] font-medium text-emerald-500 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                    Empfohlen
                  </span>
                </div>
              </div>
              <div className={cn(
                'grid size-5 place-items-center rounded-full border transition-colors',
                s.channel === 'stable' ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'
              )}>
                {s.channel === 'stable' && <Check className="size-3 stroke-[3]" />}
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              Gründlich getestete Hauptversionen mit maximaler Zuverlässigkeit für den täglichen Einsatz.
            </p>
          </button>

          {/* Dev Card */}
          <button
            type="button"
            onClick={() => { save({ channel: 'dev' }); setTimeout(check, 50); }}
            className={cn(
              'group relative flex flex-col justify-between rounded-2xl border p-4 text-start transition-all',
              s.channel === 'dev'
                ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm'
                : 'border-border bg-card hover:border-zinc-500/40 hover:bg-accent/40'
            )}
          >
            <div className="flex items-start justify-between w-full">
              <div className="flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <Sparkles className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t('Dev (Vorabversionen)')}</p>
                  <span className="text-[10px] font-medium text-purple-400 bg-purple-500/10 px-1.5 py-0.2 rounded border border-purple-500/20">
                    Vorab-Builds
                  </span>
                </div>
              </div>
              <div className={cn(
                'grid size-5 place-items-center rounded-full border transition-colors',
                s.channel === 'dev' ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'
              )}>
                {s.channel === 'dev' && <Check className="size-3 stroke-[3]" />}
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              {t('Dev-Versionen erscheinen bei jedem Push und können Fehler enthalten.')}
            </p>
          </button>
        </div>
      </div>

      {/* 4. Automatische Updates Toggle Card */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Clock className="size-4.5" />
          </div>
          <div>
            <p className="text-sm font-medium">{t('Automatisch nach Updates suchen')}</p>
            <p className="text-xs text-muted-foreground">Prüft periodisch im Hintergrund auf neue GitHub-Releases</p>
          </div>
        </div>
        <Switch checked={s.auto} onCheckedChange={(v) => save({ auto: v })} />
      </div>

      {/* 5. Versionsverlauf & Versionsauswahl (Archiv / Rollback) */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-muted text-muted-foreground">
              <History className="size-4.5" />
            </div>
            <div>
              <p className="text-sm font-medium">{t('Andere Version installieren (auch ältere)')}</p>
              <p className="text-xs text-muted-foreground">
                {s.channel === 'dev' ? t('Zeigt nur Dev-Versionen.') : t('Zeigt nur stabile Versionen.')}
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-medium text-muted-foreground tabular-nums">
            {channelList.length} Releases
          </span>
        </div>

        {channelList.length > 0 ? (
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Select value={rel.pick || undefined} onValueChange={(v) => setRel((prev) => ({ ...prev, pick: v }))}>
              <SelectTrigger className="h-10 min-w-0 flex-1 rounded-xl">
                <SelectValue placeholder={t('Version wählen …')} />
              </SelectTrigger>
              <SelectContent className="max-h-60 rounded-xl">
                {channelList.map((r) => (
                  <SelectItem key={r.version} value={r.version} className="rounded-lg">
                    <div className="flex items-center justify-between gap-3 w-full">
                      <span className="font-mono text-xs font-medium">{r.version}</span>
                      <div className="flex items-center gap-1.5">
                        {r.version === currentVer && (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                            {t('Aktuell')}
                          </span>
                        )}
                        {r.prerelease ? (
                          <span className="rounded-full bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-medium text-purple-400">
                            Dev
                          </span>
                        ) : (
                          <span className="rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-400">
                            Stable
                          </span>
                        )}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              disabled={!rel.pick || rel.pick === currentVer || installing}
              onClick={() => (res?.canInstall ? install(rel.pick) : api.update.openPage(rel.pick))}
              className="h-10 rounded-xl gap-2 font-medium shrink-0"
            >
              <ExternalLink className="size-3.5" />
              {installing ? t('Update wird installiert …') : res?.canInstall ? t('Installieren und neu starten') : t('Release-Seite öffnen')}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t('Keine Versionen verfügbar')}</p>
        )}
      </div>

      {/* 6. Update-Quelle (GitHub Repository) */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-muted text-muted-foreground">
            <GitFork className="size-4.5" />
          </div>
          <div>
            <p className="text-sm font-medium">{t('Update-Quelle (GitHub: Besitzer/Repository)')}</p>
            <p className="text-xs text-muted-foreground">Standard: HyperGaming99/ssh-deck</p>
          </div>
        </div>
        <Input
          value={s.repo}
          placeholder="HyperGaming99/ssh-deck"
          autoComplete="off"
          className="h-10 rounded-xl font-mono text-xs"
          onChange={(e) => save({ repo: e.target.value.trim() })}
        />
      </div>
    </div>
  );
}

export default UpdatesSettings;
