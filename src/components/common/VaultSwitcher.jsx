import { Check, ChevronDown, Plus, Settings as SettingsIcon, User, Users } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useT } from '@/i18n';

// Tresor-Auswahl in der Kopfzeile: Persönlich oder eines der Teams
export function VaultSwitcher({ vaults, vault, setVault, signedIn, onNew, onManage }) {
  const t = useT();
  const cur = vaults.find((x) => x.id === vault) || vaults[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-transparent bg-accent/60 px-3 text-sm hover:bg-accent">
          {cur.id === 'personal' ? <User className="size-4 text-muted-foreground" /> : <Users className="size-4 text-primary" />}
          <span className="max-w-32 truncate">{cur.name}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        {vaults.map((x) => (
          <DropdownMenuItem key={x.id} onSelect={() => setVault(x.id)}>
            {x.id === 'personal' ? <User className="size-4" /> : <Users className="size-4" />}
            <span className="flex-1 truncate">{x.name}</span>
            {x.role === 'viewer' && <span className="text-xs text-muted-foreground">{t('Betrachter')}</span>}
            {x.id === vault && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <div className="my-1 h-px bg-border" />
        {signedIn ? <DropdownMenuItem onSelect={onNew}><Plus className="size-4" />{t('Neues Team …')}</DropdownMenuItem>
          : <p className="px-2 py-1.5 text-xs text-muted-foreground">{t('Melde dich an, um Teams zu nutzen.')}</p>}
        <DropdownMenuItem onSelect={onManage}><SettingsIcon className="size-4" />{t('Teams verwalten')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default VaultSwitcher;
