import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AskForm from '@/components/AskForm';
import { useT } from '@/i18n';

// Fragt fehlende Anmeldedaten ab (SFTP, Forwarding). ask = { id, name, kind, … } wie bei AskForm
export default function CredDialog({ ask, onAnswer }) {
  const t = useT();
  if (!ask) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onAnswer(null)}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('Anmeldedaten für {name}', { name: ask.name })}</DialogTitle></DialogHeader>
        <AskForm key={ask.id} ask={ask} cancelLabel={t('Abbrechen')} onAnswer={onAnswer} />
      </DialogContent>
    </Dialog>
  );
}
