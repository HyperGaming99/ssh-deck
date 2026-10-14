// Blendet die Start-Animation aus index.html aus. Mindestens MIN ms seit Seitenstart sichtbar (damit die Animation fertig wird),
// aber nie länger als nötig: war das Laden schon langsam, verschwindet sie sofort.
const MIN = 3000;
let done = false;

export function hideSplash() {
  const el = document.getElementById('splash');
  if (done || !el) return;
  done = true;
  setTimeout(() => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 400);
  }, Math.max(0, MIN - performance.now()));
}
