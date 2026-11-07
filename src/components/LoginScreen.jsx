import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ShinyText from '@/components/ShinyText';
import Logo from '@/components/Logo';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';

// Anmelden / Registrieren / E-Mail-Code / Google-Login (nur für Hauptserver). Nach Erfolg meldet der Hauptprozess 'configured' per Status-Event, der Bildschirm verschwindet dann von selbst.
export default function LoginScreen({ status, dark, onSkip, onPair }) {
  const t = useT();
  const [mode, setMode] = useState('login'); // login | register | verify | google
  const [f, setF] = useState({ email: '', password: '', password2: '', code: '', server: status.server, state: '', exists: false });
  const [error, setError] = useState(status.error || '');
  const [busy, setBusy] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const set = (k) => (e) => {
    const val = e.target.value;
    setF((o) => ({ ...o, [k]: val }));
    if (k === 'server' && mode === 'google') setMode('login');
  };
  const isMainServer = (f.server || '').trim().replace(/\/+$/, '') === (status.defaultServer || 'https://ssh.arolg.dev').replace(/\/+$/, '');
  const needPw2 = mode === 'register' || (mode === 'google' && !f.exists);

  const startGoogle = async () => {
    setBusy(true); setError('');
    const r = await api.sync.auth({ mode: 'googleStart', server: f.server });
    setBusy(false);
    if (r.google) {
      setF((o) => ({ ...o, email: r.email, state: r.state, exists: r.exists, password: '', password2: '' }));
      setMode('google');
    } else if (r.error) setError(t(r.error));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (needPw2 && f.password !== f.password2) return setError(t('Die Passwörter stimmen nicht überein.'));
    setBusy(true); setError('');
    const r = await api.sync.auth({ mode, server: f.server, email: f.email, password: f.password, code: f.code, state: f.state, exists: f.exists });
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

        {(mode === 'login' || mode === 'register') && (
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
              <Input id="email" type="email" autoComplete="email" autoFocus={mode !== 'google'} disabled={mode === 'google'} required value={f.email} onChange={set('email')} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">{t('Passwort')}</Label>
              <Input id="password" type="password" autoComplete={mode === 'login' || (mode === 'google' && f.exists) ? 'current-password' : 'new-password'} autoFocus={mode === 'google'} required value={f.password} onChange={set('password')} />
            </div>
            {needPw2 && (
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
          {busy ? t('Bitte warten …') : mode === 'login' || (mode === 'google' && f.exists) ? t('Anmelden') : needPw2 ? t('Konto erstellen') : t('Bestätigen')}
        </Button>

        {(mode === 'login' || mode === 'register') && isMainServer && (
          <Button type="button" variant="outline" className="w-full gap-2" disabled={busy} onClick={startGoogle}>
            <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {t('Mit Google fortfahren')}
          </Button>
        )}

        <div className="space-y-1 text-center text-xs text-muted-foreground">
          {mode === 'google' && <div><button type="button" className="hover:text-foreground" onClick={() => { setMode('login'); setError(''); }}>{t('Abbrechen')}</button></div>}
          {showServer ? (
            <div className="grid gap-1.5 text-left">
              <Label htmlFor="server" className="text-xs">{t('Server')}</Label>
              <Input id="server" value={f.server} onChange={set('server')} className="h-8 text-xs" />
            </div>
          ) : <button type="button" className="hover:text-foreground" onClick={() => setShowServer(true)}>{t('Server')}: {f.server}</button>}
          <div><button type="button" className="hover:text-foreground" onClick={onPair}>{t('Per QR-Code anmelden')}</button></div>
          <div><button type="button" className="hover:text-foreground" onClick={onSkip}>{t('Ohne Konto fortfahren (nur lokal)')}</button></div>
        </div>
      </form>
    </div>
  );
}
