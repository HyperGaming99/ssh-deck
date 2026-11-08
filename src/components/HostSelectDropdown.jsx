import { Check, ChevronDown, Laptop } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import HostIcon from '@/components/HostIcon';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

export function LocalIcon({ className = 'size-4 shrink-0' }) {
  const plat = window.api?.platform;
  const slug = plat === 'darwin' ? 'apple' : plat === 'win32' ? 'windows-11' : plat === 'linux' ? 'linux' : null;
  if (slug) {
    return <HostIcon slug={slug} className={className} />;
  }
  return <Laptop className={cn(className, 'text-muted-foreground')} />;
}

export default function HostSelectDropdown({
  hosts = [],
  selectedHost = 'local',
  onSelect,
  className,
}) {
  const t = useT();
  const activeHost = selectedHost === 'local' ? null : hosts.find((h) => h.id === selectedHost);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'h-9 max-w-[280px] sm:max-w-[360px] gap-2 rounded-xl border bg-background px-3 text-xs font-medium justify-between shadow-xs hover:bg-accent/60',
            className
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            {selectedHost === 'local' || !activeHost ? (
              <>
                <LocalIcon className="size-4 shrink-0" />
                <span className="truncate">{t('Lokal (dieser Rechner)')}</span>
              </>
            ) : (
              <>
                <HostIcon slug={activeHost.icon || activeHost.autoIcon} className="size-4 shrink-0" />
                <span className="truncate font-semibold">{activeHost.name}</span>
                <span className="hidden sm:inline truncate text-[11px] text-muted-foreground font-normal">
                  ({activeHost.user}@{activeHost.host})
                </span>
              </>
            )}
          </div>
          <ChevronDown className="size-3.5 shrink-0 opacity-60 text-muted-foreground ms-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 max-h-80 overflow-y-auto p-1.5">
        <DropdownMenuItem
          onClick={() => onSelect('local')}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer"
        >
          <LocalIcon className="size-4 shrink-0" />
          <span className="flex-1 truncate text-xs font-medium">{t('Lokal (dieser Rechner)')}</span>
          {selectedHost === 'local' && <Check className="size-4 shrink-0 text-primary" />}
        </DropdownMenuItem>

        {hosts.length > 0 && <DropdownMenuSeparator className="my-1" />}
        {hosts.length > 0 && (
          <DropdownMenuLabel className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('Hosts')}
          </DropdownMenuLabel>
        )}

        {hosts.map((h) => {
          const isSelected = selectedHost === h.id;
          return (
            <DropdownMenuItem
              key={h.id}
              onClick={() => onSelect(h.id)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer"
            >
              <HostIcon slug={h.icon || h.autoIcon} className="size-4 shrink-0" />
              <div className="flex flex-1 flex-col min-w-0 leading-tight">
                <span className="truncate text-xs font-medium">{h.name}</span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {h.user}@{h.host}{h.port && h.port !== 22 ? `:${h.port}` : ''}
                </span>
              </div>
              {isSelected && <Check className="size-4 shrink-0 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
