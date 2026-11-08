import { Laptop, Server, Shield, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';

export function TorIcon({ className = 'size-6', glow = true }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      fill="none"
      className={cn('shrink-0 select-none', className)}
    >
      <defs>
        <linearGradient id="torPurpleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#a855f7" />
          <stop offset="50%" stop-color="#7e22ce" />
          <stop offset="100%" stop-color="#581c87" />
        </linearGradient>
        <linearGradient id="torStemGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#65a30d" />
          <stop offset="100%" stop-color="#84cc16" />
        </linearGradient>
        {glow && (
          <filter id="torDropShadow" x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#9333ea" flood-opacity="0.35" />
          </filter>
        )}
      </defs>

      {/* Stem / Sprout */}
      <path
        d="M24 3 C24 3, 26.5 8, 29 10 C30.5 11.2, 33 11, 35 10 C33.5 12.5, 30 14, 26.5 13 C24.5 12.5, 24 10, 24 8 Z"
        fill="url(#torStemGrad)"
      />
      <path
        d="M23 4 C23 4, 20.5 8, 18.5 9.8 C17.2 10.5, 15 10.5, 13 10 C14.8 11.8, 17.5 12.8, 20.5 12 C22 11.5, 22.8 9.5, 23 8 Z"
        fill="url(#torStemGrad)"
      />

      {/* Main Onion Bulb */}
      <path
        d="M24 9.5 C13.5 9.5, 6.5 17.5, 6.5 27.5 C6.5 36.8, 14.8 44.5, 24 45.5 C33.2 44.5, 41.5 36.8, 41.5 27.5 C41.5 17.5, 34.5 9.5, 24 9.5 Z"
        fill="url(#torPurpleGrad)"
        filter={glow ? 'url(#torDropShadow)' : undefined}
      />

      {/* Concentric Onion Layers */}
      <path
        d="M24 14 C16.5 14, 11 19.8, 11 27.5 C11 35.2, 16.5 41, 24 41"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      <path
        d="M24 18.5 C18.8 18.5, 15.2 22.8, 15.2 27.5 C15.2 32.2, 18.8 36.5, 24 36.5"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      <path
        d="M24 23 C21.2 23, 19.5 25, 19.5 27.5 C19.5 30, 21.2 32, 24 32"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.95"
      />

      {/* Core Seed */}
      <circle cx="24" cy="27.5" r="2.2" fill="#ffffff" />

      {/* Roots */}
      <path
        d="M21 45.5 L20 47.5 M24 45.5 L24 48 M27 45.5 L28 47.5"
        stroke="#c084fc"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TorCircuit({ active = true, exitIp = null, className = '' }) {
  const t = useT();

  const nodes = [
    { label: t('Eingang'), role: 'Guard', icon: Shield, color: 'text-purple-500' },
    { label: t('Relais'), role: 'Middle', icon: Shield, color: 'text-purple-400' },
    { label: t('Ausgang'), role: 'Exit', icon: Shield, color: 'text-emerald-500' },
  ];

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background/50 p-3', className)}>
      {/* Client */}
      <div className="flex items-center gap-1.5">
        <div className="grid size-7 place-items-center rounded-lg border bg-card shadow-2xs">
          <Laptop className="size-3.5 text-muted-foreground" />
        </div>
        <span className="text-[11px] font-medium text-foreground">ssh-deck</span>
      </div>

      <ArrowRight className="size-3 text-muted-foreground/40 shrink-0" />

      {/* 3 Tor Hops */}
      <div className="flex items-center gap-1.5">
        {nodes.map((node, i) => (
          <div key={node.role} className="flex items-center gap-1.5">
            <div
              className={cn(
                'flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] shadow-2xs transition-colors',
                active
                  ? 'border-purple-500/30 bg-purple-500/10 text-foreground'
                  : 'border-border bg-card text-muted-foreground'
              )}
            >
              <TorIcon className="size-3.5" glow={false} />
              <span className="font-semibold">{node.label}</span>
            </div>
            {i < nodes.length - 1 && <span className="text-[10px] text-muted-foreground/40">→</span>}
          </div>
        ))}
      </div>

      <ArrowRight className="size-3 text-muted-foreground/40 shrink-0" />

      {/* Target */}
      <div className="flex items-center gap-1.5">
        <div className="grid size-7 place-items-center rounded-lg border bg-card shadow-2xs">
          <Server className="size-3.5 text-primary" />
        </div>
        <div className="text-[11px] leading-tight">
          <span className="font-semibold text-foreground">Host / Sync</span>
          {exitIp && (
            <span className="block font-mono text-[9px] text-emerald-600 dark:text-emerald-400">
              {exitIp}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default TorIcon;
