// Jump-Hosts: Kette auflösen und Schleifen erkennen. Reine Logik, kein Electron.
const MAX_JUMPS = 3;

// Liefert die Zwischenstationen von h, außen (zuerst verbunden) nach innen. get(id) -> Host | undefined.
function chain(get, h) {
  const out = [], seen = new Set([h.id]);
  for (let cur = h; cur.jumpId;) {
    if (seen.has(cur.jumpId)) throw new Error('Jump-Host-Schleife');
    const next = get(cur.jumpId);
    if (!next) throw new Error('Jump-Host nicht gefunden');
    if (next.protocol === 'telnet') throw new Error('Telnet-Host kann kein Jump-Host sein');
    if (out.length >= MAX_JUMPS) throw new Error('Zu viele Jump-Hosts (max. 3)');
    seen.add(next.id);
    out.unshift(next);
    cur = next;
  }
  return out;
}

// Hosts, die selfId als Jump-Host wählen darf (keine Schleife, Tiefe ok, kein Telnet)
function candidates(list, selfId) {
  const get = (id) => list.find((x) => x.id === id);
  return list.filter((c) => {
    if (c.id === selfId) return false;
    try { chain(get, { id: selfId, jumpId: c.id }); return true; } catch { return false; }
  });
}

module.exports = { chain, candidates, MAX_JUMPS };
