import { useCallback, useEffect, useState } from 'react';
import { Check, Cloud, Copy, Eye, KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

// Cloud-Schlüsselbund: SSH-Schlüssel (nur die, die du einschaltest) verschlüsselt in der Cloud. Passwort + Geheimschlüssel öffnen ihn auf einem neuen Gerät.
export default function KeychainCloud({ st, toast, goAccount }) {
  const t = useT();
  const [s, setS] = useState(null); // { signedIn, enabled, remote, keys }
  const [pw, setPw] = useState('');
  const [sk, setSk] = useState('');
  const [secret, setSecret] = useState(null); // frisch erzeugter oder angezeigter Geheimschlüssel
  const [fresh, setFresh] = useState(false); // gerade eingeschaltet: Speichern bestätigen
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const row = 'rounded-xl border bg-card p-4';
  const load = useCallback(() => api.kc.status().then(setS), []);
  useEffect(() => { load(); }, [load, st?.lastSync, st?.configured]);

  const run = async (fn, after) => { setBusy(true); const r = await fn(); setBusy(false); if (r.error) { toast(r.error); return; } setPw(''); setSk(''); after?.(r); load(); };
  const copy = () => { try { navigator.clipboard.writeText(secret).catch(() => {}); } catch { /* egal */ } };

  if (!st?.configured) {
    return <div className={cn(row, 'max-w-xl space-y-3')}><p className="text-sm">{t('Melde dich an, um den Cloud-Schlüsselbund zu nutzen.')}</p><Button onClick={goAccount}>{t('Konto & Sync')}</Button></div>;
  }
  if (!s) return null;
  if (s.error && !s.enabled) return <div className={cn(row, 'max-w-xl space-y-3')}><p className="text-sm text-destructive">{t(s.error)}</p><Button variant="outline" onClick={goAccount}>{t('Konto & Sync')}</Button></div>;
  const secretBox = secret && (
    <div className={cn(row, 'space-y-3')}>
      <p className="text-sm font-semibold">{t('Dein Geheimschlüssel')}</p>
      <div className="flex items-center gap-2"><code dir="ltr" className="flex-1 select-all rounded-lg bg-muted px-3 py-2.5 text-center font-mono text-base tracking-wider">{secret}</code>
        <Button variant="outline" size="icon" aria-label={t('Kopieren')} onClick={copy}><Copy className="size-4" /></Button></div>
      <p className="text-xs text-muted-foreground">{t('Speichere ihn jetzt an einem sicheren Ort (Passwort-Manager oder Ausdruck). Du brauchst ihn zusammen mit deinem Passwort, um den Schlüsselbund auf einem neuen Gerät zu öffnen. Geht er verloren und du hast kein Gerät mehr, sind die Cloud-Schlüssel nicht wiederherstellbar.')}</p>
      {fresh ? (
        <>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />{t('Ich habe den Geheimschlüssel gespeichert')}</label>
          <Button disabled={!saved} onClick={() => { setSecret(null); setFresh(false); setSaved(false); }}><Check className="size-4" />{t('Fertig')}</Button>
        </>
      ) : <Button variant="outline" onClick={() => setSecret(null)}>{t('Schließen')}</Button>}
    </div>
  );

  return (
    <div className="max-w-xl space-y-4">
      <p className="rounded-xl bg-muted p-4 text-xs text-muted-foreground">{t('Schlüssel, die du hier einschaltest, liegen verschlüsselt in der Cloud und sind auf allen deinen Geräten da. Der Server sieht nur Chiffretext. Zusätzlich schützt ein Geheimschlüssel, den nur du hast: Selbst wenn jemand die Server-Daten stiehlt und dein Passwort errät, bleiben die Schlüssel sicher.')}</p>
      {(s.error || st.error || st.keychainError) && <p className="text-sm text-destructive">{t(s.error || st.error || st.keychainError)}</p>}
      {secretBox}
      {!secret && s.enabled && (
        <div className={cn(row, 'space-y-3')}>
          <div className="flex items-center gap-3"><ShieldCheck className="size-5 text-success" /><div className="flex-1"><p className="text-sm font-medium">{t('Cloud-Schlüsselbund ist an.')}</p><p className="text-xs text-muted-foreground">{t('{n} Schlüssel in der Cloud', { n: s.keys })}</p></div></div>
          <p className="text-xs text-muted-foreground">{t('Schalte einzelne Schlüssel in der Keychain über das Menü „⋯“ ein.')}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => run(() => api.kc.secret(), (r) => setSecret(r.secretKey))}><Eye className="size-4" />{t('Geheimschlüssel anzeigen')}</Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => confirm(t('Cloud-Schlüsselbund ausschalten? Alle Schlüssel werden aus der Cloud gelöscht, lokal bleiben sie erhalten.')) && run(() => api.kc.disable())}>{t('Ausschalten')}</Button>
          </div>
        </div>
      )}
      {!secret && !s.enabled && s.remote && (
        <form className={cn(row, 'space-y-3')} onSubmit={(e) => { e.preventDefault(); run(() => api.kc.unlock(pw, sk), () => toast(t('Cloud-Schlüsselbund geöffnet.'))); }}>
          <p className="text-sm">{t('Es gibt schon einen Cloud-Schlüsselbund. Gib Passwort und Geheimschlüssel ein, um ihn auf diesem Gerät zu öffnen.')}</p>
          <Input type="password" autoComplete="current-password" placeholder={t('Passwort')} value={pw} onChange={(e) => setPw(e.target.value)} />
          <Input dir="ltr" autoComplete="off" className="font-mono" placeholder="SD1-XXXXXX-XXXXX-XXXXX-XXXXX-XXXXX" value={sk} onChange={(e) => setSk(e.target.value)} />
          <Button type="submit" disabled={busy || !pw || !sk}><KeyRound className="size-4" />{t('Auf diesem Gerät entsperren')}</Button>
        </form>
      )}
      {!secret && !s.enabled && !s.remote && (
        <form className={cn(row, 'space-y-3')} onSubmit={(e) => { e.preventDefault(); run(() => api.kc.enable(pw), (r) => { setSecret(r.secretKey); setFresh(true); }); }}>
          <p className="text-sm">{t('Bestätige mit deinem Konto-Passwort.')}</p>
          <Input type="password" autoComplete="current-password" placeholder={t('Passwort')} value={pw} onChange={(e) => setPw(e.target.value)} />
          <Button type="submit" disabled={busy || !pw}><Cloud className="size-4" />{t('Cloud-Schlüsselbund einschalten')}</Button>
        </form>
      )}
    </div>
  );
}
