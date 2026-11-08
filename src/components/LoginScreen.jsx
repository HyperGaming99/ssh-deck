import { useState } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  Terminal,
  QrCode,
  Lock,
  Mail,
  Server,
  Monitor,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ShinyText from '@/components/ShinyText';
import Logo from '@/components/Logo';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';

// Anmelden / Registrieren / E-Mail-Code / Google-Login.
// Clean, technisches Entwickler-Layout: Neutrales Anthrazit/Schwarz ohne bunte AI-Blobs.
export default function LoginScreen({ status, dark, onSkip, onPair }) {
  const t = useT();
  const [mode, setMode] = useState('login'); // login | register | verify | google
  const [f, setF] = useState({
    email: '',
    password: '',
    password2: '',
    code: '',
    server: status.server,
    state: '',
    exists: false,
  });
  const [error, setError] = useState(status.error || '');
  const [busy, setBusy] = useState(false);
  const [showServer, setShowServer] = useState(false);

  const set = (k) => (e) => {
    const val = e.target.value;
    setF((o) => ({ ...o, [k]: val }));
    if (k === 'server' && mode === 'google') setMode('login');
  };

  const isMainServer =
    (f.server || '').trim().replace(/\/+$/, '') ===
    (status.defaultServer || 'https://ssh.arolg.dev').replace(/\/+$/, '');
  const needPw2 = mode === 'register' || (mode === 'google' && !f.exists);

  const startGoogle = async () => {
    setBusy(true);
    setError('');
    const r = (await api.sync.auth({ mode: 'googleStart', server: f.server })) || {};
    setBusy(false);
    if (r.google) {
      setF((o) => ({
        ...o,
        email: r.email,
        state: r.state,
        exists: r.exists,
        password: '',
        password2: '',
      }));
      setMode('google');
    } else if (r.error) setError(t(r.error));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (needPw2 && f.password !== f.password2)
      return setError(t('Die Passwörter stimmen nicht überein.'));
    setBusy(true);
    setError('');
    const r = (await api.sync.auth({
      mode,
      server: f.server,
      email: f.email,
      password: f.password,
      code: f.code,
      state: f.state,
      exists: f.exists,
    })) || {};
    setBusy(false);
    if (r.needsCode) setMode('verify');
    else if (r.error) setError(t(r.error));
  };

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-x-hidden overflow-y-auto bg-background p-4 sm:p-6 md:p-12">
      {/* Subtiles, technisches Entwickler-Punktraster (keine bunten AI-Farbkleckse) */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_65%_65%_at_50%_50%,#000_30%,transparent_100%)]"
        aria-hidden="true"
      />

      {/* Haupt-Container */}
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center justify-center gap-10 md:flex-row md:items-center md:justify-between lg:gap-16">
        {/* Linke Seite: Branding & technische Features */}
        <div className="flex flex-1 flex-col items-center text-center md:items-start md:text-left space-y-6 max-w-lg">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-md border bg-muted/60 px-2.5 py-1 text-xs font-mono text-muted-foreground">
              <Terminal className="size-3.5 text-foreground" />
              <span>{t('Next-Gen SSH Client & Server Hub')}</span>
            </div>

            <div className="flex items-center justify-center md:justify-start gap-3.5 pt-1">
              <Logo className="h-12 w-12 shrink-0" />
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  <ShinyText
                    text="SSH Deck"
                    color={dark ? '#8a8a8a' : '#52525b'}
                    shineColor={dark ? '#ffffff' : '#2563eb'}
                    speed={4}
                  />
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground font-medium mt-0.5">
                  {t('Verwalte deine Server, Schlüssel und Port-Tunnel sicher und synchronisiert an einem Ort.')}
                </p>
              </div>
            </div>
          </div>

          {/* 3 klare, neutrale Feature-Karten ohne künstliche Regenbogenfarben */}
          <div className="hidden sm:grid w-full gap-2.5">
            <div className="flex items-start gap-3 rounded-xl border bg-card/70 p-3 text-start transition-colors hover:border-foreground/20">
              <div className="rounded-lg border bg-muted/60 p-2 text-foreground shrink-0">
                <ShieldCheck className="size-4" />
              </div>
              <div className="space-y-0.5">
                <h2 className="text-xs font-semibold text-foreground">
                  {t('Zero-Knowledge-Verschlüsselung')}
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('Private Schlüssel & Zugangsdaten verlassen dein Gerät niemals unverschlüsselt.')}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border bg-card/70 p-3 text-start transition-colors hover:border-foreground/20">
              <div className="rounded-lg border bg-muted/60 p-2 text-foreground shrink-0">
                <RefreshCw className="size-4" />
              </div>
              <div className="space-y-0.5">
                <h2 className="text-xs font-semibold text-foreground">
                  {t('Multi-Device Cloud-Sync')}
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('Nahtlose Synchronisation zwischen Desktop, Smartphone und Web.')}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border bg-card/70 p-3 text-start transition-colors hover:border-foreground/20">
              <div className="rounded-lg border bg-muted/60 p-2 text-foreground shrink-0">
                <Terminal className="size-4" />
              </div>
              <div className="space-y-0.5">
                <h2 className="text-xs font-semibold text-foreground">
                  {t('Integrierte Dev-Suite')}
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('SFTP-Dateimanager, Port-Tunnel, Docker- & Kubernetes-Monitoring.')}
                </p>
              </div>
            </div>
          </div>


        </div>

        {/* Rechte Seite: Klare, unaufdringliche Auth-Card */}
        <div className="w-full max-w-sm sm:max-w-md shrink-0">
          <form
            onSubmit={submit}
            className="w-full space-y-4 rounded-2xl border bg-card p-6 sm:p-7 shadow-sm relative"
          >
            <div className="flex flex-col items-center gap-1.5 text-center pb-1">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {mode === 'verify'
                  ? t('Bestätigungscode')
                  : mode === 'register'
                  ? t('Konto erstellen')
                  : t('Anmelden')}
              </h2>
              <p className="text-xs text-muted-foreground max-w-xs">
                {mode === 'verify'
                  ? t('Wir haben einen Code an {email} geschickt.', { email: f.email })
                  : t('Melde dich an, damit deine Hosts auf allen Geräten verfügbar sind.')}
              </p>
            </div>

            {/* Segmented Tab Bar */}
            {(mode === 'login' || mode === 'register') && (
              <div className="grid grid-cols-2 rounded-lg bg-muted p-1 text-xs font-medium">
                {[
                  ['login', t('Anmelden')],
                  ['register', t('Registrieren')],
                ].map(([m, l]) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => {
                      setMode(m);
                      setError('');
                    }}
                    className={cn(
                      'rounded-md py-1.5 transition-colors text-center',
                      mode === m
                        ? 'bg-background font-medium text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}

            {mode === 'verify' ? (
              <div className="grid gap-1.5">
                <Label htmlFor="code" className="text-xs">{t('Bestätigungscode')}</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  maxLength={6}
                  className="text-center text-lg font-mono tracking-[0.5em]"
                  value={f.code}
                  onChange={set('code')}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="email" className="text-xs">{t('E-Mail')}</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      autoFocus={mode !== 'google'}
                      disabled={mode === 'google'}
                      required
                      className="ps-9"
                      placeholder="name@example.com"
                      value={f.email}
                      onChange={set('email')}
                    />
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="password" className="text-xs">{t('Passwort')}</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      autoComplete={
                        mode === 'login' || (mode === 'google' && f.exists)
                          ? 'current-password'
                          : 'new-password'
                      }
                      autoFocus={mode === 'google'}
                      required
                      className="ps-9"
                      value={f.password}
                      onChange={set('password')}
                    />
                  </div>
                </div>

                {needPw2 && (
                  <div className="space-y-1.5">
                    <div className="grid gap-1.5">
                      <Label htmlFor="password2" className="text-xs">{t('Passwort wiederholen')}</Label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                          id="password2"
                          type="password"
                          autoComplete="new-password"
                          required
                          className="ps-9"
                          value={f.password2}
                          onChange={set('password2')}
                        />
                      </div>
                    </div>
                    <p className="text-[11px] leading-tight text-muted-foreground">
                      {t(
                        'Dein Passwort verschlüsselt deine Daten auf diesem Gerät. Der Server kennt es nicht – ohne Passwort sind die Cloud-Daten nicht wiederherstellbar.'
                      )}
                    </p>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 p-2 text-xs text-destructive text-center">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={busy}
            >
              {busy
                ? t('Bitte warten …')
                : mode === 'login' || (mode === 'google' && f.exists)
                ? t('Anmelden')
                : needPw2
                ? t('Konto erstellen')
                : t('Bestätigen')}
            </Button>

            {(mode === 'login' || mode === 'register') && isMainServer && (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 text-xs"
                disabled={busy}
                onClick={startGoogle}
              >
                <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>{t('Mit Google fortfahren')}</span>
              </Button>
            )}

            <div className="space-y-1.5 border-t pt-3 text-center text-xs text-muted-foreground">
              {mode === 'google' && (
                <div>
                  <button
                    type="button"
                    className="hover:text-foreground font-medium underline"
                    onClick={() => {
                      setMode('login');
                      setError('');
                    }}
                  >
                    {t('Abbrechen')}
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-1 items-center">
                <button
                  type="button"
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                  onClick={onPair}
                >
                  <QrCode className="size-3.5" />
                  <span>{t('Per QR-Code anmelden')}</span>
                </button>

                <button
                  type="button"
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                  onClick={onSkip}
                >
                  <Monitor className="size-3.5" />
                  <span>{t('Ohne Konto fortfahren (nur lokal)')}</span>
                </button>
              </div>

              <div className="pt-1">
                {showServer ? (
                  <div className="grid gap-1 text-left rounded-lg border bg-muted/30 p-2">
                    <Label htmlFor="server" className="text-[11px]">
                      {t('Server')}
                    </Label>
                    <Input
                      id="server"
                      value={f.server}
                      onChange={set('server')}
                      className="h-7 text-xs"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/80 hover:text-foreground"
                    onClick={() => setShowServer(true)}
                  >
                    <Server className="size-3" />
                    <span>{t('Server')}: {f.server}</span>
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
