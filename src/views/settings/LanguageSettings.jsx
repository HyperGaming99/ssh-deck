import { Check, Globe } from 'lucide-react';
import { LANGS, useT } from '@/i18n';
import { cn } from '@/lib/utils';

const LANG_DETAILS = {
  de: { region: 'Deutschland, Österreich, Schweiz', sample: 'Guten Tag' },
  en: { region: 'United States, United Kingdom', sample: 'Hello' },
  es: { region: 'España, Latinoamérica', sample: 'Hola' },
  fr: { region: 'France, Canada, Suisse', sample: 'Bonjour' },
  pt: { region: 'Brasil, Portugal', sample: 'Olá' },
  it: { region: 'Italia, Svizzera', sample: 'Ciao' },
  nl: { region: 'Nederland, België', sample: 'Hallo' },
  pl: { region: 'Polska', sample: 'Cześć' },
  ru: { region: 'Россия, СНГ', sample: 'Привет' },
  uk: { region: 'Україна', sample: 'Привіт' },
  tr: { region: 'Türkiye', sample: 'Merhaba' },
  ja: { region: '日本 (Japan)', sample: 'こんにちは' },
  ko: { region: '대한민국 (Korea)', sample: '안녕하세요' },
  zh: { region: '中国, 简体中文', sample: '你好' },
  ar: { region: 'العالم العربي', sample: 'مرحباً' },
  hi: { region: 'भारत (India)', sample: 'नमस्ते' },
};

export default function LanguageSettings({ lang, setLang }) {
  const t = useT();
  const currentCode = lang || 'de';
  const currentLang = LANGS.find((l) => l.code === currentCode) || LANGS[1];

  return (
    <div className="space-y-4">
      {/* Kopfzeile mit aktuellem Status */}
      <div className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm">
        <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-primary/10 blur-2xl" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
              <Globe className="size-5.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">{t('Sprache der Oberfläche')}</h2>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  {currentCode.toUpperCase()}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {t('Wähle deine bevorzugte Sprache für die gesamte Benutzeroberfläche.')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-center rounded-xl border bg-muted/40 px-3 py-2 shrink-0 shadow-xs">
            <currentLang.Flag className="h-4.5 w-6.5 rounded-[3px] shadow-xs object-cover" />
            <span className="text-xs font-semibold">{currentLang.name}</span>
          </div>
        </div>
      </div>

      {/* Große Sprachen-Karten mit großer Flagge rechts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5" dir="ltr">
        {LANGS.map(({ code, name, Flag }) => {
          const isSel = currentCode === code;
          const meta = LANG_DETAILS[code] || { region: name, sample: '' };

          return (
            <button
              key={code}
              type="button"
              onClick={() => setLang(code)}
              className={cn(
                'group relative flex items-center justify-between gap-4 rounded-2xl border p-4 text-start transition-all',
                isSel
                  ? 'border-primary bg-primary/10 ring-2 ring-primary/20 shadow-sm'
                  : 'border-border bg-card hover:border-zinc-500/40 hover:bg-accent/40 hover:shadow-xs'
              )}
            >
              {/* Linke Seite: Details & Name */}
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                    {name}
                  </span>
                  <span className="font-mono text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
                    {code}
                  </span>
                  {isSel && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-xs">
                      <Check className="size-2.5 stroke-[3]" />
                      Aktiv
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground truncate leading-relaxed">
                  {meta.region}
                </p>

                {meta.sample && (
                  <p className="text-[11px] font-medium text-foreground/80 italic">
                    „{meta.sample}“
                  </p>
                )}
              </div>

              {/* Rechte Seite: Große Flagge */}
              <div className={cn(
                'relative shrink-0 overflow-hidden rounded-xl border transition-transform duration-300 group-hover:scale-105 shadow-sm',
                isSel ? 'border-primary/40 ring-2 ring-primary/30' : 'border-border'
              )}>
                <Flag className="h-11 w-16.5 object-cover" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
