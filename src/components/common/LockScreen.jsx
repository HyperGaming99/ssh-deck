import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/i18n';

async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ssh-deck-lock:${pin}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function LockScreen({ onUnlock }) {
  const t = useT();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const saved = localStorage.getItem('lockPinHash') || '';
    if (!saved || (await hashPin(pin)) === saved) {
      setPin('');
      setErr('');
      onUnlock();
    } else {
      setErr(t('Passwort falsch'));
    }
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-4 backdrop-blur-md">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 text-center shadow-xl">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Lock className="size-6" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{t('App gesperrt')}</h2>
          <p className="text-xs text-muted-foreground">{t('Bitte Sperr-Passwort oder PIN eingeben, um fortzufahren.')}</p>
        </div>
        <Input
          type="password"
          autoFocus
          value={pin}
          onChange={(e) => { setPin(e.target.value); setErr(''); }}
          placeholder={t('Sperr-Passwort / PIN')}
          className="text-center"
        />
        {err && <p className="text-xs text-destructive">{err}</p>}
        <Button type="submit" className="w-full" disabled={!pin}>{t('Entsperren')}</Button>
      </form>
    </div>
  );
}

export default LockScreen;
