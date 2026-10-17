import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { SearchAddon } from '@xterm/addon-search';
import { useT } from '@/i18n';
import { suggest } from '@/lib/suggest.mjs';
import { cn } from '@/lib/utils';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/fira-code/400.css';
import '@fontsource/source-code-pro/400.css';
import '@fontsource/ibm-plex-mono/400.css';


// Schreib-Funktionen der offenen Terminals; App leitet ssh:data hierhin.
export const writers = new Map();
// Broadcast: Eingabe des fokussierten Terminals geht zusätzlich an diese Sessions (leer = aus)
export const bcast = { to: [] };

// Einrastende Strg/Alt-Tasten der Handy-Leiste (KeyBar): gelten für die nächste getippte Taste
export const mods = { ctrl: false, alt: false, ls: new Set() };
export const setMod = (k, v) => { mods[k] = v; mods.ls.forEach((f) => f()); };
const withMods = (d) => {
  if (!mods.ctrl && !mods.alt) return d;
  if (d.length === 1) {
    if (mods.ctrl) { const c = d.toUpperCase().charCodeAt(0); if (c >= 64 && c <= 95) d = String.fromCharCode(c - 64); else if (d === ' ') d = '\0'; }
    if (mods.alt) d = '\x1b' + d;
  }
  setMod('ctrl', false); setMod('alt', false);
  return d;
};

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

// Einfügen per Strg+V / Rechtsklick: 'ask' (beim ersten Mal fragen), 'on', 'off'; liegt in localStorage wie die Schrift
export const getPaste = () => { try { return localStorage.getItem('termPaste') || 'ask'; } catch { return 'ask'; } };
export const setPaste = (v) => { try { localStorage.setItem('termPaste', v); } catch { /* egal */ } };

// Befehlsvorschläge beim Tippen: 'on' (Standard) oder 'off'; liegt in localStorage wie das Einfügen
export const getSuggest = () => { try { return localStorage.getItem('termSuggest') || 'on'; } catch { return 'on'; } };
export const setSuggest = (v) => { try { localStorage.setItem('termSuggest', v); } catch { /* egal */ } };

