// Mini-Markdown-Renderer für Release Notes (unterstützt Überschriften, Fett/Kursiv, Listen, Code, Links)
export function ReleaseNotes({ text }) {
  if (!text) return null;
  const lines = String(text).split('\n');
  const renderInline = (str) => {
    // Teilt Text anhand von Code (`...`), Fett (**...**), Kursiv (*...*) und Links ([text](url))
    const parts = [];
    let rem = str;
    let key = 0;
    while (rem.length > 0) {
      const match = rem.match(/(`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^)]+)\))/);
      if (!match) {
        parts.push(rem);
        break;
      }
      const idx = match.index;
      if (idx > 0) {
        parts.push(rem.slice(0, idx));
      }
      const full = match[0];
      if (full.startsWith('`')) {
        parts.push(<code key={key++} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{match[2]}</code>);
      } else if (full.startsWith('**')) {
        parts.push(<strong key={key++} className="font-semibold text-foreground">{match[3]}</strong>);
      } else if (full.startsWith('*')) {
        parts.push(<em key={key++} className="italic text-foreground">{match[4]}</em>);
      } else if (full.startsWith('[')) {
        parts.push(<a key={key++} href={match[6]} target="_blank" rel="noreferrer" className="text-primary underline hover:opacity-80" onClick={(e) => { e.preventDefault(); api.update.openPage?.(match[6]); }}>{match[5]}</a>);
      }
      rem = rem.slice(idx + full.length);
    }
    return parts;
  };

  return (
    <div className="max-h-56 space-y-2 overflow-auto rounded-lg border bg-background/50 p-3 text-xs leading-relaxed text-muted-foreground">
      {lines.map((l, i) => {
        const trimmed = l.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        if (trimmed.startsWith('### ')) {
          return <h4 key={i} className="pt-1 font-semibold text-foreground">{renderInline(trimmed.slice(4))}</h4>;
        }
        if (trimmed.startsWith('## ')) {
          return <h3 key={i} className="pt-1 text-sm font-semibold text-foreground">{renderInline(trimmed.slice(3))}</h3>;
        }
        if (trimmed.startsWith('# ')) {
          return <h2 key={i} className="pt-1 text-base font-bold text-foreground">{renderInline(trimmed.slice(2))}</h2>;
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={i} className="flex gap-2 ps-2">
              <span className="select-none text-muted-foreground">•</span>
              <div className="flex-1">{renderInline(trimmed.slice(2))}</div>
            </div>
          );
        }
        return <p key={i}>{renderInline(l)}</p>;
      })}
    </div>
  );
}

export default ReleaseNotes;
