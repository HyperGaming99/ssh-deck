// Gemeinsamer Zustand der Terminals (ohne xterm): Schreibfunktionen, Broadcast, Handy-Tasten, Aufzeichnung, Einstellungen.
// Eigene Datei, damit App und KeyBar nicht das ganze xterm mitladen müssen (Terminal wird erst beim ersten Öffnen geladen).
// Schreib-Funktionen der offenen Terminals; App leitet ssh:data hierhin.
export const writers = new Map();
// Broadcast: Eingabe des fokussierten Terminals geht zusätzlich an diese Sessions (leer = aus)
export const bcast = { to: [] };

// Einrastende Strg/Alt-Tasten der Handy-Leiste (KeyBar): gelten für die nächste getippte Taste
export const mods = { ctrl: false, alt: false, ls: new Set() };
export const setMod = (k, v) => { mods[k] = v; mods.ls.forEach((f) => f()); };
export const withMods = (d) => {
  if (!mods.ctrl && !mods.alt) return d;
  if (d.length === 1) {
    if (mods.ctrl) { const c = d.toUpperCase().charCodeAt(0); if (c >= 64 && c <= 95) d = String.fromCharCode(c - 64); else if (d === ' ') d = '\0'; }
    if (mods.alt) d = '\x1b' + d;
  }
  setMod('ctrl', false); setMod('alt', false);
  return d;
};

// Offene xterm-Instanzen (für Größe der Aufzeichnung) und laufende Aufzeichnungen sid -> { t0, size, ev }
export const terms = new Map();
export const recs = new Map();
export const startRec = (sid) => { const t = terms.get(sid); recs.set(sid, { t0: Date.now(), size: [t?.cols || 80, t?.rows || 24], ev: [] }); };
// Beendet die Aufzeichnung und liefert den Inhalt im asciicast-v2-Format (eine JSON-Zeile je Ereignis)
export const stopRec = (sid) => {
  const r = recs.get(sid); recs.delete(sid); if (!r) return null;
  const head = { version: 2, width: r.size[0], height: r.size[1], timestamp: Math.floor(r.t0 / 1000), env: { TERM: 'xterm-256color' } };
  return [head, ...r.ev].map((x) => JSON.stringify(x)).join('\n') + '\n';
};

// Einfügen per Strg+V / Rechtsklick: 'ask' (beim ersten Mal fragen), 'on', 'off'; liegt in localStorage wie die Schrift
export const getPaste = () => { try { return localStorage.getItem('termPaste') || 'ask'; } catch { return 'ask'; } };
export const setPaste = (v) => { try { localStorage.setItem('termPaste', v); } catch { /* egal */ } };

// Befehlsvorschläge beim Tippen: 'on' (Standard) oder 'off'; liegt in localStorage wie das Einfügen
export const getSuggest = () => { try { return localStorage.getItem('termSuggest') || 'on'; } catch { return 'on'; } };
export const setSuggest = (v) => { try { localStorage.setItem('termSuggest', v); } catch { /* egal */ } };

