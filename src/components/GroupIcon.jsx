import {
  Folder, Server, Cloud, Database, Cpu, Network, Boxes, Globe,
  Shield, HardDrive, Terminal, Key, Layers, Rocket, Workflow, Radio,
  Monitor, LayoutGrid
} from 'lucide-react';
import { ICONS } from '@/icons';

export const LUCIDE_GROUP_ICONS = {
  folder: Folder,
  server: Server,
  cloud: Cloud,
  database: Database,
  cpu: Cpu,
  network: Network,
  boxes: Boxes,
  globe: Globe,
  shield: Shield,
  harddrive: HardDrive,
  terminal: Terminal,
  key: Key,
  layers: Layers,
  rocket: Rocket,
  workflow: Workflow,
  radio: Radio,
  monitor: Monitor,
  grid: LayoutGrid,
};

export const PRESET_GROUP_ICONS = [
  { id: 'folder', name: 'Ordner', type: 'lucide' },
  { id: 'server', name: 'Server', type: 'lucide' },
  { id: 'cloud', name: 'Cloud', type: 'lucide' },
  { id: 'database', name: 'Datenbank', type: 'lucide' },
  { id: 'terminal', name: 'Terminal', type: 'lucide' },
  { id: 'boxes', name: 'Container', type: 'lucide' },
  { id: 'network', name: 'Netzwerk', type: 'lucide' },
  { id: 'cpu', name: 'Hardware', type: 'lucide' },
  { id: 'shield', name: 'Sicherheit', type: 'lucide' },
  { id: 'globe', name: 'Web', type: 'lucide' },
  { id: 'harddrive', name: 'Speicher', type: 'lucide' },
  { id: 'rocket', name: 'Produktiv', type: 'lucide' },
  { id: 'docker', name: 'Docker', type: 'svg' },
  { id: 'kubernetes', name: 'Kubernetes', type: 'svg' },
  { id: 'proxmox', name: 'Proxmox', type: 'svg' },
  { id: 'debian-linux', name: 'Debian', type: 'svg' },
  { id: 'ubuntu-linux', name: 'Ubuntu', type: 'svg' },
  { id: 'linux', name: 'Linux', type: 'svg' },
  { id: 'raspberry-pi', name: 'Raspberry Pi', type: 'svg' },
  { id: 'aws', name: 'AWS', type: 'svg' },
  { id: 'hetzner', name: 'Hetzner', type: 'svg' },
  { id: 'home-assistant', name: 'Home Assistant', type: 'svg' },
  { id: 'mysql', name: 'MySQL', type: 'svg' },
  { id: 'postgresql', name: 'PostgreSQL', type: 'svg' },
  { id: 'nginx', name: 'NGINX', type: 'svg' },
];

export const GROUP_COLORS = [
  { name: 'Blau', value: '#3b82f6' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violett', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rot', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Bernstein', value: '#f59e0b' },
  { name: 'Grün', value: '#10b981' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Schiefer', value: '#64748b' },
];

export default function GroupIcon({ group, className = 'size-5', fallbackClass = 'text-primary' }) {
  if (!group) return <Folder className={className} />;

  // 1. Custom uploaded logo
  if (group.customLogo) {
    return (
      <img
        src={group.customLogo}
        alt=""
        className={`${className} object-contain rounded shrink-0`}
      />
    );
  }

  // 2. Preset public/icons/<slug>.svg
  if (group.icon && ICONS.includes(group.icon)) {
    return (
      <img
        src={`./icons/${group.icon}.svg`}
        alt=""
        className={`${className} object-contain shrink-0`}
      />
    );
  }

  // 3. Lucide icon preset
  const LucideComp = group.icon && LUCIDE_GROUP_ICONS[group.icon.toLowerCase()];
  if (LucideComp) {
    return (
      <LucideComp
        className={className}
        style={group.color ? { color: group.color } : undefined}
      />
    );
  }

  // 4. Default: Folder with group.color or fallback class
  return (
    <Folder
      className={`${className} ${!group.color ? fallbackClass : ''}`}
      style={group.color ? { color: group.color } : undefined}
    />
  );
}
