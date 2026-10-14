// Pfad-Helfer für die SFTP-Spalten: lokal mit dem Trenner des Systems (Windows '\'), remote immer '/'.
export const DRIVES = '::drives'; // Pseudo-Pfad: Liste der Laufwerke (nur Windows)
const isDriveRoot = (p) => /^[A-Za-z]:\\?$/.test(p);

export function joinPath(base, name, sep) {
  if (base === DRIVES) return name; // Laufwerksname wie "C:\" ist schon ein ganzer Pfad
  return base.endsWith(sep) ? base + name : base + sep + name;
}

export function parentPath(p, sep) {
  if (p === DRIVES) return DRIVES;
  if (sep === '\\') {
    if (isDriveRoot(p)) return DRIVES; // über "C:\" gibt es nur noch die Laufwerksliste
    const i = p.lastIndexOf('\\');
    return i === 2 && /^[A-Za-z]:/.test(p) ? p.slice(0, 3) : i > 2 ? p.slice(0, i) : p;
  }
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.slice(0, i);
}
