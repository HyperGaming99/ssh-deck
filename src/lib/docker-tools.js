// Docker Tools: Hilfsfunktionen zur Verwaltung von Containern, Images, Volumes und Netzwerken
// über lokale Befehle oder SSH-Verbindungen (unterstützt docker und podman).

const DOCKER_PREFIX = 'D="docker"; if ! command -v docker >/dev/null 2>&1 && command -v podman >/dev/null 2>&1; then D="podman"; fi; ';

function overviewCmd() {
  return DOCKER_PREFIX + [
    '$D ps -a --format \'{{json .}}\' 2>/dev/null || true',
    'echo "---DOCKER---"',
    '$D images --format \'{{json .}}\' 2>/dev/null || true',
    'echo "---DOCKER---"',
    '$D volume ls --format \'{{json .}}\' 2>/dev/null || true',
    'echo "---DOCKER---"',
    '$D network ls --format \'{{json .}}\' 2>/dev/null || true',
    'echo "---DOCKER---"',
    '$D stats --no-stream --format \'{{json .}}\' 2>/dev/null || true',
    'echo "---DOCKER---"',
    '$D info --format \'{{json .}}\' 2>/dev/null || echo \'{}\'',
  ].join('; ');
}

function parseLines(str) {
  if (!str) return [];
  const lines = str.trim().split('\n');
  const items = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      items.push(JSON.parse(trimmed));
    } catch {
      /* ignore invalid lines */
    }
  }
  return items;
}

