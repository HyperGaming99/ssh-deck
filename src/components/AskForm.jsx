import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useT } from '@/i18n';

// Rückfrage während der Anmeldung. ask = { kind: user|password|passphrase|key|otp, keys?, alt?, prompt?, echo? }
// onAnswer({ user | secret | keyId, save } | { skip: true } | null)
export default function AskForm({ ask, onAnswer, cancelLabel }) {
  const t = useT();
  const [val, setVal] = useState('');
  useEffect(() => setVal(''), [ask]);
  const key = ask.kind === 'key', otp = ask.kind === 'otp';
  const submit = (save) => val && onAnswer(ask.kind === 'user' ? { user: val, save } : key ? { keyId: val, save } : { secret: val, save });
  const ph = { user: t('Benutzername'), password: t('Passwort'), passphrase: t('Passphrase') }[ask.kind];
  return (
    <>
      {key && <p className="text-sm">{t('Der Server verlangt einen SSH-Schlüssel.')}</p>}
      {otp && <p className="text-sm">{ask.prompt}</p>}
      {key ? (
        <Select value={val} onValueChange={setVal}>
          <SelectTrigger className="h-10 w-full rounded-xl"><SelectValue placeholder={t('Schlüssel wählen')} /></SelectTrigger>
          <SelectContent>{ask.keys.map((k) => <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>)}</SelectContent>
        </Select>
      ) : (
        <Input autoFocus type={ask.kind === 'user' || (otp && ask.echo) ? 'text' : 'password'} autoComplete="off" className="h-10 rounded-xl" value={val} onChange={(e) => setVal(e.target.value)}
          placeholder={ph} onKeyDown={(e) => e.key === 'Enter' && submit(!otp)} />
      )}
      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" onClick={() => onAnswer(null)}>{cancelLabel}</Button>
        <div className="flex items-center gap-2">
          {key && ask.alt && <Button variant="ghost" onClick={() => onAnswer({ skip: true })}>{t('Passwort verwenden')}</Button>}
          {otp ? <Button disabled={!val} onClick={() => submit(false)}>{t('Weiter')}</Button> : (
            <div className="flex">
              <Button disabled={!val} className="rounded-e-none" onClick={() => submit(true)}>{t('Weiter & speichern')}</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button disabled={!val} className="rounded-s-none border-s border-primary-foreground/20 px-2"><ChevronDown className="size-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => submit(false)}>{t('Weiter ohne Speichern')}</DropdownMenuItem></DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
