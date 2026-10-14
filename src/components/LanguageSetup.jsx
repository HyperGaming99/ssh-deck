import Logo from '@/components/Logo';
import { LANGS } from '@/i18n';

// Erster Start: Sprache muss gewählt werden (bewusst kein stilles Englisch). Text neutral auf Englisch.
export default function LanguageSetup({ onPick }) {
  return (
    <div className="grid flex-1 place-items-center overflow-auto p-6" dir="ltr">
      <div className="w-full max-w-xl space-y-6 rounded-2xl border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo className="h-16 w-[50px]" />
          <h1 className="text-xl font-semibold">Choose your language</h1>
          <p className="text-sm text-muted-foreground">You can change it later in Settings.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LANGS.map(({ code, name, Flag }) => (
            <button key={code} onClick={() => onPick(code)}
              className="flex items-center gap-2.5 rounded-xl border bg-background px-3 py-2.5 text-start text-sm transition-colors hover:border-primary hover:bg-accent">
              <Flag className="h-4 w-6 shrink-0 rounded-[3px] shadow-sm" />
              <span className="truncate">{name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
