// Zeitleiste des zweiten Trailers (Terminal + Themes). Einzige Quelle für Bühne (stage2.html) und Soundeffekte (sfx.js).
// Alles in Takten geplant (bpm der Musik); Positionen kommen aus layout.json (capture2.js).
(function (root) {
  function buildTimeline(bpm = 100) {
    const L = root.LAYOUT || require('./layout.json');
    const bar = 240 / bpm, T = (n) => n * bar, beat = bar / 4;
    const OUT = 20.8; // Takt des Abspanns (Film unter 55 s)
    const duration = T(OUT + 1.7);
    const TR = L.tour;

    // ---- Bildzustände (ein Fenster, spätere liegen oben und blenden über) ----
    const themeSeq = [ // [Takt, Theme] – Schlag auf Schlag im Takt der Musik
      [3.15, 'auto'], [4.75, 'tokyo'], [5.25, 'dracula'], [5.75, 'nord'], [6.0, 'gruvbox'], [6.25, 'solarl'], [6.5, 'hackerg'],
      [6.75, 'monokai'], [7.0, 'onedark'], [7.25, 'hackerb'], [7.5, 'tokyo'],
    ].map(([b, id]) => ({ t: T(b), id }));
    const NAMES = { auto: 'Automatic', tokyo: 'Tokyo Night', dracula: 'Dracula', nord: 'Nord', gruvbox: 'Gruvbox', solarl: 'Solarized Light', hackerg: 'Hacker Green', monokai: 'Monokai', onedark: 'One Dark', hackerb: 'Hacker Blue' };
    const lay = (name, b, fade) => ({ name, t0: T(b), fade });
    const layers = [
      { name: 'hosts', t0: -9, fade: .01 }, lay('c_log', 2.15, .3), lay('c_hk', 2.5, .4),
      ...themeSeq.map((s) => ({ name: 'th_' + s.id, t0: s.t, fade: s.id === 'auto' ? .5 : .3 })),
      lay('font', 8.4, .5), lay('p_snip', 9.85, .45), lay('p_hist', 10.25, .35), lay('p_fwd', 10.6, .35), lay('fw0', 10.9, .5), lay('fw1', 11.5, .3), lay('c_key', 12.0, .7),
      lay('hosts_all', 13.0, .7), lay('sheet', 13.65, .45), lay('import', 14.4, .55), lay('sftp', 15.35, .7), lay('keychain', 16.55, .7), lay('keychain_open', 17.15, .3),
      lay('known', 17.85, .7), lay('set_privacy', 18.75, .7), lay('set_lang', 19.7, .7),
    ];
    const overlay = { t0: T(3.2), t1: T(12.0) }; // gezeichnetes Terminal über dem Aufnahme-Fenster
    const dimAt = T(10.9); // Seitenblatt (Forwarding) dimmt auch das Terminal-Overlay

    // ---- Terminal: Befehle werden getippt ----
    const term = [{ t0: 3.4 * bar, cps: 22 }, { t0: 3.95 * bar, cps: 22 }, { t0: 4.45 * bar, cps: 26 }];
    const cmdLen = [6, 9, 25];
    const keys = []; term.forEach((c, i) => { for (let k = 0; k < cmdLen[i]; k++) keys.push(c.t0 + k / c.cps); });
    const fontClicks = [T(8.7), T(8.85), T(9.0)]; // Schrift wächst bei den Klicks auf "+"

    // ---- Kamera: Bewegungen laufen über die Bildwechsel hinweg (keine harten Schnitte) ----
    const cam = [
      [0.9, 960, 540, 0.5], [1.9, 520, 340, 1.3], [2.5, 960, 380, 1.45], [3.0, 960, 400, 1.55], [3.45, 760, 465, 1.2],
      [4.4, 700, 400, 1.5], [4.75, 960, 600, 0.9], [7.2, 960, 600, 0.93], [7.9, 960, 560, 1.0],
      [8.3, 1700, 230, 1.65], [9.05, 1700, 250, 1.62], [9.4, 640, 300, 1.4], [9.7, 640, 300, 1.4],
      [9.95, 1710, 330, 1.55], [10.75, 1640, 400, 1.5], [11.5, 1580, 330, 1.45], [11.95, 960, 400, 1.5], [12.9, 960, 420, 1.38],
      [13.0, 960, 540, 1.0], [13.5, 1250, 420, 1.15], [14.3, 760, 330, 1.3], [14.9, 960, 540, 1.1], [15.5, 760, 400, 1.2], [16.2, 1220, 440, 1.2],
      [16.6, 960, 540, 1.05], [17.1, 1500, 260, 1.4], [17.8, 960, 500, 1.1], [18.7, 700, 380, 1.25], [19.5, 960, 540, 1.1], [19.9, 800, 400, 1.2],
      [20.4, 960, 540, 1.05], [OUT - 0.2, 960, 540, 0.62],
    ].map(([b, x, y, z]) => ({ t: T(b), x, y, z }));

    // ---- Mauszeiger (Bildschirmkoordinaten des Fensters) ----
    const mid = (r, dx = 0) => ({ x: r.x + r.w / 2 + dx, y: r.y + r.h / 2 });
    const C = (b, p, v = 1) => ({ t: T(b), x: p.x, y: p.y, v });
    const cur = [C(1.5, { x: 1400, y: 820 }, 0), C(1.7, { x: 1250, y: 700 }, 1), C(2.05, mid(L.hostCard)), C(2.5, { x: 1180, y: 620 }), C(3.0, mid(L.hkAdd)), C(3.5, { x: 1300, y: 700 }, 1), C(4.55, { x: 1500, y: 650 }, 1)];
    const clicks = [[2.05, mid(L.hostCard)], [3.0, mid(L.hkAdd)]];
    const row = (id) => { const p = mid(L.rows[id]); return { x: p.x - 40, y: p.y }; };
    themeSeq.slice(1).forEach((s) => { const p = row(s.id); cur.push({ t: s.t - 0.03, x: p.x, y: p.y, v: 1 }); clicks.push([s.t / bar, p]); });
    const fr = mid(L.fontRow), sp = mid(L.sizePlus), tb = (id) => mid(L.tabs[id]);
    cur.push(C(7.7, { x: 1500, y: 300 }), C(8.4, { x: fr.x - 40, y: fr.y }), C(8.7, sp));
    clicks.push([8.4, { x: fr.x - 40, y: fr.y }]); fontClicks.forEach((t) => { clicks.push([t / bar, sp]); cur.push({ t: t - 0.02, x: sp.x, y: sp.y, v: 1 }); });
    cur.push(C(9.5, { x: sp.x - 60, y: sp.y + 40 }), C(9.85, tb('snip')), C(10.25, tb('hist')), C(10.6, tb('fwd')), C(10.85, mid(L.newFwd)), C(11.45, mid(L.fwContinue)), C(11.9, { x: 1500, y: 700 }, 0));
    clicks.push([9.85, tb('snip')], [10.25, tb('hist')], [10.6, tb('fwd')], [10.85, mid(L.newFwd)], [11.45, mid(L.fwContinue)]);
    const dragA = mid(TR.sftpFrom, -240), dragB = mid(TR.sftpTo, -240);
    cur.push(C(13.1, { x: 1300, y: 700 }, 1), C(13.6, mid(TR.newHost)), C(14.0, { x: 1000, y: 420 }), C(14.4, mid(TR.importBtn)), C(14.9, { x: 900, y: 500 }),
      C(15.5, dragA), C(16.15, dragB), C(16.5, { x: 1200, y: 600 }), C(17.1, mid(TR.eye)), C(17.7, { x: 1300, y: 500 }), C(18.7, mid(TR.privacy)), C(19.65, mid(TR.language)), C(20.2, { x: 1200, y: 600 }, 0));
    clicks.push([13.6, mid(TR.newHost)], [14.4, mid(TR.importBtn)], [15.5, dragA], [17.1, mid(TR.eye)], [18.7, mid(TR.privacy)], [19.65, mid(TR.language)]);
    cur.sort((a, b) => a.t - b.t);
    const clickList = clicks.map(([b, p]) => ({ t: b * bar, ...p })); // t in Sekunden
    const chip = { t0: T(15.5), t1: T(16.15), from: dragA, to: dragB };

    // ---- Untertitel ----
    const caps = [
      { a: 2.55, b: 3.15, label: 'CONNECT', title: ['Trust,', 'verified.'], sub: 'Host keys are checked right in the tab.' },
      { a: 3.55, b: 4.6, label: 'TERMINAL', title: ['A terminal that', 'just works.'], sub: 'History, snippets and forwarding beside it.' },
      { a: 4.8, b: 7.4, label: 'THEMES', title: ['Make it', 'yours.'], sub: 'Ten color themes — applied to the whole window.' },
      { a: 8.45, b: 9.1, label: 'FONTS', title: ['Your font.', 'Your size.'], sub: 'Bundled fonts, live preview.' },
      { a: 9.9, b: 10.8, label: 'SIDE PANEL', title: ['Everything', 'one click away.'], sub: 'Snippets, history and port forwarding.' },
      { a: 10.95, b: 11.85, label: 'FORWARDING', title: ['Port forwarding,', 'guided.'], sub: 'Local, remote or dynamic.' },
      { a: 12.05, b: 12.9, label: 'SMART LOGIN', title: ['Asks only for', 'what is missing.'], sub: 'Username, password, key or one-time code.' },
      { a: 13.1, b: 14.25, label: 'HOSTS', title: ['Every server,', 'neatly organized.'], sub: 'Groups, tags and OS icons.' },
      { a: 14.5, b: 15.25, label: 'IMPORT', title: ['Bring your', 'hosts along.'], sub: 'ssh config, CSV, PuTTY, MobaXterm, SecureCRT.' },
      { a: 15.45, b: 16.45, label: 'SFTP', title: ['Move files by', 'dragging them.'], sub: 'Even from server to server.' },
      { a: 16.7, b: 17.75, label: 'KEYCHAIN', title: ['Your keys,', 'under control.'], sub: 'Generate, import, export — censor fingerprints.' },
      { a: 17.95, b: 18.6, label: 'KNOWN HOSTS', title: ['Know every', 'fingerprint.'], sub: 'Review and import at a glance.' },
      { a: 18.85, b: 19.6, label: 'PRIVACY', title: ['Private', 'by design.'], sub: 'Encrypted sync. Optional Tor.' },
      { a: 19.8, b: 20.5, label: '16 LANGUAGES', title: ['Speaks your', 'language.'], sub: 'With a setup assistant on first start.' },
    ].map((c) => ({ ...c, a: T(c.a), b: T(c.b) }));

    // ---- Soundeffekte ----
    const big = [[0.9, 1.9], [2.2, 2.5], [3.1, 3.45], [4.4, 4.75], [7.2, 7.9], [8.0, 8.3], [9.1, 9.4], [9.7, 9.95], [11.9, 12.0], [12.9, 13.0], [OUT - 0.6, OUT - 0.2]];
    const sfx = [
      ...big.map(([a, b]) => ({ t: T(a), kind: 'whoosh', dur: T(b) - T(a) })),
      ...clickList.map((c) => ({ t: c.t, kind: 'click' })), ...keys.map((t) => ({ t, kind: 'key' })),
      ...themeSeq.slice(1).map((s) => ({ t: s.t, kind: 'pop' })), { t: T(10.9), kind: 'swish' }, { t: T(OUT), kind: 'thud' },
      ...[12.0, 13.0, 13.65, 14.4, 15.35, 16.55, 17.85, 18.75, 19.7].map((b) => ({ t: T(b), kind: 'pop' })),
    ].sort((a, b) => a.t - b.t);

    const sizeNum = { x: L.sizePlus.x - 34, y: L.sizePlus.y - 1, w: 30, h: L.sizePlus.h + 2 }; // die Zahl zwischen "-" und "+"
    return { bpm, bar, beat, duration, outroAt: T(OUT), chip, sizeNum, fontShow: [T(8.4), T(9.85)], T, layers, themeSeq, NAMES, overlay, dimAt, term, cmdLen, fontClicks, cam, cursor: cur, clicks: clickList, caps, sfx, termRect: L.term };
  }
  if (typeof module !== 'undefined') module.exports = { buildTimeline };
  else root.buildTimeline2 = buildTimeline;
})(typeof window !== 'undefined' ? window : globalThis);