function parseOverview(stdout) {
  if (!stdout || !stdout.includes('---DOCKER---')) return null;
  const parts = stdout.split(/---DOCKER---/);

  const rawContainers = parseLines(parts[0]);
  const rawImages = parseLines(parts[1]);
  const rawVolumes = parseLines(parts[2]);
  const rawNetworks = parseLines(parts[3]);
  const rawStats = parseLines(parts[4]);
  let info = {};
  try {
    info = JSON.parse(parts[5]?.trim() || '{}');
  } catch {
    info = {};
  }

  const statsMap = new Map();
  for (const s of rawStats) {
    if (s.ID) statsMap.set(s.ID, s);
    if (s.Name) statsMap.set(s.Name, s);
    if (s.Container) statsMap.set(s.Container, s);
  }

  const containers = rawContainers.map((c) => {
    const stats = statsMap.get(c.ID) || statsMap.get(c.Names) || null;
    const isRunning = (c.State || '').toLowerCase() === 'running';
    const isPaused = (c.State || '').toLowerCase() === 'paused';
    return {
      id: c.ID || '',
      name: (c.Names || '').replace(/^\//, ''),
      image: c.Image || '',
      state: c.State || 'unknown',
      status: c.Status || '',
      running: isRunning,
      paused: isPaused,
      ports: c.Ports || '',
      created: c.CreatedAt || c.RunningFor || '',
      size: c.Size || '',
      command: c.Command || '',
      cpu: stats?.CPUPerc || null,
      memory: stats?.MemUsage || null,
      memPct: stats?.MemPerc || null,
      netIO: stats?.NetIO || null,
      pids: stats?.PIDs || null,
    };
  });

  const images = rawImages.map((i) => ({
    id: (i.ID || '').replace(/^sha256:/, '').slice(0, 12),
    repository: i.Repository || '<none>',
    tag: i.Tag || '<none>',
    size: i.Size || '-',
    created: i.CreatedAt || i.CreatedSince || '-',
    digest: i.Digest || '',
  }));

  const volumes = rawVolumes.map((v) => ({
    name: v.Name || '',
    driver: v.Driver || 'local',
    mountpoint: v.Mountpoint || '',
    scope: v.Scope || 'local',
  }));

  const networks = rawNetworks.map((n) => ({
    id: (n.ID || '').slice(0, 12),
    name: n.Name || '',
    driver: n.Driver || 'bridge',
    scope: n.Scope || 'local',
    ipv6: n.IPv6 === 'true',
    internal: n.Internal === 'true',
  }));

  return {
    containers,
    images,
    volumes,
    networks,
    info: {
      serverVersion: info.ServerVersion || '',
      operatingSystem: info.OperatingSystem || '',
      arch: info.Architecture || '',
      cpus: info.NCPU || 0,
      totalMemory: info.MemTotal ? Math.round(info.MemTotal / (1024 * 1024)) : 0,
    },
  };
}

function startCmd({ id }) {
  const safeId = String(id || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  return `${DOCKER_PREFIX}$D start ${safeId}`;
}

function stopCmd({ id }) {
  const safeId = String(id || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  return `${DOCKER_PREFIX}$D stop ${safeId}`;
}

function restartCmd({ id }) {
  const safeId = String(id || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  return `${DOCKER_PREFIX}$D restart ${safeId}`;
}

function pauseCmd({ id }) {
  const safeId = String(id || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  return `${DOCKER_PREFIX}$D pause ${safeId}`;
}

function unpauseCmd({ id }) {
  const safeId = String(id || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  return `${DOCKER_PREFIX}$D unpause ${safeId}`;
}

function removeCmd({ id, force = false }) {
  const safeId = String(id || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  return `${DOCKER_PREFIX}$D rm ${force ? '-f ' : ''}${safeId}`;
}

function logsCmd({ id, tail = 200 }) {
  const safeId = String(id || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  return `${DOCKER_PREFIX}$D logs --tail=${Number(tail) || 200} ${safeId}`;
}

function inspectCmd({ id }) {
  const safeId = String(id || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  return `${DOCKER_PREFIX}$D inspect ${safeId}`;
}

function runCmd({ name, image, ports, env, restart = 'always', volumes }) {
  const safeImg = String(image || '').trim().replace(/[^\w.:/@-]/g, '');
  const args = ['-d'];
  if (name && name.trim()) {
    const safeName = name.trim().replace(/[^a-zA-Z0-9_.-]/g, '');
    args.push(`--name ${safeName}`);
  }
  if (restart) {
    const safeRestart = ['no', 'always', 'on-failure', 'unless-stopped'].includes(restart) ? restart : 'always';
    args.push(`--restart ${safeRestart}`);
  }
  if (ports && typeof ports === 'string') {
    ports.split(',').map((p) => p.trim()).filter(Boolean).forEach((p) => {
      const safeP = p.replace(/[^0-9:\/]/g, '');
      if (safeP) args.push(`-p ${safeP}`);
    });
  }
  if (env && typeof env === 'string') {
    env.split('\n').map((e) => e.trim()).filter(Boolean).forEach((e) => {
      const parts = e.split('=');
      if (parts.length >= 2) {
        const k = parts[0].trim().replace(/[^a-zA-Z0-9_]/g, '');
        const v = parts.slice(1).join('=').trim().replace(/"/g, '\\"');
        if (k) args.push(`-e "${k}=${v}"`);
      }
    });
  }
  if (volumes && typeof volumes === 'string') {
    volumes.split(',').map((v) => v.trim()).filter(Boolean).forEach((v) => {
      const safeV = v.replace(/[^a-zA-Z0-9_./:-]/g, '');
      if (safeV) args.push(`-v ${safeV}`);
    });
  }
  return `${DOCKER_PREFIX}$D run ${args.join(' ')} ${safeImg}`;
}

function pullCmd({ image }) {
  const safeImg = String(image || '').trim().replace(/[^\w.:/@-]/g, '');
  return `${DOCKER_PREFIX}$D pull ${safeImg}`;
}

function removeImageCmd({ id, force = false }) {
  const safeId = String(id || '').replace(/[^a-zA-Z0-9_.:/-]/g, '');
  return `${DOCKER_PREFIX}$D rmi ${force ? '-f ' : ''}${safeId}`;
}

function removeVolumeCmd({ name }) {
  const safeName = String(name || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  return `${DOCKER_PREFIX}$D volume rm ${safeName}`;
}

function removeNetworkCmd({ id }) {
  const safeId = String(id || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  return `${DOCKER_PREFIX}$D network rm ${safeId}`;
}

function pruneCmd({ type = 'system' }) {
  if (type === 'containers') return `${DOCKER_PREFIX}$D container prune -f`;
  if (type === 'images') return `${DOCKER_PREFIX}$D image prune -f`;
  if (type === 'volumes') return `${DOCKER_PREFIX}$D volume prune -f`;
  if (type === 'networks') return `${DOCKER_PREFIX}$D network prune -f`;
  return `${DOCKER_PREFIX}$D system prune -f`;
}

export {
  overviewCmd,
  parseOverview,
  startCmd,
  stopCmd,
  restartCmd,
  pauseCmd,
  unpauseCmd,
  removeCmd,
  logsCmd,
  inspectCmd,
  runCmd,
  pullCmd,
  removeImageCmd,
  removeVolumeCmd,
  removeNetworkCmd,
  pruneCmd,
};
