import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { SearchAddon } from '@xterm/addon-search';
import { useT } from '@/i18n';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/fira-code/400.css';
import '@fontsource/source-code-pro/400.css';
import '@fontsource/ibm-plex-mono/400.css';


// Schreib-Funktionen der offenen Terminals; App leitet ssh:data hierhin.
export const writers = new Map();

// Offene xterm-Instanzen (für Größe der Aufzeichnung) und laufende Aufzeichnungen sid -> { t0, size, ev }
const terms = new Map();
const recs = new Map();
export const startRec = (sid) => { const t = terms.get(sid); recs.set(sid, { t0: Date.now(), size: [t?.cols || 80, t?.rows || 24], ev: [] }); };
// Beendet die Aufzeichnung und liefert den Inhalt im asciicast-v2-Format (eine JSON-Zeile je Ereignis)
export const stopRec = (sid) => {
  const r = recs.get(sid); recs.delete(sid); if (!r) return null;
  const head = { version: 2, width: r.size[0], height: r.size[1], timestamp: Math.floor(r.t0 / 1000), env: { TERM: 'xterm-256color' } };
  return [head, ...r.ev].map((x) => JSON.stringify(x)).join('\n') + '\n';
};

// Eingegebene Zeilen für den Verlauf; Zeilen nach einer Passwort-/Code-Abfrage werden nie aufgezeichnet
const SECRET_PROMPT = /(pass(word|phrase|wort)?|kennwort|code|token|pin)[^\n]*:\s*$/i;
const strip = (x) => x.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g, '');

export default function Terminal({ sid, hostId, active, theme, font, attempt = 0, reconn = 0, onCommand }) {
  const t = useT();
  const box = useRef(null);
  const ref = useRef({});
  const input = useRef(null);
  const [find, setFind] = useState(null); // null = Suchleiste zu, sonst { q, cs }
    const go = (back, f = find) => { const a = ref.current.search; if (!a || !f.q) return; (back ? a.findPrevious : a.findNext).call(a, f.q, { caseSensitive: f.cs }); };
  const closeFind = () => { setFind(null); ref.current.search?.clearSelection(); ref.current.term?.focus(); };

  useEffect(() => {
    const term = new XTerm({ fontFamily: font.family, fontSize: font.size, cursorBlink: true, theme });
    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.open(box.current);
    fit.fit();
    ref.current = { term, fit, search };
    terms.set(sid, term);
    // Strg+F (Mac: Cmd+F) öffnet die Suche und geht nicht an die Shell
    term.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown' && e.key.toLowerCase() === 'f' && (api.platform === 'darwin' ? e.metaKey : e.ctrlKey) && !e.altKey) {
        setFind((f) => f || { q: '', cs: false }); setTimeout(() => input.current?.select(), 0); return false;
      }
      return true;
    });
    let tail = '', line = ''; // letzte Ausgabe / aktuell getippte Zeile
    writers.set(sid, (d) => { recs.get(sid)?.ev.push([(Date.now() - recs.get(sid).t0) / 1000, 'o', d]); tail = (tail + strip(d)).slice(-200); term.write(d); });
    term.onData((d) => {
      api.input(sid, d);
      if (d === '\r') { if (line.trim() && !SECRET_PROMPT.test(tail.split('\n').pop())) onCommand?.(sid, line.trim()); line = ''; }
      else if (d === '\x7f') line = line.slice(0, -1);
      else if (d.length === 1 ? d >= ' ' : !d.startsWith('\x1b')) line += d; // Pfeiltasten/Escape-Folgen ignorieren, Einfügen zählt
      else if (d.startsWith('\x1b')) line = '';
    });
    term.onResize(({ cols, rows }) => api.resize(sid, cols, rows));
    api.open(sid, hostId, term.cols, term.rows);
    const ro = new ResizeObserver(() => box.current.offsetParent && fit.fit());
    ro.observe(box.current);
    return () => { ro.disconnect(); writers.delete(sid); terms.delete(sid); recs.delete(sid); api.close(sid); term.dispose(); };
  }, [sid, hostId, attempt]);

  useEffect(() => { // Neu verbinden: dieselbe Sitzung noch einmal öffnen, der Terminal-Inhalt bleibt
    const term = ref.current.term;
    if (reconn && term) api.open(sid, hostId, term.cols, term.rows);
  }, [reconn]);
  useEffect(() => { if (ref.current.term) ref.current.term.options.theme = theme; }, [theme]);
  useEffect(() => { // Schrift erst laden, dann setzen und neu einpassen (sonst misst xterm mit der Ersatzschrift)
    const t = ref.current.term; if (!t) return;
    const apply = () => { t.options.fontFamily = font.family; t.options.fontSize = font.size; ref.current.fit?.fit(); };
    document.fonts.load(`${font.size}px ${font.family}`).then(apply, apply);
  }, [font.family, font.size]);
  useEffect(() => { if (active) { ref.current.fit?.fit(); ref.current.term?.focus(); } }, [active]);

  const btn = 'grid size-6 place-items-center rounded text-muted-foreground hover:bg-accent';
  return (
    <div className="relative size-full">
      <div ref={box} dir="ltr" className="size-full" />
      {find && (
        <div dir="ltr" className="absolute right-3 top-1 z-10 flex items-center gap-1 rounded-lg border bg-card p-1 text-foreground shadow-md">
          <input ref={input} autoFocus value={find.q} placeholder={t('Suchen')} className="h-6 w-44 rounded bg-background px-2 text-sm outline-none"
            onChange={(e) => { const f = { ...find, q: e.target.value }; setFind(f); go(false, f); }}
            onKeyDown={(e) => { if (e.key === 'Escape') closeFind(); else if (e.key === 'Enter') go(e.shiftKey); }} />
          <button type="button" title={t('Groß-/Kleinschreibung')} aria-label={t('Groß-/Kleinschreibung')} className={`${btn} text-xs font-semibold ${find.cs ? 'bg-primary/15 text-primary' : ''}`}
            onClick={() => { const f = { ...find, cs: !find.cs }; setFind(f); go(false, f); }}>Aa</button>
          <button type="button" title={t('Vorheriger Treffer')} aria-label={t('Vorheriger Treffer')} className={btn} onClick={() => go(true)}><ChevronUp className="size-4" /></button>
          <button type="button" title={t('Nächster Treffer')} aria-label={t('Nächster Treffer')} className={btn} onClick={() => go(false)}><ChevronDown className="size-4" /></button>
          <button type="button" title={t('Schließen')} aria-label={t('Schließen')} className={btn} onClick={closeFind}><X className="size-4" /></button>
        </div>
      )}
    </div>
  );
}
