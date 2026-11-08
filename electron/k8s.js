// Kubernetes Tools: Hilfsfunktionen zur Verwaltung von Nodes, Pods, Deployments und Services
// über lokale Befehle oder SSH-Verbindungen (unterstützt kubectl, k3s, microk8s).

const K8S_PREFIX = 'K="kubectl"; if ! command -v kubectl >/dev/null 2>&1; then if command -v k3s >/dev/null 2>&1; then K="k3s kubectl"; elif command -v microk8s >/dev/null 2>&1; then K="microk8s kubectl"; fi; fi; ';

function overviewCmd() {
  return K8S_PREFIX + [
    '$K get nodes -o json 2>/dev/null || echo \'{"items":[]}\'',
    'echo "---K8S---"',
    '$K get pods -A -o json 2>/dev/null || echo \'{"items":[]}\'',
    'echo "---K8S---"',
    '$K get deployments -A -o json 2>/dev/null || echo \'{"items":[]}\'',
    'echo "---K8S---"',
    '$K get services -A -o json 2>/dev/null || echo \'{"items":[]}\'',
    'echo "---K8S---"',
    '$K get namespaces -o json 2>/dev/null || echo \'{"items":[]}\'',
  ].join('; ');
}

function parseOverview(stdout) {
  if (!stdout || !stdout.includes('---K8S---')) return null;
  const parts = stdout.split(/---K8S---/);
  const parseJson = (s) => {
    try {
      return JSON.parse(s.trim());
    } catch {
      return { items: [] };
    }
  };

  const rawNodes = parseJson(parts[0])?.items || [];
  const rawPods = parseJson(parts[1])?.items || [];
  const rawDeps = parseJson(parts[2])?.items || [];
  const rawSvcs = parseJson(parts[3])?.items || [];
  const rawNs = parseJson(parts[4])?.items || [];

  const nodes = rawNodes.map((n) => {
    const readyCond = n.status?.conditions?.find((c) => c.type === 'Ready');
    const isReady = readyCond?.status === 'True';
    const labels = n.metadata?.labels || {};
    const roles = Object.keys(labels)
      .filter((k) => k.startsWith('node-role.kubernetes.io/'))
      .map((k) => k.replace('node-role.kubernetes.io/', ''))
      .filter(Boolean);
    const internalIp = n.status?.addresses?.find((a) => a.type === 'InternalIP')?.address || '-';
    return {
      name: n.metadata?.name || '',
      ready: isReady,
      status: isReady ? 'Ready' : (readyCond?.reason || 'NotReady'),
      roles: roles.length ? roles : ['worker'],
      version: n.status?.nodeInfo?.kubeletVersion || '-',
      osImage: n.status?.nodeInfo?.osImage || '-',
      arch: n.status?.nodeInfo?.architecture || '-',
      internalIp,
      created: n.metadata?.creationTimestamp,
    };
  });

  const pods = rawPods.map((p) => {
    const cStatuses = p.status?.containerStatuses || [];
    const restarts = cStatuses.reduce((acc, c) => acc + (c.restartCount || 0), 0);
    const readyCount = cStatuses.filter((c) => c.ready).length;
    const totalCount = p.spec?.containers?.length || 1;
    const img = p.spec?.containers?.[0]?.image || '-';
    return {
      name: p.metadata?.name || '',
      namespace: p.metadata?.namespace || 'default',
      phase: p.status?.phase || 'Unknown',
      ready: `${readyCount}/${totalCount}`,
      isReady: readyCount === totalCount && readyCount > 0,
      restarts,
      image: img,
      node: p.spec?.nodeName || '-',
      ip: p.status?.podIP || '-',
      created: p.metadata?.creationTimestamp,
    };
  });

  const deployments = rawDeps.map((d) => ({
    name: d.metadata?.name || '',
    namespace: d.metadata?.namespace || 'default',
    replicas: d.status?.replicas || 0,
    readyReplicas: d.status?.readyReplicas || 0,
    updatedReplicas: d.status?.updatedReplicas || 0,
    availableReplicas: d.status?.availableReplicas || 0,
    image: d.spec?.template?.spec?.containers?.[0]?.image || '-',
    created: d.metadata?.creationTimestamp,
  }));

  const services = rawSvcs.map((s) => {
    const ports = (s.spec?.ports || []).map((p) => `${p.port}${p.nodePort ? ':' + p.nodePort : ''}/${p.protocol || 'TCP'}`).join(', ');
    const extIp = s.status?.loadBalancer?.ingress?.[0]?.ip || s.spec?.externalIPs?.[0] || '-';
    return {
      name: s.metadata?.name || '',
      namespace: s.metadata?.namespace || 'default',
      type: s.spec?.type || 'ClusterIP',
      clusterIp: s.spec?.clusterIP || '-',
      externalIp: extIp,
      ports: ports || '-',
      created: s.metadata?.creationTimestamp,
    };
  });

  const namespaces = Array.from(new Set([
    'default',
    ...rawNs.map((ns) => ns.metadata?.name).filter(Boolean),
    ...pods.map((p) => p.namespace),
  ])).sort();

  return { nodes, pods, deployments, services, namespaces };
}

