// Dezente Soundeffekte aus der Zeitleiste (Kamerafluege, Klicks, Tippen, Panel, Dialoge) -> trailer/out/sfx.wav
// Start: node trailer/sfx.js [bpm]
const fs = require('fs');
const path = require('path');
const v2 = process.env.TRAILER === '2';
const { buildTimeline } = require(v2 ? './timeline2' : './timeline');

const bpmFile = path.join(__dirname, 'music', 'bpm.json');
const bpm = +process.argv[2] || (fs.existsSync(bpmFile) ? JSON.parse(fs.readFileSync(bpmFile)).bpm : 100);
const TL = buildTimeline(bpm);
const SR = 44100, N = Math.ceil(TL.duration * SR), L = new Float32Array(N), R = new Float32Array(N);
let seed = 11; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
function voice(t0, dur, f) { const i0 = Math.max(0, Math.floor(t0 * SR)), i1 = Math.min(N, Math.floor((t0 + dur) * SR)); for (let i = i0; i < i1; i++) { const [l, r] = f((i - i0) / SR, (i - i0) / (i1 - i0)); L[i] += l; R[i] += r; } }

for (const e of TL.sfx) {
  if (e.kind === 'whoosh') { // Rauschen mit steigendem Filter, laut gegen Ende, wandert von links nach rechts
    let lp = 0, lp2 = 0;
    voice(e.t, e.dur + 0.15, (t, p) => { const q = clamp(t / e.dur); lp += (rnd() - lp) * (0.015 + 0.35 * q * q); lp2 += (lp - lp2) * 0.5; const a = lp2 * Math.sin(Math.PI * Math.pow(q, 0.8)) * 0.55 * (t < e.dur ? 1 : clamp(1 - (t - e.dur) / 0.15)); const pan = q; return [a * (1 - pan * 0.6), a * (0.4 + pan * 0.6)]; });
  } else if (e.kind === 'hit') { // weicher Aufprall bei der Landung
    let ph = 0;
    voice(e.t, 0.7, (t) => { ph += (6.2832 * (48 + 40 * Math.exp(-t * 18))) / SR; const a = Math.sin(ph) * Math.exp(-t * 6) * 0.38; return [a, a]; });
  } else if (e.kind === 'click') {
    voice(e.t, 0.1, (t) => { const a = (Math.sin(6.2832 * 1800 * t) * Math.exp(-t * 90) + Math.sin(6.2832 * 130 * t) * Math.exp(-t * 38) * 0.9) * 0.22; return [a, a]; });
  } else if (e.kind === 'key') {
    let prev = 0;
    voice(e.t, 0.035, (t) => { const n = rnd(), hp = n - prev; prev = n; const a = hp * Math.exp(-t * 150) * 0.07 + Math.sin(6.2832 * (380 + 60 * rnd()) * t) * Math.exp(-t * 110) * 0.045; return [a, a]; });
  } else if (e.kind === 'swish') {
    let prev = 0;
    voice(e.t, 0.4, (t, p) => { const n = rnd(), hp = n - prev; prev = n; const a = hp * Math.sin(Math.PI * p) * 0.17; return [a * 0.7, a]; });
  } else if (e.kind === 'pop') {
    let ph = 0;
    voice(e.t, 0.16, (t) => { ph += (6.2832 * (520 - 260 * clamp(t / 0.12))) / SR; const a = Math.sin(ph) * Math.exp(-t * 26) * 0.2; return [a, a]; });
  } else if (e.kind === 'thud') {
    let ph = 0;
    voice(e.t, 0.25, (t) => { ph += (6.2832 * (100 - 40 * clamp(t / 0.1))) / SR; const a = Math.sin(ph) * Math.exp(-t * 16) * 0.3; return [a, a]; });
  }
}
const pcm = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) { pcm.writeInt16LE(Math.round(clamp(Math.tanh(L[i]), -1, 1) * 32000), i * 4); pcm.writeInt16LE(Math.round(clamp(Math.tanh(R[i]), -1, 1) * 32000), i * 4 + 2); }
const head = Buffer.alloc(44);
head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', v2 ? 'sfx2.wav' : 'sfx.wav'), Buffer.concat([head, pcm]));
console.log(`sfx.wav: ${TL.duration.toFixed(1)} s bei ${bpm} BPM, ${TL.sfx.length} Effekte`);
