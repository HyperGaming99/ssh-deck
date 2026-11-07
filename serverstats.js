// Server-Status (nur Linux): ein Befehl, Ausgabe in Blöcken durch "---" getrennt, und ein reiner Parser dafür.
const CMD = "cat /proc/loadavg; echo ---; nproc; echo ---; cat /proc/meminfo; echo ---; df -P /; echo ---; cat /proc/uptime; echo ---; docker ps -a --format '{{.Names}}\\t{{.State}}\\t{{.Status}}\\t{{.Image}}' 2>/dev/null || true; echo ---; (kubectl get pods -A --request-timeout=2s --no-headers -o custom-columns='NS:.metadata.namespace,NAME:.metadata.name,PHASE:.status.phase,IMAGE:.spec.containers[0].image' 2>/dev/null || k3s kubectl get pods -A --request-timeout=2s --no-headers -o custom-columns='NS:.metadata.namespace,NAME:.metadata.name,PHASE:.status.phase,IMAGE:.spec.containers[0].image' 2>/dev/null || true)";

// Rückgabe { load, cores, memTotal, memUsed, diskTotal, diskUsed, diskPct, uptime, containers, pods } (Bytes/Sekunden) oder null, wenn nicht lesbar
function parse(out) {
  const [la, nproc, mem, df, up, dk, k8s] = String(out).split(/^---$/m).map((s) => s.trim());
  const load = la?.split(/\s+/).slice(0, 3).map(Number);
  const m = (k) => Number(mem?.match(new RegExp(`^${k}:\\s+(\\d+)`, 'm'))?.[1]) * 1024;
  const d = df?.split('\n')[1]?.trim().split(/\s+/); // Dateisystem 1K-Blöcke Benutzt Verfügbar Kapazität Eingehängt
  const containers = dk
    ? dk.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [name = '', state = '', status = '', image = ''] = l.split('\t');
      return { name, state, status, image };
    }).filter((c) => c.name)
    : [];
  const pods = k8s
    ? k8s.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [namespace = '', name = '', phase = '', image = ''] = l.split(/\s+/);
      return { namespace, name, phase, image };
    }).filter((p) => p.name)
    : [];
  const r = {
    load, cores: Number(nproc) || 1,
    memTotal: m('MemTotal'), memUsed: m('MemTotal') - m('MemAvailable'),
    diskTotal: Number(d?.[1]) * 1024, diskUsed: Number(d?.[2]) * 1024, diskPct: parseInt(d?.[4]),
    uptime: Number(up?.split(/\s+/)[0]),
    containers,
    pods,
  };
  const nums = [...(load || []), r.memTotal, r.memUsed, r.diskTotal, r.diskUsed, r.diskPct, r.uptime];
  return load?.length === 3 && nums.every(Number.isFinite) ? r : null;
}

module.exports = { CMD, parse };
