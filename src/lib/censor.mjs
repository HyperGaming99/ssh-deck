// Zensur für Bildschirmfreigaben/Screenshots: zeigt von Fingerabdrücken und Hostnamen nur einen kleinen Anfang.
const DOTS = '••••••••';

// "SHA256:CYeCfgvlcGuzaFg…" -> "SHA256:CYeC••••••••"
export function maskFingerprint(fp) {
  if (!fp) return '';
  const i = fp.indexOf(':');
  return fp.slice(0, i + 1 + 4) + DOTS;
}

// IPv4: nur erste Zahl; Domain: Anfang des ersten Teils + Endung; sonst nur Anfang
export function maskHost(host) {
  const h = String(host || '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return `${h.split('.')[0]}.•••.•••.•••`;
  const parts = h.split('.');
  if (parts.length === 1) return h.slice(0, 2) + '•••';
  return [parts[0].slice(0, 2) + '•••', ...parts.slice(1, -1).map(() => '•••'), parts[parts.length - 1]].join('.');
}
