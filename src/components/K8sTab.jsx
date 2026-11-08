import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Boxes,
  Server,
  RefreshCw,
  Plus,
  Search,
  Terminal,
  Trash2,
  Layers,
  Network,
  FileText,
  Copy,
  Check,
  RotateCcw,
  SlidersHorizontal,
  Info,
  ChevronDown,
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
import HostSelectDropdown from '@/components/HostSelectDropdown';

export default function K8sTab({ hosts = [], connect, toast, dark }) {
  const t = useT();
  const [selectedHost, setSelectedHost] = useState('local');
  const [subTab, setSubTab] = useState('pods'); // 'pods' | 'nodes' | 'deployments' | 'services'
  const [q, setQ] = useState('');
  const [selectedNs, setSelectedNs] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState({ nodes: [], pods: [], deployments: [], services: [], namespaces: [] });

  // Dialog-Zustände
  const [runOpen, setRunOpen] = useState(false);
  const [runForm, setRunForm] = useState({ name: '', image: '', namespace: 'default', port: '', type: 'pod' });
  const [scaleItem, setScaleItem] = useState(null); // { name, namespace, replicas }
  const [scaleReplicas, setScaleReplicas] = useState(1);
  const [modalText, setModalText] = useState(null); // { title, text, kind: 'logs' | 'describe' }
  const [copied, setCopied] = useState(false);
  const [busyAction, setBusyAction] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.k8s.overview(selectedHost);
      setData(res || { nodes: [], pods: [], deployments: [], services: [], namespaces: [] });
    } catch (err) {
      setError(err.message || t('Kein Kubernetes-Cluster gefunden oder kubectl nicht erreichbar.'));
      setData({ nodes: [], pods: [], deployments: [], services: [], namespaces: [] });
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
  const handleRun = async (e) => {
    e.preventDefault();
    if (!runForm.name.trim() || !runForm.image.trim()) return;
    setBusyAction(true);
    try {
      await api.k8s.run(selectedHost, runForm);
      toast(t('Workload gestartet.'));
      setRunOpen(false);
      setRunForm({ name: '', image: '', namespace: 'default', port: '', type: 'pod' });
      load();
    } catch (err) {
      toast(err.message || t('Fehler beim Starten'));
    } finally {
      setBusyAction(false);
    }
  };

  const handleScale = async () => {
    if (!scaleItem) return;
    setBusyAction(true);
    try {
      await api.k8s.scale(selectedHost, { name: scaleItem.name, namespace: scaleItem.namespace, replicas: scaleReplicas });
      toast(t('Skalierung angewendet.'));
      setScaleItem(null);
      load();
    } catch (err) {
      toast(err.message || t('Skalieren fehlgeschlagen'));
    } finally {
      setBusyAction(false);
    }
  };

  const handleRestart = async (item, type = 'deployment') => {
    try {
      await api.k8s.restart(selectedHost, { name: item.name, namespace: item.namespace, type });
      toast(t('Neustart angestoßen.'));
      load();
    } catch (err) {
      toast(err.message || t('Neustart fehlgeschlagen'));
    }
  };

  const handleDelete = async (kind, name, namespace) => {
    if (!confirm(t('Möchtest du „{name}“ wirklich löschen?', { name }))) return;
    try {
      await api.k8s.delete(selectedHost, { kind, name, namespace });
      toast(t('Ressource gelöscht.'));
      load();
    } catch (err) {
      toast(err.message || t('Löschen fehlgeschlagen'));
    }
  };

  const showLogs = async (pod) => {
    try {
      const logs = await api.k8s.logs(selectedHost, { name: pod.name, namespace: pod.namespace, tail: 200 });
      setModalText({ title: `${t('Logs')}: ${pod.name}`, text: logs, kind: 'logs' });
    } catch (err) {
      toast(err.message || t('Logs konnten nicht geladen werden'));
    }
  };

  const showDescribe = async (kind, name, namespace) => {
    try {
      const desc = await api.k8s.describe(selectedHost, { kind, name, namespace });
      setModalText({ title: `${t('Details')}: ${name}`, text: desc, kind: 'describe' });
    } catch (err) {
      toast(err.message || t('Details konnten nicht geladen werden'));
    }
  };

  const openTerminal = (pod) => {
    if (activeHostObj && connect) {
      connect(activeHostObj, 'ssh');
      toast(t('Terminal geöffnet. Nutze: kubectl exec -it {name} -n {ns} -- sh', { name: pod.name, ns: pod.namespace }));
    } else {
      toast(t('Verbinde zuerst per SSH mit dem Host.'));
    }
  };

  const copyModalText = async () => {
    if (!modalText?.text) return;
    await navigator.clipboard.writeText(modalText.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filter
  const filteredPods = useMemo(() => {
    return (data.pods || []).filter((p) => {
      if (selectedNs !== 'all' && p.namespace !== selectedNs) return false;
      if (!q) return true;
      const s = q.toLowerCase();
      return p.name.toLowerCase().includes(s) || p.image.toLowerCase().includes(s) || p.node.toLowerCase().includes(s);
    });
  }, [data.pods, selectedNs, q]);

  const filteredNodes = useMemo(() => {
    return (data.nodes || []).filter((n) => {
      if (!q) return true;
      const s = q.toLowerCase();
      return n.name.toLowerCase().includes(s) || n.version.toLowerCase().includes(s) || n.internalIp.includes(s);
    });
  }, [data.nodes, q]);

  const filteredDeployments = useMemo(() => {
    return (data.deployments || []).filter((d) => {
      if (selectedNs !== 'all' && d.namespace !== selectedNs) return false;
      if (!q) return true;
      const s = q.toLowerCase();
      return d.name.toLowerCase().includes(s) || d.image.toLowerCase().includes(s);
    });
  }, [data.deployments, selectedNs, q]);

  const filteredServices = useMemo(() => {
    return (data.services || []).filter((s) => {
      if (selectedNs !== 'all' && s.namespace !== selectedNs) return false;
      if (!q) return true;
      const str = q.toLowerCase();
      return s.name.toLowerCase().includes(str) || s.type.toLowerCase().includes(str) || s.clusterIp.includes(str);
    });
  }, [data.services, selectedNs, q]);

  return (
    <div className="space-y-4">
      {/* Obere Leiste: Host-Auswahl, Schnellaktionen, Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Host Dropdown */}
          <HostSelectDropdown hosts={hosts} selectedHost={selectedHost} onSelect={setSelectedHost} />

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
            {t('Neuer Workload')}
          </Button>
        </div>

        {/* Suche & Namespace-Filter */}
        <div className="flex items-center gap-2 ms-auto">
          {data.namespaces?.length > 1 && (
            <select
              value={selectedNs}
              onChange={(e) => setSelectedNs(e.target.value)}
              className="h-9 rounded-xl border bg-background px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">{t('Alle Namespaces')}</option>
              {data.namespaces.map((ns) => (
                <option key={ns} value={ns}>{ns}</option>
              ))}
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

      {/* Sub-Tabs: Pods, Nodes, Deployments, Services */}
      <div className="flex gap-1.5 rounded-xl bg-muted/60 p-1">
        {[
          ['pods', t('Pods'), filteredPods.length, Boxes],
          ['nodes', t('Nodes'), filteredNodes.length, Server],
          ['deployments', t('Deployments'), filteredDeployments.length, Layers],
          ['services', t('Services'), filteredServices.length, Network],
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

      {/* Fehleranzeige / Keine Cluster Verbindung */}
      {error && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-5 text-center space-y-2">
          <p className="text-sm font-semibold text-destructive">{error}</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {t('Stelle sicher, dass kubectl oder k3s auf dem gewählten Host installiert ist und ~/.kube/config existiert.')}
          </p>
          <div className="pt-2">
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5 text-xs">
              <RefreshCw className="size-3.5" />
              {t('Erneut versuchen')}
            </Button>
          </div>
        </div>
      )}

      {/* TAB 1: PODS */}
      {subTab === 'pods' && !error && (
        <div className="space-y-2">
          {!filteredPods.length ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground">
              {t('Keine Pods gefunden.')}
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredPods.map((pod) => (
                <div
                  key={`${pod.namespace}/${pod.name}`}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-foreground/20"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'size-2.5 rounded-full shrink-0',
                          pod.phase === 'Running' || pod.phase === 'Succeeded'
                            ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]'
                            : pod.phase === 'Pending'
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        )}
                      />
                      <span className="font-semibold text-sm text-foreground truncate">{pod.name}</span>
                      <Badge variant="secondary" className="text-[10px] px-2 py-0">
                        {pod.namespace}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-mono px-2 py-0">
                        {pod.ready}
                      </Badge>
                      {pod.restarts > 0 && (
                        <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 px-1.5 py-0">
                          {pod.restarts} {t('Neustarts')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs font-mono text-muted-foreground truncate">
                      {pod.image} {pod.node !== '-' && `· Node: ${pod.node}`} {pod.ip !== '-' && `· IP: ${pod.ip}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => showLogs(pod)}
                      title={t('Logs')}
                    >
                      <FileText className="size-3.5" />
                      <span className="hidden md:inline">{t('Logs')}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => showDescribe('pod', pod.name, pod.namespace)}
                      title={t('Details')}
                    >
                      <Info className="size-3.5" />
                      <span className="hidden md:inline">{t('Details')}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs text-blue-500 hover:text-blue-600"
                      onClick={() => openTerminal(pod)}
                      title={t('Terminal (Exec)')}
                    >
                      <Terminal className="size-3.5" />
                      <span className="hidden md:inline">Exec</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive hover:text-destructive"
                      onClick={() => handleDelete('pod', pod.name, pod.namespace)}
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

      {/* TAB 2: NODES */}
      {subTab === 'nodes' && !error && (
        <div className="space-y-2">
          {!filteredNodes.length ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground">
              {t('Keine Nodes gefunden.')}
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredNodes.map((n) => (
                <div
                  key={n.name}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-foreground/20"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'size-2.5 rounded-full shrink-0',
                          n.ready ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-rose-500'
                        )}
                      />
                      <span className="font-semibold text-sm text-foreground truncate">{n.name}</span>
                      <Badge variant={n.ready ? 'secondary' : 'destructive'} className="text-[10px] px-2 py-0">
                        {n.status}
                      </Badge>
                      {n.roles.map((r) => (
                        <Badge key={r} variant="outline" className="text-[10px] px-2 py-0">
                          {r}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs font-mono text-muted-foreground truncate">
                      {n.version} · IP: {n.internalIp} · {n.osImage} ({n.arch})
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => showDescribe('node', n.name, '')}
                    >
                      <Info className="size-3.5" />
                      <span>{t('Details')}</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DEPLOYMENTS */}
      {subTab === 'deployments' && !error && (
        <div className="space-y-2">
          {!filteredDeployments.length ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground">
              {t('Keine Deployments gefunden.')}
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredDeployments.map((dep) => (
                <div
                  key={`${dep.namespace}/${dep.name}`}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-foreground/20"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'size-2.5 rounded-full shrink-0',
                          dep.readyReplicas === dep.replicas && dep.replicas > 0
                            ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]'
                            : dep.readyReplicas > 0
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        )}
                      />
                      <span className="font-semibold text-sm text-foreground truncate">{dep.name}</span>
                      <Badge variant="secondary" className="text-[10px] px-2 py-0">
                        {dep.namespace}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-mono px-2 py-0">
                        {dep.readyReplicas}/{dep.replicas} Replicas
                      </Badge>
                    </div>
                    <p className="text-xs font-mono text-muted-foreground truncate">{dep.image}</p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => {
                        setScaleItem(dep);
                        setScaleReplicas(dep.replicas || 1);
                      }}
                    >
                      <SlidersHorizontal className="size-3.5" />
                      <span className="hidden md:inline">{t('Skalieren')}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => handleRestart(dep, 'deployment')}
                    >
                      <RotateCcw className="size-3.5" />
                      <span className="hidden md:inline">{t('Neustart')}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => showDescribe('deployment', dep.name, dep.namespace)}
                    >
                      <Info className="size-3.5" />
                      <span className="hidden md:inline">{t('Details')}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive hover:text-destructive"
                      onClick={() => handleDelete('deployment', dep.name, dep.namespace)}
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

      {/* TAB 4: SERVICES */}
      {subTab === 'services' && !error && (
        <div className="space-y-2">
          {!filteredServices.length ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground">
              {t('Keine Services gefunden.')}
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredServices.map((svc) => (
                <div
                  key={`${svc.namespace}/${svc.name}`}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-foreground/20"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-foreground truncate">{svc.name}</span>
                      <Badge variant="secondary" className="text-[10px] px-2 py-0">
                        {svc.namespace}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-2 py-0">
                        {svc.type}
                      </Badge>
                    </div>
                    <p className="text-xs font-mono text-muted-foreground truncate">
                      Cluster-IP: {svc.clusterIp} {svc.externalIp !== '-' && `· Ext: ${svc.externalIp}`} · Ports: {svc.ports}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => showDescribe('service', svc.name, svc.namespace)}
                    >
                      <Info className="size-3.5" />
                      <span>{t('Details')}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive hover:text-destructive"
                      onClick={() => handleDelete('service', svc.name, svc.namespace)}
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

      {/* MODAL 1: NEUER WORKLOAD (RUN / CREATE DEPLOYMENT) */}
      <Dialog open={runOpen} onOpenChange={setRunOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <form onSubmit={handleRun}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="size-4" />
                {t('Neuen Workload starten')}
              </DialogTitle>
              <DialogDescription>
                {t('Erstellt einen neuen Pod oder ein Deployment über kubectl im Cluster.')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4">
              <div className="grid gap-1.5">
                <Label>{t('Typ')}</Label>
                <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-muted p-1">
                  {[
                    ['pod', 'Pod (kubectl run)'],
                    ['deployment', 'Deployment'],
                  ].map(([val, lab]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setRunForm((o) => ({ ...o, type: val }))}
                      className={cn(
                        'rounded-md py-1.5 text-xs font-medium transition-colors text-center',
                        runForm.type === val
                          ? 'bg-background text-foreground shadow-xs font-semibold'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {lab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="k8s-name">{t('Name')}</Label>
                <Input
                  id="k8s-name"
                  required
                  placeholder="my-app"
                  value={runForm.name}
                  onChange={(e) => setRunForm((o) => ({ ...o, name: e.target.value }))}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="k8s-image">{t('Container Image')}</Label>
                <Input
                  id="k8s-image"
                  required
                  placeholder="nginx:alpine, redis:7, ..."
                  value={runForm.image}
                  onChange={(e) => setRunForm((o) => ({ ...o, image: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="k8s-ns">{t('Namespace')}</Label>
                  <Input
                    id="k8s-ns"
                    placeholder="default"
                    value={runForm.namespace}
                    onChange={(e) => setRunForm((o) => ({ ...o, namespace: e.target.value }))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="k8s-port">{t('Port (optional)')}</Label>
                  <Input
                    id="k8s-port"
                    type="number"
                    placeholder="80"
                    value={runForm.port}
                    onChange={(e) => setRunForm((o) => ({ ...o, port: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="submit" disabled={busyAction || !runForm.name.trim() || !runForm.image.trim()}>
                {busyAction ? t('Bitte warten …') : t('Starten')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setRunOpen(false)}>
                {t('Abbrechen')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: DEPLOYMENT SKALIEREN */}
      <Dialog open={!!scaleItem} onOpenChange={(o) => !o && setScaleItem(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t('Deployment skalieren')}</DialogTitle>
            <DialogDescription>
              {scaleItem?.name} ({t('Namespace')}: {scaleItem?.namespace})
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-3">
            <Label>{t('Anzahl Replicas (Instanzen)')}</Label>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="size-10 text-lg font-bold"
                onClick={() => setScaleReplicas((n) => Math.max(0, n - 1))}
              >
                -
              </Button>
              <Input
                type="number"
                min={0}
                className="text-center text-lg font-semibold h-10"
                value={scaleReplicas}
                onChange={(e) => setScaleReplicas(Number(e.target.value))}
              />
              <Button
                type="button"
                variant="outline"
                className="size-10 text-lg font-bold"
                onClick={() => setScaleReplicas((n) => n + 1)}
              >
                +
              </Button>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button onClick={handleScale} disabled={busyAction}>
              {busyAction ? t('Bitte warten …') : t('Skalierung anwenden')}
            </Button>
            <Button variant="outline" onClick={() => setScaleItem(null)}>
              {t('Abbrechen')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: LOGS & DESCRIBE AUSGABE */}
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
