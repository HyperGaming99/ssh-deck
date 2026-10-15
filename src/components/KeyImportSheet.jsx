import { useEffect, useState } from 'react';
import { FileUp, KeyRound, Lock } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/i18n';

const EMPTY = { name: '', privateKey: '', publicKey: '', passphrase: '' };
const area = 'min-h-28 w-full resize-y rounded-xl border bg-background px-3 py-2.5 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring';

// Eigenen Schlüssel einbinden: privat einfügen oder Datei wählen, öffentlicher Teil optional (wird sonst abgeleitet)
export default function KeyImportSheet({ open, onClose, onDone, toast, vault = 'personal' }) {
  const t = useT();
  const [v, setV] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setV(EMPTY); }, [open]);
  const set = (k) => (e) => setV((o) => ({ ...o, [k]: e.target.value }));

  const pickFile = async () => {
    const r = await api.keys.readFile();
    if (r.canceled) return;
    if (r.error) return toast(r.error);
    setV((o) => ({ ...o, privateKey: r.text, publicKey: r.pub || o.publicKey, name: o.name || r.name })); // liegt eine .pub daneben, wird sie mitgenommen
  };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const err = await api.keys.import({ ...v, vault });
    setBusy(false);
    if (err) return toast(err);
    toast(t('Schlüssel importiert.'));
    onDone(); onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 bg-sidebar p-0 sm:max-w-[460px]">
        <form onSubmit={submit} className="flex h-full flex-col">
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="flex items-center gap-2"><KeyRound className="size-4" />{t('Schlüssel importieren')}</SheetTitle>
            <SheetDescription>{t('Füge einen vorhandenen Schlüssel ein oder wähle eine Datei. Ein privater Schlüssel wird verschlüsselt gespeichert; der öffentliche Teil lässt sich automatisch ableiten.')}</SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <section className="space-y-3 rounded-2xl border bg-card p-4">
              <div className="grid gap-1.5">
                <Label htmlFor="kname">{t('Name')}</Label>
                <Input id="kname" required autoComplete="off" value={v.name} onChange={set('name')} />
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="kpriv">{t('Privater Schlüssel')}</Label>
                  <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={pickFile}><FileUp className="size-3.5" />{t('Datei wählen …')}</Button>
                </div>
                <textarea id="kpriv" dir="ltr" spellCheck={false} autoComplete="off" className={area} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" value={v.privateKey} onChange={set('privateKey')} />
              </div>
              <div className="relative grid gap-1.5">
                <Label htmlFor="kpass">{t('Passphrase (optional)')}</Label>
                <Lock className="pointer-events-none absolute start-3 top-[2.45rem] size-4 text-muted-foreground" />
                <Input id="kpass" type="password" autoComplete="new-password" className="ps-9" value={v.passphrase} onChange={set('passphrase')} />
              </div>
            </section>

            <section className="space-y-2 rounded-2xl border bg-card p-4">
              <Label htmlFor="kpub">{t('Öffentlicher Schlüssel (optional)')}</Label>
              <textarea id="kpub" dir="ltr" spellCheck={false} autoComplete="off" className={area} placeholder="ssh-ed25519 AAAA… name" value={v.publicKey} onChange={set('publicKey')} />
              {!v.privateKey.trim() && <p className="text-xs text-muted-foreground">{t('Ohne privaten Schlüssel kannst du den öffentlichen nur auf Hosts eintragen, nicht zum Anmelden nutzen.')}</p>}
            </section>
          </div>

          <SheetFooter className="gap-2 border-t p-4">
            <Button type="submit" className="h-11 w-full rounded-xl" disabled={busy || !(v.privateKey.trim() || v.publicKey.trim())}>{t('Importieren')}</Button>
            <Button type="button" variant="outline" className="h-10 w-full rounded-xl" onClick={onClose}>{t('Abbrechen')}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
