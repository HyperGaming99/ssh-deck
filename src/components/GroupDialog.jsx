import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import GroupIcon, { GROUP_COLORS, PRESET_GROUP_ICONS, LUCIDE_GROUP_ICONS } from '@/components/GroupIcon';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { Check, Folder, ImagePlus, Pipette, Trash2, UploadCloud, X } from 'lucide-react';

// Liest und optimiert Bilddateien (SVG direkt als Data-URL, Rasterbilder auf max 128x128 skaliert)
function processImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Keine Datei'));
    const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Fehler beim Lesen der Datei'));
    reader.onload = () => {
      const dataUrl = reader.result;
      if (isSvg) {
        return resolve(dataUrl);
      }
      const img = new Image();
      img.onerror = () => reject(new Error('Ungültige Bilddatei.'));
      img.onload = () => {
        const max = 128;
        let w = img.width, h = img.height;
        if (w > max || h > max) {
          if (w > h) { h = Math.round((h * max) / w); w = max; }
          else { w = Math.round((w * max) / h); h = max; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export default function GroupDialog({ group, open, onClose, onSave, serverCount = 0 }) {
  const t = useT();
  const fileInputRef = useRef(null);
  const colorInputRef = useRef(null);

  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [icon, setIcon] = useState('');
  const [customLogo, setCustomLogo] = useState('');
  const [logoTab, setLogoTab] = useState('preset'); // 'preset' | 'custom'
  const [dragOver, setDragOver] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(group?.name || '');
      setColor(group?.color || '');
      setIcon(group?.icon || '');
      setCustomLogo(group?.customLogo || '');
      setLogoTab(group?.customLogo ? 'custom' : 'preset');
      setErr('');
      setBusy(false);
    }
  }, [open, group]);

  if (!open) return null;

  const handleFileUpload = async (file) => {
    if (!file) return;
    try {
      setBusy(true);
      setErr('');
      const dataUrl = await processImage(file);
      setCustomLogo(dataUrl);
      setLogoTab('custom');
    } catch (e) {
      setErr(t('Ungültige Bilddatei.'));
    } finally {
      setBusy(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setErr(t('Name fehlt'));
      return;
    }
    setBusy(true);
    setErr('');
    const payload = {
      ...(group || {}),
      name: cleanName,
      color: color || undefined,
      icon: logoTab === 'preset' ? (icon || undefined) : undefined,
      customLogo: logoTab === 'custom' ? (customLogo || undefined) : undefined,
    };
    const res = await onSave(payload);
    if (res) {
      setErr(res);
      setBusy(false);
    } else {
      onClose();
    }
  };

  const previewGroup = {
    name: name.trim() || t('Gruppen-Name'),
    color,
    icon: logoTab === 'preset' ? icon : undefined,
    customLogo: logoTab === 'custom' ? customLogo : undefined,
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{group ? t('Gruppe bearbeiten') : t('Neue Gruppe')}</DialogTitle>
            <DialogDescription className="text-xs">
              {t('Passe Name, Farbe und Logo der Gruppe an.')}
            </DialogDescription>
          </DialogHeader>

          {/* Live Vorschau */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{t('Vorschau')}</Label>
            <div className="rounded-xl border bg-card p-3 shadow-2xs">
              <div className="flex items-center gap-3">
                <div
                  className="grid size-12 shrink-0 place-items-center rounded-xl border transition-colors overflow-hidden"
                  style={{
                    backgroundColor: color ? `${color}20` : 'var(--secondary)',
                    borderColor: color ? `${color}44` : 'transparent',
                  }}
                >
                  <GroupIcon group={previewGroup} className="size-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">{previewGroup.name}</span>
                    {color && (
                      <span
                        className="size-2 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{t('{n} Server', { n: serverCount })}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Name Eingabe */}
          <div className="space-y-1.5">
            <Label htmlFor="group-name" className="text-xs font-medium">{t('Gruppen-Name')}</Label>
            <Input
              id="group-name"
              placeholder={t('z. B. Webserver, Cloud, Datenbanken …')}
              value={name}
              onChange={(e) => { setName(e.target.value); setErr(''); }}
              autoComplete="off"
              autoFocus
              required
            />
          </div>

          {/* Farb-Auswahl */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">{t('Farbe')}</Label>
              {color && (
                <button
                  type="button"
                  onClick={() => setColor('')}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  {t('Keine Farbe')}
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.name}
                  onClick={() => setColor(color === c.value ? '' : c.value)}
                  className={cn(
                    'relative size-7 rounded-full transition-transform hover:scale-110 focus:outline-none ring-offset-background',
                    color === c.value && 'ring-2 ring-primary ring-offset-2 scale-105'
                  )}
                  style={{ backgroundColor: c.value }}
                >
                  {color === c.value && <Check className="mx-auto size-3.5 text-white drop-shadow-xs" />}
                </button>
              ))}

              {/* Eigene Farbe per Color Picker */}
              <button
                type="button"
                title={t('Eigene Farbe')}
                onClick={() => colorInputRef.current?.click()}
                className={cn(
                  'relative flex size-7 items-center justify-center rounded-full border border-dashed text-muted-foreground hover:text-foreground hover:border-primary transition-colors',
                  color && !GROUP_COLORS.some((c) => c.value === color) && 'ring-2 ring-primary ring-offset-2'
                )}
                style={color && !GROUP_COLORS.some((c) => c.value === color) ? { backgroundColor: color, color: '#fff' } : undefined}
              >
                <Pipette className="size-3.5" />
              </button>
              <input
                ref={colorInputRef}
                type="color"
                value={color || '#3b82f6'}
                onChange={(e) => setColor(e.target.value)}
                className="sr-only"
              />

              {color && (
                <span className="font-mono text-xs text-muted-foreground ml-1 uppercase">{color}</span>
              )}
            </div>
          </div>

          {/* Logo & Symbol Auswahl */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">{t('Logo & Symbol')}</Label>
            </div>

            {/* Tabs: Vordefiniert vs Eigenes Logo */}
            <div className="grid grid-cols-2 rounded-lg bg-muted p-1 text-xs">
              <button
                type="button"
                onClick={() => setLogoTab('preset')}
                className={cn(
                  'rounded-md py-1.5 font-medium transition-all text-center',
                  logoTab === 'preset' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t('Vordefinierte Symbole')}
              </button>
              <button
                type="button"
                onClick={() => setLogoTab('custom')}
                className={cn(
                  'rounded-md py-1.5 font-medium transition-all text-center',
                  logoTab === 'custom' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t('Eigenes Logo')}
              </button>
            </div>

            {/* Tab 1: Vordefinierte Symbole */}
            {logoTab === 'preset' && (
              <div className="space-y-2">
                <div className="grid grid-cols-6 sm:grid-cols-7 gap-1.5 max-h-36 overflow-y-auto p-1 rounded-xl border bg-card">
                  {PRESET_GROUP_ICONS.map((p) => {
                    const isSelected = icon === p.id || (!icon && p.id === 'folder');
                    return (
                      <button
                        key={p.id}
                        type="button"
                        title={p.name}
                        onClick={() => setIcon(p.id === 'folder' ? '' : p.id)}
                        className={cn(
                          'flex flex-col items-center justify-center p-2 rounded-lg transition-colors hover:bg-accent',
                          isSelected && 'bg-primary/15 ring-1.5 ring-primary'
                        )}
                      >
                        <GroupIcon group={{ icon: p.id, color }} className="size-5 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tab 2: Eigenes Logo hochladen */}
            {logoTab === 'custom' && (
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {customLogo ? (
                  <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
                    <div className="grid size-14 shrink-0 place-items-center rounded-lg border bg-secondary/50 p-1 overflow-hidden">
                      <img src={customLogo} alt="" className="size-full object-contain" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-xs font-medium text-foreground">{t('Eigenes Logo aktiv')}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{t('Wird für diese Gruppe angezeigt')}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {t('Ändern')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setCustomLogo('')}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-colors',
                      dragOver ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/60 hover:bg-accent/40'
                    )}
                  >
                    <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                      <UploadCloud className="size-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">{t('Logo hochladen')}</p>
                      <p className="text-[11px] text-muted-foreground">{t('Unterstützt SVG, PNG, JPG und WebP.')}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {err && <p className="text-xs text-destructive">{err}</p>}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              {t('Abbrechen')}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {group ? t('Gruppe speichern') : t('Gruppe erstellen')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
