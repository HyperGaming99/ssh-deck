import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/i18n';

export function Toolbar({ q, setQ, label, onNew }) {
  const t = useT();
  return (
    <div className="mb-6 flex gap-3">
      <div className="relative max-w-md flex-1">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder={t('Suchen …')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {onNew && <Button onClick={onNew}><Plus className="size-4" />{label}</Button>}
    </div>
  );
}

export default Toolbar;
