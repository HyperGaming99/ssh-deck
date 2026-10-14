import { Server } from 'lucide-react';

// Dashboard-Icon (public/icons/<slug>.svg) oder Fallback-Symbol
export default function HostIcon({ slug, className = 'size-6' }) {
  return slug
    ? <img src={`./icons/${slug}.svg`} alt="" className={className} />
    : <Server className={`${className} text-muted-foreground`} />;
}
