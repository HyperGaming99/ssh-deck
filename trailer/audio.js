// Synthetisiert die Trailer-Musik (eigene Komposition, keine Fremdsamples) und schreibt trailer/out/music.wav.
// Start: node trailer/audio.js
const fs = require('fs');
const path = require('path');

const TL = require('./timeline').buildTimeline(100); // Platzhalter-Musik: immer 100 BPM
const SR = 44100, DUR = Math.ceil(TL.duration), N = SR * DUR;
const BPM = 100, BEAT = 60 / BPM;          // 0,6 s pro Schlag
const L = new Float32Array(N), R = new Float32Array(N);   // trocken
const WL = new Float32Array(N), WR = new Float32Array(N); // geht in den Hall
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
let seed = 7; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1; // deterministisches Rauschen

// Mischt eine Funktion f(t_lokal) -> [l, r] ab t0 für dur Sekunden in einen Bus
function voice(bus, t0, dur, f) {
  const [bl, br] = bus; const i0 = Math.max(0, Math.floor(t0 * SR)), i1 = Math.min(N, Math.floor((t0 + dur) * SR));
  for (let i = i0; i < i1; i++) { const [l, r] = f((i - i0) / SR, i); bl[i] += l; br[i] += r; }
}
const DRY = [L, R], WET = [WL, WR];

// ----- Struktur -----
const HITS = [...TL.flights.map((f) => f.t1), TL.T(18.7)]; // Landungen der Kamera + Abspann
const GROOVE0 = TL.T(2), GROOVE1 = DUR - 3.6;
const CHORDS = [ // je 2 Takte (4,8 s): Am – F – C – G
  { f: [110, 130.81, 164.81, 220], root: 55 }, { f: [87.31, 110, 130.81, 174.61], root: 43.65 },
  { f: [130.81, 164.81, 196, 261.63], root: 65.41 }, { f: [98, 123.47, 146.83, 196], root: 49 },
];
const chordAt = (t) => CHORDS[Math.floor(Math.max(0, t) / (BEAT * 8)) % 4];
// Energie über die Zeit: Aufbau, Höhepunkte, kurzer Atemzug im Datenschutz-Teil
const energy = (t) => (t < TL.T(2) ? .35 : t < TL.T(5.3) ? .62 : t < TL.T(13) ? .9 : t < TL.T(15.9) ? .78 : t < TL.T(18.7) ? 1 : .45);

// ----- Pad: drei leicht verstimmte Sägezahn-Stimmen je Ton, weich gefiltert, langer An-/Abschwung -----
for (let c = 0; c * BEAT * 8 < DUR; c++) {
  const t0 = c * BEAT * 8, dur = BEAT * 8 + 1.6, ch = CHORDS[c % 4];
  for (const [ni, f] of ch.f.entries()) for (const det of [-.006, 0, .006]) {
    let ph = rnd() * 6.28, lp = 0;
    voice(WET, t0, dur, (t) => {
      ph += (6.2832 * f * (1 + det)) / SR;
      const saw = ((ph / 6.2832) % 1) * 2 - 1;
      lp += (saw - lp) * (0.035 + 0.025 * energy(t0 + t)); // Tiefpass, öffnet mit der Energie
      const env = clamp(t / 1.3) * clamp((dur - t) / 1.5);
      const a = lp * env * 0.045 * (0.6 + 0.6 * energy(t0 + t)), pan = (ni - 1.5) * .12;
      return [a * (1 - pan), a * (1 + pan)];
    });
  }
}

// ----- Sub-Drone unter dem Intro -----
voice(DRY, 0, GROOVE0 + .4, (t) => { const a = Math.sin(6.2832 * 55 * t) * 0.16 * clamp(t / 1.6) * clamp((GROOVE0 + .4 - t) / .4); return [a, a]; });

// ----- Kick, Hi-Hat, Snare, Bass -----
const kicks = [];
for (let t = GROOVE0; t < GROOVE1; t += BEAT) kicks.push(t);
for (const tk of kicks) {
  const e = energy(tk);
  let ph = 0;
  voice(DRY, tk, .38, (t) => { ph += (6.2832 * (44 + 120 * Math.exp(-t * 28))) / SR; const a = Math.sin(ph) * Math.exp(-t * 8.5) * 0.78 * (0.55 + 0.45 * e); return [a, a]; });
}
for (let t = GROOVE0 + BEAT / 2; t < GROOVE1; t += BEAT) { // Hi-Hat auf dem Off-Beat
  let prev = 0;
  voice(DRY, t, .06, (tt) => { const n = rnd(), hp = n - prev; prev = n; const a = hp * Math.exp(-tt * 70) * 0.11 * energy(t); return [a * .9, a * 1.1]; });
}
for (let t = TL.T(5.3) + BEAT; t < GROOVE1; t += BEAT * 2) { // Snare/Clap auf 2 und 4
  let prev = 0, lp = 0;
  voice(DRY, t, .22, (tt) => { const n = rnd(), hp = n - prev; prev = n; lp += (hp - lp) * .5; const a = lp * Math.exp(-tt * 20) * 0.22 * energy(t) + Math.sin(6.2832 * 190 * tt) * Math.exp(-tt * 25) * 0.1; return [a, a]; });
}
for (let t = GROOVE0; t < GROOVE1; t += BEAT) { // Bass: Grundton auf 1 und "und von 2"
  const ch = chordAt(t - GROOVE0 + 0.0);
  for (const off of [0, BEAT * 1.5]) {
    const tb = t + off; if (tb >= GROOVE1) continue;
    let ph = 0, lp = 0;
    voice(DRY, tb, .5, (tt) => { ph += (6.2832 * ch.root) / SR; const s = Math.sin(ph) + 0.5 * (((ph / 6.2832) % 1) * 2 - 1); lp += (s - lp) * .08; const a = lp * Math.exp(-tt * 4.2) * 0.2 * energy(tb) * clamp(tt / .008); return [a, a]; });
  }
}

