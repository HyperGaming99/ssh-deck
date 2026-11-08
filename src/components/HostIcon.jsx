import { useEffect, useState } from 'react';
import { Server } from 'lucide-react';

// Dashboard-Icon (public/icons/<slug>.svg) oder Fallback-Symbol
export default function HostIcon({ slug, className = 'size-6' }) {
  const [err, setErr] = useState(false);
  useEffect(() => {
    setErr(false);
  }, [slug]);

  if (slug && !err) {
    return <img src={`./icons/${slug}.svg`} alt="" className={className} onError={() => setErr(true)} />;
  }
  return <Server className={`${className} text-muted-foreground`} />;
}
