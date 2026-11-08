import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/i18n';

// Konto-Status; Anmelden passiert im Login-Bildschirm
// Sync-Server: Standard ist der Server des Projekts; ein eigener kann eingetragen werden (nur ohne Anmeldung änderbar)
export function ServerField({ st, locked, toast }) {
  const t = useT();
  const [v, setV] = useState(st.server);
  useEffect(() => setV(st.server), [st.server]);
  const save = async (x) => { const r = await api.settings.set({ syncServer: x === st.defaultServer ? '' : x }); if (r?.error) { toast(r.error); setV(st.server); } };
  return (
    <div className="mt-4 space-y-1.5 border-t pt-4">
      <p className="text-xs font-medium text-muted-foreground">{t('Sync-Server')}</p>
      <div className="flex gap-2">
        <Input dir="ltr" value={v} disabled={locked} autoComplete="off" onChange={(e) => setV(e.target.value)} onBlur={() => v !== st.server && save(v.trim())} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        {!locked && st.server !== st.defaultServer && <Button type="button" variant="outline" onClick={() => save(st.defaultServer)}>{t('Standard')}</Button>}
      </div>
      {locked && <p className="text-xs text-muted-foreground">{t('Zum Ändern zuerst abmelden.')}</p>}
    </div>
  );
}

export default ServerField;
