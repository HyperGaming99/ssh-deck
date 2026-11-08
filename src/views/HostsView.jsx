import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  Copy,
  Download,
  Ellipsis,
  FileText,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import GroupDialog from '@/components/GroupDialog';
import GroupIcon from '@/components/GroupIcon';
import HostIcon from '@/components/HostIcon';
import ImportDialog from '@/components/ImportDialog';
import { Empty, IconButton, Item } from '@/components/common';
import { inV, useVault } from '@/context/VaultContext';
import { useT } from '@/i18n';
import { sshCommand, sshConfig } from '@/lib/sshcmd.mjs';
import { cn, matches } from '@/lib/utils';

const mobile = !!window.api?.mobile;

export function HostsView({ dark, connect, openSftp, openForm, openHost, toast, rev }) {
  const t = useT();
  const { vault, writable, vaults } = useVault();
  const [hosts, setHosts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [q, setQ] = useState('');
  const [current, setCurrent] = useState(null); // Gruppenname oder null (oberste Ebene)
  const [importOpen, setImportOpen] = useState(false);
  const [draggedHost, setDraggedHost] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { id, pos: 'before' | 'after' }
  const [draggedGroup, setDraggedGroup] = useState(null);
  const [groupDropTarget, setGroupDropTarget] = useState(null); // { id, pos: 'before' | 'after' }
  const [dragOverGroup, setDragOverGroup] = useState(null);
  const [dragOverBreadcrumb, setDragOverBreadcrumb] = useState(false);
  const [showHealth, setShowHealth] = useState(() => {
    try { return localStorage.getItem('hostHealth') !== '0'; } catch { return true; }
  });
  const [healthMap, setHealthMap] = useState({});
  const [pinging, setPinging] = useState(false);

  useEffect(() => {
    const handler = () => {
      try {
        setShowHealth(localStorage.getItem('hostHealth') !== '0');
      } catch { /* egal */ }
    };
    window.addEventListener('host-health-cfg', handler);
    return () => window.removeEventListener('host-health-cfg', handler);
  }, []);

  const refreshHealth = useCallback(async (targets) => {
    const list = targets || hosts;
    if (!showHealth || !list.length || !api.hosts?.pingAll) return;
    setPinging(true);
    try {
      const res = await api.hosts.pingAll(list);
      if (res && typeof res === 'object') {
        setHealthMap((prev) => ({ ...prev, ...res }));
      }
    } catch {
      /* egal */
    } finally {
      setPinging(false);
    }
  }, [hosts, showHealth]);

  useEffect(() => {
    if (!showHealth || !hosts.length) return;
    refreshHealth(hosts);
    const iv = setInterval(() => refreshHealth(hosts), 45000);
    return () => clearInterval(iv);
  }, [showHealth, hosts, refreshHealth]);
  const load = useCallback(() => {
    api.hosts.list().then((l) => setHosts(l.filter((h) => inV(h, vault))));
    api.groups.list().then((l) => setGroups(l.filter((g) => inV(g, vault))));
  }, [vault]);
  useEffect(() => { load(); }, [load, rev]);
  useEffect(() => setCurrent(null), [vault]);

  const reorderHost = async (sourceId, targetId, pos = 'before') => {
    const currentHosts = [...hosts];
    const sIdx = currentHosts.findIndex((h) => h.id === sourceId);
    const tIdx = currentHosts.findIndex((h) => h.id === targetId);
    if (sIdx === -1 || tIdx === -1) return;

    const [moved] = currentHosts.splice(sIdx, 1);
    const newTIdx = currentHosts.findIndex((h) => h.id === targetId);
    const insertIdx = pos === 'after' ? newTIdx + 1 : newTIdx;
    currentHosts.splice(insertIdx, 0, moved);

    setHosts(currentHosts);

    const ids = currentHosts.map((h) => h.id);
    await api.hosts.reorder(ids);
    load();
  };

  const reorderGroup = async (sourceId, targetId, pos = 'before') => {
    const currentGroups = [...groups];
    const sIdx = currentGroups.findIndex((g) => g.id === sourceId);
    const tIdx = currentGroups.findIndex((g) => g.id === targetId);
    if (sIdx === -1 || tIdx === -1) return;

    const [moved] = currentGroups.splice(sIdx, 1);
    const newTIdx = currentGroups.findIndex((g) => g.id === targetId);
    const insertIdx = pos === 'after' ? newTIdx + 1 : newTIdx;
    currentGroups.splice(insertIdx, 0, moved);

    setGroups(currentGroups);

    const ids = currentGroups.map((g) => g.id);
    await api.groups.reorder(ids);
    load();
  };

  const onDragStartHost = (e, h) => {
    e.dataTransfer.setData('text/plain', h.id);
    e.dataTransfer.setData('application/x-deck-host', h.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedHost(h);
  };

  const onDragStartGroup = (e, g) => {
    e.dataTransfer.setData('text/plain', g.id);
    e.dataTransfer.setData('application/x-deck-group', g.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedGroup(g);
  };

  const onDragOverHost = (e, targetH) => {
    if (!draggedHost || draggedHost.id === targetH.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const pos = e.clientX < midX ? 'before' : 'after';
    if (dropTarget?.id !== targetH.id || dropTarget?.pos !== pos) {
      setDropTarget({ id: targetH.id, pos });
    }
  };

  const onDragLeaveHost = (e, targetH) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    if (dropTarget?.id === targetH.id) {
      setDropTarget(null);
    }
  };

  const onDropHost = async (e, targetH) => {
    e.preventDefault();
    const sId = draggedHost?.id || e.dataTransfer.getData('application/x-deck-host');
    const pos = dropTarget?.pos || 'before';
    setDraggedHost(null);
    setDropTarget(null);
    setDragOverGroup(null);
    if (!sId || sId === targetH.id) return;
    await reorderHost(sId, targetH.id, pos);
  };

  const onDragEnd = () => {
    setDraggedHost(null);
    setDropTarget(null);
    setDraggedGroup(null);
    setGroupDropTarget(null);
    setDragOverGroup(null);
    setDragOverBreadcrumb(false);
  };

  const onDragOverGroupCard = (e, g) => {
    if (draggedGroup && draggedGroup.id !== g.id) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = e.currentTarget.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const pos = e.clientX < midX ? 'before' : 'after';
      if (groupDropTarget?.id !== g.id || groupDropTarget?.pos !== pos) {
        setGroupDropTarget({ id: g.id, pos });
      }
      return;
    }
    if (draggedHost) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragOverGroup !== g.id) setDragOverGroup(g.id);
    }
  };

  const onDragLeaveGroupCard = (e, g) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    if (groupDropTarget?.id === g.id) setGroupDropTarget(null);
    if (dragOverGroup === g.id) setDragOverGroup(null);
  };

  const onDropGroupCard = async (e, g) => {
    e.preventDefault();
    if (draggedGroup) {
      const sId = draggedGroup.id;
      const pos = groupDropTarget?.pos || 'before';
      setDraggedGroup(null);
      setGroupDropTarget(null);
      if (sId && sId !== g.id) {
        await reorderGroup(sId, g.id, pos);
      }
      return;
    }
    const sId = draggedHost?.id || e.dataTransfer.getData('application/x-deck-host');
    setDraggedHost(null);
    setDropTarget(null);
    setDragOverGroup(null);
    if (!sId) return;
    const h = hosts.find((x) => x.id === sId);
    if (h && h.group !== g.name) {
      await api.hosts.save({ ...h, group: g.name });
      toast(t('Host „{host}“ in Gruppe „{group}“ verschoben.', { host: h.name, group: g.name }));
      load();
    }
  };

  const edit = async (h = { port: 22, group: current ?? '', vault }) => {
    const values = h.id ? { ...h, ...(await api.hosts.get(h.id)) } : h;
    openHost({
      values, groups: await api.groups.list(), keys: await api.keys.list(), vaults,
      onSave: async (o) => { const id = await api.hosts.save(o); load(); return id; },
      onConnect: connect,
      onDelete: async (id) => { await api.hosts.remove(id); load(); },
    });
  };
  const [groupDialog, setGroupDialog] = useState(null); // { open: true, group: null | g }
  const newGroup = () => setGroupDialog({ open: true, group: null });
  const editGroup = (g) => setGroupDialog({ open: true, group: g });
  const handleSaveGroup = async (g) => {
    let err;
    if (g.id) {
      err = await api.groups.save(g);
      if (!err && current === groupDialog?.group?.name && g.name !== groupDialog?.group?.name) {
        setCurrent(g.name);
      }
    } else {
      err = await api.groups.create(g.name, vault, { color: g.color, icon: g.icon, customLogo: g.customLogo });
    }
    if (err) return err;
    load();
    return null;
  };
  const removeGroup = async (g) => {
    if (!confirm(t('Gruppe „{name}“ löschen? Die Hosts bleiben erhalten.', { name: g.name }))) return;
    await api.groups.remove(g.id);
    if (current === g.name) setCurrent(null);
    load();
  };

  // Klonen / in einen anderen Tresor klonen oder verschieben
  const copyTo = async (h, target, move) => {
    const r = await api.hosts.copy(h.id, target, move, !move && target === vault ? `${h.name} (${t('Kopie')})` : undefined);
    if (r.error) return toast(r.error);
    toast((move ? t('Host verschoben.') : t('Host geklont.')) + (r.keyDropped ? ` ${t('Der Schlüssel gehört zu seinem Tresor und wurde nicht mitgenommen.')}` : ''));
    load();
  };
  // Favorit umschalten, SSH-Befehl kopieren, als ~/.ssh/config exportieren
  const toggleFav = async (h) => { await api.hosts.save({ ...h, fav: !h.fav }); load(); };
  const copyCmd = async (h) => { await navigator.clipboard.writeText(sshCommand(h)); toast(t('SSH-Befehl kopiert.')); };
  const copyConfig = async (h) => { await navigator.clipboard.writeText(sshConfig([h])); toast(t('SSH-Config kopiert.')); };
  const exportConfig = async (list, name) => {
    if (!list.length) return toast(t('Keine Hosts zum Exportieren.'));
    const err = await api.saveText(name, sshConfig(list));
    if (err) toast(err);
  };
  const hostMenu = (h) => {
    const others = vaults.filter((x) => x.id !== vault);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label={t('Mehr')} onClick={(e) => e.stopPropagation()}><Ellipsis className="size-3.5" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => copyCmd(h)}><Copy className="size-4" />{t('SSH-Befehl kopieren')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => copyConfig(h)}><FileText className="size-4" />{t('Als SSH-Config exportieren')}</DropdownMenuItem>
          {showHealth && (
            <DropdownMenuItem onSelect={async () => {
              try {
                const r = await api.hosts.ping(h);
                if (r) setHealthMap((prev) => ({ ...prev, [h.id]: r }));
              } catch { /* egal */ }
            }}>
              <RefreshCw className="size-4" />{t('Status aktualisieren')}
            </DropdownMenuItem>
          )}
          {writable && <DropdownMenuItem onSelect={() => copyTo(h, vault, false)}><Copy className="size-4" />{t('Klonen')}</DropdownMenuItem>}
          {others.length > 0 && <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">{t('In Tresor klonen')}</DropdownMenuLabel>
            {others.map((x) => <DropdownMenuItem key={`c${x.id}`} onSelect={() => copyTo(h, x.id, false)}>{x.id === 'personal' ? <User className="size-4" /> : <Users className="size-4" />}{x.name}</DropdownMenuItem>)}
            {writable && <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">{t('In Tresor verschieben')}</DropdownMenuLabel>
              {others.map((x) => <DropdownMenuItem key={`m${x.id}`} onSelect={() => copyTo(h, x.id, true)}>{x.id === 'personal' ? <User className="size-4" /> : <Users className="size-4" />}{x.name}</DropdownMenuItem>)}
            </>}
          </>}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };
  const hostCard = (h) => {
    const isDragging = draggedHost?.id === h.id;
    const isTarget = dropTarget?.id === h.id;
    const canDrag = writable && !searching && !mobile;
    const health = showHealth ? healthMap[h.id] : null;

    return (
      <Item
        key={h.id}
        dark={dark}
        leading={
          canDrag ? (
            <div
              className="drag-handle -ml-1 mr-0.5 flex shrink-0 cursor-grab items-center text-muted-foreground/35 transition-colors hover:text-foreground active:cursor-grabbing"
              title={t('Ziehen zum Sortieren')}
            >
              <GripVertical className="size-4" />
            </div>
          ) : null
        }
        draggable={canDrag}
        onDragStart={(e) => onDragStartHost(e, h)}
        onDragOver={(e) => onDragOverHost(e, h)}
        onDragLeave={(e) => onDragLeaveHost(e, h)}
        onDrop={(e) => onDropHost(e, h)}
        onDragEnd={onDragEnd}
        className={cn(
          'transition-all duration-150',
          isDragging && 'opacity-35 scale-[0.98] border-dashed',
          isTarget && 'ring-2 ring-primary border-primary bg-primary/5 shadow-md scale-[1.01]',
        )}
        icon={<HostIcon slug={h.icon || h.autoIcon} />}
        sub={
          <span className="flex items-center justify-between gap-2">
            <span className="truncate">{h.protocol === 'telnet' ? `telnet://${h.host}:${h.port}` : `${h.user}@${h.host}:${h.port}`}</span>
            {showHealth && (
              health ? (
                health.online ? (
                  <span
                    className="inline-flex shrink-0 items-center gap-1.5 text-xs font-mono font-medium text-emerald-600 dark:text-emerald-400"
                    title={t('Online ({ms} ms)', { ms: health.ms ?? 0 })}
                  >
                    <span className={cn('size-2 rounded-full', (health.ms ?? 999) < 120 ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]')} />
                    <span>{health.ms}ms</span>
                  </span>
                ) : (
                  <span
                    className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400"
                    title={health.error || t('Offline')}
                  >
                    <span className="size-2 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.5)]" />
                    <span>{health.error === 'ETIMEDOUT' ? t('Timeout') : t('Offline')}</span>
                  </span>
                )
              ) : pinging ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground/60">
                  <span className="size-2 rounded-full bg-muted-foreground/40 animate-pulse" />
                  <span>{t('Wird geprüft …')}</span>
                </span>
              ) : null
            )}
          </span>
        }
        title={<span className="flex items-center gap-2">
          {h.name}
          {!current && h.group && (() => {
            const grp = groups.find((g) => g.name === h.group);
            return (
              <span
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium border"
                style={{
                  backgroundColor: grp?.color ? `${grp.color}15` : 'var(--muted)',
                  borderColor: grp?.color ? `${grp.color}35` : 'transparent',
                  color: grp?.color || 'inherit',
                }}
              >
                {grp && <GroupIcon group={grp} className="size-3 shrink-0" />}
                <span className="max-w-24 truncate">{h.group}</span>
              </span>
            );
          })()}
          {(h.tags || []).slice(0, 2).map((tg) => <Badge key={tg} variant="secondary" className="px-1.5 py-0 text-xs">{tg}</Badge>)}
        </span>}
        onClick={() => connect(h)}
        actions={<>{h.protocol !== 'telnet' && <IconButton label="SFTP" onClick={() => openSftp(h)}><FolderOpen className="size-3.5" /></IconButton>}
          {hostMenu(h)}
          {writable && <><IconButton label={t('Favorit')} onClick={() => toggleFav(h)}><Star className={cn('size-3.5', h.fav && 'fill-current text-primary')} /></IconButton><IconButton label={t('Bearbeiten')} onClick={() => edit(h)}><Pencil className="size-3.5" /></IconButton>
          <IconButton label={t('Löschen')} onClick={async () => { await api.hosts.remove(h.id); load(); }}><Trash2 className="size-3.5" /></IconButton></>}</>}
      />
    );
  };
  const grid = (kids) => <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">{kids}</div>;
  const heading = (text) => <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{text}</h3>;

  const searching = q.trim() !== '';
  const found = hosts.filter((h) => matches(q, h.name, h.host, h.user, h.group, (h.tags || []).join(' ')));
  const inGroup = hosts.filter((h) => h.group === current);
  const currentGroup = current !== null ? groups.find((g) => g.name === current) : null;
  const favs = hosts.filter((h) => h.fav);
  const lastUsed = hosts.filter((h) => !h.fav && h.lastUsed).sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 5);
  const ungrouped = hosts.filter((h) => !h.group || !groups.some((g) => g.name === h.group));

  return (
    <>
      <div className="mtool mb-6 flex gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('Suchen …')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {showHealth && (
          <Button variant="outline" size="icon" title={t('Status aktualisieren')} onClick={() => refreshHealth(hosts)} disabled={pinging}>
            <RefreshCw className={cn('size-4', pinging && 'animate-spin')} />
          </Button>
        )}
        {!mobile && <Button variant="outline" onClick={() => exportConfig(current !== null ? inGroup : hosts, 'ssh_config')}><FileText className="size-4" />{t('Als SSH-Config exportieren')}</Button>}
        {writable && <>
        {!mobile && <Button variant="outline" onClick={() => setImportOpen(true)}><Download className="size-4" />{t('Importieren')}</Button>}
        <Button variant="outline" onClick={newGroup}><FolderPlus className="size-4" />{t('Neue Gruppe')}</Button>
        <Button onClick={() => edit()}><Plus className="size-4" />{t('Neuer Host')}</Button></>}
      </div>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onDone={load} toast={toast} vault={vault} />
      <GroupDialog
        open={!!groupDialog}
        group={groupDialog?.group}
        serverCount={groupDialog?.group ? hosts.filter((h) => h.group === groupDialog.group.name).length : 0}
        onClose={() => setGroupDialog(null)}
        onSave={handleSaveGroup}
      />
      {searching ? (
        <>{!found.length && <Empty>{t('Keine Treffer.')}</Empty>}{grid(found.map(hostCard))}</>
      ) : current !== null ? (
        <>
          <div className="mb-4 flex items-center justify-between gap-2">
            <button
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-all hover:text-foreground',
                dragOverBreadcrumb && 'bg-primary/15 text-primary ring-2 ring-primary',
              )}
              onClick={() => setCurrent(null)}
              onDragOver={(e) => {
                if (draggedHost) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverBreadcrumb(true);
                }
              }}
              onDragLeave={() => setDragOverBreadcrumb(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setDragOverBreadcrumb(false);
                const sId = draggedHost?.id || e.dataTransfer.getData('application/x-deck-host');
                setDraggedHost(null);
                if (!sId) return;
                const h = hosts.find((x) => x.id === sId);
                if (h && h.group) {
                  await api.hosts.save({ ...h, group: '' });
                  toast(t('Host „{host}“ aus Gruppe entfernt.', { host: h.name }));
                  load();
                }
              }}
            >
              <ChevronLeft className="size-4" />{t('Alle Hosts')}<span className="mx-1">/</span>
              {currentGroup && (
                <div
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-md border mr-1 overflow-hidden"
                  style={{
                    backgroundColor: currentGroup.color ? `${currentGroup.color}20` : 'var(--secondary)',
                    borderColor: currentGroup.color ? `${currentGroup.color}44` : 'transparent',
                  }}
                >
                  <GroupIcon group={currentGroup} className="size-3.5" />
                </div>
              )}
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                {current}
                {currentGroup?.color && <span className="size-2 rounded-full inline-block" style={{ backgroundColor: currentGroup.color }} />}
              </span>
            </button>
            {writable && currentGroup && (
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => editGroup(currentGroup)}>
                <Pencil className="size-3.5" />{t('Gruppe bearbeiten')}
              </Button>
            )}
          </div>
          {!inGroup.length && <Empty>{t('Diese Gruppe ist leer. Weise einem Host über „Bearbeiten“ diese Gruppe zu.')}</Empty>}
          {grid(inGroup.map(hostCard))}
        </>
      ) : (
        <>
          {favs.length > 0 && <section className="mb-8">{heading(t('Favoriten'))}{grid(favs.map(hostCard))}</section>}
          {lastUsed.length > 0 && <section className="mb-8">{heading(t('Zuletzt verwendet'))}{grid(lastUsed.map(hostCard))}</section>}
          {groups.length > 0 && (
            <section className="mb-8">
              {heading(t('Gruppen'))}
              {grid(groups.map((g) => {
                const n = hosts.filter((h) => h.group === g.name).length;
                const isGroupDragging = draggedGroup?.id === g.id;
                const isGroupTarget = groupDropTarget?.id === g.id;
                const canDragGroup = writable && !searching && !mobile;
                return (
                  <Item
                    key={g.id}
                    dark={dark}
                    leading={
                      canDragGroup ? (
                        <div
                          className="drag-handle -ml-1 mr-0.5 flex shrink-0 cursor-grab items-center text-muted-foreground/35 transition-colors hover:text-foreground active:cursor-grabbing"
                          title={t('Ziehen zum Sortieren')}
                        >
                          <GripVertical className="size-4" />
                        </div>
                      ) : null
                    }
                    draggable={canDragGroup}
                    onDragStart={(e) => onDragStartGroup(e, g)}
                    onDragOver={(e) => onDragOverGroupCard(e, g)}
                    onDragLeave={(e) => onDragLeaveGroupCard(e, g)}
                    onDrop={(e) => onDropGroupCard(e, g)}
                    onDragEnd={onDragEnd}
                    icon={<GroupIcon group={g} className="size-7" />}
                    iconStyle={g.color ? {
                      backgroundColor: `${g.color}18`,
                      borderColor: `${g.color}44`,
                      borderWidth: 1,
                    } : undefined}
                    title={<span className="flex items-center gap-2">
                      <span>{g.name}</span>
                      {g.color && <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />}
                    </span>}
                    sub={t('{n} Server', { n })}
                    onClick={() => setCurrent(g.name)}
                    className={cn(
                      'transition-all duration-150',
                      isGroupDragging && 'opacity-35 scale-[0.98] border-dashed',
                      isGroupTarget && 'ring-2 ring-primary border-primary bg-primary/5 shadow-md scale-[1.01]',
                      dragOverGroup === g.id && 'ring-2 ring-primary bg-primary/10 border-primary scale-[1.02]',
                    )}
                    actions={<>{!mobile && <IconButton label={t('Als SSH-Config exportieren')} onClick={() => exportConfig(hosts.filter((h) => h.group === g.name), g.name)}><FileText className="size-3.5" /></IconButton>}
                      {writable && <><IconButton label={t('Bearbeiten')} onClick={() => editGroup(g)}><Pencil className="size-3.5" /></IconButton>
                      <IconButton label={t('Gruppe löschen')} onClick={() => removeGroup(g)}><Trash2 className="size-3.5" /></IconButton></>}</>}
                  />
                );
              }))}
            </section>
          )}
          {!hosts.length && !groups.length && <Empty>{t('Keine Hosts. Mit „Neuer Host“ anlegen.')}</Empty>}
          {ungrouped.length > 0 && <section>{heading(groups.length ? t('Ohne Gruppe') : t('Hosts'))}{grid(ungrouped.map(hostCard))}</section>}
        </>
      )}
    </>
  );
}

export default HostsView;
