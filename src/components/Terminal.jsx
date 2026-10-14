import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/fira-code/400.css';
import '@fontsource/source-code-pro/400.css';
import '@fontsource/ibm-plex-mono/400.css';


// Schreib-Funktionen der offenen Terminals; App leitet ssh:data hierhin.
export const writers = new Map();

// Eingegebene Zeilen für den Verlauf; Zeilen nach einer Passwort-/Code-Abfrage werden nie aufgezeichnet
const SECRET_PROMPT = /(pass(word|phrase|wort)?|kennwort|code|token|pin)[^\n]*:\s*$/i;
const strip = (x) => x.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g, '');

export default function Terminal({ sid, hostId, active, theme, font, attempt = 0, onCommand }) {
  const box = useRef(null);
  const ref = useRef({});

  useEffect(() => {
    const term = new XTerm({ fontFamily: font.family, fontSize: font.size, cursorBlink: true, theme });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(box.current);
    fit.fit();
    ref.current = { term, fit };
    let tail = '', line = ''; // letzte Ausgabe / aktuell getippte Zeile
    writers.set(sid, (d) => { tail = (tail + strip(d)).slice(-200); term.write(d); });
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
    return () => { ro.disconnect(); writers.delete(sid); api.close(sid); term.dispose(); };
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
