// Rendert stage.html Bild für Bild (30 fps) und kodiert mit ffmpeg zu MP4.
//   Vorschau einzelner Zeitpunkte: npx electron trailer/render.js --no-sandbox --preview 1.5,6,12
//   Ganzer Film:                   npx electron trailer/render.js --no-sandbox
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
const FPS = 30;
const argv = process.argv;
const previewAt = argv.includes('--preview') ? argv[argv.indexOf('--preview') + 1].split(',').map(Number) : null;
const OUT = path.join(__dirname, 'out');
const MUSIC_DIR = path.join(__dirname, 'music');
const bpmFile = path.join(MUSIC_DIR, 'bpm.json');
const argBpm = argv.includes('--bpm') ? +argv[argv.indexOf('--bpm') + 1] : 0;
const info = fs.existsSync(bpmFile) ? JSON.parse(fs.readFileSync(bpmFile, 'utf8')) : null;
const BPM = argBpm || (info && info.bpm) || 100;
const OFFSET = argBpm ? 0 : (info && info.offset) || 0; // Zeit des ersten Schlags in der Musik
const STAGE = argv.includes('--stage') ? argv[argv.indexOf('--stage') + 1] : 'stage'; // 'stage' (Trailer 1) oder 'stage2' (Terminal + Themes)
const NAME = STAGE === 'stage2' ? 'ssh-deck-terminal-trailer' : 'ssh-deck-trailer';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ width: 1920, height: 1080, useContentSize: true, show: false, frame: false,
    webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true } });
  win.webContents.setFrameRate(60);
  const ex = (js) => win.webContents.executeJavaScript(js, true);
  await win.loadFile(path.join(__dirname, STAGE + '.html'), { query: { bpm: String(BPM), ...(argv.includes('--clean') ? { clean: '1' } : {}) } });
  win.webContents.on('console-message', (_e, _l, msg) => console.log('[Seite]', msg));
  try { await ex('window.ready'); } catch (e) { throw new Error(e && e.message ? e.message : JSON.stringify(e) + ' (Bild nicht ladbar?)'); }
  const duration = await ex('window.DURATION');

  // Wartet auf zwei frische Frames, damit das Bild den eben gesetzten Zustand zeigt
  const paint = () => new Promise((r) => { const t = setTimeout(r, 90); win.webContents.once('paint', () => { clearTimeout(t); r(); }); });
  const frame = async (t) => {
    await ex(`window.renderAt(${t})`);
    await paint(); await paint();
    return win.webContents.capturePage();
  };

  if (previewAt) {
    fs.mkdirSync(path.join(OUT, 'preview'), { recursive: true });
    for (const t of previewAt) {
      const img = await frame(t);
      fs.writeFileSync(path.join(OUT, 'preview', `${STAGE}${argv.includes('--clean') ? '_clean' : ''}_t${String(t).replace('.', '_')}.png`), img.toPNG());
      console.log('Vorschau', t, img.getSize().width + 'x' + img.getSize().height);
    }
    return app.quit();
  }

  const silent = path.join(OUT, NAME + '-silent.mp4');
  const file = path.join(OUT, NAME + '.mp4');
  const args = ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', '1920x1080', '-r', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS), '-movflags', '+faststart', silent];
  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((r) => ff.on('close', r));
  const total = Math.round(duration * FPS);
  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    const img = await frame(i / FPS);
    const buf = img.toBitmap();
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 60 === 0) console.log(`Bild ${i}/${total} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  ff.stdin.end();
  await done;
  // Ton: eigene Musik (trailer/music/track.*) + Effekte, sonst Platzhalter-Musik
  const track = fs.existsSync(MUSIC_DIR) ? fs.readdirSync(MUSIC_DIR).find((f) => /^track\.(mp3|wav|m4a|ogg|flac|aac)$/i.test(f)) : null;
  const D = duration, mux = (extra, filter) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, ...extra, '-filter_complex', filter, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-t', String(D), '-movflags', '+faststart', file], { stdio: 'inherit' });
  const muxed = track
    ? mux(['-ss', String(OFFSET), '-i', path.join(MUSIC_DIR, track), '-i', path.join(OUT, STAGE === 'stage2' ? 'sfx2.wav' : 'sfx.wav')],
      `[1:a]apad=whole_dur=${D},atrim=duration=${D},asetpts=N/SR/TB,afade=t=in:st=0:d=0.4,afade=t=out:st=${D - 2.2}:d=2.2,volume=0.68[m];[2:a]volume=0.8[s];[m][s]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.84:level=0:attack=3:release=60[a]`)
    : mux(['-i', path.join(OUT, 'music.wav')], '[1:a]anull[a]');
  await new Promise((res) => muxed.on('close', res));
  console.log(track ? `Ton: ${track} (${BPM} BPM) + Effekte` : 'Ton: Platzhalter-Musik (keine Datei in trailer/music/)');
  console.log('fertig:', file);
  app.quit();
}).catch((e) => { console.error('FEHLER', e); app.exit(1); });
