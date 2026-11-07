import { useEffect, useState } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

export default function KeyGenSheet({ open, onClose, onDone, toast, vault = 'personal' }) {
  const t = useT();
  const [name, setName] = useState('');
  const [type, setType] = useState('ed25519'); // 'ed25519' | 'rsa' | 'ecdsa'
  const [rsaBits, setRsaBits] = useState('4096');
  const [ecdsaBits, setEcdsaBits] = useState('256');
  const [comment, setComment] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setType('ed25519');
      setRsaBits('4096');
      setEcdsaBits('256');
      setComment('');
      setPassphrase('');
      setBusy(false);
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    let bits;
    if (type === 'rsa') bits = Number(rsaBits);
    if (type === 'ecdsa') bits = Number(ecdsaBits);
    const err = await api.keys.generate({
      name: name.trim(),
      type,
      bits,
      comment: comment.trim(),
      passphrase: passphrase || undefined,
      vault,
    });
    setBusy(false);
    if (err) return toast(err);
    toast(t('Schlüssel generiert.'));
    onDone();
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 bg-sidebar p-0 sm:max-w-[460px]">
        <form onSubmit={submit} className="flex h-full flex-col">
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="flex items-center gap-2"><KeyRound className="size-4" />{t('Schlüssel generieren')}</SheetTitle>
            <SheetDescription>{t('Erzeugt ein neues Schlüsselpaar. Der private Teil wird verschlüsselt gespeichert.')}</SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <section className="space-y-4 rounded-2xl border bg-card p-4">
              <div className="grid gap-1.5">
                <Label htmlFor="gen-kname">{t('Name')}</Label>
                <Input
                  id="gen-kname"
                  required
                  autoFocus
                  autoComplete="off"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="id_ed25519"
                />
              </div>

              <div className="grid gap-1.5">
                <Label>{t('Typ')}</Label>
                <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-muted p-1">
                  {[
                    ['ed25519', 'ED25519'],
                    ['rsa', 'RSA'],
                    ['ecdsa', 'ECDSA'],
                  ].map(([val, lab]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setType(val)}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-xs font-medium transition-colors text-center',
                        type === val
                          ? 'bg-background text-foreground shadow-xs font-semibold'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {lab}
                    </button>
                  ))}
                </div>
              </div>

              {type === 'rsa' && (
                <div className="grid gap-1.5">
                  <Label>{t('Schlüssellänge (Bits)')}</Label>
                  <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-muted p-1">
                    {['2048', '3072', '4096'].map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setRsaBits(b)}
                        className={cn(
                          'rounded-md px-2 py-1.5 text-xs font-medium transition-colors text-center',
                          rsaBits === b
                            ? 'bg-background text-foreground shadow-xs font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {b} {t('Bits')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {type === 'ecdsa' && (
                <div className="grid gap-1.5">
                  <Label>{t('Kurve / Bits')}</Label>
                  <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-muted p-1">
                    {[
                      ['256', 'P-256 (256 Bits)'],
                      ['384', 'P-384 (384 Bits)'],
                      ['521', 'P-521 (521 Bits)'],
                    ].map(([b, lab]) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setEcdsaBits(b)}
                        className={cn(
                          'rounded-md px-1 py-1.5 text-[11px] font-medium transition-colors text-center',
                          ecdsaBits === b
                            ? 'bg-background text-foreground shadow-xs font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {lab}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="gen-kcomment">{t('Kommentar (optional)')}</Label>
                <Input
                  id="gen-kcomment"
                  autoComplete="off"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="user@example.com"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="gen-kpass">{t('Passphrase (optional)')}</Label>
                <Input
                  id="gen-kpass"
                  type="password"
                  autoComplete="new-password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
              </div>
            </section>
          </div>

          <SheetFooter className="border-t bg-card px-5 py-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t('Abbrechen')}</Button>
            <Button type="submit" disabled={busy || !name.trim()} className="gap-2">
              <Plus className="size-4" />
              {busy ? t('Bitte warten …') : t('Generieren')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
