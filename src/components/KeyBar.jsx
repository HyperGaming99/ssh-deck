import { useEffect, useState } from 'react';
import { mods, setMod } from '@/components/Terminal';
import { cn } from '@/lib/utils';

// Sondertasten-Leiste für das Handy-Terminal (horizontal scrollbar); Strg/Alt rasten ein
const KEYS = [
  ['Esc', '\x1b'], ['Tab', '\t'], ['Ctrl'], ['Alt'], ['←', '\x1b[D'], ['↑', '\x1b[A'], ['↓', '\x1b[B'], ['→', '\x1b[C'],
  ['|', '|'], ['/', '/'], ['-', '-'], ['~', '~'], ['Home', '\x1b[H'], ['End', '\x1b[F'], ['PgUp', '\x1b[5~'], ['PgDn', '\x1b[6~'],
];

export default function KeyBar({ sid }) {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); mods.ls.add(f); return () => mods.ls.delete(f); }, []);
  return (
    <div dir="ltr" className="mkeys flex shrink-0 gap-1 overflow-x-auto border-t bg-sidebar p-1 [scrollbar-width:none]" onMouseDown={(e) => e.preventDefault()}>
      {KEYS.map(([label, seq]) => {
        const k = label === 'Ctrl' ? 'ctrl' : label === 'Alt' ? 'alt' : null;
        return (
          <button key={label} type="button" onClick={() => (k ? setMod(k, !mods[k]) : api.input(sid, seq))}
            className={cn('h-11 min-w-11 shrink-0 rounded-lg border bg-background px-3 font-mono text-sm active:bg-accent', k && mods[k] && 'border-primary bg-primary text-primary-foreground')}>{label}</button>
        );
      })}
    </div>
  );
}
