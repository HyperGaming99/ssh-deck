// Zeitleiste des Trailers – einzige Quelle für Bühne (stage.html), Soundeffekte (sfx.js) und Musik-Platzhalter (audio.js).
// Alles ist in Takten (bars) geplant und richtet sich nach dem Tempo (bpm) der Musik: Flüge landen auf Taktanfängen.
(function (root) {
  function buildTimeline(bpm = 100) {
    const bar = 240 / bpm; // 4 Schläge
    const T = (bars) => bars * bar;

    // Alle App-Bildschirme liegen als "Kacheln" auf einer großen Fläche; die Kamera fliegt zwischen ihnen (kein Schnitt).
    const TILES = {
      hosts: { x: 0, y: 0 }, term: { x: 2240, y: 200 }, sftp: { x: 4480, y: -140 },
      sec: { x: 6720, y: 160 }, set: { x: 8960, y: -100 }, lang: { x: 11200, y: 120 },
    };
    const W = (tile, x, y) => ({ x: TILES[tile].x + x, y: TILES[tile].y + y }); // Kachel- -> Weltkoordinaten

    // ---- Kamera: Halte-Punkte (Ankunft a, Abflug l) mit langsamer Annäherung dz; dazwischen Flüge ----
    const stops = [
      { id: 'intro', tile: 'hosts', f: [960, 540], z: 0.6, a: 0, l: T(1.9), dz: 0.05 },
      { id: 'hosts1', tile: 'hosts', f: [820, 500], z: 1.1, a: T(2.0), l: T(3.7), dz: 0.05 },
      { id: 'hosts2', tile: 'hosts', f: [1500, 640], z: 1.28, a: T(4.0), l: T(4.75), dz: 0.04 },
      { id: 'term', tile: 'term', f: [560, 330], z: 1.5, a: T(5.5), l: T(7.4), dz: 0.08 },
      { id: 'sftp', tile: 'sftp', f: [980, 560], z: 1.12, a: T(8.2), l: T(9.8), dz: 0.06 },
      { id: 'sec', tile: 'sec', f: [960, 620], z: 1.22, a: T(10.6), l: T(13.0), dz: 0.1 },
      { id: 'set', tile: 'set', f: [700, 470], z: 1.25, a: T(13.8), l: T(15.2), dz: 0.06 },
      { id: 'lang', tile: 'lang', f: [960, 600], z: 1.0, a: T(16.0), l: T(17.3), dz: 0.06 },
      { id: 'out', tile: 'set', f: [1900, 500], z: 0.27, a: T(18.6), l: T(20), dz: 0.02 },
    ].map((s) => ({ ...s, p: W(s.tile, s.f[0], s.f[1]) }));
    const duration = T(20);

    // ---- Untertitel (Label, Titelzeilen, Unterzeile) ----
    const caps = [
      { a: 2.15, b: 4.6, label: 'HOSTS', title: ['Every server,', 'neatly organized.'], sub: 'Groups, tags and the right icon for each system.' },
      { a: 5.65, b: 7.3, label: 'TERMINAL', title: ['A terminal that', 'just works.'], sub: 'Tabs, snippets and instant connections.' },
      { a: 8.35, b: 9.75, label: 'SFTP', title: ['Move files by', 'dragging them.'], sub: 'Even from one server to another.' },
      { a: 10.75, b: 12.95, label: 'SECURITY', title: ['Trust,', 'verified.'], sub: 'Host key checks, Keychain and Known hosts.' },
      { a: 13.95, b: 15.15, label: 'PRIVACY', title: ['Private', 'by design.'], sub: 'End-to-end encrypted sync. Optional Tor.' },
      { a: 16.1, b: 17.25, label: 'YOURS', title: ['Your language.', 'Your theme.'], sub: '16 languages, light and dark.' },
    ].map((c) => ({ ...c, a: T(c.a), b: T(c.b) }));

    // ---- Bildzustände je Kachel: später gestartete liegen oben und blenden über (kein Dip) ----
    const img = (tile, name, t0, fade = 0.5) => ({ tile, name, t0, fade });
    const images = [
      img('hosts', 'hosts', -9), img('hosts', 'group', T(3.0), 0.45),
      img('lang', 'langsetup', -9), img('lang', 'hosts_light', T(16.75), 0.7),
      img('sftp', 'sftp', -9), img('set', 'settings_account', -9), img('set', 'settings_privacy', T(14.5), 0.6),
      img('sec', 'keychain', -9), img('sec', 'known', T(11.4), 0.5),
    ];

    // ---- Terminal: feines Tippen (Zustände je 2 Zeichen) ----
    const k = Math.min(1, (l(stops, 'term') - stops.find((s) => s.id === 'term').a) / 4.6); // bei schnellem Tempo zusammenschieben
    function l(arr, id) { return arr.find((s) => s.id === id).l; }
    const t0 = stops.find((s) => s.id === 'term').a - 0.5; // Tippen beginnt kurz vor der Ankunft
    const term = [['ty0', -9]]; const keys = [];
    let tc = t0 + 0.9 * k;
    const type = (tag, steps, cps, outAt) => {
      const total = steps[steps.length - 1];
      for (const n of steps) { const tt = tc + (n / cps) * k; term.push([`${tag}_${n}`, tt]); }
      for (let c = 0; c < total; c++) keys.push(tc + (c / cps) * k);
      tc += (total / cps) * k;
      tc += outAt * k; term.push([`${tag}_out`, tc]); keys.push(tc - 0.25 * k);
    };
    type('ty1', [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22], 15, 0.4);
    tc += 0.5 * k;
    type('ty2', [2, 4, 6, 8, 9], 12, 0.35);
    tc += 0.45 * k;
    for (const n of [6, 12, 18, 24, 30, 33]) term.push([`ty3_${n}`, tc + (n / 40) * k]);
    for (let c = 0; c < 33; c++) keys.push(tc + (c / 40) * k);
    tc += (33 / 40) * k + 0.3 * k;
    for (let i = 1; i <= 5; i++) term.push([`ty3_l${i}`, tc + i * 0.3 * k]);
    term.forEach(([name, t], i) => images.push({ tile: 'term', name, t0: t, fade: i === 0 ? 0.01 : 0.05 }));

    // ---- Mauszeiger (Weltkoordinaten) ----
    const C = (t, tile, x, y, v = 1) => ({ t, ...W(tile, x, y), v });
    const cursor = [
      C(T(2.0), 'hosts', 1180, 820, 0), C(T(2.2), 'hosts', 1130, 780, 1), C(T(2.95), 'hosts', 300, 285, 1), C(T(3.35), 'hosts', 420, 520, 1),
      C(T(3.68), 'hosts', 770, 166, 1), C(T(4.1), 'hosts', 1500, 400, 1), C(T(4.55), 'hosts', 1722, 994, 1), C(T(4.75), 'hosts', 1760, 1040, 0),
      C(T(8.1), 'sftp', 200, 372, 0), C(T(8.3), 'sftp', 200, 372, 1), C(T(9.25), 'sftp', 1130, 340, 1), C(T(9.5), 'sftp', 1230, 420, 0),
    ];
    const clicks = [[T(2.95), 'hosts', 300, 285], [T(3.68), 'hosts', 770, 166], [T(4.55), 'hosts', 1722, 994], [T(9.25), 'sftp', 1130, 340]]
      .map(([t, tile, x, y]) => ({ t, ...W(tile, x, y) }));

    // ---- Overlays: Host-Panel schiebt herein, Dialoge poppen, Datei-Chip wird gezogen ----
    const panel = { t0: T(3.72), t1: T(4.3) };
    const dialogs = [{ t0: T(11.8), id: 'hostkey' }, { t0: T(12.35), id: 'hostkey_changed' }];
    const chip = { t0: T(8.35), t1: T(9.25), from: W('sftp', 150, 340), to: W('sftp', 1060, 300) };

    // ---- Soundeffekte (für sfx.js / audio.js) ----
    const flights = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const A = stops[i], B = stops[i + 1];
      if (A.tile === B.tile && Math.hypot(A.p.x - B.p.x, A.p.y - B.p.y) < 1200) continue; // kurze Schwenks bleiben still
      flights.push({ t0: A.l, t1: B.a });
    }
    const sfx = [
      ...flights.map((f) => ({ t: f.t0, kind: 'whoosh', dur: f.t1 - f.t0 })),
      ...flights.map((f) => ({ t: f.t1, kind: 'hit' })),
      ...clicks.map((c) => ({ t: c.t, kind: 'click' })),
      ...keys.map((t) => ({ t, kind: 'key' })),
      { t: panel.t0, kind: 'swish' }, ...dialogs.map((d) => ({ t: d.t0, kind: 'pop' })), { t: chip.t1, kind: 'thud' },
    ].sort((a, b) => a.t - b.t);

    return { bpm, bar, duration, TILES, stops, caps, images, cursor, clicks, panel, dialogs, chip, flights, sfx, T };
  }
  if (typeof module !== 'undefined') module.exports = { buildTimeline };
  else root.buildTimeline = buildTimeline;
})(typeof window !== 'undefined' ? window : globalThis);