export default function Terminal({ sid, hostId, active, theme, font, attempt = 0, reconn = 0, onCommand }) {
  const box = useRef(null);
  const ref = useRef({});
  const t = useT();
  const tr = useRef(t); tr.current = t;
  const input = useRef(null);
  const [sug, setSug] = useState(null); // Vorschläge am Cursor: { items, sel, line, x, y }
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
    const el = box.current;
    terms.set(sid, term);
    let tail = '', line = ''; // letzte Ausgabe / aktuell getippte Zeile
    // Vorschläge: Befehle dieser Sitzung (nur im Speicher), Snippets, häufige Befehle; Annahme: Strg+Leertaste oder Antippen
    const cmds = []; let snips = [], cur = null;
    api.snippets.list().then((l) => { snips = l.map((x) => x.cmd).filter((c) => c && !c.includes('{{') && !c.includes('\n')); }, () => {});
    const hide = () => { if (cur) { cur = null; setSug(null); } };
    const refresh = () => {
      const items = getSuggest() === 'off' || term.buffer.active.type === 'alternate' || SECRET_PROMPT.test(tail.split('\n').pop()) ? [] : suggest(line, { history: cmds, snippets: snips });
      if (!items.length) return hide();
      const scr = term.element?.querySelector('.xterm-screen'), box0 = el.getBoundingClientRect();
      if (!scr) return;
      const r = scr.getBoundingClientRect(), cw = r.width / term.cols, ch = r.height / term.rows;
      const x = r.left - box0.left + term.buffer.active.cursorX * cw, y = r.top - box0.top + term.buffer.active.cursorY * ch;
      const above = y > box0.height / 2; // Cursor in der unteren Hälfte: Popup über der Eingabezeile, sonst darunter (verankert, damit es sie nie überdeckt)
      cur = { items, sel: cur && cur.line === line ? cur.sel : -1, line, x: Math.max(0, Math.min(x, box0.width - 220)), ...(above ? { bottom: box0.height - y + 2 } : { top: y + ch + 2 }) };
      setSug(cur);
    };
    const accept = (it) => { // nur den fehlenden Rest tippen
      const add = it.text.slice(line.length); if (!add) return;
      api.input(sid, add); for (const o of bcast.to) if (o !== sid) api.input(o, add);
      line += add; hide(); term.focus();
    };
    ref.current.accept = accept;
    writers.set(sid, (d) => { recs.get(sid)?.ev.push([(Date.now() - recs.get(sid).t0) / 1000, 'o', d]); tail = (tail + strip(d)).slice(-200); term.write(d); });
    const paste = async () => {
      try { await pasteNow(); } finally { setTimeout(() => term.focus(), 0); } // confirm() nimmt dem Terminal den Fokus
    };
    const pasteNow = async () => {
      const m = getPaste();
      if (m === 'off') return;
      if (m === 'ask') { if (!confirm(tr.current('Zwischenablage ins Terminal einfügen? Das gilt für Strg+V und Rechtsklick und lässt sich in den Einstellungen ändern.'))) return setPaste('off'); setPaste('on'); }
      try { const x = await navigator.clipboard.readText(); if (x) term.paste(x); } catch { /* Zwischenablage nicht lesbar */ }
    };
    const copy = () => { const x = term.getSelection(); if (x) navigator.clipboard.writeText(x).catch(() => {}); };
    // Strg+C kopiert nur bei Markierung (sonst Abbruch ans Terminal), Strg+Shift+C immer; Strg+A bleibt für die Shell, Strg+Shift+A markiert alles
    term.attachCustomKeyEventHandler((e) => {
      if (cur && e.type === 'keydown') { // Vorschläge: Strg+Leertaste übernimmt, Alt+Pfeil wählt, Esc blendet aus (geht auch an die Shell)
        if (e.key === ' ' && e.ctrlKey) { e.preventDefault(); accept(cur.items[Math.max(0, cur.sel)]); return false; }
        if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); cur = { ...cur, sel: (cur.sel + (e.key === 'ArrowDown' ? 1 : -1) + cur.items.length) % cur.items.length }; setSug(cur); return false; }
        if (e.key === 'Escape') hide();
      }
      // Strg+F (Mac: Cmd+F) öffnet die Suche und geht nicht an die Shell
      if (e.type === 'keydown' && e.key.toLowerCase() === 'f' && (api.platform === 'darwin' ? e.metaKey : e.ctrlKey) && !e.altKey) {
        setFind((f) => f || { q: '', cs: false }); setTimeout(() => input.current?.select(), 0); return false;
      }
      if (e.type !== 'keydown' || !e.ctrlKey || e.altKey || e.metaKey) return true;
      const k = e.key.toLowerCase();
      if (k === 'v') { e.preventDefault(); paste(); return false; }
      if (k === 'c' && (e.shiftKey || term.hasSelection())) { e.preventDefault(); copy(); return false; }
      if (k === 'a' && e.shiftKey) { e.preventDefault(); term.selectAll(); return false; }
      return true;
    });
    // Rechtsklick: mit Markierung kopieren, sonst einfügen
    const onCtx = (e) => { e.preventDefault(); term.focus(); if (term.hasSelection()) { copy(); term.clearSelection(); } else paste(); };
    el.addEventListener('contextmenu', onCtx);
    term.onData((d) => {
      d = withMods(d);
      api.input(sid, d);
      for (const o of bcast.to) if (o !== sid) api.input(o, d);
      if (d === '\r') { if (line.trim() && !SECRET_PROMPT.test(tail.split('\n').pop())) { onCommand?.(sid, line.trim()); cmds.push(line.trim()); } line = ''; }
      else if (d === '\x7f') line = line.slice(0, -1);
      else if (d.length === 1 ? d >= ' ' : !d.startsWith('\x1b')) line += d; // Pfeiltasten/Escape-Folgen ignorieren, Einfügen zählt
      else if (d.startsWith('\x1b')) line = '';
    });
    term.onWriteParsed(refresh); // nach der Ausgabe des Servers (Echo): Cursor steht dann an der richtigen Stelle
    term.onResize(({ cols, rows }) => api.resize(sid, cols, rows));
    api.open(sid, hostId, term.cols, term.rows);
    const ro = new ResizeObserver(() => box.current.offsetParent && fit.fit());
    ro.observe(box.current);
    return () => { el.removeEventListener('contextmenu', onCtx); ro.disconnect(); writers.delete(sid); terms.delete(sid); recs.delete(sid); api.close(sid); term.dispose(); };
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
      {sug && (
        <div dir="ltr" className="absolute z-20 w-max min-w-40 max-w-[92%] overflow-hidden rounded-lg border bg-card py-0.5 text-foreground shadow-lg" style={{ left: sug.x, top: sug.top, bottom: sug.bottom }}>
          {sug.items.map((it, i) => (
            <button key={it.text} type="button" onMouseDown={(e) => { e.preventDefault(); ref.current.accept(it); }}
              className={cn('flex h-7 w-full items-center gap-3 px-2 text-start font-mono text-xs hover:bg-accent msug', i === sug.sel && 'bg-accent')}>
              <span className="min-w-0 truncate"><b>{sug.line}</b><span className="text-muted-foreground">{it.text.slice(sug.line.length)}</span></span>
              <span className="ms-auto shrink-0 font-sans text-[10px] text-muted-foreground">{it.src === 'hist' ? t('Verlauf') : it.src === 'snip' ? t('Snippet') : t('Häufig')}</span>
            </button>
          ))}
        </div>
      )}
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
