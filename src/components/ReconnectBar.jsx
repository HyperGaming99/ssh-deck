import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';

const MAX = 5; // Versuche, danach nur noch manuell
const autoOn = () => { try { return localStorage.getItem('autoReconnect') !== '0'; } catch { return true; } };

// Leiste über dem Terminal nach unerwartetem Verbindungsabbruch: Countdown (3 s, 6 s, dann 12 s) bis zum nächsten Versuch
export default function ReconnectBar({ tries, onNow, onCancel }) {
  const t = useT();
  const auto = autoOn() && tries < MAX;
  const [left, setLeft] = useState(Math.min(3 * 2 ** tries, 12));
  useEffect(() => {
    if (!auto) return;
    if (left <= 0) return onNow();
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [left, auto]);
  return (
    <div className="absolute inset-x-2 top-2 z-10 flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm text-foreground shadow-md">
      <span className="min-w-0 flex-1 truncate">{auto ? t('Verbindung getrennt – neu verbinden in {n} s').replace('{n}', left) : t('Verbindung getrennt')}</span>
      <Button size="sm" onClick={onNow}>{t('Jetzt verbinden')}</Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>{t('Abbrechen')}</Button>
    </div>
  );
}
