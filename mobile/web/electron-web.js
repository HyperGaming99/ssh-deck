// Gegenstück im WebView: ersetzt "electron" für preload.js, damit window.api wie am Desktop funktioniert.
// Kanal: window.__deckChannel = { send(string), onMessage(fn) } (Capacitor-Plugin oder Test).
const pend = new Map();
const subs = new Map();
const native = {}; // Anfragen vom Node-Teil: name -> async (...args) => Antwort
let id = 0;
let ready;
const up = new Promise((r) => { ready = r; });
const ch = () => window.__deckChannel;

export const handleNative = (name, fn) => { native[name] = fn; };
export const connect = () => {
  ch().onMessage(onMessage);
  const hello = setInterval(() => ch().send(JSON.stringify({ t: 'hello' })), 400); // Node startet evtl. später als die Oberfläche
  up.then(() => clearInterval(hello));
};
const onMessage = (raw) => {
  const m = JSON.parse(raw);
  if (m.t === 'ready') ready();
  else if (m.t === 'result') { const p = pend.get(m.id); pend.delete(m.id); if (p) (m.ok ? p.res(m.value) : p.rej(new Error(m.error))); }
  else if (m.t === 'event') (subs.get(m.ch) || []).forEach((f) => f({}, ...m.args));
  else if (m.t === 'req') Promise.resolve(native[m.name]?.(...m.args)).catch(() => null).then((value) => ch().send(JSON.stringify({ t: 'res', id: m.id, value: value ?? null })));
};

export const ipcRenderer = {
  invoke: (c, ...args) => up.then(() => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ch().send(JSON.stringify({ t: 'invoke', id: i, ch: c, args })); })),
  send: (c, ...args) => up.then(() => ch().send(JSON.stringify({ t: 'send', ch: c, args }))),
  on: (c, f) => subs.set(c, [...(subs.get(c) || []), f]),
};
export const contextBridge = { exposeInMainWorld: (name, obj) => { window[name] = obj; } };
export const webUtils = { getPathForFile: () => '' };
