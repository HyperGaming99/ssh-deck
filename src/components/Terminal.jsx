import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/fira-code/400.css';
import '@fontsource/source-code-pro/400.css';
import '@fontsource/ibm-plex-mono/400.css';
import { useT } from '@/i18n';


// Schreib-Funktionen der offenen Terminals; App leitet ssh:data hierhin.
export const writers = new Map();
// Broadcast: Eingabe des fokussierten Terminals geht zusätzlich an diese Sessions (leer = aus)
export const bcast = { to: [] };

// Eingegebene Zeilen für den Verlauf; Zeilen nach einer Passwort-/Code-Abfrage werden nie aufgezeichnet
const SECRET_PROMPT = /(pass(word|phrase|wort)?|kennwort|code|token|pin)[^\n]*:\s*$/i;
const strip = (x) => x.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g, '');

// Einfügen per Strg+V / Rechtsklick: 'ask' (beim ersten Mal fragen), 'on', 'off'; liegt in localStorage wie die Schrift
export const getPaste = () => { try { return localStorage.getItem('termPaste') || 'ask'; } catch { return 'ask'; } };
export const setPaste = (v) => { try { localStorage.setItem('termPaste', v); } catch { /* egal */ } };

export default function Terminal({ sid, hostId, active, theme, font, attempt = 0, onCommand }) {
  const box = useRef(null);
  const ref = useRef({});
  const t = useT();
  const tr = useRef(t); tr.current = t;

  useEffect(() => {
    const term = new XTerm({ fontFamily: font.family, fontSize: font.size, cursorBlink: true, theme });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(box.current);
    fit.fit();
    ref.current = { term, fit };
    let tail = '', line = ''; // letzte Ausgabe / aktuell getippte Zeile
    writers.set(sid, (d) => { tail = (tail + strip(d)).slice(-200); term.write(d); });
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
      if (e.type !== 'keydown' || !e.ctrlKey || e.altKey || e.metaKey) return true;
      const k = e.key.toLowerCase();
      if (k === 'v') { e.preventDefault(); paste(); return false; }
      if (k === 'c' && (e.shiftKey || term.hasSelection())) { e.preventDefault(); copy(); return false; }
      if (k === 'a' && e.shiftKey) { e.preventDefault(); term.selectAll(); return false; }
      return true;
    });
    // Rechtsklick: mit Markierung kopieren, sonst einfügen
    const el = box.current;
    const onCtx = (e) => { e.preventDefault(); term.focus(); if (term.hasSelection()) { copy(); term.clearSelection(); } else paste(); };
    el.addEventListener('contextmenu', onCtx);
    term.onData((d) => {
      api.input(sid, d);
      for (const o of bcast.to) if (o !== sid) api.input(o, d);
      if (d === '\r') { if (line.trim() && !SECRET_PROMPT.test(tail.split('\n').pop())) onCommand?.(sid, line.trim()); line = ''; }
      else if (d === '\x7f') line = line.slice(0, -1);
      else if (d.length === 1 ? d >= ' ' : !d.startsWith('\x1b')) line += d; // Pfeiltasten/Escape-Folgen ignorieren, Einfügen zählt
      else if (d.startsWith('\x1b')) line = '';
    });
    term.onResize(({ cols, rows }) => api.resize(sid, cols, rows));
    api.open(sid, hostId, term.cols, term.rows);
    const ro = new ResizeObserver(() => box.current.offsetParent && fit.fit());
    ro.observe(box.current);
    return () => { el.removeEventListener('contextmenu', onCtx); ro.disconnect(); writers.delete(sid); api.close(sid); term.dispose(); };
  }, [sid, hostId, attempt]);

  useEffect(() => { if (ref.current.term) ref.current.term.options.theme = theme; }, [theme]);
  useEffect(() => { // Schrift erst laden, dann setzen und neu einpassen (sonst misst xterm mit der Ersatzschrift)
    const t = ref.current.term; if (!t) return;
    const apply = () => { t.options.fontFamily = font.family; t.options.fontSize = font.size; ref.current.fit?.fit(); };
    document.fonts.load(`${font.size}px ${font.family}`).then(apply, apply);
  }, [font.family, font.size]);
  useEffect(() => { if (active) { ref.current.fit?.fit(); ref.current.term?.focus(); } }, [active]);

  return <div ref={box} dir="ltr" className="size-full" />;
}
