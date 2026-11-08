import { useEffect, useState } from 'react';
import {
  Check,
  Download,
  FileText,
  FolderOpen,
  KeyRound,
  Languages,
  Lock,
  Moon,
  Palette,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Terminal as TermIcon,
  User,
  Users,
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
import SyncView from './SyncView';
import TorSettings from './TorSettings';
import UpdatesSettings from './UpdatesSettings';

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
export function SettingsView({ st, dark, setDark, side, setSide, onLogin, onLogout, lang, setLang, settingsTab, teams, refreshTeams, vault, setVault, toast }) {
  const t = useT();
  const [tab, setTab] = useState(settingsTab || 'account');
  useEffect(() => { if (settingsTab) setTab(settingsTab); }, [settingsTab]);
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
          <>
            <div className={row}>
              <div><p className="text-sm font-medium">{t('Design')}</p><p className="text-xs text-muted-foreground">{t('Hell oder dunkel')}</p></div>
              {seg([[false, t('Hell'), Sun], [true, t('Dunkel'), Moon]], dark, setDark)}
            </div>
            <div className={cn(row, 'mhide')}>
              <div><p className="text-sm font-medium">{t('Seitenleiste')}</p><p className="text-xs text-muted-foreground">{t('Stil der linken Navigation')}</p></div>
              {seg([['compact', t('Kompakt')], ['wide', t('Breit')], ['float', t('Schwebend')]], side, setSide)}
            </div>
            <div className={row}>
              <div><p className="text-sm font-medium">{t('Animationen')}</p><p className="text-xs text-muted-foreground">{t('Glow bei Hosts und Gruppen sowie Übergänge')}</p></div>
              {seg([['on', t('An')], ['off', t('Aus')]], anim, pickAnim)}
            </div>
          </>
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
        {tab === 'language' && (
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm font-medium">{t('Sprache der Oberfläche')}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3" dir="ltr">
              {LANGS.map(({ code, name, Flag }) => (
                <button key={code} onClick={() => setLang(code)}
                  className={cn('flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-start text-sm transition-colors hover:bg-accent', lang === code && 'border-primary bg-accent')}>
                  <Flag className="h-4 w-6 shrink-0 rounded-[3px] shadow-sm" />
                  <span className="truncate">{name}</span>
                  {lang === code && <Check className="ms-auto size-4 text-primary" />}
                </button>
              ))}
            </div>
          </div>
        )}
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
