import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Eye, EyeOff, FolderOpen, KeyRound, Lock, Plus, Tag, Trash2, Type, User, Users, X } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import HostIcon from '@/components/HostIcon';
import { ICONS } from '@/icons';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

// Karte und Eingabefeld mit Symbol vorn
const Card = ({ title, children }) => (
  <section className="space-y-3 rounded-2xl border bg-card p-4">
    {title && <h3 className="text-sm font-semibold">{title}</h3>}
    {children}
  </section>
);
const Field = ({ icon: Icon, end, children }) => (
  <div className="relative">
    <Icon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    {children}
    {end && <div className="absolute end-1.5 top-1/2 -translate-y-1/2">{end}</div>}
  </div>
);
const inputCls = 'h-11 rounded-xl ps-9';
const triggerCls = 'h-11 w-full rounded-xl ps-9';

// spec: { values, groups, keys, onSave(host) -> id, onConnect({id,name}), onDelete(id) }
export default function HostSheet({ spec, onClose }) {
  const t = useT();
  const [v, setV] = useState({});
  const [showPw, setShowPw] = useState(false);
  const [more, setMore] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [own, setOwn] = useState({ keyId: '', user: '' }); // mein eigener Zugang zu einem Team-Host (nur für mich)
  const action = useRef('save');
  useEffect(() => {
    if (!spec) return;
    setV({ ...spec.values, tags: (spec.values.tags || []).join(', ') });
    setShowPw(false); setMore(false); setKeyOpen(!!spec.values.keyId); setOwn({ keyId: '', user: '' });
    if (spec.values.id && spec.values.vault && spec.values.vault !== 'personal') api.override.get(spec.values.id).then(setOwn);
  }, [spec]);
  if (!spec) return null;

  const set = (k) => (e) => setV((o) => ({ ...o, [k]: e.target.value }));
  const pick = (k) => (x) => setV((o) => ({ ...o, [k]: x === '__none' ? '' : x }));
  const editing = !!spec.values.id;
  const cur = v.vault || 'personal', vaults = spec.vaults || [];
  const pickVault = (x) => setV((o) => ({ ...o, vault: x, group: '', keyId: '' })); // Gruppen und Schlüssel gehören zu einem Tresor

  const submit = async (e) => {
    e.preventDefault();
    const o = { ...v, id: spec.values.id, name: (v.name || '').trim() || v.host, tags: (v.tags || '').split(',').map((s) => s.trim()).filter(Boolean) };
    if (!o.secret) delete o.secret; // leer = bestehendes Passwort behalten
    const id = await spec.onSave(o);
    if (cur !== 'personal' && (id || o.id)) await api.override.set(id || o.id, own);
    if (action.current === 'connect') spec.onConnect({ id, name: o.name });
    onClose();
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 bg-sidebar p-0 sm:max-w-[400px]">
        <form onSubmit={submit} className="flex h-full flex-col">
          <SheetHeader className="flex-row items-center justify-between gap-2 border-b px-5 py-4">
            <div className="min-w-0">
              <SheetTitle>{t('Host-Details')}</SheetTitle>
              <SheetDescription className="truncate">{v.name || v.host || ' '}</SheetDescription>
            </div>
            {editing && (
              <Button type="button" variant="ghost" size="icon" className="me-8 size-8 text-muted-foreground hover:text-destructive" aria-label={t('Löschen')}
                onClick={async () => { await spec.onDelete(spec.values.id); onClose(); }}><Trash2 className="size-4" /></Button>
            )}
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <Card title={t('Adresse')}>
              <div className="flex items-center gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary"><HostIcon slug={v.icon || spec.values.autoIcon} /></div>
                <Input className="h-11 rounded-xl" placeholder={t('Hostname oder IP-Adresse')} autoComplete="off" required autoFocus value={v.host ?? ''} onChange={set('host')} />
              </div>
            </Card>

            <Card title={t('Allgemein')}>
              <Field icon={Type}><Input className={inputCls} placeholder={t('Name')} autoComplete="off" value={v.name ?? ''} onChange={set('name')} /></Field>
              {vaults.length > 1 && (
                <Field icon={Users}>
                  <Select value={cur} onValueChange={pickVault}>
                    <SelectTrigger className={triggerCls}><SelectValue placeholder={t('Tresor')} /></SelectTrigger>
                    <SelectContent>{vaults.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              )}
              <Field icon={FolderOpen}>
                <Select value={v.group || '__none'} onValueChange={pick('group')}>
                  <SelectTrigger className={triggerCls}><SelectValue placeholder={t('Gruppe')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">{t('Keine Gruppe')}</SelectItem>
                    {spec.groups.filter((g) => (g.vault || 'personal') === cur).map((g) => <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field icon={Tag}><Input className={inputCls} placeholder={t('Tags (mit Komma getrennt)')} autoComplete="off" value={v.tags ?? ''} onChange={set('tags')} /></Field>
            </Card>

            {cur !== 'personal' && editing && (
              <Card title={t('Mein Zugang (nur für mich)')}>
                <Field icon={User}><Input className={inputCls} placeholder={t('Eigener Benutzer (optional)')} autoComplete="off" value={own.user} onChange={(e) => setOwn((o) => ({ ...o, user: e.target.value }))} /></Field>
                <Field icon={KeyRound}>
                  <Select value={own.keyId || '__none'} onValueChange={(x) => setOwn((o) => ({ ...o, keyId: x === '__none' ? '' : x }))}>
                    <SelectTrigger className={triggerCls}><SelectValue placeholder={t('Eigener Schlüssel')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">{t('Schlüssel des Hosts verwenden')}</SelectItem>
                      {spec.keys.filter((k) => !k.publicOnly).map((k) => <SelectItem key={k.id} value={k.id}>{`${k.name} · ${k.type}`}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </Card>
            )}

            <Card>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{t('SSH-Port')}</span>
                <Input type="number" min="1" max="65535" className="h-9 w-24 rounded-xl text-center" value={v.port ?? 22} onChange={set('port')} />
              </div>
              <div className="border-t" />
              <h3 className="text-sm font-semibold">{t('Zugangsdaten')}</h3>
              <Field icon={User}><Input className={inputCls} placeholder={t('Benutzer')} autoComplete="off" value={v.user ?? ''} onChange={set('user')} /></Field>
              <Field icon={Lock} end={
                <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={showPw ? t('Passwort verbergen') : t('Passwort anzeigen')} onClick={() => setShowPw(!showPw)}>
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>}>
                <Input className={cn(inputCls, 'pe-11')} type={showPw ? 'text' : 'password'} autoComplete="new-password"
                  placeholder={spec.values.hasSecret ? t('Passwort (leer = unverändert)') : t('Passwort')} value={v.secret ?? ''} onChange={set('secret')} />
              </Field>

              {keyOpen ? (
                <div className="flex items-center gap-2">
                  <Field icon={KeyRound}>
                    <Select value={v.keyId || '__none'} onValueChange={pick('keyId')}>
                      <SelectTrigger className={triggerCls}><SelectValue placeholder={t('Schlüssel (Keychain)')} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">{t('Kein Schlüssel (Passwort)')}</SelectItem>
                        {spec.keys.filter((k) => !k.publicOnly && (k.vault || 'personal') === cur).map((k) => <SelectItem key={k.id} value={k.id}>{`${k.name} · ${k.type}`}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0 text-muted-foreground" onClick={() => { setV((o) => ({ ...o, keyId: '' })); setKeyOpen(false); }}><X className="size-4" /></Button>
                </div>
              ) : (
                <Button type="button" variant="ghost" className="h-9 w-full justify-start gap-2 text-muted-foreground" onClick={() => setKeyOpen(true)}>
                  <Plus className="size-4" />{t('Schlüssel hinzufügen')}
                </Button>
              )}

              <div className="border-t" />
              <button type="button" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onClick={() => setMore(!more)}>
                {more ? t('Weniger anzeigen') : t('Mehr anzeigen')}<ChevronDown className={cn('size-4 transition-transform', more && 'rotate-180')} />
              </button>
              {more && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">{t('Symbol')}</p>
                  <Select value={v.icon || '__none'} onValueChange={pick('icon')}>
                    <SelectTrigger className="h-11 w-full rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">{t('Automatisch (Betriebssystem)')}</SelectItem>
                      {ICONS.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </Card>
          </div>

          <SheetFooter className="gap-2 border-t p-4">
            <Button type="submit" className="h-11 w-full rounded-xl" onClick={() => { action.current = 'connect'; }}>{t('Verbinden')}</Button>
            <Button type="submit" variant="outline" className="h-10 w-full rounded-xl" onClick={() => { action.current = 'save'; }}>{t('Speichern')}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
