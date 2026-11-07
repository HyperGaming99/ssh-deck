import { useEffect, useState } from 'react';
import { FileUp, KeyRound, Lock, Sparkles, PenLine } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

const area = 'min-h-28 w-full resize-y rounded-xl border bg-background px-3 py-2.5 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default function KeyModalSheet({ open, onClose, onDone, toast, vault = 'personal', initialTab = 'generate' }) {
  const t = useT();
  const [tab, setTab] = useState(initialTab); // 'generate' | 'import'

  // Generieren State
  const [genName, setGenName] = useState('');
  const [type, setType] = useState('ed25519'); // 'ed25519' | 'rsa' | 'ecdsa'
  const [rsaBits, setRsaBits] = useState('4096');
  const [ecdsaBits, setEcdsaBits] = useState('256');
  const [comment, setComment] = useState('');
  const [genPassphrase, setGenPassphrase] = useState('');

  // Importieren State
  const [impName, setImpName] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [impPassphrase, setImpPassphrase] = useState('');

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTab(initialTab || 'generate');
      setGenName('');
      setType('ed25519');
      setRsaBits('4096');
      setEcdsaBits('256');
      setComment('');
      setGenPassphrase('');

      setImpName('');
      setPrivateKey('');
      setPublicKey('');
      setImpPassphrase('');
      setBusy(false);
    }
  }, [open, initialTab]);

  const pickFile = async () => {
    const r = await api.keys.readFile();
    if (r.canceled) return;
    if (r.error) return toast(r.error);
    setPrivateKey(r.text);
    if (r.pub) setPublicKey(r.pub);
    if (r.name && !impName) setImpName(r.name);
  };

  const submitGenerate = async (e) => {
    e.preventDefault();
    if (!genName.trim()) return;
    setBusy(true);
    let bits;
    if (type === 'rsa') bits = Number(rsaBits);
    if (type === 'ecdsa') bits = Number(ecdsaBits);
    const err = await api.keys.generate({
      name: genName.trim(),
      type,
      bits,
      comment: comment.trim(),
      passphrase: genPassphrase || undefined,
      vault,
    });
    setBusy(false);
    if (err) return toast(err);
    toast(t('Schlüssel generiert.'));
    onDone();
    onClose();
  };

  const submitImport = async (e) => {
    e.preventDefault();
    if (!impName.trim()) return;
    setBusy(true);
    const err = await api.keys.import({
      name: impName.trim(),
      privateKey,
      publicKey,
      passphrase: impPassphrase,
      vault,
    });
    setBusy(false);
    if (err) return toast(err);
    toast(t('Schlüssel importiert.'));
    onDone();
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 bg-sidebar p-0 sm:max-w-[460px]">
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="flex items-center gap-2">
              <KeyRound className="size-4" />
              {t('Neuer Schlüssel')}
            </SheetTitle>
            <SheetDescription>
              {tab === 'generate'
                ? t('Erzeugt ein neues Schlüsselpaar. Der private Teil wird verschlüsselt gespeichert.')
                : t('Füge einen vorhandenen Schlüssel ein oder wähle eine Datei. Ein privater Schlüssel wird verschlüsselt gespeichert; der öffentliche Teil lässt sich automatisch ableiten.')}
            </SheetDescription>
            <div className="grid grid-cols-2 gap-1.5 pt-2">
              <button
                type="button"
                onClick={() => setTab('generate')}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-colors',
                  tab === 'generate'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                <Sparkles className="size-3.5" />
                {t('Generieren')}
              </button>
              <button
                type="button"
                onClick={() => setTab('import')}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-colors',
                  tab === 'import'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                <PenLine className="size-3.5" />
                {t('Manuell eingeben')}
              </button>
            </div>
          </SheetHeader>

          {tab === 'generate' ? (
            <form onSubmit={submitGenerate} className="flex min-h-0 flex-1 flex-col justify-between">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                <section className="space-y-4 rounded-2xl border bg-card p-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="gen-kname">{t('Name')}</Label>
                    <Input
                      id="gen-kname"
                      required
                      autoFocus
                      autoComplete="off"
                      value={genName}
                      onChange={(e) => setGenName(e.target.value)}
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
                              'rounded-md px-2 py-1.5 text-xs font-medium transition-colors text-center',
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
                      placeholder="user@device"
                    />
                  </div>

                  <div className="relative grid gap-1.5">
                    <Label htmlFor="gen-kpass">{t('Passphrase (optional)')}</Label>
                    <Lock className="pointer-events-none absolute start-3 top-[2.45rem] size-4 text-muted-foreground" />
                    <Input
                      id="gen-kpass"
                      type="password"
                      autoComplete="new-password"
                      className="ps-9"
                      value={genPassphrase}
                      onChange={(e) => setGenPassphrase(e.target.value)}
                    />
                  </div>
                </section>
              </div>

              <SheetFooter className="gap-2 border-t p-4">
                <Button type="submit" className="h-11 w-full rounded-xl" disabled={busy || !genName.trim()}>
                  {t('Schlüssel generieren')}
                </Button>
                <Button type="button" variant="outline" className="h-10 w-full rounded-xl" onClick={onClose}>
                  {t('Abbrechen')}
                </Button>
              </SheetFooter>
            </form>
          ) : (
            <form onSubmit={submitImport} className="flex min-h-0 flex-1 flex-col justify-between">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                <section className="space-y-3 rounded-2xl border bg-card p-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="imp-kname">{t('Name')}</Label>
                    <Input
                      id="imp-kname"
                      required
                      autoFocus
                      autoComplete="off"
                      value={impName}
                      onChange={(e) => setImpName(e.target.value)}
                      placeholder="id_rsa_prod"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="imp-kpriv">{t('Privater Schlüssel')}</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mhide h-7 gap-1.5 text-xs"
                        onClick={pickFile}
                      >
                        <FileUp className="size-3.5" />
                        {t('Datei wählen …')}
                      </Button>
                    </div>
                    <textarea
                      id="imp-kpriv"
                      dir="ltr"
                      spellCheck={false}
                      autoComplete="off"
                      className={area}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                      value={privateKey}
                      onChange={(e) => setPrivateKey(e.target.value)}
                    />
                  </div>
                  <div className="relative grid gap-1.5">
                    <Label htmlFor="imp-kpass">{t('Passphrase (optional)')}</Label>
                    <Lock className="pointer-events-none absolute start-3 top-[2.45rem] size-4 text-muted-foreground" />
                    <Input
                      id="imp-kpass"
                      type="password"
                      autoComplete="new-password"
                      className="ps-9"
                      value={impPassphrase}
                      onChange={(e) => setImpPassphrase(e.target.value)}
                    />
                  </div>
                </section>

                <section className="space-y-2 rounded-2xl border bg-card p-4">
                  <Label htmlFor="imp-kpub">{t('Öffentlicher Schlüssel (optional)')}</Label>
                  <textarea
                    id="imp-kpub"
                    dir="ltr"
                    spellCheck={false}
                    autoComplete="off"
                    className={area}
                    placeholder="ssh-ed25519 AAAA… name"
                    value={publicKey}
                    onChange={(e) => setPublicKey(e.target.value)}
                  />
                  {!privateKey.trim() && (
                    <p className="text-xs text-muted-foreground">
                      {t('Ohne privaten Schlüssel kannst du den öffentlichen nur auf Hosts eintragen, nicht zum Anmelden nutzen.')}
                    </p>
                  )}
                </section>
              </div>

              <SheetFooter className="gap-2 border-t p-4">
                <Button
                  type="submit"
                  className="h-11 w-full rounded-xl"
                  disabled={busy || (!privateKey.trim() && !publicKey.trim()) || !impName.trim()}
                >
                  {t('Schlüssel hinzufügen')}
                </Button>
                <Button type="button" variant="outline" className="h-10 w-24 rounded-xl" onClick={onClose}>
                  {t('Abbrechen')}
                </Button>
              </SheetFooter>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
