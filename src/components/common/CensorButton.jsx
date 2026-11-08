import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useT } from '@/i18n';
import { IconButton } from '@/components/common/IconButton';

// Zensur-Schalter (Known Hosts, Schlüssel): standardmäßig an, Wahl wird gespeichert
export function useCensor() {
  const [on, setOn] = useState(() => { try { return localStorage.getItem('censor') !== '0'; } catch { return true; } });
  const toggle = () => { const v = !on; setOn(v); try { localStorage.setItem('censor', v ? '1' : '0'); } catch { /* egal */ } };
  return [on, toggle];
}

export function CensorButton({ on, toggle }) {
  const t = useT();
  return (
    <IconButton label={on ? t('Angaben anzeigen') : t('Angaben verbergen')} onClick={toggle}>
      {on ? <EyeOff className="size-4 text-muted-foreground" /> : <Eye className="size-4" />}
    </IconButton>
  );
}

export default CensorButton;
