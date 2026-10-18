import { useEffect, useRef, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/i18n';

const TTL = 120;

// Angemeldetes Gerät: nach Passwortabfrage einen QR-Code zeigen, der 2 Minuten gilt
export function PairShow() {
  const t = useT();
  const [s, setS] = useState(null); // { pw } | { img, left, kc }
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!s?.img) return;
    const i = setInterval(() => setS((o) => (o.left <= 1 ? null : { ...o, left: o.left - 1 })), 1000);
    return () => clearInterval(i);
  }, [!!s?.img]);
  if (!s) return <Button variant="outline" onClick={() => { setErr(''); setS({ pw: '' }); }}>{t('Gerät per QR-Code koppeln')}</Button>;
  const go = async () => {
    const r = await api.sync.pairCreate(s.pw);
    if (r.error) return setErr(r.error);
    const { toDataURL } = await import('qrcode');
    setS({ img: await toDataURL(r.code, { width: 280, margin: 2, errorCorrectionLevel: 'L' }), left: TTL, kc: r.keychain });
  };
  if (s.img) return (
    <div className="space-y-2">
      <img src={s.img} alt="" className="size-64 rounded-lg bg-white" />
      <p className={`text-xs ${s.kc ? 'text-success' : 'text-muted-foreground'}`}>{s.kc ? t('Der Cloud-Schlüsselbund mit Geheimschlüssel ist im Code enthalten.') : t('Ohne Cloud-Schlüsselbund. Schalte ihn unter Schlüsselbund ein oder entsperre ihn hier, damit er mitkommt.')}</p>
      <p className="text-xs text-muted-foreground">{t('Scanne den Code mit SSH Deck auf dem anderen Gerät. Er enthält deine Zugangsdaten – zeige ihn niemandem. Gültig noch {n} s.', { n: s.left })}</p>
      <Button variant="ghost" onClick={() => setS(null)}>{t('Schließen')}</Button>
    </div>
  );
  return (
    <div className="space-y-2">
      <Input type="password" autoFocus autoComplete="current-password" placeholder={t('Passwort zur Bestätigung')} value={s.pw} onChange={(e) => { setS({ pw: e.target.value }); setErr(''); }} onKeyDown={(e) => e.key === 'Enter' && s.pw && go()} />
      {err && <p className="text-sm text-destructive">{t(err)}</p>}
      <div className="flex gap-2"><Button disabled={!s.pw} onClick={go}>{t('QR-Code anzeigen')}</Button><Button variant="ghost" onClick={() => setS(null)}>{t('Abbrechen')}</Button></div>
    </div>
  );
}

// Abgemeldetes Gerät: Kamera scannt den Code; zusätzlich Einfügen als Ausweg
export function PairScan({ onDone, toast }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [paste, setPaste] = useState('');
  const video = useRef(null);
  const join = async (code) => { const r = await api.sync.pairJoin(code); if (r.error) setErr(r.error); else { toast?.(r.keychain ? 'Angemeldet, Cloud-Schlüsselbund eingerichtet.' : 'Angemeldet.'); onDone?.(); } return !r.error; };
  useEffect(() => {
    if (!open) return;
    let stop = false, stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.current.srcObject = stream; await video.current.play();
        const jsQR = (await import('jsqr')).default, cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
        const tick = async () => {
          if (stop) return;
          const v = video.current;
          if (v.videoWidth) {
            cv.width = v.videoWidth; cv.height = v.videoHeight; cx.drawImage(v, 0, 0);
            const q = jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height);
            if (q?.data.startsWith('sshdeck://pair/')) { stop = true; if (!(await join(q.data))) setOpen(false); return; }
          }
          setTimeout(tick, 200);
        };
        tick();
      } catch { setErr('Kamera nicht verfügbar. Erlaube den Zugriff oder füge den Code ein.'); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((x) => x.stop()); };
  }, [open]);
  return (
    <div className="mt-3 space-y-2">
      {!open ? <Button variant="outline" onClick={() => { setErr(''); setOpen(true); }}>{t('Per QR-Code anmelden')}</Button> : (
        <>
          <video ref={video} playsInline muted className="aspect-square w-64 rounded-lg bg-black object-cover" />
          <Button variant="ghost" onClick={() => setOpen(false)}>{t('Abbrechen')}</Button>
        </>
      )}
      <div className="flex gap-2"><Input placeholder="sshdeck://pair/…" value={paste} onChange={(e) => setPaste(e.target.value)} /><Button variant="secondary" disabled={!paste} onClick={() => join(paste)}>{t('Einfügen')}</Button></div>
      {err && <p className="text-sm text-destructive">{t(err)}</p>}
    </div>
  );
}

// Sofort erreichbar aus Kopfzeile und Login-Bildschirm: angemeldet = Code zeigen, sonst scannen
export function PairSheet({ open, onClose, signedIn, toast }) {
  const t = useT();
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-3 overflow-y-auto p-6 sm:max-w-sm">
        <SheetTitle>{signedIn ? t('Gerät per QR-Code koppeln') : t('Per QR-Code anmelden')}</SheetTitle>
        <SheetDescription className="text-xs">{signedIn ? t('Zeige den Code auf diesem Gerät und scanne ihn auf dem neuen.') : t('Scanne den Code, den ein angemeldetes Gerät zeigt.')}</SheetDescription>
        {signedIn ? <PairShow /> : <PairScan onDone={onClose} toast={toast} />}
      </SheetContent>
    </Sheet>
  );
}