function runCmd({ name, image, namespace = 'default', port, type = 'pod' }) {
  const safeName = String(name || '').replace(/[^a-zA-Z0-9-]/g, '');
  const safeImg = String(image || '').replace(/[^\w.:/@-]/g, '');
  const safeNs = String(namespace || 'default').replace(/[^a-zA-Z0-9-]/g, '');
  const portArg = port ? ` --port=${Number(port)}` : '';
  if (type === 'deployment') {
    return `${K8S_PREFIX}$K create deployment ${safeName} --image=${safeImg} -n ${safeNs}${portArg}`;
  }
  return `${K8S_PREFIX}$K run ${safeName} --image=${safeImg} -n ${safeNs}${portArg}`;
}

function scaleCmd({ name, namespace = 'default', replicas = 1 }) {
  const safeName = String(name || '').replace(/[^a-zA-Z0-9-]/g, '');
  const safeNs = String(namespace || 'default').replace(/[^a-zA-Z0-9-]/g, '');
  return `${K8S_PREFIX}$K scale deployment ${safeName} -n ${safeNs} --replicas=${Number(replicas)}`;
}

function restartCmd({ name, namespace = 'default', type = 'deployment' }) {
  const safeName = String(name || '').replace(/[^a-zA-Z0-9-]/g, '');
  const safeNs = String(namespace || 'default').replace(/[^a-zA-Z0-9-]/g, '');
  const safeType = type === 'daemonset' ? 'daemonset' : type === 'statefulset' ? 'statefulset' : 'deployment';
  return `${K8S_PREFIX}$K rollout restart ${safeType}/${safeName} -n ${safeNs}`;
}

function deleteCmd({ kind = 'pod', name, namespace = 'default' }) {
  const safeKind = ['pod', 'deployment', 'service', 'daemonset', 'statefulset'].includes(kind) ? kind : 'pod';
  const safeName = String(name || '').replace(/[^a-zA-Z0-9-]/g, '');
  const safeNs = String(namespace || 'default').replace(/[^a-zA-Z0-9-]/g, '');
  return `${K8S_PREFIX}$K delete ${safeKind} ${safeName} -n ${safeNs}`;
}

function logsCmd({ name, namespace = 'default', tail = 200 }) {
  const safeName = String(name || '').replace(/[^a-zA-Z0-9-]/g, '');
  const safeNs = String(namespace || 'default').replace(/[^a-zA-Z0-9-]/g, '');
  return `${K8S_PREFIX}$K logs ${safeName} -n ${safeNs} --tail=${Number(tail) || 200}`;
}

function describeCmd({ kind = 'pod', name, namespace = 'default' }) {
  const safeKind = ['pod', 'node', 'deployment', 'service'].includes(kind) ? kind : 'pod';
  const safeName = String(name || '').replace(/[^a-zA-Z0-9-]/g, '');
  const safeNs = String(namespace || 'default').replace(/[^a-zA-Z0-9-]/g, '');
  return `${K8S_PREFIX}$K describe ${safeKind} ${safeName} -n ${safeNs}`;
}

module.exports = {
  overviewCmd,
  parseOverview,
  runCmd,
  scaleCmd,
  restartCmd,
  deleteCmd,
  logsCmd,
  describeCmd,
};
