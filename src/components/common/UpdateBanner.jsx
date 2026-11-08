import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';

// Hinweisleiste unter der Kopfzeile, wenn eine neue Version bereitsteht
export function UpdateBanner({ upd, onClose }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3 border-b bg-primary/10 px-4 py-2 text-sm">
      <Download className="size-4 text-primary" />
      <span className="flex-1">{t('Version {v} ist verfügbar.', { v: upd.latest })}</span>
      <Button size="sm" disabled={busy} onClick={() => (upd.canInstall ? (setBusy(true), api.update.install().then((r) => r.error && setBusy(false))) : api.update.openPage())}>
        {busy ? t('Update wird installiert …') : upd.canInstall ? t('Installieren und neu starten') : t('Release-Seite öffnen')}
      </Button>
      <Button size="sm" variant="ghost" onClick={onClose}>{t('Später')}</Button>
    </div>
  );
}

export default UpdateBanner;
