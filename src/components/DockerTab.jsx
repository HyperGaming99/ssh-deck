import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Container,
  Server,
  RefreshCw,
  Plus,
  Search,
  Terminal,
  Trash2,
  Layers,
  Network,
  HardDrive,
  FileText,
  Copy,
  Check,
  Play,
  Square,
  Pause,
  RotateCcw,
  Download,
  Info,
  ChevronDown,
  Cpu,
  Activity,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

export default function DockerTab({ hosts = [], connect, toast, dark }) {
  const t = useT();
  const [selectedHost, setSelectedHost] = useState('local');
  const [subTab, setSubTab] = useState('containers'); // 'containers' | 'images' | 'volumes' | 'networks'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'running' | 'paused' | 'exited'
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState({ containers: [], images: [], volumes: [], networks: [], info: {} });

  // Dialog-Zustände
  const [runOpen, setRunOpen] = useState(false);
  const [runForm, setRunForm] = useState({ name: '', image: '', ports: '', env: '', restart: 'always', volumes: '' });
  const [pullOpen, setPullOpen] = useState(false);
  const [pullImage, setPullImage] = useState('');
  const [modalText, setModalText] = useState(null); // { title, text }
  const [copied, setCopied] = useState(false);
  const [busyAction, setBusyAction] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.docker.overview(selectedHost);
      setData(res || { containers: [], images: [], volumes: [], networks: [], info: {} });
    } catch (err) {
      setError(err.message || t('Kein Docker-Daemon gefunden oder keine Berechtigung.'));
      setData({ containers: [], images: [], volumes: [], networks: [], info: {} });
    } finally {
      setLoading(false);
    }
  }, [selectedHost, t]);

  useEffect(() => {
    load();
  }, [load]);

  const activeHostObj = useMemo(() => {
    if (selectedHost === 'local') return null;
    return hosts.find((h) => h.id === selectedHost);
  }, [hosts, selectedHost]);

  // Aktionen
  const handleStart = async (c) => {
    try {
      await api.docker.start(selectedHost, { id: c.id });
      toast(t('Container gestartet.'));
      load();
    } catch (err) {
      toast(err.message || t('Fehler beim Ausführen'));
    }
  };

  const handleStop = async (c) => {
    try {
      await api.docker.stop(selectedHost, { id: c.id });
      toast(t('Container gestoppt.'));
      load();
    } catch (err) {
      toast(err.message || t('Fehler beim Ausführen'));
    }
  };

  const handleRestart = async (c) => {
    try {
      await api.docker.restart(selectedHost, { id: c.id });
      toast(t('Container neu gestartet.'));
      load();
    } catch (err) {
      toast(err.message || t('Fehler beim Ausführen'));
    }
  };

  const handlePause = async (c) => {
    try {
      await api.docker.pause(selectedHost, { id: c.id });
      toast(t('Container pausiert.'));
      load();
    } catch (err) {
      toast(err.message || t('Fehler beim Ausführen'));
    }
  };

  const handleUnpause = async (c) => {
    try {
      await api.docker.unpause(selectedHost, { id: c.id });
      toast(t('Container fortgesetzt.'));
      load();
    } catch (err) {
      toast(err.message || t('Fehler beim Ausführen'));
    }
  };

  const handleDeleteContainer = async (c) => {
    if (!confirm(t('Möchtest du „{name}“ wirklich löschen?', { name: c.name || c.id }))) return;
    try {
      await api.docker.remove(selectedHost, { id: c.id, force: true });
      toast(t('Container gelöscht.'));
      load();
    } catch (err) {
      toast(err.message || t('Fehler beim Ausführen'));
    }
  };

  const handleDeleteImage = async (img) => {
    if (!confirm(t('Möchtest du dieses Image wirklich löschen?'))) return;
    try {
      await api.docker.removeImage(selectedHost, { id: img.id || `${img.repository}:${img.tag}`, force: true });
      toast(t('Image gelöscht.'));
      load();
    } catch (err) {
      toast(err.message || t('Fehler beim Ausführen'));
    }
  };

  const handleDeleteVolume = async (vol) => {
    if (!confirm(t('Möchtest du dieses Volume wirklich löschen?'))) return;
    try {
      await api.docker.removeVolume(selectedHost, { name: vol.name });
      toast(t('Volume gelöscht.'));
      load();
    } catch (err) {
      toast(err.message || t('Fehler beim Ausführen'));
    }
  };

  const handleDeleteNetwork = async (net) => {
    if (!confirm(t('Möchtest du dieses Netzwerk wirklich löschen?'))) return;
    try {
      await api.docker.removeNetwork(selectedHost, { id: net.id || net.name });
      toast(t('Netzwerk gelöscht.'));
      load();
    } catch (err) {
      toast(err.message || t('Fehler beim Ausführen'));
    }
  };

  const handlePrune = async () => {
    if (!confirm(t('Alle unbenutzten Container, Images und Netzwerke entfernen?'))) return;
    setBusyAction(true);
    try {
      await api.docker.prune(selectedHost, { type: 'system' });
      toast(t('System aufgeräumt.'));
      load();
    } catch (err) {
      toast(err.message || t('Fehler beim Ausführen'));
    } finally {
      setBusyAction(false);
    }
  };

  const handleRun = async (e) => {
    e.preventDefault();
    if (!runForm.image.trim()) return;
    setBusyAction(true);
    try {
      await api.docker.run(selectedHost, runForm);
      toast(t('Container gestartet.'));
      setRunOpen(false);
      setRunForm({ name: '', image: '', ports: '', env: '', restart: 'always', volumes: '' });
      load();
    } catch (err) {
      toast(err.message || t('Fehler beim Ausführen'));
    } finally {
      setBusyAction(false);
    }
  };

  const handlePull = async (e) => {
    e.preventDefault();
    if (!pullImage.trim()) return;
    setBusyAction(true);
    try {
      await api.docker.pull(selectedHost, { image: pullImage.trim() });
      toast(t('Image gepullt.'));
      setPullOpen(false);
      setPullImage('');
      load();
    } catch (err) {
      toast(err.message || t('Fehler beim Ausführen'));
    } finally {
      setBusyAction(false);
    }
  };

  const showLogs = async (c) => {
    try {
      const logs = await api.docker.logs(selectedHost, { id: c.id, tail: 250 });
      setModalText({ title: `${t('Logs')}: ${c.name || c.id}`, text: logs });
    } catch (err) {
      toast(err.message || t('Fehler beim Ausführen'));
    }
  };

  const showInspect = async (c) => {
    try {
      const info = await api.docker.inspect(selectedHost, { id: c.id });
      setModalText({ title: `${t('Details')}: ${c.name || c.id}`, text: info });
    } catch (err) {
      toast(err.message || t('Fehler beim Ausführen'));
    }
  };

  const openTerminal = (c) => {
    if (activeHostObj && connect) {
      connect(activeHostObj, 'ssh');
      toast(t('Terminal geöffnet. Nutze: docker exec -it {name} sh', { name: c.name || c.id }));
    } else {
      navigator.clipboard.writeText(`docker exec -it ${c.name || c.id} sh`);
      toast(t('Terminal geöffnet. Nutze: docker exec -it {name} sh', { name: c.name || c.id }));
    }
  };

  const copyModalText = async () => {
    if (!modalText?.text) return;
    await navigator.clipboard.writeText(modalText.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filter
  const filteredContainers = useMemo(() => {
    return (data.containers || []).filter((c) => {
      if (statusFilter === 'running' && !c.running) return false;
      if (statusFilter === 'paused' && !c.paused) return false;
      if (statusFilter === 'exited' && (c.running || c.paused)) return false;
      if (!q) return true;
      const s = q.toLowerCase();
      return (
        (c.name || '').toLowerCase().includes(s) ||
        (c.image || '').toLowerCase().includes(s) ||
        (c.id || '').toLowerCase().includes(s) ||
        (c.ports || '').toLowerCase().includes(s)
      );
    });
  }, [data.containers, statusFilter, q]);

  const filteredImages = useMemo(() => {
    return (data.images || []).filter((i) => {
      if (!q) return true;
      const s = q.toLowerCase();
      return (
        (i.repository || '').toLowerCase().includes(s) ||
        (i.tag || '').toLowerCase().includes(s) ||
        (i.id || '').toLowerCase().includes(s)
      );
    });
  }, [data.images, q]);

  const filteredVolumes = useMemo(() => {
    return (data.volumes || []).filter((v) => {
      if (!q) return true;
      const s = q.toLowerCase();
      return (
        (v.name || '').toLowerCase().includes(s) ||
        (v.driver || '').toLowerCase().includes(s) ||
        (v.mountpoint || '').toLowerCase().includes(s)
      );
    });
  }, [data.volumes, q]);

  const filteredNetworks = useMemo(() => {
    return (data.networks || []).filter((n) => {
      if (!q) return true;
      const s = q.toLowerCase();
      return (
        (n.name || '').toLowerCase().includes(s) ||
        (n.driver || '').toLowerCase().includes(s) ||
        (n.id || '').toLowerCase().includes(s)
      );
    });
  }, [data.networks, q]);

  const runningCount = useMemo(() => (data.containers || []).filter((c) => c.running).length, [data.containers]);
  const pausedCount = useMemo(() => (data.containers || []).filter((c) => c.paused).length, [data.containers]);
  const stoppedCount = useMemo(() => (data.containers || []).filter((c) => !c.running && !c.paused).length, [data.containers]);

  return (
    <div className="space-y-4">
      {/* Obere Leiste: Host-Auswahl, Schnellaktionen, Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Host Dropdown */}
          <div className="relative">
            <select
              value={selectedHost}
              onChange={(e) => setSelectedHost(e.target.value)}
              className="h-9 rounded-xl border bg-background px-3 pe-8 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="local">💻 {t('Lokal (dieser Rechner)')}</option>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  🖥️ {h.name} ({h.user}@{h.host})
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 rounded-xl text-xs font-medium"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            {t('Aktualisieren')}
          </Button>

          <Button
            size="sm"
            className="h-9 gap-1.5 rounded-xl text-xs font-medium"
            onClick={() => setRunOpen(true)}
          >
            <Plus className="size-3.5" />
            {t('Neuer Container')}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 rounded-xl text-xs font-medium"
            onClick={() => setPullOpen(true)}
          >
            <Download className="size-3.5" />
            {t('Image pullen')}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 rounded-xl text-xs font-medium text-amber-600 dark:text-amber-400"
            onClick={handlePrune}
            disabled={busyAction}
          >
            <Sparkles className="size-3.5" />
            {t('Aufräumen')}
          </Button>
        </div>

        {/* Suche & Status-Filter */}
        <div className="flex items-center gap-2 ms-auto">
          {subTab === 'containers' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-xl border bg-background px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">{t('Alle Status')}</option>
              <option value="running">{t('Laufend')} ({runningCount})</option>
              <option value="paused">{t('Pausiert')} ({pausedCount})</option>
              <option value="exited">{t('Beendet')} ({stoppedCount})</option>
            </select>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('Suchen …')}
              className="h-9 w-44 sm:w-56 ps-8 text-xs rounded-xl"
            />
          </div>
        </div>
      </div>

      {/* Info-Leiste */}
      {data.info?.serverVersion && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/60 px-4 py-2.5 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Container className="size-3.5 text-primary" /> Docker v{data.info.serverVersion}
            </span>
            {data.info.operatingSystem && <span>{data.info.operatingSystem} ({data.info.arch})</span>}
            {data.info.cpus > 0 && <span>{data.info.cpus} CPUs</span>}
            {data.info.totalMemory > 0 && <span>{(data.info.totalMemory / 1024).toFixed(1)} GB RAM</span>}
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
              {runningCount} {t('Laufend')}
            </span>
            {pausedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                <span className="size-2 rounded-full bg-amber-500" />
                {pausedCount} {t('Pausiert')}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <span className="size-2 rounded-full bg-muted-foreground/40" />
              {stoppedCount} {t('Beendet')}
            </span>
          </div>
        </div>
      )}

      {/* Sub-Tabs: Container, Images, Volumes, Netzwerke */}
      <div className="flex gap-1.5 rounded-xl bg-muted/60 p-1">
        {[
          ['containers', t('Container'), filteredContainers.length, Container],
          ['images', t('Images'), filteredImages.length, Layers],
          ['volumes', t('Volumes'), filteredVolumes.length, HardDrive],
          ['networks', t('Netzwerke'), filteredNetworks.length, Network],
        ].map(([id, label, count, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-colors',
              subTab === id
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="size-3.5" />
            <span>{label}</span>
            <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Fehleranzeige */}
      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive">
          <p className="font-semibold">{error}</p>
          <Button variant="outline" size="sm" className="mt-4 gap-1.5 text-xs" onClick={load}>
            <RefreshCw className="size-3.5" />
            {t('Erneut versuchen')}
          </Button>
        </div>
      )}

      {/* TAB 1: CONTAINERS */}
      {subTab === 'containers' && !error && (
        <div className="space-y-2">
          {!filteredContainers.length ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground">
              {t('Keine Container gefunden.')}
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredContainers.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-foreground/20"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'size-2.5 rounded-full shrink-0',
                          c.running
                            ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]'
                            : c.paused
                            ? 'bg-amber-500 shadow-[0_0_8px_#f59e0b]'
                            : 'bg-muted-foreground/40'
                        )}
                      />
                      <span className="font-semibold text-sm text-foreground truncate">{c.name}</span>
                      <Badge variant="outline" className="text-[10px] font-mono px-2 py-0">
                        {c.id.slice(0, 10)}
                      </Badge>
                      <Badge
                        variant={c.running ? 'secondary' : c.paused ? 'outline' : 'outline'}
                        className={cn(
                          'text-[10px] px-2 py-0',
                          c.running && 'text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/10',
                          c.paused && 'text-amber-600 dark:text-amber-400 border-amber-500/20 bg-amber-500/10'
                        )}
                      >
                        {c.status || c.state}
                      </Badge>
                      {c.cpu && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                          <Cpu className="size-3 text-primary/70" /> {c.cpu}
                        </span>
                      )}
                      {c.memory && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                          <Activity className="size-3 text-primary/70" /> {c.memory}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-muted-foreground truncate">
                      {c.image} {c.ports && `· ${c.ports}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 self-end lg:self-center">
                    {c.running ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-xs text-amber-600 hover:text-amber-700"
                          onClick={() => handlePause(c)}
                          title={t('Pausieren')}
                        >
                          <Pause className="size-3.5" />
                          <span className="hidden xl:inline">{t('Pausieren')}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-xs text-rose-600 hover:text-rose-700"
                          onClick={() => handleStop(c)}
                          title={t('Stoppen')}
                        >
                          <Square className="size-3.5" />
                          <span className="hidden xl:inline">{t('Stoppen')}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          onClick={() => handleRestart(c)}
                          title={t('Neustarten')}
                        >
                          <RotateCcw className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-xs text-blue-500 hover:text-blue-600"
                          onClick={() => openTerminal(c)}
                          title={t('Terminal (Exec)')}
                        >
                          <Terminal className="size-3.5" />
                          <span className="hidden md:inline">Exec</span>
                        </Button>
                      </>
                    ) : c.paused ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-xs text-emerald-600 hover:text-emerald-700"
                          onClick={() => handleUnpause(c)}
                          title={t('Fortsetzen')}
                        >
                          <Play className="size-3.5" />
                          <span className="hidden xl:inline">{t('Fortsetzen')}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-xs text-rose-600 hover:text-rose-700"
                          onClick={() => handleStop(c)}
                          title={t('Stoppen')}
                        >
                          <Square className="size-3.5" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-xs text-emerald-600 hover:text-emerald-700"
                        onClick={() => handleStart(c)}
                        title={t('Starten')}
                      >
                        <Play className="size-3.5" />
                        <span className="hidden xl:inline">{t('Starten')}</span>
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => showLogs(c)}
                      title={t('Logs')}
                    >
                      <FileText className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => showInspect(c)}
                      title={t('Details')}
                    >
                      <Info className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive hover:text-destructive"
                      onClick={() => handleDeleteContainer(c)}
                      title={t('Löschen')}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: IMAGES */}
      {subTab === 'images' && !error && (
        <div className="space-y-2">
          {!filteredImages.length ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground">
              {t('Keine Images gefunden.')}
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredImages.map((i) => (
                <div
                  key={`${i.repository}:${i.tag}:${i.id}`}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-foreground/20"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Layers className="size-4 text-primary shrink-0" />
                      <span className="font-semibold text-sm text-foreground truncate">{i.repository}</span>
                      <Badge variant="secondary" className="text-[10px] px-2 py-0">
                        {i.tag}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-mono px-2 py-0">
                        {i.id}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-mono px-2 py-0">
                        {i.size}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('Erstellt')}: {i.created}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs text-primary"
                      onClick={() => {
                        setRunForm((prev) => ({ ...prev, image: `${i.repository}:${i.tag}` }));
                        setRunOpen(true);
                      }}
                      title={t('Container ausführen')}
                    >
                      <Play className="size-3.5" />
                      <span className="hidden md:inline">{t('Starten')}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive hover:text-destructive"
                      onClick={() => handleDeleteImage(i)}
                      title={t('Löschen')}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: VOLUMES */}
      {subTab === 'volumes' && !error && (
        <div className="space-y-2">
          {!filteredVolumes.length ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground">
              {t('Keine Volumes gefunden.')}
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredVolumes.map((v) => (
                <div
                  key={v.name}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-foreground/20"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <HardDrive className="size-4 text-primary shrink-0" />
                      <span className="font-semibold text-sm text-foreground truncate">{v.name}</span>
                      <Badge variant="outline" className="text-[10px] px-2 py-0">
                        {v.driver}
                      </Badge>
                    </div>
                    <p className="text-xs font-mono text-muted-foreground truncate">
                      {v.mountpoint || v.scope}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive hover:text-destructive"
                      onClick={() => handleDeleteVolume(v)}
                      title={t('Löschen')}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: NETWORKS */}
      {subTab === 'networks' && !error && (
        <div className="space-y-2">
          {!filteredNetworks.length ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground">
              {t('Keine Netzwerke gefunden.')}
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredNetworks.map((n) => (
                <div
                  key={n.id || n.name}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-foreground/20"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Network className="size-4 text-primary shrink-0" />
                      <span className="font-semibold text-sm text-foreground truncate">{n.name}</span>
                      <Badge variant="outline" className="text-[10px] px-2 py-0">
                        {n.driver}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] font-mono px-2 py-0">
                        {n.id}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Scope: {n.scope} {n.internal && '· internal'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive hover:text-destructive"
                      onClick={() => handleDeleteNetwork(n)}
                      title={t('Löschen')}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: NEUER CONTAINER */}
      <Dialog open={runOpen} onOpenChange={setRunOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t('Container ausführen')}</DialogTitle>
            <DialogDescription>
              {t('Startet einen neuen Docker-Container auf der gewählten Verbindung.')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRun} className="space-y-4">
            <div className="space-y-3 py-2 text-xs">
              <div className="grid gap-1.5">
                <Label htmlFor="docker-img">{t('Image (z. B. nginx:alpine)')}</Label>
                <Input
                  id="docker-img"
                  required
                  placeholder="nginx:alpine, postgres:16, redis:7, ..."
                  value={runForm.image}
                  onChange={(e) => setRunForm((o) => ({ ...o, image: e.target.value }))}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="docker-name">{t('Container-Name')}</Label>
                <Input
                  id="docker-name"
                  placeholder="my-web-app"
                  value={runForm.name}
                  onChange={(e) => setRunForm((o) => ({ ...o, name: e.target.value }))}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="docker-ports">{t('Port-Weiterleitung (z. B. 8080:80)')}</Label>
                <Input
                  id="docker-ports"
                  placeholder="8080:80, 5432:5432"
                  value={runForm.ports}
                  onChange={(e) => setRunForm((o) => ({ ...o, ports: e.target.value }))}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="docker-restart">{t('Restart-Richtlinie')}</Label>
                <select
                  id="docker-restart"
                  value={runForm.restart}
                  onChange={(e) => setRunForm((o) => ({ ...o, restart: e.target.value }))}
                  className="h-9 rounded-xl border bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="always">{t('Immer (always)')}</option>
                  <option value="unless-stopped">{t('Wenn nicht gestoppt (unless-stopped)')}</option>
                  <option value="on-failure">{t('Bei Fehler (on-failure)')}</option>
                  <option value="no">{t('Keine (no)')}</option>
                </select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="docker-env">{t('Umgebungsvariablen (eine pro Zeile, z. B. FOO=bar)')}</Label>
                <textarea
                  id="docker-env"
                  rows={3}
                  placeholder="NODE_ENV=production&#10;PORT=3000"
                  className="rounded-xl border bg-background p-2.5 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  value={runForm.env}
                  onChange={(e) => setRunForm((o) => ({ ...o, env: e.target.value }))}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="submit" disabled={busyAction || !runForm.image.trim()}>
                {busyAction ? t('Bitte warten …') : t('Starten')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setRunOpen(false)}>
                {t('Abbrechen')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: IMAGE PULLEN */}
      <Dialog open={pullOpen} onOpenChange={setPullOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t('Image herunterladen')}</DialogTitle>
            <DialogDescription>
              {t('Lädt das angegebene Image aus der Container-Registry herunter.')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handlePull} className="space-y-4">
            <div className="grid gap-1.5 py-2">
              <Label htmlFor="docker-pull-img">{t('Image-Name mit Tag (z. B. ubuntu:latest)')}</Label>
              <Input
                id="docker-pull-img"
                required
                placeholder="ubuntu:latest, alpine:latest, node:22-alpine"
                value={pullImage}
                onChange={(e) => setPullImage(e.target.value)}
              />
            </div>

            <DialogFooter className="gap-2">
              <Button type="submit" disabled={busyAction || !pullImage.trim()}>
                {busyAction ? t('Bitte warten …') : t('Herunterladen')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setPullOpen(false)}>
                {t('Abbrechen')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: LOGS & DETAILS */}
      <Dialog open={!!modalText} onOpenChange={(o) => !o && setModalText(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col rounded-2xl">
          <DialogHeader className="flex flex-row items-center justify-between border-b pb-3">
            <DialogTitle className="text-sm font-semibold truncate pe-4">
              {modalText?.title}
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8 shrink-0"
              onClick={copyModalText}
            >
              {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
              {copied ? t('Kopiert') : t('Kopieren')}
            </Button>
          </DialogHeader>

          <div className="flex-1 overflow-auto bg-muted/40 p-3 rounded-xl font-mono text-xs whitespace-pre-wrap leading-relaxed select-text my-2">
            {modalText?.text}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalText(null)}>
              {t('Schließen')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
