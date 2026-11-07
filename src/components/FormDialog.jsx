import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// spec: { title, fields: [{ name, label, type?, options?: [[value,label]], required?, render? }], values, onSubmit }
export default function FormDialog({ spec, onClose }) {
  const t = useT();
  const [v, setV] = useState({});
  useEffect(() => setV(spec?.values ?? {}), [spec]);
  if (!spec) return null;
  const set = (k, val) => setV((o) => ({ ...o, [k]: val }));
  const submit = async (e) => {
    e.preventDefault();
    await spec.onSubmit(v);
    onClose();
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <form onSubmit={submit} className="flex h-full flex-col gap-4 overflow-y-auto p-6">
          <SheetHeader className="p-0">
            <SheetTitle>{spec.title}</SheetTitle>
            {spec.description && <SheetDescription>{spec.description}</SheetDescription>}
          </SheetHeader>
          {spec.fields.map((f) => {
            if (f.render) {
              return <div key={f.name}>{f.render(v, set)}</div>;
            }
            return (
              <div key={f.name} className="grid gap-1.5">
                <Label htmlFor={f.name}>{f.label}</Label>
                {f.segmented ? (
                  <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
                    {f.options.map(([val, lab]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => set(f.name, val)}
                        className={cn(
                          'flex-1 min-w-[70px] rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors text-center',
                          String(v[f.name] ?? '') === String(val)
                            ? 'bg-background text-foreground shadow-xs'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {lab}
                      </button>
                    ))}
                  </div>
                ) : f.options ? (
                  <Select value={String(v[f.name] ?? '')} onValueChange={(x) => set(f.name, x === '__none' ? '' : x)}>
                    <SelectTrigger id={f.name}><SelectValue placeholder={t('Auswählen …')} /></SelectTrigger>
                    <SelectContent>{f.options.map(([val, lab]) => <SelectItem key={val} value={val || '__none'}>{lab}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Input id={f.name} type={f.type ?? 'text'} required={f.required} autoComplete="off"
                    value={v[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} />
                )}
              </div>
            );
          })}
          <SheetFooter className="mt-auto p-0">
            <Button type="submit">{spec.submitLabel ?? t('Speichern')}</Button>
            <Button type="button" variant="outline" onClick={onClose}>{t('Abbrechen')}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
