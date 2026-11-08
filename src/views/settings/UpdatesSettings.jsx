import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
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
    if (r.error) setErr(r.error);
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
    api.update.list().then((r) => r.list && setRel({ list: r.list, pick: '' }));
  }, []);

  const install = async (v) => {
    setInstalling(true); setErr('');
    const r = await api.update.install(v);
    if (r.error) { setInstalling(false); setErr(r.error); }
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

  const row = 'flex items-center justify-between gap-4 rounded-xl border bg-card p-4';
  return (
    <div className="max-w-xl space-y-3">
      <div className={row}>
        <div><p className="text-sm font-medium">{res?.current ? t('Version {v}', { v: res.current }) : 'SSH Deck'}</p>
          <p className={cn('text-xs', err ? 'text-destructive' : 'text-muted-foreground')}>
            {busy ? t('Suche läuft …') : installing ? t('Update wird installiert …') : err ? t(err) : res?.available ? t('Version {v} ist verfügbar.', { v: res.latest }) : res?.latest ? t('Du hast die neueste Version.') : ''}
          </p></div>
        <Button variant="outline" disabled={busy || installing} onClick={check}><RefreshCw className={cn('size-4', busy && 'animate-spin')} />{t('Jetzt prüfen')}</Button>
      </div>
      {res?.available && (
        <div className={cn(row, 'flex-col items-stretch')}>
          {res.notes && <ReleaseNotes text={res.notes} />}
          {res.canInstall
            ? <Button disabled={installing} onClick={() => install()}>{installing ? t('Update wird installiert …') : t('Installieren und neu starten')}</Button>
            : <Button onClick={() => api.update.openPage()}>{t('Release-Seite öffnen')}</Button>}
        </div>
      )}
      <div className={row}>
        <p className="text-sm font-medium">{t('Automatisch nach Updates suchen')}</p>
        <Switch checked={s.auto} onCheckedChange={(v) => save({ auto: v })} />
      </div>
      <div className={cn(row, 'flex-col items-stretch')}>
        <p className="text-sm font-medium">{t('Update-Kanal')}</p>
        <div className="grid grid-cols-2 rounded-lg bg-muted p-1 text-sm">
          {[['stable', t('Stabil')], ['dev', t('Dev (Vorabversionen)')]].map(([v, l]) => (
            <button key={v} type="button" onClick={() => { save({ channel: v }); setTimeout(check, 50); }}
              className={cn('rounded-md px-3 py-1.5', s.channel === v ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}>{l}</button>
          ))}
        </div>
        {s.channel === 'dev' && <p className="text-xs text-muted-foreground">{t('Dev-Versionen erscheinen bei jedem Push und können Fehler enthalten.')}</p>}
      </div>
      <div className={cn(row, 'flex-col items-stretch')}>
        <div>
          <p className="text-sm font-medium">{t('Andere Version installieren (auch ältere)')}</p>
          <p className="text-xs text-muted-foreground">
            {s.channel === 'dev' ? t('Zeigt nur Dev-Versionen.') : t('Zeigt nur stabile Versionen.')}
          </p>
        </div>
        {channelList.length > 0 ? (
          <div className="flex gap-2">
            <Select value={rel.pick || undefined} onValueChange={(v) => setRel((prev) => ({ ...prev, pick: v }))}>
              <SelectTrigger className="h-9 min-w-0 flex-1">
                <SelectValue placeholder={t('Version wählen …')} />
              </SelectTrigger>
              <SelectContent>
                {channelList.map((r) => (
                  <SelectItem key={r.version} value={r.version}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{r.version}</span>
                      {r.version === res?.current && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{t('Aktuell')}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button disabled={!rel.pick || rel.pick === res?.current || installing} onClick={() => (res?.canInstall ? install(rel.pick) : api.update.openPage(rel.pick))}>
              {installing ? t('Update wird installiert …') : res?.canInstall ? t('Installieren und neu starten') : t('Release-Seite öffnen')}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t('Keine Versionen verfügbar')}</p>
        )}
      </div>
      <div className={cn(row, 'flex-col items-stretch')}>
        <p className="text-sm font-medium">{t('Update-Quelle (GitHub: Besitzer/Repository)')}</p>
        <Input value={s.repo} placeholder="HyperGaming99/ssh-deck" autoComplete="off" onChange={(e) => save({ repo: e.target.value.trim() })} />
      </div>
    </div>
  );
}

export default UpdatesSettings;
