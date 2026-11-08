import { useState } from 'react';
import { Check, CloudOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PairScan, PairShow } from '@/components/PairQR';
import { cn } from '@/lib/utils';
import { useLang, useT } from '@/i18n';
import ServerField from './ServerField';

export function SyncView({ st, onLogin, onLogout, toast }) {
  const t = useT();
  const lang = useLang();
  const [del, setDel] = useState(null); // null = zu, sonst { pw, busy, error }
  if (!st.configured) {
    return (
      <div className="flex max-w-2xl items-start gap-4 rounded-xl border bg-card p-5">
        <CloudOff className="mt-0.5 size-6 text-muted-foreground" />
        <div className="flex-1">
          <p className="font-medium">{t('Nicht angemeldet')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('Ohne Konto bleiben deine Daten nur auf diesem Gerät.')}</p>
          <Button className="mt-4" onClick={onLogin}>{t('Anmelden')}</Button>
          <PairScan onDone={onLogout} toast={toast} />
          <ServerField st={st} toast={toast} />
        </div>
      </div>
    );
  }
  const when = st.lastSync ? new Date(st.lastSync).toLocaleString(lang) : t('noch nie');
  const label = { off: t('Nicht verbunden'), syncing: t('Synchronisiere …'), ok: t('Synchronisiert'), error: t('Fehler') }[st.status];
  return (
    <div className="max-w-2xl rounded-xl border bg-card p-5">
      <div className="mrow flex items-center gap-3">
        <span className={cn('grid size-10 place-items-center rounded-lg bg-secondary', st.status === 'error' && 'text-destructive', st.status === 'ok' && 'text-success')}>
          {st.status === 'syncing' ? <RefreshCw className="size-5 animate-spin" /> : st.status === 'error' ? <CloudOff className="size-5" /> : <Check className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{label}</p>
          <p className="truncate text-sm text-muted-foreground">{t('{email} · zuletzt {when}', { email: st.email, when })}</p>
          <p className="truncate text-xs text-muted-foreground">{st.server}</p>
        </div>
        <Button variant="outline" onClick={() => api.sync.now()} disabled={st.status === 'syncing'}><RefreshCw className="size-4" />{t('Jetzt synchronisieren')}</Button>
      </div>
      {st.error && <p className="mt-3 text-sm text-destructive">{t(st.error)}</p>}
      <ServerField st={st} locked toast={toast} />
      <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">{t('Gesynct werden Hosts (mit Passwörtern), Gruppen, Snippets und Forwarding-Regeln – Ende-zu-Ende verschlüsselt. Private Schlüssel bleiben auf dem Gerät. Der Abgleich läuft automatisch.')}</p>
      <div className="mt-4"><PairShow /></div>
      <div className="mt-3 flex justify-end">
        <Button variant="ghost" className="text-destructive" onClick={() => { if (confirm(t('Abmelden? Die lokalen Daten bleiben erhalten, der Sync stoppt auf diesem Gerät.'))) { api.sync.logout(); onLogout(); } }}>{t('Abmelden')}</Button>
      </div>
      <div className="mt-3 border-t pt-3">
        {!del ? (
          <Button variant="ghost" className="text-destructive" onClick={() => setDel({ pw: '' })}>{t('Konto löschen')}</Button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{t('Dein Konto und alle Daten auf dem Sync-Server werden gelöscht (Hosts, Tresor, Cloud-Schlüsselbund, Team-Mitgliedschaften). Die Daten auf diesem Gerät bleiben. Das lässt sich nicht rückgängig machen.')}</p>
            <Input type="password" autoComplete="current-password" placeholder={t('Passwort zur Bestätigung')} value={del.pw} onChange={(e) => setDel({ ...del, pw: e.target.value, error: '' })} />
            {del.error && <p className="text-sm text-destructive">{t(del.error)}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDel(null)}>{t('Abbrechen')}</Button>
              <Button variant="destructive" disabled={!del.pw || del.busy} onClick={async () => {
                setDel({ ...del, busy: true });
                const r = await api.sync.deleteAccount(del.pw);
                if (r.error) setDel({ ...del, busy: false, error: r.error }); else { setDel(null); onLogout(); }
              }}>{t('Konto endgültig löschen')}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SyncView;
