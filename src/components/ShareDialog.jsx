import { useState, useEffect } from 'react';
import {
  Share2,
  Copy,
  Check,
  QrCode,
  Users,
  Radio,
  Eye,
  Keyboard,
  ExternalLink,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

export default function ShareDialog({ open, onClose, tab, toast }) {
  const t = useT();
  const [status, setStatus] = useState(null); // null | { active, port, token, urls, interactive, viewers }
  const [qrCode, setQrCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [interactive, setInteractive] = useState(false);

  const sid = tab?.sid;

  useEffect(() => {
    if (!open || !sid || !api.share?.status) return;
    api.share.status(sid).then((s) => {
      setStatus(s);
      if (s) {
        setInteractive(!!s.interactive);
        generateQr(s.urls?.[0]?.url || '');
      } else {
        setQrCode('');
      }
    }).catch(() => {});
  }, [open, sid]);

  const generateQr = async (url) => {
    if (!url) return;
    try {
      const { toDataURL } = await import('qrcode');
      const dataUrl = await toDataURL(url, { width: 220, margin: 2, errorCorrectionLevel: 'M' });
      setQrCode(dataUrl);
    } catch {
      /* ignore */
    }
  };

  const handleStart = async () => {
    if (!sid || !api.share?.start) return;
    setLoading(true);
    try {
      const res = await api.share.start(sid, tab.title || 'Terminal');
      setStatus(res);
      setInteractive(!!res.interactive);
      const primaryUrl = res.urls?.[0]?.url || '';
      await generateQr(primaryUrl);
    } catch (err) {
      toast?.(err.message || 'Fehler beim Starten der Freigabe');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (!sid || !api.share?.stop) return;
    setLoading(true);
    try {
      await api.share.stop(sid);
      setStatus(null);
      setQrCode('');
    } catch (err) {
      toast?.(err.message || 'Fehler beim Beenden der Freigabe');
    } finally {
      setLoading(false);
    }
  };

  const toggleInteractive = async (v) => {
    setInteractive(v);
    if (!sid || !status || !api.share?.setInteractive) return;
    try {
      await api.share.setInteractive(sid, v);
      setStatus((prev) => (prev ? { ...prev, interactive: v } : null));
    } catch {
      /* ignore */
    }
  };

  const primaryUrl = status?.urls?.[0]?.url || '';

  const copyUrl = async (url) => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast?.(t('Link kopiert.'));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Share2 className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {t('Sitzung live teilen')}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {tab?.title}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          <p className="text-muted-foreground">
            {t('Ermöglicht Kollegen das Zuschauen oder gemeinsame Tippen im Terminal über einen lokalen Link oder QR-Code.')}
          </p>

          {/* Status Badge */}
          <div className="flex items-center justify-between rounded-xl border bg-card p-3">
            <div className="flex items-center gap-2 font-medium">
              <span
                className={cn(
                  'size-2.5 rounded-full shrink-0',
                  status
                    ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]'
                    : 'bg-muted-foreground/40'
                )}
              />
              <span>{status ? t('Freigabe aktiv') : t('Freigabe inaktiv')}</span>
            </div>
            {status && (
              <Badge variant="secondary" className="gap-1 text-[11px] font-mono">
                <Users className="size-3" />
                {status.viewers > 0
                  ? t('{n} Zuschauer verbunden', { n: status.viewers })
                  : t('Keine Zuschauer')}
              </Badge>
            )}
          </div>

          {/* Toggle Interactive */}
          <div className="flex items-center justify-between gap-4 rounded-xl border bg-card p-3">
            <div>
              <p className="font-medium text-sm flex items-center gap-1.5">
                {interactive ? <Keyboard className="size-4 text-primary" /> : <Eye className="size-4 text-muted-foreground" />}
                {t('Gemeinsam tippen (Paired Programming)')}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('Zuschauer dürfen Befehle eingeben und interaktiv zusammenarbeiten')}
              </p>
            </div>
            <Switch checked={interactive} onCheckedChange={toggleInteractive} disabled={!status} />
          </div>

          {/* Wenn aktiv: Links und QR-Code */}
          {status && (
            <div className="space-y-3 rounded-xl border bg-card/60 p-4">
              <div className="space-y-1.5">
                <p className="font-medium text-xs text-foreground">{t('Freigabe-Link:')}</p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={primaryUrl}
                    className="h-8 flex-1 rounded-lg border bg-background px-2.5 font-mono text-[11px] select-all outline-none"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs shrink-0"
                    onClick={() => copyUrl(primaryUrl)}
                  >
                    {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                    <span>{copied ? t('Kopiert') : t('Link kopieren')}</span>
                  </Button>
                </div>
              </div>

              {/* QR-Code */}
              {qrCode && (
                <div className="flex flex-col items-center justify-center pt-2">
                  <p className="text-[11px] text-muted-foreground mb-2">
                    {t('QR-Code zum Beitreten scannen:')}
                  </p>
                  <div className="p-2 rounded-xl bg-white shadow-sm border">
                    <img src={qrCode} alt="QR Code" className="size-36" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {status ? (
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={handleStop}
                disabled={loading}
              >
                {t('Freigabe beenden')}
              </Button>
            ) : (
              <Button
                size="sm"
                className="gap-1.5 text-xs"
                onClick={handleStart}
                disabled={loading}
              >
                <Radio className="size-3.5" />
                {t('Freigabe starten')}
              </Button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('Schließen')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
