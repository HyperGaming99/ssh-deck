import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Tab als abgerundete Pille; onClose zeigt ein X
export function Pill({ active, onClick, onClose, children }) {
  return (
    <div onClick={onClick}
      className={cn('flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-transparent px-3 text-sm text-muted-foreground transition-colors hover:bg-accent',
        active && 'border-border bg-background text-foreground shadow-sm')}>
      {children}
      {onClose && <X className="size-3.5 opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); onClose(); }} />}
    </div>
  );
}

export default Pill;
