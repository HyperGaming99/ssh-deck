// Server-Status (nur Linux): ein Befehl, Ausgabe in Blöcken durch "---" getrennt, und ein reiner Parser dafür.
const CMD = 'cat /proc/loadavg; echo ---; nproc; echo ---; cat /proc/meminfo; echo ---; df -P /; echo ---; cat /proc/uptime';

// Rückgabe { load, cores, memTotal, memUsed, diskTotal, diskUsed, diskPct, uptime } (Bytes/Sekunden) oder null, wenn nicht lesbar
function parse(out) {
  const [la, nproc, mem, df, up] = String(out).split(/^---$/m).map((s) => s.trim());
  const load = la?.split(/\s+/).slice(0, 3).map(Number);
  const m = (k) => Number(mem?.match(new RegExp(`^${k}:\\s+(\\d+)`, 'm'))?.[1]) * 1024;
  const d = df?.split('\n')[1]?.trim().split(/\s+/); // Dateisystem 1K-Blöcke Benutzt Verfügbar Kapazität Eingehängt
  const r = {
    load, cores: Number(nproc) || 1,
    memTotal: m('MemTotal'), memUsed: m('MemTotal') - m('MemAvailable'),
    diskTotal: Number(d?.[1]) * 1024, diskUsed: Number(d?.[2]) * 1024, diskPct: parseInt(d?.[4]),
    uptime: Number(up?.split(/\s+/)[0]),
  };
  const nums = [...(load || []), r.memTotal, r.memUsed, r.diskTotal, r.diskUsed, r.diskPct, r.uptime];
  return load?.length === 3 && nums.every(Number.isFinite) ? r : null;
}

module.exports = { CMD, parse };
