import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ShinyText from '@/components/ShinyText';
import Logo from '@/components/Logo';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';

// Anmelden / Registrieren / E-Mail-Code. Nach Erfolg meldet der Hauptprozess 'configured' per Status-Event, der Bildschirm verschwindet dann von selbst.
export default function LoginScreen({ status, dark, onSkip }) {
  const t = useT();
  const [mode, setMode] = useState('login'); // login | register | verify
  const [f, setF] = useState({ email: '', password: '', password2: '', code: '', server: status.server });
  const [error, setError] = useState(status.error || '');
  const [busy, setBusy] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const set = (k) => (e) => setF((o) => ({ ...o, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (mode === 'register' && f.password !== f.password2) return setError(t('Die Passwörter stimmen nicht überein.'));
    setBusy(true); setError('');
    const r = await api.sync.auth({ mode, server: f.server, email: f.email, password: f.password, code: f.code });
    setBusy(false);
    if (r.needsCode) setMode('verify');
    else if (r.error) setError(t(r.error)); // Meldungen aus Hauptprozess/Server sind deutsch, hier übersetzt
  };

  return (
    <div className="grid flex-1 place-items-center overflow-auto p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center gap-2 pb-2">
          <Logo className="h-16 w-[50px]" />
          <h1 className="text-xl font-semibold"><ShinyText text="SSH Deck" color={dark ? '#8a8a8a' : '#52525b'} shineColor={dark ? '#ffffff' : '#2563eb'} speed={4} /></h1>
          <p className="text-center text-sm text-muted-foreground">
            {mode === 'verify' ? t('Wir haben einen Code an {email} geschickt.', { email: f.email }) : t('Melde dich an, damit deine Hosts auf allen Geräten verfügbar sind.')}
          </p>
        </div>

        {mode !== 'verify' && (
          <div className="grid grid-cols-2 rounded-lg bg-muted p-1 text-sm">
            {[['login', t('Anmelden')], ['register', t('Registrieren')]].map(([m, l]) => (
              <button type="button" key={m} onClick={() => { setMode(m); setError(''); }}
                className={cn('rounded-md py-1.5 transition-colors', mode === m ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}>{l}</button>
            ))}
          </div>
        )}

        {mode === 'verify' ? (
          <div className="grid gap-1.5">
            <Label htmlFor="code">{t('Bestätigungscode')}</Label>
            <Input id="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={6} className="text-center text-lg tracking-[0.5em]" value={f.code} onChange={set('code')} />
          </div>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="email">{t('E-Mail')}</Label>
              <Input id="email" type="email" autoComplete="email" autoFocus required value={f.email} onChange={set('email')} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">{t('Passwort')}</Label>
              <Input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={f.password} onChange={set('password')} />
            </div>
            {mode === 'register' && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="password2">{t('Passwort wiederholen')}</Label>
                  <Input id="password2" type="password" autoComplete="new-password" required value={f.password2} onChange={set('password2')} />
                </div>
                <p className="text-xs text-muted-foreground">{t('Dein Passwort verschlüsselt deine Daten auf diesem Gerät. Der Server kennt es nicht – ohne Passwort sind die Cloud-Daten nicht wiederherstellbar.')}</p>
              </>
            )}
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? t('Bitte warten …') : mode === 'login' ? t('Anmelden') : mode === 'register' ? t('Konto erstellen') : t('Bestätigen')}
        </Button>

        <div className="space-y-1 text-center text-xs text-muted-foreground">
          {showServer ? (
            <div className="grid gap-1.5 text-left">
              <Label htmlFor="server" className="text-xs">{t('Server')}</Label>
              <Input id="server" value={f.server} onChange={set('server')} className="h-8 text-xs" />
            </div>
          ) : <button type="button" className="hover:text-foreground" onClick={() => setShowServer(true)}>{t('Server')}: {f.server}</button>}
          <div><button type="button" className="hover:text-foreground" onClick={onSkip}>{t('Ohne Konto fortfahren (nur lokal)')}</button></div>
        </div>
      </form>
    </div>
  );
}
