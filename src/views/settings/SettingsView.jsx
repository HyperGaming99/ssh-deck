import { useEffect, useState } from 'react';
import {
  AppWindowMac,
  Check,
  Columns,
  Download,
  FileText,
  FolderOpen,
  KeyRound,
  Languages,
  Layout,
  Lock,
  Minus,
  Moon,
  Palette,
  Plus,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Terminal as TermIcon,
  Type,
  User,
  Users,
  ZapOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import KeychainCloud from '@/components/KeychainCloud';
import TeamsSettings from '@/components/TeamsSettings';
import { LANGS, T, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { getPaste, getSuggest, setPaste, setSuggest } from '@/lib/termState';
import { AUTO, FONTS, THEMES } from '@/lib/termThemes';
import SyncView from './SyncView';
import TorSettings from './TorSettings';
import UpdatesSettings from './UpdatesSettings';
import LanguageSettings from './LanguageSettings';

const mobile = !!window.api?.mobile;

// Animationen (Glow, Übergänge) an/aus: Merkmal am <html>, das CSS blendet alles aus; liegt in localStorage
export const getAnim = () => { try { return localStorage.getItem('anim') || 'on'; } catch { return 'on'; } };
export const applyAnim = (v) => { document.documentElement.dataset.anim = v; try { localStorage.setItem('anim', v); } catch { /* egal */ } };
applyAnim(getAnim());

async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ssh-deck-lock:${pin}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const SETTINGS_TABS = [ // Updates/Editor gibt es nur am Desktop
  ['account', T('Konto & Sync'), User],
  ['appearance', T('Darstellung'), Palette],
  ['features', T('Funktionen'), SlidersHorizontal],
  ['language', T('Sprache'), Languages],
  ['privacy', T('Datenschutz'), ShieldCheck],
  ['keychain', T('Cloud-Schlüsselbund'), KeyRound],
  ['teams', T('Teams'), Users],
  ['updates', T('Updates'), Download, true],
  ['files', T('Dateien öffnen'), FileText, true],
].filter((x) => !(mobile && x[3]));

// Einstellungen mit eigener Seitenleiste (links Kategorien, rechts Inhalt)
export function SettingsView({ st, dark, setDark, side, setSide, onLogin, onLogout, lang, setLang, settingsTab, teams, refreshTeams, vault, setVault, toast, termTheme, setTheme, font, setFont }) {
  const t = useT();
  const [tab, setTab] = useState(settingsTab || 'account');
  useEffect(() => { if (settingsTab) setTab(settingsTab); }, [settingsTab]);
  const currentTheme = termTheme || 'auto';
  const pickTheme = setTheme || ((v) => { try { localStorage.setItem('termTheme', v); window.dispatchEvent(new Event('theme-cfg')); } catch {} });
  const currentFont = font || { family: FONTS[0][0], size: mobile ? 12 : 14 };
  const pickFont = setFont || ((v) => { try { localStorage.setItem('termFont', JSON.stringify(v)); window.dispatchEvent(new Event('font-cfg')); } catch {} });
  const [editors, setEditors] = useState([]);
  const [editor, setEditor] = useState('auto');
  const [customEditor, setCustomEditor] = useState('');
  useEffect(() => {
    api.editors.list().then(setEditors);
    api.settings.get().then((s) => { setEditor(s.editor || 'auto'); setCustomEditor(s.customEditor || ''); });
  }, []);
  const [sg, setSg] = useState(getSuggest);
  const pickSg = (v) => { setSg(v); setSuggest(v); };
  const [paste, setPasteState] = useState(getPaste);
  const pickPaste = (v) => { setPasteState(v); setPaste(v); };
  const [anim, setAnim] = useState(getAnim);
  const pickAnim = (v) => { setAnim(v); applyAnim(v); };
  const [autoRe, setAutoRe] = useState(() => { try { return localStorage.getItem('autoReconnect') !== '0'; } catch { return true; } });
  const [featTab, setFeatTab] = useState('server');
  const [srvStats, setSrvStats] = useState(() => { try { return localStorage.getItem('serverStats') !== '0'; } catch { return true; } });
  const [dockerSetting, setDockerSetting] = useState(() => { try { return localStorage.getItem('dockerFeature') === '1'; } catch { return false; } });
  const [k8sSetting, setK8sSetting] = useState(() => { try { return localStorage.getItem('k8sFeature') === '1'; } catch { return false; } });
  const [hostHealth, setHostHealth] = useState(() => { try { return localStorage.getItem('hostHealth') !== '0'; } catch { return true; } });
  const [dotfiles, setDotfiles] = useState(() => { try { return localStorage.getItem('sftpDotfiles') !== '0'; } catch { return true; } });
  const [sftpPerms, setSftpPerms] = useState(() => { try { return localStorage.getItem('sftpPermissions') !== '0'; } catch { return true; } });
  const [autoLockMin, setAutoLockMin] = useState(() => { try { return localStorage.getItem('autoLockMin') || '0'; } catch { return '0'; } });
  const [sessionTimeout, setSessionTimeout] = useState(() => { try { return localStorage.getItem('sessionTimeoutMin') || '0'; } catch { return '0'; } });
  const [clipboardClear, setClipboardClear] = useState(() => { try { return localStorage.getItem('clipboardClear') === '1'; } catch { return false; } });
  const [hasLockPin, setHasLockPin] = useState(() => { try { return !!localStorage.getItem('lockPinHash'); } catch { return false; } });
  const [newPin, setNewPin] = useState('');
  const pickEditor = (v) => { setEditor(v); api.settings.set({ editor: v }); };
  const row = 'mrow flex items-center justify-between gap-4 rounded-xl border bg-card p-4';
  const seg = (opts, value, onChange) => (
    <div className={cn('grid rounded-lg bg-muted p-1 text-sm', opts.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      {opts.map(([v, l, Icon]) => (
        <button key={l} onClick={() => onChange(v)} className={cn('flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5', value === v ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}>
          {Icon && <Icon className="size-3.5" />}{l}
        </button>
      ))}
    </div>
  );
  return (
    <div className="mset flex gap-8">
      <aside className="w-48 shrink-0 space-y-1">
        {SETTINGS_TABS.map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn('relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent', tab === id && 'bg-accent text-foreground')}>
            {tab === id && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />}
            <Icon className="size-4" />{t(label)}
          </button>
        ))}
      </aside>
      <div className="min-w-0 max-w-2xl flex-1 space-y-3">
        {tab === 'account' && <SyncView st={st} onLogin={onLogin} onLogout={onLogout} toast={toast} />}
        {tab === 'appearance' && (
          <div className="space-y-6">
            {/* 1. Design-Modus: Hell / Dunkel mit echten Fenster-Vorschauen */}
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">{t('Design')}</h3>
                <p className="text-xs text-muted-foreground">{t('Hell oder dunkel')}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Hell */}
                <button
                  type="button"
                  onClick={() => setDark(false)}
                  className={cn(
                    'group relative flex flex-col overflow-hidden rounded-2xl border p-3.5 text-start transition-all',
                    !dark
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-md'
                      : 'border-border/60 bg-card hover:border-border hover:bg-accent/40'
                  )}
                >
                  <div className="relative mb-3 h-28 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white p-2 text-zinc-900 shadow-sm transition-transform group-hover:scale-[1.01]">
                    <div className="mb-2 flex items-center gap-1.5 border-b border-zinc-100 pb-1.5">
                      <div className="size-2 rounded-full bg-red-400" />
                      <div className="size-2 rounded-full bg-amber-400" />
                      <div className="size-2 rounded-full bg-emerald-400" />
                      <div className="mx-auto text-[9px] font-semibold text-zinc-400 tracking-wider">SSH DECK</div>
                    </div>
                    <div className="flex h-[calc(100%-24px)] gap-2">
                      <div className="flex w-12 flex-col gap-1.5 rounded-lg bg-zinc-100 p-1.5">
                        <div className="h-2 w-full rounded bg-blue-600" />
                        <div className="h-2 w-full rounded bg-zinc-200" />
                        <div className="h-2 w-full rounded bg-zinc-200" />
                      </div>
                      <div className="flex flex-1 flex-col gap-1.5">
                        <div className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-2 py-1">
                          <div className="flex items-center gap-1.5">
                            <div className="size-2 rounded-full bg-emerald-500" />
                            <div className="h-2 w-12 rounded bg-zinc-300" />
                          </div>
                          <div className="h-2 w-6 rounded bg-zinc-200" />
                        </div>
                        <div className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-2 py-1">
                          <div className="flex items-center gap-1.5">
                            <div className="size-2 rounded-full bg-emerald-500" />
                            <div className="h-2 w-10 rounded bg-zinc-300" />
                          </div>
                          <div className="h-2 w-6 rounded bg-zinc-200" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="grid size-7 place-items-center rounded-lg bg-amber-500/15 text-amber-500">
                        <Sun className="size-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{t('Hell')}</p>
                      </div>
                    </div>
                    {!dark && (
                      <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
                        <Check className="size-3" />
                      </span>
                    )}
                  </div>
                </button>

                {/* Dunkel */}
                <button
                  type="button"
                  onClick={() => setDark(true)}
                  className={cn(
                    'group relative flex flex-col overflow-hidden rounded-2xl border p-3.5 text-start transition-all',
                    dark
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-md'
                      : 'border-border/60 bg-card hover:border-border hover:bg-accent/40'
                  )}
                >
                  <div className="relative mb-3 h-28 w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 p-2 text-zinc-100 shadow-sm transition-transform group-hover:scale-[1.01]">
                    <div className="mb-2 flex items-center gap-1.5 border-b border-zinc-800 pb-1.5">
                      <div className="size-2 rounded-full bg-red-500/80" />
                      <div className="size-2 rounded-full bg-amber-500/80" />
                      <div className="size-2 rounded-full bg-emerald-500/80" />
                      <div className="mx-auto text-[9px] font-semibold text-zinc-500 tracking-wider">SSH DECK</div>
                    </div>
                    <div className="flex h-[calc(100%-24px)] gap-2">
                      <div className="flex w-12 flex-col gap-1.5 rounded-lg bg-zinc-900 p-1.5">
                        <div className="h-2 w-full rounded bg-blue-500" />
                        <div className="h-2 w-full rounded bg-zinc-800" />
                        <div className="h-2 w-full rounded bg-zinc-800" />
                      </div>
                      <div className="flex flex-1 flex-col gap-1.5">
                        <div className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-2 py-1">
                          <div className="flex items-center gap-1.5">
                            <div className="size-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                            <div className="h-2 w-12 rounded bg-zinc-700" />
                          </div>
                          <div className="h-2 w-6 rounded bg-zinc-800" />
                        </div>
                        <div className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-2 py-1">
                          <div className="flex items-center gap-1.5">
                            <div className="size-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                            <div className="h-2 w-10 rounded bg-zinc-700" />
                          </div>
                          <div className="h-2 w-6 rounded bg-zinc-800" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="grid size-7 place-items-center rounded-lg bg-blue-500/15 text-blue-400">
                        <Moon className="size-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{t('Dunkel')}</p>
                      </div>
                    </div>
                    {dark && (
                      <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
                        <Check className="size-3" />
                      </span>
                    )}
                  </div>
                </button>
              </div>
            </div>

            {/* 2. Seitenleisten-Stil mit Vorschau-Mockups */}
            <div className={cn('space-y-3', 'mhide')}>
              <div>
                <h3 className="text-sm font-semibold">{t('Seitenleiste')}</h3>
                <p className="text-xs text-muted-foreground">{t('Stil der linken Navigation')}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  {
                    id: 'compact',
                    title: t('Kompakt'),
                    preview: (
                      <div className="flex h-16 w-full gap-1.5 rounded-lg border bg-background/50 p-1.5">
                        <div className="flex w-6 flex-col items-center gap-1.5 rounded bg-muted/60 py-1">
                          <div className="size-2 rounded bg-primary" />
                          <div className="size-2 rounded bg-muted-foreground/30" />
                          <div className="size-2 rounded bg-muted-foreground/30" />
                        </div>
                        <div className="flex flex-1 flex-col gap-1 rounded bg-muted/20 p-1">
                          <div className="h-1.5 w-1/2 rounded bg-muted-foreground/30" />
                          <div className="h-5 rounded border border-border/40 bg-card/60" />
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: 'wide',
                    title: t('Breit'),
                    preview: (
                      <div className="flex h-16 w-full gap-1.5 rounded-lg border bg-background/50 p-1.5">
                        <div className="flex w-14 flex-col gap-1.5 rounded bg-muted/60 p-1">
                          <div className="flex items-center gap-1"><div className="size-1.5 rounded bg-primary" /><div className="h-1 w-7 rounded bg-primary/70" /></div>
                          <div className="flex items-center gap-1"><div className="size-1.5 rounded bg-muted-foreground/30" /><div className="h-1 w-6 rounded bg-muted-foreground/20" /></div>
                          <div className="flex items-center gap-1"><div className="size-1.5 rounded bg-muted-foreground/30" /><div className="h-1 w-8 rounded bg-muted-foreground/20" /></div>
                        </div>
                        <div className="flex flex-1 flex-col gap-1 rounded bg-muted/20 p-1">
                          <div className="h-1.5 w-1/2 rounded bg-muted-foreground/30" />
                          <div className="h-5 rounded border border-border/40 bg-card/60" />
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: 'float',
                    title: t('Schwebend'),
                    preview: (
                      <div className="relative flex h-16 w-full gap-1.5 rounded-lg border bg-background/50 p-1.5">
                        <div className="my-0.5 flex w-10 flex-col items-center gap-1 rounded-lg border border-border/80 bg-card shadow-sm py-1">
                          <div className="size-2 rounded bg-primary" />
                          <div className="size-2 rounded bg-muted-foreground/30" />
                          <div className="size-2 rounded bg-muted-foreground/30" />
                        </div>
                        <div className="flex flex-1 flex-col gap-1 rounded bg-muted/20 p-1">
                          <div className="h-1.5 w-1/2 rounded bg-muted-foreground/30" />
                          <div className="h-5 rounded border border-border/40 bg-card/60" />
                        </div>
                      </div>
                    ),
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSide(item.id)}
                    className={cn(
                      'group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-3 text-start transition-all',
                      side === item.id
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm'
                        : 'border-border/60 bg-card hover:border-border hover:bg-accent/40'
                    )}
                  >
                    <div className="mb-2.5 transition-transform group-hover:scale-[1.01]">{item.preview}</div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">{item.title}</p>
                      </div>
                      {side === item.id && (
                        <span className="grid size-4 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
                          <Check className="size-2.5" />
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Animationen & Glow-Effekte */}
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">{t('Animationen')}</h3>
                <p className="text-xs text-muted-foreground">{t('Glow bei Hosts und Gruppen sowie Übergänge')}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => pickAnim('on')}
                  className={cn(
                    'group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-3.5 text-start transition-all',
                    anim === 'on'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm'
                      : 'border-border/60 bg-card hover:border-border hover:bg-accent/40'
                  )}
                >
                  <div className="mb-3 flex h-16 w-full items-center justify-center rounded-xl border border-primary/40 bg-card/80 p-3 shadow-[0_0_15px_rgba(59,130,246,0.25)] transition-all">
                    <div className="flex items-center gap-2.5">
                      <div className="size-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
                      <div className="space-y-1">
                        <div className="h-2 w-24 rounded bg-primary/80 animate-pulse" />
                        <div className="h-1.5 w-16 rounded bg-muted-foreground/40" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="grid size-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-500">
                        <Sparkles className="size-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{t('An')}</p>
                      </div>
                    </div>
                    {anim === 'on' && (
                      <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
                        <Check className="size-3" />
                      </span>
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => pickAnim('off')}
                  className={cn(
                    'group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-3.5 text-start transition-all',
                    anim === 'off'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm'
                      : 'border-border/60 bg-card hover:border-border hover:bg-accent/40'
                  )}
                >
                  <div className="mb-3 flex h-16 w-full items-center justify-center rounded-xl border border-border bg-card/40 p-3">
                    <div className="flex items-center gap-2.5">
                      <div className="size-3 rounded-full bg-emerald-500" />
                      <div className="space-y-1">
                        <div className="h-2 w-24 rounded bg-zinc-400" />
                        <div className="h-1.5 w-16 rounded bg-muted-foreground/30" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="grid size-7 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <ZapOff className="size-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{t('Aus')}</p>
                      </div>
                    </div>
                    {anim === 'off' && (
                      <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
                        <Check className="size-3" />
                      </span>
                    )}
                  </div>
                </button>
              </div>
            </div>

            {/* 4. Terminal-Farbschemata mit echten Terminal-Preview-Fenstern */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Palette className="size-4 text-primary" />
                    {t('Terminal-Themes')}
                  </h3>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[{ id: 'auto', name: t('Automatisch (App-Design)'), theme: dark ? AUTO.dark : AUTO.light }, ...THEMES].map((x) => {
                  const isSelected = currentTheme === x.id;
                  const th = x.theme;
                  return (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => pickTheme(x.id)}
                      className={cn(
                        'group relative flex flex-col overflow-hidden rounded-2xl border text-start transition-all',
                        isSelected
                          ? 'border-primary ring-2 ring-primary/25 shadow-md scale-[1.01]'
                          : 'border-border/60 hover:border-border hover:bg-card/60'
                      )}
                    >
                      {/* Theme Header */}
                      <div className="flex items-center justify-between border-b bg-card/80 px-3 py-2 text-xs font-semibold backdrop-blur">
                        <span className="truncate">{x.name}</span>
                        {isSelected && (
                          <span className="grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-2.5" />
                          </span>
                        )}
                      </div>

                      {/* Mini Terminal Preview */}
                      <div className="p-3 font-mono text-[11px] leading-tight flex-1 flex flex-col justify-between" style={{ background: th.background, color: th.foreground }}>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 opacity-90 text-[10px]">
                            <span style={{ color: th.green ?? '#22c55e' }}>deck@server</span>
                            <span>:</span>
                            <span style={{ color: th.blue ?? '#3b82f6' }}>~</span>
                            <span>$ uptime</span>
                          </div>
                          <div className="text-[10px] opacity-80 pl-1 flex items-center gap-1.5">
                            <span className="size-1.5 rounded-full" style={{ background: th.green ?? '#22c55e' }} />
                            <span>up 34d, 0.08 load</span>
                          </div>
                        </div>

                        {/* Palette Color Dots */}
                        <div className="mt-3 flex items-center gap-1 pt-1.5 border-t border-white/10">
                          {[th.black, th.red, th.green, th.yellow, th.blue, th.magenta, th.cyan, th.white].filter(Boolean).map((col, idx) => (
                            <span key={idx} className="size-2 rounded-full shadow-sm" style={{ background: col }} />
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 5. Terminal-Typografie & Schriftart-Vorschau */}
            <div className="space-y-3 pt-2 border-t">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Type className="size-4 text-primary" />
                  {t('Schriftart')}
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className={cn(row, 'flex-col items-stretch')}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{t('Schriftart')}</p>
                    </div>
                  </div>
                  <Select value={currentFont.family} onValueChange={(v) => pickFont({ ...currentFont, family: v })}>
                    <SelectTrigger className="h-9 w-full mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FONTS.map(([v, n]) => (
                        <SelectItem key={v} value={v}>
                          <span style={{ fontFamily: v }}>{n}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className={cn(row, 'flex-col items-stretch')}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{t('Schriftgröße')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="grid size-8 place-items-center rounded-lg border hover:bg-accent transition-colors"
                        onClick={() => pickFont({ ...currentFont, size: Math.max(9, currentFont.size - 1) })}
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-8 text-center font-mono text-sm font-semibold tabular-nums">{currentFont.size}px</span>
                      <button
                        type="button"
                        className="grid size-8 place-items-center rounded-lg border hover:bg-accent transition-colors"
                        onClick={() => pickFont({ ...currentFont, size: Math.min(28, currentFont.size + 1) })}
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Typography Code Box */}
              <div
                className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-zinc-100 shadow-inner"
                style={{ fontFamily: currentFont.family, fontSize: `${currentFont.size}px`, lineHeight: 1.5 }}
              >
                <div className="mb-2 flex items-center justify-between border-b border-zinc-800/80 pb-2 text-[11px] font-sans text-zinc-400 select-none">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-emerald-500 inline-block" />
                    Live Terminal Vorschau
                  </span>
                  <span>{currentFont.family.replace(/"/g, '').split(',')[0]} · {currentFont.size}px</span>
                </div>
                <div className="overflow-x-auto [scrollbar-width:none]">
                  <div><span className="text-purple-400">const</span> sshDeck = <span className="text-blue-400">await</span> connect({'{'} host: <span className="text-emerald-400">"10.0.0.51"</span>, port: <span className="text-amber-400">22</span> {'}'});</div>
                  <div><span className="text-purple-400">if</span> (sshDeck.connected) console.<span className="text-amber-300">log</span>(<span className="text-emerald-400">"=&gt; Online [Latency: 4.2ms] != null"</span>);</div>
                </div>
              </div>
            </div>
          </div>
        )}
        {tab === 'features' && (
          <>
            <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1">
              {[['server', t('Server'), Server], ['terminal', t('Terminal'), TermIcon], ['sftp', 'SFTP', FolderOpen], ['security', t('Sicherheit'), Lock]].map(([id, label, Icon]) => (
                <button key={id} type="button" onClick={() => setFeatTab(id)}
                  className={cn('flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors', featTab === id ? 'bg-primary/15 font-medium text-primary' : 'text-muted-foreground hover:bg-accent')}>
                  <Icon className="size-4" />{label}
                </button>
              ))}
            </div>
            {featTab === 'server' && (
              <>
                <div className={row}>
                  <div><p className="text-sm font-medium">{t('Server-Status')}</p><p className="text-xs text-muted-foreground">{t('CPU, Arbeitsspeicher, Festplatte und Laufzeit im Terminal anzeigen')}</p></div>
                  <Switch checked={srvStats} onCheckedChange={(v) => { setSrvStats(v); try { localStorage.setItem('serverStats', v ? '1' : '0'); } catch { /* egal */ } }} />
                </div>
                <div className={row}>
                  <div><p className="text-sm font-medium">{t('Docker-Manager')}</p><p className="text-xs text-muted-foreground">{t('Eigenen Docker-Reiter in der Hauptnavigation anzeigen')}</p></div>
                  <Switch checked={dockerSetting} onCheckedChange={(v) => { setDockerSetting(v); try { localStorage.setItem('dockerFeature', v ? '1' : '0'); window.dispatchEvent(new Event('docker-cfg')); } catch { /* egal */ } }} />
                </div>
                <div className={row}>
                  <div><p className="text-sm font-medium">{t('Kubernetes-Manager')}</p><p className="text-xs text-muted-foreground">{t('Eigenen Kubernetes-Reiter in der Hauptnavigation anzeigen')}</p></div>
                  <Switch checked={k8sSetting} onCheckedChange={(v) => { setK8sSetting(v); try { localStorage.setItem('k8sFeature', v ? '1' : '0'); window.dispatchEvent(new Event('k8s-cfg')); } catch { /* egal */ } }} />
                </div>
                <div className={row}>
                  <div><p className="text-sm font-medium">{t('Host-Status & Ping')}</p><p className="text-xs text-muted-foreground">{t('Erreichbarkeit und Latenz (ms) auf Host-Karten anzeigen')}</p></div>
                  <Switch checked={hostHealth} onCheckedChange={(v) => { setHostHealth(v); try { localStorage.setItem('hostHealth', v ? '1' : '0'); window.dispatchEvent(new Event('host-health-cfg')); } catch { /* egal */ } }} />
                </div>
              </>
            )}
            {featTab === 'terminal' && (
              <>
                <div className={row}>
                  <div><p className="text-sm font-medium">{t('Befehlsvorschläge')}</p><p className="text-xs text-muted-foreground">{t('Vorschläge beim Tippen im Terminal: Befehle dieser Sitzung, Snippets und häufige Befehle. Übernehmen mit Strg+Leertaste oder Antippen.')}</p></div>
                  {seg([['on', t('An')], ['off', t('Aus')]], sg, pickSg)}
                </div>
                <div className={row}>
                  <div><p className="text-sm font-medium">{t('Einfügen im Terminal')}</p><p className="text-xs text-muted-foreground">{t('Strg+V und Rechtsklick fügen die Zwischenablage ein')}</p></div>
                  {seg([['ask', t('Nachfragen')], ['on', t('Erlauben')], ['off', t('Aus')]], paste, pickPaste)}
                </div>
                <div className={row}>
                  <div><p className="text-sm font-medium">{t('Automatisch neu verbinden')}</p><p className="text-xs text-muted-foreground">{t('Bei unerwartet getrennter Verbindung erneut versuchen')}</p></div>
                  <Switch checked={autoRe} onCheckedChange={(v) => { setAutoRe(v); try { localStorage.setItem('autoReconnect', v ? '1' : '0'); } catch { /* egal */ } }} />
                </div>
              </>
            )}
            {featTab === 'sftp' && (
              <>
                <div className={row}>
                  <div><p className="text-sm font-medium">{t('Versteckte Dateien anzeigen')}</p><p className="text-xs text-muted-foreground">{t('Dateien und Ordner mit führendem Punkt (.env, .ssh, .git) im SFTP einblenden')}</p></div>
                  <Switch checked={dotfiles} onCheckedChange={(v) => { setDotfiles(v); try { localStorage.setItem('sftpDotfiles', v ? '1' : '0'); window.dispatchEvent(new Event('sftp-dotfiles')); } catch { /* egal */ } }} />
                </div>
                <div className={row}>
                  <div><p className="text-sm font-medium">{t('Dateirechte anzeigen')}</p><p className="text-xs text-muted-foreground">{t('Rechte-Spalte (rwxr-xr-x / 755) in der SFTP-Dateiliste anzeigen')}</p></div>
                  <Switch checked={sftpPerms} onCheckedChange={(v) => { setSftpPerms(v); try { localStorage.setItem('sftpPermissions', v ? '1' : '0'); window.dispatchEvent(new Event('sftp-permissions')); } catch { /* egal */ } }} />
                </div>
              </>
            )}
            {featTab === 'security' && (
              <>
                <div className={row}>
                  <div><p className="text-sm font-medium">{t('App-Sperre nach Inaktivität')}</p><p className="text-xs text-muted-foreground">{t('Sperrt die Oberfläche automatisch bei Inaktivität, ohne laufende Sitzungen zu trennen')}</p></div>
                  <Select value={autoLockMin} onValueChange={(v) => { setAutoLockMin(v); try { localStorage.setItem('autoLockMin', v); window.dispatchEvent(new Event('lock-cfg')); } catch { /* egal */ } }}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">{t('Aus')}</SelectItem>
                      <SelectItem value="5">5 min</SelectItem>
                      <SelectItem value="15">15 min</SelectItem>
                      <SelectItem value="30">30 min</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className={row}>
                  <div><p className="text-sm font-medium">{t('Sitzungs-Inaktivitäts-Timeout')}</p><p className="text-xs text-muted-foreground">{t('Trennt inaktive SSH-Sitzungen nach bestimmter Zeit automatisch')}</p></div>
                  <Select value={sessionTimeout} onValueChange={(v) => { setSessionTimeout(v); try { localStorage.setItem('sessionTimeoutMin', v); window.dispatchEvent(new Event('session-timeout-cfg')); } catch { /* egal */ } }}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">{t('Aus')}</SelectItem>
                      <SelectItem value="5">5 min</SelectItem>
                      <SelectItem value="15">15 min</SelectItem>
                      <SelectItem value="30">30 min</SelectItem>
                      <SelectItem value="60">{t('60 min')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className={row}>
                  <div><p className="text-sm font-medium">{t('Zwischenablage automatisch leeren')}</p><p className="text-xs text-muted-foreground">{t('Leert sensible Passwörter nach 30 Sekunden aus der Zwischenablage')}</p></div>
                  <Switch checked={clipboardClear} onCheckedChange={(v) => { setClipboardClear(v); try { localStorage.setItem('clipboardClear', v ? '1' : '0'); window.dispatchEvent(new Event('clipboard-clear-cfg')); } catch { /* egal */ } }} />
                </div>
                <div className={cn(row, 'flex-col items-stretch')}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{t('Sperr-Passwort / PIN')}</p>
                      <p className="text-xs text-muted-foreground">{t('Wird zum Entsperren der App nach Inaktivität oder manuellem Sperren benötigt')}</p>
                    </div>
                    {hasLockPin && (
                      <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new Event('app-lock-now'))}>
                        <Lock className="size-3.5" />{t('Jetzt sperren')}
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value)}
                      placeholder={t('Sperr-Passwort / PIN')}
                    />
                    <Button
                      disabled={!newPin.trim()}
                      onClick={async () => {
                        const h = await hashPin(newPin.trim());
                        try { localStorage.setItem('lockPinHash', h); } catch { /* egal */ }
                        setHasLockPin(true);
                        setNewPin('');
                        window.dispatchEvent(new Event('lock-cfg'));
                        toast(t('Gespeichert.'));
                      }}
                    >
                      {t('Speichern')}
                    </Button>
                    {hasLockPin && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          try { localStorage.removeItem('lockPinHash'); } catch { /* egal */ }
                          setHasLockPin(false);
                          window.dispatchEvent(new Event('lock-cfg'));
                        }}
                      >
                        {t('Entfernen')}
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}
        {tab === 'language' && <LanguageSettings lang={lang} setLang={setLang} />}
        {tab === 'privacy' && <TorSettings />}
        {tab === 'keychain' && <KeychainCloud st={st} toast={toast} goAccount={() => setTab('account')} />}
        {tab === 'teams' && <TeamsSettings st={st} teams={teams} refresh={refreshTeams} vault={vault} setVault={setVault} toast={toast} goAccount={() => setTab('account')} />}
        {!mobile && tab === 'updates' && <UpdatesSettings />}
        {!mobile && tab === 'files' && (
          <>
            <div className={row}>
              <div><p className="text-sm font-medium">{t('Standard-Editor')}</p><p className="text-xs text-muted-foreground">{t('Für „Öffnen“ und Doppelklick auf Dateien im SFTP')}</p></div>
              <Select value={editor} onValueChange={pickEditor}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t('Automatisch (VS Code, sonst System)')}</SelectItem>
                  {editors.filter((e) => e.cmd !== 'custom').map((e) => <SelectItem key={e.cmd} value={e.cmd}>{e.name}</SelectItem>)}
                  <SelectItem value="custom">{t('Eigenes Programm')}</SelectItem>
                  <SelectItem value="system">{t('Systemstandard')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className={cn(row, 'flex-col items-stretch')}>
              <div>
                <p className="text-sm font-medium">{t('Eigenes Programm')}</p>
                <p className="text-xs text-muted-foreground">{t('Öffnen mit')}</p>
              </div>
              <div className="flex gap-2">
                <Input
                  value={customEditor}
                  placeholder="/usr/bin/kate"
                  autoComplete="off"
                  onChange={(e) => {
                    const v = e.target.value;
                    setCustomEditor(v);
                    setEditor('custom');
                    api.settings.set({ editor: 'custom', customEditor: v });
                  }}
                />
                <Button variant="outline" onClick={async () => {
                  const r = await api.editors.pick?.();
                  if (r?.path) {
                    setCustomEditor(r.path);
                    setEditor('custom');
                    api.editors.list().then(setEditors);
                  }
                }}>{t('Programm wählen …')}</Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SettingsView;
