import { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { LANGS, useT } from '@/i18n';
import { cn } from '@/lib/utils';

export default function LanguageSettings({ lang, setLang }) {
  const t = useT();
  const [q, setQ] = useState('');

  const currentCode = lang || 'de';

  const filtered = useMemo(() => {
    if (!q.trim()) return LANGS;
    const term = q.trim().toLowerCase();
    return LANGS.filter(({ code, name }) => {
      return (
        code.toLowerCase().includes(term) ||
        name.toLowerCase().includes(term)
      );
    });
  }, [q]);

  return (
    <div className="space-y-3">
      {/* Kopfzeile mit Titel und kompakter Suche */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div>
          <p className="text-sm font-medium text-foreground">{t('Sprache der Oberfläche')}</p>
          <p className="text-xs text-muted-foreground">{t('Wähle deine bevorzugte Sprache für die gesamte Benutzeroberfläche.')}</p>
        </div>
        <div className="relative w-full sm:w-56 shrink-0">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('Sprache suchen …')}
            className="h-8 w-full ps-8 pe-7 text-xs rounded-lg"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Sprachauswahl */}
      <div className="rounded-xl border bg-card p-3">
        {!filtered.length ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            {t('Keine Sprache gefunden.')}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3" dir="ltr">
            {filtered.map(({ code, name, Flag }) => {
              const isSel = currentCode === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg border px-3 py-2 text-start text-sm transition-colors',
                    isSel
                      ? 'border-primary bg-primary/10 text-foreground font-medium'
                      : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Flag className="h-3.5 w-5 shrink-0 rounded-[2px] shadow-2xs" />
                  <span className="truncate">{name}</span>
                  {isSel && <Check className="ms-auto size-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
