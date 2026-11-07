// Server-Status (nur Linux): ein Befehl, Ausgabe in Blöcken durch "---" getrennt, und ein reiner Parser dafür.
const CMD = "cat /proc/loadavg; echo ---; nproc; echo ---; cat /proc/meminfo; echo ---; df -P /; echo ---; cat /proc/uptime; echo ---; docker ps -a --format '{{.Names}}\\t{{.State}}\\t{{.Status}}\\t{{.Image}}' 2>/dev/null || true";

// Rückgabe { load, cores, memTotal, memUsed, diskTotal, diskUsed, diskPct, uptime, containers } (Bytes/Sekunden) oder null, wenn nicht lesbar
function parse(out) {
  const [la, nproc, mem, df, up, dk] = String(out).split(/^---$/m).map((s) => s.trim());
  const load = la?.split(/\s+/).slice(0, 3).map(Number);
  const m = (k) => Number(mem?.match(new RegExp(`^${k}:\\s+(\\d+)`, 'm'))?.[1]) * 1024;
  const d = df?.split('\n')[1]?.trim().split(/\s+/); // Dateisystem 1K-Blöcke Benutzt Verfügbar Kapazität Eingehängt
  const containers = dk
    ? dk.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [name = '', state = '', status = '', image = ''] = l.split('\t');
      return { name, state, status, image };
    }).filter((c) => c.name)
    : [];
  const r = {
    load, cores: Number(nproc) || 1,
    memTotal: m('MemTotal'), memUsed: m('MemTotal') - m('MemAvailable'),
    diskTotal: Number(d?.[1]) * 1024, diskUsed: Number(d?.[2]) * 1024, diskPct: parseInt(d?.[4]),
    uptime: Number(up?.split(/\s+/)[0]),
    containers,
  };
  const nums = [...(load || []), r.memTotal, r.memUsed, r.diskTotal, r.diskUsed, r.diskPct, r.uptime];
  return load?.length === 3 && nums.every(Number.isFinite) ? r : null;
}

module.exports = { CMD, parse };
