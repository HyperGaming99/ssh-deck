// Zeitleiste des Trailers. Einzige Quelle für Bühne (stage2.html) und Soundeffekte (sfx.js).
// Aufbau in Szenen (in Takten der Musik): jede Szene hat Bildzustände, Kamera-Ausschnitt, Mausweg und einen Untertitel.
// Kamera: fit() legt den wichtigen Bereich eines Bildes (Fensterkoordinaten 1920x1080) rechts neben den Untertitel – nichts wird verdeckt oder angeschnitten.
(function (root) {
  function buildTimeline(bpm = 100) {
    const L = root.LAYOUT || require('./layout.json');
    const bar = 240 / bpm, beat = bar / 4;
    // Zeitraffer: die Szenen sind unten in "Roh-Takten" geplant; warp() staucht sie abschnittsweise (Forwarding am stärksten), Film ~64 s
    const K = [[0, 0, .94], [1.6, 0, .72], [7.85, 0, .8], [10.95, 0, .7], [14.05, 0, .5], [17.8, 0, .68], [35.8, 0, 1]];
    for (let i = 1; i < K.length; i++) K[i][1] = K[i - 1][1] + (K[i][0] - K[i - 1][0]) * K[i - 1][2];
    const warp = (b) => { let i = 0; while (i + 1 < K.length && b >= K[i + 1][0]) i++; return K[i][1] + (b - K[i][0]) * K[i][2]; };
    const T = (n) => warp(n) * bar;
    const TR = L.tour, N = TR.NEW, Fb = L.fwBtn;
    const mid = (r, dx = 0) => ({ x: r.x + r.w / 2 + dx, y: r.y + r.h / 2 });

    // ---- Kamera: Rechteck r so groß wie möglich in den Bildbereich rechts vom Untertitel legen ----
    const VIEW = { x: 720, y: 100, w: 1120, h: 880 };
    const fit = (r, v = VIEW, max = 1.6) => {
      const z = Math.min(v.w / r.w, v.h / r.h, max);
      return { x: r.x + r.w / 2 - (v.x + v.w / 2 - 960) / z, y: r.y + r.h / 2 - (v.y + v.h / 2 - 540) / z, z };
    };
    // wichtige Bereiche der Aufnahmen (Fensterkoordinaten)
    const R = {
      hosts: { x: 20, y: 40, w: 1180, h: 330 }, conn: { x: 660, y: 130, w: 600, h: 460 }, term: { x: 0, y: 40, w: 1100, h: 560 },
      themes: { x: 0, y: 0, w: 1920, h: 1000 }, font: { x: 1000, y: 0, w: 920, h: 640 }, panel: { x: 1000, y: 0, w: 920, h: 700 },
      fwd: { x: 1330, y: 0, w: 590, h: 600 }, hostsAll: { x: 20, y: 40, w: 1230, h: 480 }, sheet: { x: 1280, y: 0, w: 640, h: 1080 },
      import: { x: 600, y: 320, w: 720, h: 420 }, sftp: { x: 40, y: 40, w: 1860, h: 640 }, keychain: { x: 40, y: 60, w: 1860, h: 320 },
      known: { x: 40, y: 60, w: 1860, h: 420 }, set: (h) => ({ x: 40, y: 60, w: 1000, h }), vault: { x: 0, y: 0, w: 960, h: 480 },
    };

    const layers = [], cam = [], cur = [], clicks = [], caps = [], sfx = [];
    const lay = (name, b, fade = .5) => { layers.push({ name, t0: T(b), fade }); if (b > 1.5) sfx.push({ t: T(b), kind: 'pop' }); };
    const look = (b, r, push = 1) => { const c = fit(r); cam.push({ t: T(b), x: c.x, y: c.y, z: c.z * push }); };
    const move = (b, p, v = 1) => cur.push({ t: T(b), x: p.x, y: p.y, v });
    const click = (b, p) => { move(b - .02, p); clicks.push({ t: T(b), x: p.x, y: p.y }); sfx.push({ t: T(b), kind: 'click' }); };
    const cap = (a, b, label, title, sub) => caps.push({ a: T(a), b: T(b), label, title, sub });
    // Szene: Kamera fährt in .3 Takten heran, steht dann ruhig und schiebt langsam nach (kein Hektik-Schnitt)
    const scene = (a, b, r) => { look(a, r); look(b - .3, r, 1.04); sfx.push({ t: T(a - .3), kind: 'whoosh', dur: T(.3) }); };

    // ---- 0: Intro (Logo), Fenster erscheint ----
    cam.push({ t: T(0.9), x: 960, y: 540, z: 0.5 });
    layers.push({ name: 'hosts', t0: -9, fade: .01 });

    // ---- 1: Hosts ----
    scene(1.6, 3.0, R.hosts);
    cap(1.7, 2.85, 'HOSTS', ['Every server,', 'neatly organized.'], 'Groups, tags and icons for every OS.');
    move(1.7, { x: 1100, y: 600 }, 0); move(1.9, { x: 900, y: 420 }); click(2.75, mid(L.hostCard));

    // ---- 2: Verbinden mit Host-Key-Prüfung ----
    lay('c_log', 2.95, .35); lay('c_hk', 3.45, .4);
    scene(3.0, 4.45, R.conn);
    cap(3.1, 4.3, 'CONNECT', ['Trust,', 'verified.'], 'New host keys are checked right in the tab.');
    move(3.5, { x: 1250, y: 520 }); click(4.15, mid(L.hkAdd));

    // ---- 3: Smart Login ----
    lay('c_key', 4.45, .4);
    scene(4.45, 5.7, R.conn);
    cap(4.55, 5.55, 'SMART LOGIN', ['Asks only for', 'what is missing.'], 'Username, password, key or one-time code.');
    move(5.0, { x: 1150, y: 480 });

    // ---- 4: Terminal (gezeichnet, Befehle werden getippt) ----
    lay('th_auto', 5.65, .5);
    const overlay = { t0: T(5.75), t1: T(17.75) };
    const term = [{ t0: T(6.0), cps: 20 }, { t0: T(6.55), cps: 20 }, { t0: T(7.1), cps: 24 }];
    const cmdLen = [6, 9, 25];
    term.forEach((c, i) => { for (let k = 0; k < cmdLen[i]; k++) sfx.push({ t: c.t0 + k / c.cps, kind: 'key' }); });
    scene(5.75, 7.85, R.term);
    cap(5.85, 7.7, 'TERMINAL', ['A terminal that', 'just works.'], 'Copy, paste, select all — with history beside it.');
    move(5.9, { x: 1000, y: 500 }, 0);

    // ---- 5: Themes (Schlag auf Schlag) ----
    const seq = [[7.95, 'auto'], [8.3, 'tokyo'], [8.6, 'dracula'], [8.9, 'nord'], [9.2, 'gruvbox'], [9.45, 'solarl'], [9.7, 'hackerg'], [9.95, 'monokai'], [10.2, 'onedark'], [10.45, 'hackerb'], [10.7, 'tokyo']];
    const themeSeq = seq.map(([b, id]) => ({ t: T(b), id }));
    const NAMES = { auto: 'Automatic', tokyo: 'Tokyo Night', dracula: 'Dracula', nord: 'Nord', gruvbox: 'Gruvbox', solarl: 'Solarized Light', hackerg: 'Hacker Green', monokai: 'Monokai', onedark: 'One Dark', hackerb: 'Hacker Blue' };
    seq.forEach(([b, id], i) => { layers.push({ name: 'th_' + id, t0: T(b), fade: i ? .3 : .5 }); if (i) { const p = mid(L.rows[id]); click(b, { x: p.x - 40, y: p.y }); } });
    scene(7.95, 10.95, R.themes);
    cap(8.0, 10.8, 'THEMES', ['Make it', 'yours.'], 'Ten color themes — for the whole window.');
    move(7.95, { x: 1500, y: 300 });

    // ---- 6: Schrift ----
    const fr = mid(L.fontRow), sp = mid(L.sizePlus);
    lay('font', 11.05, .5);
    scene(11.0, 12.45, R.font);
    cap(11.1, 12.3, 'FONTS', ['Your font.', 'Your size.'], 'Bundled monospace fonts, live preview.');
    click(11.05, { x: fr.x - 40, y: fr.y });
    const fontB = [11.5, 11.7, 11.9], fontClicks = fontB.map(T);
    fontB.forEach((b) => click(b, sp));
    move(12.3, { x: sp.x - 60, y: sp.y + 40 });

    // ---- 7: Seitenleiste ----
    const tb = (id) => mid(L.tabs[id]);
    lay('p_snip', 12.55, .45); lay('p_hist', 13.15, .35);
    scene(12.5, 13.95, R.panel);
    cap(12.6, 13.8, 'SIDE PANEL', ['Everything', 'one click away.'], 'Snippets and command history.');
    click(12.55, tb('snip')); click(13.15, tb('hist'));

    // ---- 8: Port-Forwarding: alle fünf Schritte des Assistenten ----
    lay('p_fwd', 14.05, .35); lay('fw0', 14.45, .5);
    const dimAt = T(14.45);
    scene(14.05, 17.8, R.fwd);
    cap(14.1, 17.6, 'PORT FORWARDING', ['Port forwarding,', 'guided.'], 'Every step explained — local, remote or dynamic.');
    click(14.05, tb('fwd')); click(14.4, mid(L.newFwd));
    [[15.1, 'fw1'], [15.75, 'fw2'], [16.4, 'fw3'], [17.05, 'fw4']].forEach(([b, n], i) => { click(b - .05, mid(Fb[i])); lay(n, b, .3); });
    click(17.6, mid(Fb[4]));

    // ---- 9: Hosts anlegen und importieren ----
    lay('hosts_all', 17.85, .7);
    scene(17.85, 18.65, R.hostsAll);
    click(18.55, mid(TR.newHost));
    lay('sheet', 18.65, .45);
    scene(18.65, 19.65, R.sheet);
    cap(17.95, 19.5, 'NEW HOST', ['Add a server', 'in seconds.'], 'Address, user, key — and tags.');
    move(19.3, { x: 1500, y: 500 });
    lay('import', 19.7, .55);
    scene(19.65, 20.75, R.import);
    cap(19.75, 20.6, 'IMPORT', ['Bring your', 'hosts along.'], 'ssh config, CSV, PuTTY, MobaXterm, SecureCRT.');
    move(20.1, { x: 1000, y: 560 });

    // ---- 10: SFTP ----
    const dragA = mid(TR.sftpFrom, -240), dragB = mid(TR.sftpTo, -240);
    lay('sftp', 20.8, .7);
    scene(20.8, 22.45, R.sftp);
    cap(20.9, 22.3, 'SFTP', ['Move files by', 'dragging them.'], 'Two panes — even from server to server.');
    click(21.25, dragA); move(21.95, dragB); move(22.3, { x: 1200, y: 600 });
    const chip = { t0: T(21.25), t1: T(21.95), from: dragA, to: dragB };

    // ---- 11: Schlüsselbund ----
    lay('keychain', 22.55, .7); lay('keychain_open', 23.25, .3);
    scene(22.55, 24.05, R.keychain);
    cap(22.65, 23.9, 'KEYCHAIN', ['Your keys,', 'under control.'], 'Generate, import, export — fingerprints masked.');
    click(23.2, mid(TR.eye));

    // ---- 12: Known Hosts ----
    lay('known', 24.1, .7);
    scene(24.1, 25.45, R.known);
    cap(24.2, 25.3, 'KNOWN HOSTS', ['Know every', 'fingerprint.'], 'Review and import at a glance.');
    move(24.7, { x: 900, y: 300 });

    // ---- 13–19: Einstellungen und neue Funktionen ----
    const st = (id, dx = -30) => { const p = mid(N[id] || TR[id]); return { x: p.x + dx, y: p.y }; };
    lay('set_kc', 25.55, .6);
    scene(25.55, 26.9, R.set(460));
    cap(25.65, 26.75, 'CLOUD KEYCHAIN', ['Your keys on', 'every device.'], 'Locked by a secret key only you hold.');
    move(26.2, st('teams'));

    click(26.95, st('teams')); lay('set_teams', 27.0, .6);
    scene(27.0, 28.5, R.set(880));
    cap(27.1, 28.35, 'TEAMS', ['Share vaults', 'with your team.'], 'End-to-end encrypted, with roles.');
    click(27.55, mid(N.teamRow));

    click(28.5, mid(N.vault)); lay('vault_menu', 28.55, .5);
    scene(28.55, 29.95, R.vault);
    cap(28.65, 29.8, 'VAULTS', ['Personal or team —', 'one click.'], 'Switch right in the title bar.');
    move(29.6, { x: 700, y: 420 });

    lay('set_privacy', 30.0, .6);
    scene(30.0, 31.35, R.set(560));
    cap(30.1, 31.2, 'PRIVACY', ['Private', 'by design.'], 'End-to-end encrypted sync. Optional Tor.');
    move(30.9, st('language'));

    click(31.35, st('language')); lay('set_lang', 31.4, .6);
    scene(31.4, 32.75, R.set(520));
    cap(31.5, 32.6, '16 LANGUAGES', ['Speaks your', 'language.'], 'Including right-to-left.');

    click(32.75, st('appearance')); lay('set_app', 32.8, .6);
    scene(32.8, 34.15, R.set(460));
    cap(32.9, 34.0, 'APPEARANCE', ['Calm when', 'you want it.'], 'Light or dark — animations on or off.');
    click(33.45, mid(N.animOff)); lay('set_app_off', 33.5, .2);

    click(34.15, st('updates')); lay('set_upd', 34.2, .6);
    scene(34.2, 35.65, R.set(880));
    cap(34.3, 35.5, 'UPDATES', ['Any version,', 'any time.'], 'Stable or dev channel — and roll back.');
    move(35.4, { x: 1200, y: 600 }, 0);

    // ---- Abspann ----
    const OUT = 35.8;
    const duration = T(OUT + 1.7);
    cam.push({ t: T(OUT - 0.2), x: 960, y: 540, z: 0.62 });
    sfx.push({ t: T(OUT - 0.6), kind: 'whoosh', dur: T(.4) }, { t: T(OUT), kind: 'thud' }, { t: T(14.45), kind: 'swish' });

    const byT = (a, b) => a.t - b.t;
    layers.sort((a, b) => a.t0 - b.t0); cam.sort(byT); cur.sort(byT); clicks.sort(byT); sfx.sort(byT); caps.sort((a, b) => a.a - b.a);
    const sizeNum = { x: L.sizePlus.x - 34, y: L.sizePlus.y - 1, w: 30, h: L.sizePlus.h + 2 }; // die Zahl zwischen "-" und "+"
    return { bpm, bar, beat, duration, outroAt: T(OUT), chip, sizeNum, fontShow: [T(11.05), T(12.5)], T, layers, themeSeq, NAMES, overlay, dimAt, term, cmdLen, fontClicks, cam, cursor: cur, clicks, caps, sfx, termRect: L.term };
  }
  if (typeof module !== 'undefined') module.exports = { buildTimeline };
  else root.buildTimeline2 = buildTimeline;
})(typeof window !== 'undefined' ? window : globalThis);
