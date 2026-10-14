// Zeitleiste des zweiten Trailers (Terminal + Themes). Einzige Quelle für Bühne (stage2.html) und Soundeffekte (sfx.js).
// Alles in Takten geplant (bpm der Musik); Positionen kommen aus layout.json (capture2.js).
(function (root) {
  function buildTimeline(bpm = 100) {
    const L = root.LAYOUT || require('./layout.json');
    const bar = 240 / bpm, T = (n) => n * bar, beat = bar / 4;
    const mid = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    const OUT = 26.8; // Takt des Abspanns
    const duration = T(OUT + 1.9);
    const TR = L.tour;

    // ---- Bildzustände (ein Fenster, spätere liegen oben und blenden über) ----
    const themeSeq = [ // [Takt, Theme] – ab 5.0 Schlag auf Schlag, im Finale jede Viertelnote
      [3.15, 'auto'], [5.0, 'tokyo'], [5.5, 'dracula'], [6.0, 'nord'], [6.5, 'gruvbox'], [6.75, 'solarl'], [7.0, 'hackerg'],
      [7.25, 'monokai'], [7.5, 'onedark'], [7.75, 'hackerb'], [8.0, 'tokyo'],
    ].map(([b, id]) => ({ t: T(b), id }));
    const NAMES = { auto: 'Automatic', tokyo: 'Tokyo Night', dracula: 'Dracula', nord: 'Nord', gruvbox: 'Gruvbox', solarl: 'Solarized Light', hackerg: 'Hacker Green', monokai: 'Monokai', onedark: 'One Dark', hackerb: 'Hacker Blue' };
    const layers = [
      { name: 'hosts', t0: -9, fade: .01 }, { name: 'c_log', t0: T(2.15), fade: .25 }, { name: 'c_hk', t0: T(2.5), fade: .3 },
      ...themeSeq.map((s) => ({ name: 'th_' + s.id, t0: s.t, fade: s.id === 'auto' ? .45 : .3 })),
      { name: 'font', t0: T(9.5), fade: .25 }, { name: 'p_snip', t0: T(11.2), fade: .22 }, { name: 'p_hist', t0: T(11.6), fade: .22 }, { name: 'p_fwd', t0: T(12.0), fade: .22 },
      { name: 'fw0', t0: T(12.35), fade: .3 }, { name: 'fw1', t0: T(13.0), fade: .2 }, { name: 'c_key', t0: T(13.5), fade: .4 },
      { name: 'hosts_all', t0: T(14.5), fade: .4 }, { name: 'sheet', t0: T(15.35), fade: .3 }, { name: 'import', t0: T(16.2), fade: .3 }, { name: 'newtab', t0: T(17.7), fade: .25 },
      { name: 'sftp', t0: T(18.8), fade: .35 }, { name: 'keychain', t0: T(20.2), fade: .35 }, { name: 'keychain_open', t0: T(20.75), fade: .2 }, { name: 'keychain', t0: T(21.2), fade: .2 },
      { name: 'known', t0: T(21.7), fade: .35 }, { name: 'set_privacy', t0: T(22.9), fade: .35 }, { name: 'set_lang', t0: T(24.3), fade: .3 }, { name: 'hosts_light', t0: T(25.5), fade: .3 },
    ];
    const overlay = { t0: T(3.2), t1: T(13.5) }; // gezeichnetes Terminal über dem Aufnahme-Fenster
    const dimAt = T(12.35); // Seitenblatt (Forwarding) dimmt auch das Terminal-Overlay

    // ---- Terminal: Befehle werden getippt ----
    const term = [{ t0: 3.4 * bar, cps: 22 }, { t0: 3.95 * bar, cps: 22 }, { t0: 4.45 * bar, cps: 26 }];
    const cmdLen = [6, 9, 25];
    const keys = []; term.forEach((c, i) => { for (let k = 0; k < cmdLen[i]; k++) keys.push(c.t0 + k / c.cps); });
    // Schrift wächst bei den Klicks auf "+"
    const fontClicks = [T(9.8), T(9.95), T(10.1)];

    // ---- Kamera: Haltepunkte, dazwischen weiche Bewegung ----
    const cam = [
      [0.9, 960, 540, 0.5], [1.9, 520, 340, 1.3], [2.5, 960, 380, 1.45], [3.0, 960, 400, 1.55], [3.45, 760, 465, 1.2],
      [4.6, 700, 400, 1.5], [5.0, 960, 600, 0.9], [7.9, 960, 600, 0.93], [8.6, 960, 560, 1.0],
      [9.4, 1700, 230, 1.65], [10.2, 1700, 250, 1.62], [10.6, 640, 300, 1.4], [11.0, 640, 300, 1.4], [11.2, 1710, 330, 1.55],
      [12.3, 1640, 400, 1.5], [13.2, 1580, 330, 1.45], [13.5, 960, 400, 1.5], [14.3, 960, 400, 1.38], [14.5, 960, 540, 1.0],
      [15.3, 1250, 420, 1.15], [16.1, 760, 330, 1.3], [16.5, 960, 540, 1.12], [17.55, 420, 150, 1.5], [17.9, 960, 430, 1.2], [18.7, 960, 540, 1.05], [19.0, 760, 400, 1.2], [19.8, 1220, 440, 1.2],
      [20.2, 960, 540, 1.05], [20.65, 1500, 260, 1.4], [21.4, 1400, 300, 1.3], [21.7, 960, 500, 1.1], [22.8, 700, 380, 1.25], [23.4, 960, 540, 1.1], [24.2, 800, 400, 1.2], [24.9, 960, 540, 1.08],
      [25.35, 1550, 120, 1.6], [25.9, 960, 540, 1.0], [OUT - 0.2, 960, 540, 0.62],
    ].map(([b, x, y, z]) => ({ t: T(b), x, y, z }));

    // ---- Mauszeiger (Bildschirmkoordinaten des Fensters) ----
    const C = (b, p, v = 1) => ({ t: T(b), x: p.x, y: p.y, v });
    const cur = [C(1.5, { x: 1400, y: 820 }, 0), C(1.7, { x: 1250, y: 700 }, 1), C(2.05, mid(L.hostCard)), C(2.5, { x: 1180, y: 620 }), C(3.0, mid(L.hkAdd)), C(3.5, { x: 1300, y: 700 }, 1)];
    const clicks = [[2.05, mid(L.hostCard)], [3.0, mid(L.hkAdd)]];
    const row = (id) => ({ x: mid(L.rows[id]).x - 40, y: mid(L.rows[id]).y });
    cur.push(C(4.8, { x: 1500, y: 650 }, 1));
    themeSeq.slice(1).forEach((s) => { const p = row(s.id); cur.push({ t: s.t - 0.03, x: p.x, y: p.y, v: 1 }); clicks.push([s.t / bar, p]); });
    const lastTheme = themeSeq[themeSeq.length - 1].t;
    const fr = mid(L.fontRow), sp = mid(L.sizePlus);
    cur.push(C(8.35, { x: 1500, y: 300 }, 1), C(9.5, { x: fr.x - 40, y: fr.y }), C(9.8, sp));
    clicks.push([9.5, { x: fr.x - 40, y: fr.y }]); fontClicks.forEach((t) => { clicks.push([t / bar, sp]); cur.push({ t: t - 0.02, x: sp.x, y: sp.y, v: 1 }); });
    const tb = (id) => mid(L.tabs[id]);
    cur.push(C(10.4, { x: sp.x - 60, y: sp.y + 40 }), C(11.2, tb('snip')), C(11.6, tb('hist')), C(12.0, tb('fwd')), C(12.3, mid(L.newFwd)), C(12.95, mid(L.fwContinue)), C(13.4, { x: 1500, y: 700 }, 0));
    const m4 = (r, dx = 0) => ({ x: r.x + r.w / 2 + dx, y: r.y + r.h / 2 });
    const dragA = m4(TR.sftpFrom, -240), dragB = m4(TR.sftpTo, -240);
    cur.push(C(14.7, { x: 1300, y: 700 }, 1), C(15.3, mid(TR.newHost)), C(15.8, { x: 1000, y: 420 }), C(16.15, mid(TR.importBtn)), C(16.9, { x: 900, y: 500 }), C(17.65, mid(TR.plus)), C(18.2, { x: 900, y: 600 }),
      C(18.95, dragA), C(19.65, dragB), C(20.0, { x: 1200, y: 600 }), C(20.7, mid(TR.eye)), C(21.2, mid(TR.eye)), C(21.7, { x: 1300, y: 500 }), C(22.8, mid(TR.privacy)), C(24.25, mid(TR.language)), C(25.4, mid(TR.sun)), C(25.9, { x: 1200, y: 600 }, 0));
    clicks.push([15.3, mid(TR.newHost)], [16.15, mid(TR.importBtn)], [17.65, mid(TR.plus)], [18.95, dragA], [20.7, mid(TR.eye)], [21.2, mid(TR.eye)], [22.8, mid(TR.privacy)], [24.25, mid(TR.language)], [25.4, mid(TR.sun)]);
    const chip = { t0: T(18.95), t1: T(19.65), from: dragA, to: dragB };
    clicks.push([11.2, tb('snip')], [11.6, tb('hist')], [12.0, tb('fwd')], [12.3, mid(L.newFwd)], [12.95, mid(L.fwContinue)]);
    cur.sort((a, b) => a.t - b.t);
    const clickList = clicks.map(([b, p]) => ({ t: b * bar, ...p })); // t in Sekunden

    // ---- Untertitel ----
    const caps = [
      { a: 2.55, b: 3.15, label: 'CONNECT', title: ['Trust,', 'verified.'], sub: 'Host keys are checked right in the tab.' },
      { a: 3.55, b: 4.9, label: 'TERMINAL', title: ['A terminal that', 'just works.'], sub: 'History, snippets and forwarding right beside it.' },
      { a: 5.05, b: 7.9, label: 'THEMES', title: ['Make it', 'yours.'], sub: 'Ten color themes — applied to the whole window.' },
      { a: 9.55, b: 10.2, label: 'FONTS', title: ['Your font.', 'Your size.'], sub: 'Bundled monospace fonts with a live preview.' },
      { a: 11.2, b: 12.3, label: 'SIDE PANEL', title: ['Everything', 'one click away.'], sub: 'Snippets, history and port forwarding.' },
      { a: 12.45, b: 13.45, label: 'FORWARDING', title: ['Port forwarding,', 'guided.'], sub: 'Local, remote or dynamic — step by step.' },
      { a: 13.55, b: 14.45, label: 'SMART LOGIN', title: ['Asks only for', 'what is missing.'], sub: 'Username, password, key or one-time code.' },
      { a: 14.6, b: 16.1, label: 'HOSTS', title: ['Every server,', 'neatly organized.'], sub: 'Groups, tags and OS icons — detected automatically.' },
      { a: 16.25, b: 17.6, label: 'IMPORT', title: ['Bring your', 'hosts along.'], sub: 'ssh config, CSV, PuTTY, MobaXterm and SecureCRT.' },
      { a: 17.75, b: 18.75, label: 'QUICK CONNECT', title: ['Jump anywhere,', 'instantly.'], sub: 'Search hosts and recent sessions with Ctrl+K.' },
      { a: 18.9, b: 20.1, label: 'SFTP', title: ['Move files by', 'dragging them.'], sub: 'Even from one server to another.' },
      { a: 20.3, b: 21.6, label: 'KEYCHAIN', title: ['Your keys,', 'under control.'], sub: 'Generate, import and export — fingerprints stay hidden.' },
      { a: 21.75, b: 22.85, label: 'KNOWN HOSTS', title: ['Know every', 'fingerprint.'], sub: 'Review, import and censor them at a glance.' },
      { a: 22.95, b: 24.25, label: 'PRIVACY', title: ['Private', 'by design.'], sub: 'End-to-end encrypted sync. Optional Tor routing.' },
      { a: 24.35, b: 25.4, label: '16 LANGUAGES', title: ['Speaks your', 'language.'], sub: 'With a setup assistant on first start.' },
      { a: 25.55, b: 26.6, label: 'LOOK', title: ['Light or dark.', 'Your call.'], sub: 'Switch with one click.' },
    ].map((c) => ({ ...c, a: T(c.a), b: T(c.b) }));

    // ---- Soundeffekte ----
    const big = [[0.9, 1.9], [2.2, 2.5], [3.1, 3.45], [4.6, 5.0], [7.9, 8.6], [9.0, 9.4], [10.2, 10.6], [10.9, 11.2], [13.2, 13.5], [14.3, 14.5]];
    const sfx = [
      ...big.map(([a, b]) => ({ t: T(a), kind: 'whoosh', dur: T(b) - T(a) })), ...big.map(([, b]) => ({ t: T(b), kind: 'hit' })),
      ...clickList.map((c) => ({ t: c.t, kind: 'click' })), ...keys.map((t) => ({ t, kind: 'key' })),
      ...themeSeq.slice(1).map((s) => ({ t: s.t, kind: 'pop' })), { t: T(12.35), kind: 'swish' }, { t: T(OUT), kind: 'thud' },
      ...[14.5, 15.35, 16.2, 17.7, 18.8, 20.2, 21.7, 22.9, 24.3, 25.5].map((b) => ({ t: T(b), kind: 'pop' })), { t: T(OUT - 0.5), kind: 'whoosh', dur: T(0.5) },
    ].sort((a, b) => a.t - b.t);

    const sizeNum = { x: L.sizePlus.x - 34, y: L.sizePlus.y - 1, w: 30, h: L.sizePlus.h + 2 }; // die Zahl zwischen "-" und "+" im Schriftgrößen-Feld
    return { bpm, bar, beat, duration, outroAt: T(OUT), chip, sizeNum, fontShow: [T(9.5), T(11.2)], T, layers, themeSeq, NAMES, overlay, dimAt, term, cmdLen, fontClicks, cam, cursor: cur, clicks: clickList, caps, sfx, termRect: L.term };
  }
  if (typeof module !== 'undefined') module.exports = { buildTimeline };
  else root.buildTimeline2 = buildTimeline;
})(typeof window !== 'undefined' ? window : globalThis);
