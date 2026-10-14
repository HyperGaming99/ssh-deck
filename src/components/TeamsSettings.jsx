import { useCallback, useEffect, useState } from 'react';
import { Check, LogOut, Trash2, UserPlus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

const ROLE_LABEL = { owner: 'Besitzer', admin: 'Admin', member: 'Mitglied', viewer: 'Betrachter' };

// Teams verwalten: erstellen, Mitglieder einladen (mit Fingerabdruck zum Vergleichen), Rollen, entfernen, verlassen, löschen
export default function TeamsSettings({ st, teams, refresh, vault, setVault, toast, goAccount }) {
  const t = useT();
  const [name, setName] = useState('');
  const [sel, setSel] = useState(null);
  const [info, setInfo] = useState(null); // { role, members }
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [busy, setBusy] = useState(false);
  const team = teams.find((x) => x.id === sel) || null;
  const manage = team && (team.role === 'owner' || team.role === 'admin');
  const row = 'rounded-xl border bg-card p-4';
  const roleName = (r) => t(ROLE_LABEL[r] || r);

  const loadMembers = useCallback(async () => {
    if (!sel) return setInfo(null);
    const r = await api.team.members(sel);
    if (r.error) { toast(r.error); setInfo(null); } else setInfo(r);
  }, [sel, toast]);
  useEffect(() => { loadMembers(); }, [loadMembers, teams]);
  useEffect(() => { if (sel && !teams.some((x) => x.id === sel)) setSel(null); }, [teams, sel]);

  if (!st?.configured) {
    return (
      <div className={cn(row, 'max-w-xl space-y-3')}>
        <p className="text-sm">{t('Melde dich an, um Teams zu nutzen.')}</p>
        <Button onClick={goAccount}>{t('Konto & Sync')}</Button>
      </div>
    );
  }
  const run = async (fn, ok) => { setBusy(true); const r = await fn(); setBusy(false); if (r?.error) { toast(r.error); return false; } if (ok) toast(ok(r)); await refresh(); await loadMembers(); return true; };

  return (
    <div className="max-w-2xl space-y-4">
      <p className="rounded-xl bg-muted p-4 text-xs text-muted-foreground">{t('Teams sind Ende-zu-Ende verschlüsselt: Der Server sieht nur Chiffretext. Alles, was du in einem Team-Tresor ablegst (Hosts mit Passwörtern, Snippets, Schlüssel), sehen alle Mitglieder.')}</p>
      {st.teamError && <p className="text-sm text-destructive">{st.teamError}</p>}

      <form className={cn(row, 'flex gap-2')} onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; if (await run(async () => { const r = await api.team.create(name); if (r.id) setSel(r.id); return r; })) setName(''); }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Name')} autoComplete="off" maxLength={60} />
        <Button type="submit" disabled={busy || !name.trim()}><Users className="size-4" />{t('Team erstellen')}</Button>
      </form>

      {!teams.length && <p className="text-sm text-muted-foreground">{t('Du bist in keinem Team.')}</p>}
      <div className="grid gap-2">
        {teams.map((x) => (
          <button key={x.id} type="button" onClick={() => setSel(sel === x.id ? null : x.id)}
            className={cn(row, 'flex items-center gap-3 text-start transition-colors hover:bg-accent', sel === x.id && 'border-primary')}>
            <Users className="size-5 text-primary" />
            <div className="min-w-0 flex-1"><div className="truncate font-medium">{x.name}</div><div className="text-xs text-muted-foreground">{t('{n} Mitglieder', { n: x.members })}</div></div>
            <Badge variant="secondary">{roleName(x.role)}</Badge>
            {vault === x.id && <Check className="size-4 text-primary" />}
          </button>
        ))}
      </div>

      {team && info && (
        <div className={cn(row, 'space-y-4')}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">{team.name}</h3>
            <Button variant="outline" size="sm" onClick={() => setVault(team.id)}>{t('Tresor öffnen')}</Button>
          </div>

          <div className="space-y-2">
            {info.members.map((m) => (
              <div key={m.userId} className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.email}{m.me && <span className="ms-2 text-xs text-muted-foreground">{t('Du')}</span>}</div>
                  <div className="font-mono text-[11px] text-muted-foreground" dir="ltr" title={t('Schlüssel-Fingerabdruck')}>{m.fingerprint}</div>
                </div>
                {manage && m.role !== 'owner' && !m.me && (team.role === 'owner' || m.role !== 'admin') ? (
                  <Select value={m.role} onValueChange={(r) => run(() => api.team.setRole(team.id, m.userId, r))}>
                    <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{['admin', 'member', 'viewer'].filter((r) => r !== 'admin' || team.role === 'owner').map((r) => <SelectItem key={r} value={r}>{roleName(r)}</SelectItem>)}</SelectContent>
                  </Select>
                ) : <Badge variant="outline">{roleName(m.role)}</Badge>}
                {manage && m.role !== 'owner' && !m.me && (team.role === 'owner' || m.role !== 'admin') && (
                  <Button variant="ghost" size="icon" className="size-8" aria-label={t('Entfernen')} disabled={busy}
                    onClick={() => confirm(t('Mitglied „{email}“ entfernen? Der Teamschlüssel wird erneuert, damit die Person keinen Zugriff mehr hat.', { email: m.email })) && run(() => api.team.remove(team.id, m.userId))}><Trash2 className="size-4" /></Button>
                )}
              </div>
            ))}
          </div>

          {manage && (
            <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); if (!email.trim()) return; if (await run(() => api.team.invite(team.id, email, role), (r) => t('Eingeladen. Vergleicht den Fingerabdruck {fp} persönlich, damit niemand dazwischen steckt.', { fp: r.fingerprint }))) setEmail(''); }}>
              <Input className="min-w-48 flex-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('E-Mail-Adresse der Person')} autoComplete="off" />
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{['member', 'viewer', ...(team.role === 'owner' ? ['admin'] : [])].map((r) => <SelectItem key={r} value={r}>{roleName(r)}</SelectItem>)}</SelectContent>
              </Select>
              <Button type="submit" disabled={busy || !email.trim()}><UserPlus className="size-4" />{t('Einladen')}</Button>
            </form>
          )}

          <div className="flex justify-end border-t pt-3">
            {team.role === 'owner'
              ? <Button variant="destructive" size="sm" disabled={busy} onClick={() => confirm(t('Team „{name}“ löschen? Alle geteilten Einträge verschwinden für alle Mitglieder.', { name: team.name })) && run(() => api.team.delete(team.id)).then((ok) => ok && vault === team.id && setVault('personal'))}><Trash2 className="size-4" />{t('Team löschen')}</Button>
              : <Button variant="outline" size="sm" disabled={busy} onClick={() => confirm(t('Team „{name}“ verlassen? Die geteilten Einträge verschwinden von diesem Gerät.', { name: team.name })) && run(() => api.team.leave(team.id)).then((ok) => ok && vault === team.id && setVault('personal'))}><LogOut className="size-4" />{t('Team verlassen')}</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
