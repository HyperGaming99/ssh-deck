// Erkennt Tempo (BPM) und Taktanfang einer Musikdatei und schreibt trailer/music/bpm.json.
// Start: node trailer/analyze.js [datei]   (Standard: trailer/music/track.*)
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'music');
const file = process.argv[2] || fs.readdirSync(dir).filter((f) => /^track\.(mp3|wav|m4a|ogg|flac|aac)$/i.test(f)).map((f) => path.join(dir, f))[0];
if (!file) { console.error('Keine Musik gefunden: Datei als trailer/music/track.mp3 (oder .wav/.m4a/.ogg/.flac) ablegen.'); process.exit(1); }

const SR = 11025, HOP = 110; // 100 Messwerte pro Sekunde
const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-t', '120', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 29 });
if (r.status !== 0) { console.error('ffmpeg konnte die Datei nicht lesen:', String(r.stderr)); process.exit(1); }
const x = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4));

// Einsatzkurve: Energiezunahme im Bass (Kick) und in den Höhen (Hi-Hat/Snare), halbwellengleichgerichtet
const n = Math.floor(x.length / HOP), eLow = new Float32Array(n), eHigh = new Float32Array(n);
let lp = 0, prev = 0;
for (let i = 0; i < n; i++) {
  let a = 0, b = 0;
  for (let j = 0; j < HOP; j++) { const s = x[i * HOP + j]; lp += (s - lp) * 0.04; const hp = s - prev; prev = s; a += lp * lp; b += hp * hp; }
  eLow[i] = Math.log1p(a * 40); eHigh[i] = Math.log1p(b * 40);
}
const env = new Float32Array(n);
for (let i = 1; i < n; i++) env[i] = Math.max(0, eLow[i] - eLow[i - 1]) + 0.6 * Math.max(0, eHigh[i] - eHigh[i - 1]);
const mean = env.reduce((s, v) => s + v, 0) / n; for (let i = 0; i < n; i++) env[i] = Math.max(0, env[i] - mean * 0.8);

// Beat-Gitter: für jedes BPM und jede Phase die Summe der Einsätze auf den Schlägen; Tempo-Vorliebe um ~115 BPM löst Oktav-Doppeldeutigkeiten
let best = { s: -1 };
for (let bpm = 70; bpm <= 180; bpm += 0.1) {
  const period = 6000 / bpm; // in Messwerten
  const K = Math.min(80, Math.floor((n - period) / period));
  const prior = Math.exp(-0.5 * Math.pow(Math.log(bpm / 115) / 0.38, 2));
  for (let ph = 0; ph < period; ph += 1) {
    let s = 0; for (let k = 0; k < K; k++) { const idx = Math.round(ph + k * period); s += env[idx] + 0.5 * (env[idx - 1] || 0) * 0 + 0.3 * (env[idx + 1] || 0); }
    s = (s / K) * prior;
    if (s > best.s) best = { s, bpm, ph, period };
  }
}
const beat = 60 / best.bpm;
let offset = (best.ph * HOP) / SR; offset = offset % beat; // Zeit des ersten Schlags
const out = { file: path.basename(file), bpm: Math.round(best.bpm * 10) / 10, offset: Math.round(offset * 1000) / 1000 };
fs.writeFileSync(path.join(dir, 'bpm.json'), JSON.stringify(out, null, 2));
console.log(`Tempo: ${out.bpm} BPM, erster Schlag bei ${out.offset} s  (${out.file})`);