// ----- Arpeggio (Pluck) ab der zweiten Szene, gespielt in 16teln -----
for (let t = TL.T(3.5), k = 0; t < GROOVE1 + .1; t += BEAT / 4, k++) {
  const ch = chordAt(t - GROOVE0), f = ch.f[[0, 2, 1, 3, 2, 3, 1, 2][k % 8]] * 4;
  if (k % 8 === 7 && t > 20) continue; // kleine Lücken für Groove
  let ph = 0;
  voice(WET, t, .5, (tt) => { ph += (6.2832 * f) / SR; const tri = (Math.asin(Math.sin(ph)) * 2) / Math.PI; const a = (tri * 0.7 + Math.sin(ph * 2) * 0.15) * Math.exp(-tt * 9) * 0.085 * energy(t); const p = (k % 8 - 3.5) * .09; return [a * (1 - p), a * (1 + p)]; });
}

// ----- Aufbauten (Riser) und Einschläge an jedem Szenenwechsel -----
for (const h of HITS) {
  const rl = .9;
  let lp = 0;
  voice(WET, h - rl, rl, (t) => { const p = t / rl; lp += (rnd() - lp) * (0.02 + 0.5 * p * p); const a = lp * p * p * 0.5; return [a, a]; });
  let ph = 0, lp2 = 0;
  voice(DRY, h, 1.4, (t) => { ph += (6.2832 * (52 + 70 * Math.exp(-t * 14))) / SR; lp2 += (rnd() - lp2) * .15; const a = Math.sin(ph) * Math.exp(-t * 3.2) * 0.55 + lp2 * Math.exp(-t * 7) * 0.45; return [a, a]; });
  voice(WET, h, 2, (t) => { const a = Math.sin(6.2832 * 110 * t) * Math.exp(-t * 2.2) * 0.12; return [a, a]; });
}

// ----- Bedien-Geräusche: Mausklicks und Tippen -----
const click = (t0, vol = 1) => {
  voice(DRY, t0, .09, (t) => { const a = (Math.sin(6.2832 * 1900 * t) * Math.exp(-t * 90) + Math.sin(6.2832 * 140 * t) * Math.exp(-t * 40) * .8) * 0.2 * vol; return [a, a]; });
};
for (const e of TL.sfx) { if (e.kind === 'click') click(e.t); }
const key = (t0) => { let prev = 0; voice(DRY, t0, .03, (t) => { const n = rnd(), hp = n - prev; prev = n; const a = hp * Math.exp(-t * 160) * 0.07 + Math.sin(6.2832 * 420 * t) * Math.exp(-t * 120) * 0.04; return [a, a]; }); };
for (const e of TL.sfx) { if (e.kind === 'key') key(e.t); }

// ----- Hall (Schroeder: 4 Kammfilter + 2 Allpässe je Kanal) -----
function reverb(inp, spread) {
  const combs = [1557, 1617, 1491, 1422].map((d) => Math.round(d * spread)), out = new Float32Array(N), g = 0.84, damp = 0.35;
  for (const d of combs) { const buf = new Float32Array(d); let idx = 0, store = 0; for (let i = 0; i < N; i++) { const y = buf[idx]; store = y * (1 - damp) + store * damp; buf[idx] = inp[i] + store * g; out[i] += y * 0.25; if (++idx >= d) idx = 0; } }
  for (const d of [225, 556].map((x) => Math.round(x * spread))) { const buf = new Float32Array(d); let idx = 0; for (let i = 0; i < N; i++) { const bo = buf[idx], x = out[i]; buf[idx] = x + bo * 0.5; out[i] = bo - x * 0.5 + bo * 0.5 * 0 + bo * 0; if (++idx >= d) idx = 0; } }
  return out;
}
const rl = reverb(WL, 1), rr = reverb(WR, 1.07);

// ----- Mischung, weiche Begrenzung, Ein-/Ausblenden, Normalisierung -----
const outL = new Float32Array(N), outR = new Float32Array(N);
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = clamp(t / .25) * clamp((DUR - t) / 1.5);
  const l = (L[i] + WL[i] * 0.55 + rl[i] * 1.1) * fade, r = (R[i] + WR[i] * 0.55 + rr[i] * 1.1) * fade;
  outL[i] = Math.tanh(l * 1.25); outR[i] = Math.tanh(r * 1.25);
  peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]));
}
const gain = 0.89 / peak;
const pcm = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) { pcm.writeInt16LE(Math.round(clamp(outL[i] * gain, -1, 1) * 32767), i * 4); pcm.writeInt16LE(Math.round(clamp(outR[i] * gain, -1, 1) * 32767), i * 4 + 2); }
const head = Buffer.alloc(44);
head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'music.wav'), Buffer.concat([head, pcm]));
console.log(`music.wav: ${DUR} s, Spitze vor Normalisierung ${peak.toFixed(2)}`);
