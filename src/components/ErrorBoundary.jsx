import { Component } from 'react';
import { useT } from '@/i18n';

function Fallback({ error }) {
  const t = useT();
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="max-w-md space-y-3 rounded-2xl border bg-card p-6 text-center">
        <p className="text-base font-semibold">{t('Etwas ist schiefgelaufen.')}</p>
        <p className="break-words font-mono text-xs text-muted-foreground" dir="ltr">{String(error?.message || error)}</p>
        <button type="button" className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground" onClick={() => location.reload()}>{t('Neu laden')}</button>
      </div>
    </div>
  );
}

// Fängt Darstellungsfehler ab: statt eines weißen Bildschirms steht die Fehlermeldung da (und ein Knopf zum Neuladen)
export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error(error, info?.componentStack); }
  render() { return this.state.error ? <Fallback error={this.state.error} /> : this.props.children; }
}
