import { useId } from 'react';

// SSH-Deck-Zeichen: gefächertes Kartendeck mit Eingabeaufforderung (gleiche Form wie assets/logo.svg)
export default function Logo({ className = 'size-6' }) {
  const id = useId().replace(/:/g, '');
  const g = (n) => `url(#${id}${n})`;
  return (
    <svg viewBox="100 60 330 420" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id + 'm'} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff5fa2" /><stop offset="1" stopColor="#ff9a5a" /></linearGradient>
        <linearGradient id={id + 'c'} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2ec4ff" /><stop offset="1" stopColor="#4f7bff" /></linearGradient>
        <linearGradient id={id + 'f'} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7a5cff" /><stop offset="1" stopColor="#4f7bff" /></linearGradient>
        <linearGradient id={id + 'p'} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#9fe3ff" /></linearGradient>
      </defs>
      <g transform="rotate(21 256 452)"><rect x="130" y="82" width="252" height="326" rx="50" fill={g('m')} /></g>
      <g transform="rotate(10.5 256 452)"><rect x="130" y="82" width="252" height="326" rx="50" fill={g('c')} /></g>
      <rect x="130" y="82" width="252" height="326" rx="50" fill={g('f')} />
      <rect x="146" y="98" width="220" height="294" rx="36" fill="#0e1020" />
      <path d="M196 206 L262 262 L196 318" fill="none" stroke={g('p')} strokeWidth="36" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="282" y="312" width="68" height="30" rx="15" fill={g('m')} />
    </svg>
  );
}
