import { useMemo, useState } from 'react';
import { Check, Globe, Info, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LANGS, RTL, useT } from '@/i18n';
import { cn } from '@/lib/utils';

export const LANG_META = {
  de: { enName: 'German', region: 'DACH · Standarddeutsch' },
  en: { enName: 'English', region: 'International · Global' },
  es: { enName: 'Spanish', region: 'España, América Latina' },
  fr: { enName: 'French', region: 'France, Canada, Belgique' },
  pt: { enName: 'Portuguese', region: 'Brasil, Portugal' },
  it: { enName: 'Italian', region: 'Italia, Svizzera' },
  nl: { enName: 'Dutch', region: 'Nederland, België' },
  pl: { enName: 'Polish', region: 'Polska' },
  ru: { enName: 'Russian', region: 'Восточная Европа' },
  uk: { enName: 'Ukrainian', region: 'Україна' },
  tr: { enName: 'Turkish', region: 'Türkiye' },
  ja: { enName: 'Japanese', region: '日本語 · 日本' },
  ko: { enName: 'Korean', region: '한국어 · 대한민국' },
  zh: { enName: 'Chinese', region: '简体中文 · 中国' },
  ar: { enName: 'Arabic', region: 'العالم العربي · الشرق الأوسط' },
  hi: { enName: 'Hindi', region: 'हिन्दी · भारत' },
};

export default function LanguageSettings({ lang, setLang }) {
  const t = useT();
  const [q, setQ] = useState('');

  const currentCode = lang || 'de';
  const activeLang = useMemo(
    () => LANGS.find((l) => l.code === currentCode) || LANGS[0],
    [currentCode]
  );
  const ActiveFlag = activeLang.Flag;
  const activeMeta = LANG_META[activeLang.code] || {};

  const filtered = useMemo(() => {
    if (!q.trim()) return LANGS;
    const term = q.trim().toLowerCase();
    return LANGS.filter(({ code, name }) => {
      const meta = LANG_META[code] || {};
      return (
        code.toLowerCase().includes(term) ||
        name.toLowerCase().includes(term) ||
        (meta.enName && meta.enName.toLowerCase().includes(term)) ||
        (meta.region && meta.region.toLowerCase().includes(term))
      );
    });
  }, [q]);

  return (
    <div className="space-y-4">
      {/* 1. Spotlight-Banner für die aktuell aktive Sprache */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative flex shrink-0 items-center justify-center rounded-xl border bg-background p-1.5 shadow-sm">
              <ActiveFlag className="h-8 w-12 rounded-[5px] object-cover shadow-xs" />
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {t('Aktive Sprache')}
                </span>
                <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 uppercase">
                  {activeLang.code}
                </Badge>
                {RTL.has(activeLang.code) && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {t('Rechts-nach-links (RTL)')}
                  </Badge>
                )}
              </div>
              <h3 className="text-xl font-bold tracking-tight text-foreground truncate">
                {activeLang.name}
              </h3>
              <p className="text-xs text-muted-foreground truncate">
                {activeMeta.enName ? `${activeMeta.enName} · ` : ''}{activeMeta.region}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
            <div className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Check className="size-3.5" />
              <span>{t('Aktiv')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Steuerleiste: Titel, Beschreibung, Suche & Trefferanzahl */}
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Globe className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">
                {t('Sprache der Oberfläche')}
              </h2>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {LANGS.length} {t('Sprachen')}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('Wähle deine bevorzugte Sprache für die gesamte Benutzeroberfläche.')}
            </p>
          </div>

          {/* Suchleiste */}
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('Sprache suchen …')}
              className="h-9 w-full ps-8 pe-8 text-xs rounded-xl"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 3. Grid aller Sprachen */}
        {!filtered.length ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-8 text-center">
            <p className="text-xs text-muted-foreground">{t('Keine Sprache gefunden.')}</p>
            <Button variant="outline" size="sm" className="h-8 text-xs rounded-lg" onClick={() => setQ('')}>
              {t('Suchen …')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5" dir="ltr">
            {filtered.map(({ code, name, Flag }) => {
              const isSel = currentCode === code;
              const meta = LANG_META[code] || {};
              const isRtl = RTL.has(code);

              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-2xl border p-3 text-start transition-all duration-150',
                    isSel
                      ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30'
                      : 'border-border/80 bg-background/50 hover:border-primary/40 hover:bg-accent/60'
                  )}
                >
                  <div className="relative shrink-0 overflow-hidden rounded-lg border border-border/50 bg-background/60 p-1 shadow-2xs group-hover:scale-105 transition-transform">
                    <Flag className="h-5 w-7.5 rounded-[3px] object-cover shadow-xs" />
                  </div>

                  <div className="min-w-0 flex-1 leading-snug">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('text-sm font-semibold truncate', isSel ? 'text-primary' : 'text-foreground')}>
                        {name}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground uppercase opacity-75">
                        {code}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {meta.enName || name}
                    </p>
                  </div>

                  {isRtl && (
                    <span className="text-[10px] font-mono rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                      RTL
                    </span>
                  )}

                  {isSel && (
                    <div className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-xs">
                      <Check className="size-3 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Fußzeilen-Hinweis */}
      <div className="flex items-start gap-3 rounded-2xl border border-muted bg-muted/30 p-3.5 text-xs text-muted-foreground">
        <Info className="size-4 shrink-0 mt-0.5 text-primary" />
        <p className="leading-relaxed">
          {t('Die Sprache wird ohne Neustart der Anwendung sofort wirksam.')}
        </p>
      </div>
    </div>
  );
}
