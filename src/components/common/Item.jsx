import SpotlightCard from '@/components/SpotlightCard';
import { cn } from '@/lib/utils';

// Karte mit Spotlight; icon darf beliebiger Node sein
export function Item({ icon, title, sub, onClick, actions, dark, compact, leading, className, iconStyle, ...rest }) {
  return (
    <SpotlightCard theme={dark ? 'dark' : 'light'} className={cn('cursor-pointer p-0!', className)} onClick={onClick} style={{ borderRadius: 18 }} {...rest}>
      <div className={cn('group relative flex items-center mcard', compact ? 'gap-3 p-3' : 'gap-4 p-5')}>
        {leading}
        <div
          className={cn('grid shrink-0 place-items-center overflow-hidden', compact ? 'size-11 rounded-lg bg-primary/10 text-primary' : 'size-14 rounded-xl bg-secondary [&>img]:size-9 [&>img]:object-contain [&>svg]:size-7')}
          style={iconStyle}
        >
          {icon}
        </div>
        <div className={cn('min-w-0 flex-1', compact ? 'space-y-0.5' : 'space-y-1')}>
          <div className={cn('truncate font-semibold', compact ? 'text-sm' : 'text-base')}>{title}</div>
          <div className={cn('truncate text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>{sub}</div>
        </div>
        {/* Aktionen schweben über der Karte statt Platz zu belegen: so bleibt der Text voll lesbar */}
        <div
          className="mact absolute end-3 top-1/2 flex -translate-y-1/2 rounded-xl border bg-card/95 p-0.5 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100"
          draggable={false}
          onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      </div>
    </SpotlightCard>
  );
}

export default Item;
