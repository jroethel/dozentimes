// The score, composed in code from the same cue sheet as the picture. No samples: every sound is
// synthesized here, so the soundtrack is original and free to publish.
// D minor at 120 BPM: one beat is 0.5 s, each kind is two bars. Writes out/score.wav (32-bit float).
import { writeFileSync, mkdirSync } from "node:fs";
import { ease, hash } from "./kit.ts";
import { CUE, KINDS, TRANS, hourHit } from "./timeline.ts";

const SR = 48000, DUR = 60, N = SR * DUR;
const TAU = Math.PI * 2;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- buses ----------
const dryL = new Float32Array(N), dryR = new Float32Array(N);
const revL = new Float32Array(N), revR = new Float32Array(N);
const duckL = new Float32Array(N), duckR = new Float32Array(N); // pad and bass, ducked by the kick
const kickEnv = new Float32Array(N);

function put(sig: Float32Array, t0: number, gain: number, pan = 0, rev = 0.15, duck = false) {
  const i0 = Math.round(t0 * SR);
  const gl = Math.cos((pan + 1) * Math.PI / 4) * gain, gr = Math.sin((pan + 1) * Math.PI / 4) * gain;
  const L = duck ? duckL : dryL, R = duck ? duckR : dryR;
  for (let i = 0; i < sig.length; i++) {
    const j = i0 + i;
    if (j < 0 || j >= N) continue;
    const v = sig[i];
    L[j] += v * gl; R[j] += v * gr;
    if (rev > 0) { revL[j] += v * gl * rev; revR[j] += v * gr * rev; }
  }
}

// ---------- sources ----------
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const buf = (dur: number) => new Float32Array(Math.max(1, Math.round(dur * SR)));

class Biquad {
  b0 = 1; b1 = 0; b2 = 0; a1 = 0; a2 = 0; x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  set(type: "lp" | "hp" | "bp", f: number, q: number) {
    const w = TAU * Math.min(f, SR * 0.45) / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
    let b0, b1, b2;
    if (type === "lp") { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    else if (type === "hp") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    else { b0 = al; b1 = 0; b2 = -al; }
    const a0 = 1 + al;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = -2 * c / a0; this.a2 = (1 - al) / a0;
    return this;
  }
  run(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

// noise through a band-pass whose centre glides from f0 to f1, shaped by env(u)
function noiseSweep(dur: number, f0: number, f1: number, q: number, env: (u: number) => number, type: "bp" | "lp" | "hp" = "bp") {
  const out = buf(dur), bq = new Biquad();
  for (let i = 0; i < out.length; i++) {
    const u = i / out.length;
    if (i % 32 === 0) bq.set(type, f0 * Math.pow(f1 / f0, u), q);
    out[i] = bq.run(rnd()) * env(u);
  }
  return out;
}

// FM bell: an inharmonic modulator gives the glassy strike, its index decays faster than the tone
function bell(f: number, dur = 3, ratio = 3.5, index = 2.2, decay = 1.1) {
  const out = buf(dur);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const I = index * Math.exp(-t * 3.2);
    const m = Math.sin(TAU * f * ratio * t) * I;
    const a = Math.exp(-t / decay) * Math.min(1, t * 400);
    out[i] = (Math.sin(TAU * f * t + m) * 0.8 + Math.sin(TAU * f * 2.01 * t) * 0.12 * Math.exp(-t * 4)) * a;
  }
  return out;
}

// Karplus-Strong pluck
function pluck(f: number, dur = 1.2, bright = 0.5, damp = 0.996) {
  const out = buf(dur), P = Math.max(2, Math.round(SR / f)), d = new Float32Array(P);
  for (let i = 0; i < P; i++) d[i] = rnd() * (0.5 + bright * 0.5);
  let k = 0, prev = 0;
  for (let i = 0; i < out.length; i++) {
    const cur = d[k];
    const nx = damp * (bright * cur + (1 - bright) * 0.5 * (cur + prev));
    prev = cur; d[k] = nx; out[i] = cur; k = (k + 1) % P;
  }
  return out;
}

function kick(gain = 1) {
  const out = buf(0.6);
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const f = 54 + 120 * Math.exp(-t * 30);
    ph += TAU * f / SR;
    out[i] = (Math.sin(ph) * Math.exp(-t * 7.5) + Math.sin(2 * ph) * 0.18 * Math.exp(-t * 14) + rnd() * 0.3 * Math.exp(-t * 300)) * gain;
  }
  return out;
}

function tick(f: number, len = 0.035) {
  const out = buf(len), hp = new Biquad().set("hp", 2500, 0.7);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    out[i] = hp.run(rnd()) * Math.exp(-t * 260) * 0.6 + Math.sin(TAU * f * t) * Math.exp(-t * 120) * 0.5;
  }
  return out;
}

function click(f = 3000, len = 0.012, q = 2) {
  const out = buf(len), bp = new Biquad().set("bp", f, q);
  for (let i = 0; i < out.length; i++) out[i] = bp.run(rnd()) * Math.exp(-(i / SR) * 500) * 2.5;
  return out;
}

function thump(f0 = 90, f1 = 40, dur = 0.5, dec = 9) {
  const out = buf(dur);
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    ph += TAU * (f1 + (f0 - f1) * Math.exp(-t * 18)) / SR;
    out[i] = Math.sin(ph) * Math.exp(-t * dec);
  }
  return out;
}

function boom(dur = 2.2) {
  const out = buf(dur), lp = new Biquad().set("lp", 180, 0.7);
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    ph += TAU * (42 + 40 * Math.exp(-t * 4)) / SR;
    out[i] = Math.sin(ph) * Math.exp(-t * 1.8) + lp.run(rnd()) * Math.exp(-t * 3) * 0.6;
  }
  return out;
}

function glide(f0: number, f1: number, dur: number, wave: "sin" | "tri" = "sin", envf = (u: number) => Math.sin(Math.PI * u)) {
  const out = buf(dur);
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const u = i / out.length;
    ph += TAU * f0 * Math.pow(f1 / f0, u) / SR;
    const s = wave === "sin" ? Math.sin(ph) : (2 / Math.PI) * Math.asin(Math.sin(ph));
    out[i] = s * envf(u);
  }
  return out;
}

function drop(f: number) {
  const out = buf(0.12);
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    ph += TAU * f * (1 + 1.2 * Math.min(1, t / 0.03)) / SR;
    out[i] = Math.sin(ph) * Math.exp(-t * 45) * Math.min(1, t * 2000);
  }
  return out;
}

const blep = (t: number, dt: number) => {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
};

// a soft analog pad: three detuned saws per note through a gently opening low-pass
function pad(notes: number[], dur: number, cut0: number, cut1: number, att = 0.5, rel = 1.2) {
  const out = buf(dur + rel), lp = new Biquad(), lp2 = new Biquad();
  const voices: { ph: number; dt: number }[] = [];
  for (const m of notes) for (const d of [-0.11, 0, 0.12]) voices.push({ ph: hash(m + d), dt: mtof(m + d) / SR });
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    if (i % 32 === 0) { const c = cut0 + (cut1 - cut0) * Math.min(1, t / dur); lp.set("lp", c, 0.8); lp2.set("lp", c * 1.4, 0.6); }
    let s = 0;
    for (const v of voices) { v.ph += v.dt; if (v.ph >= 1) v.ph -= 1; s += 2 * v.ph - 1 - blep(v.ph, v.dt); }
    const env = Math.min(1, t / att) * (t > dur ? Math.exp(-(t - dur) / (rel / 4)) : 1);
    out[i] = lp2.run(lp.run(s / voices.length)) * env;
  }
  return out;
}

function bass(m: number, dur: number) {
  const out = buf(dur + 0.3), f = mtof(m);
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    ph += TAU * f / SR;
    const env = Math.min(1, t / 0.02) * (t > dur ? Math.exp(-(t - dur) * 20) : 1);
    out[i] = (Math.sin(ph) + 0.4 * Math.sin(2 * ph) + 0.16 * Math.sin(3 * ph) + 0.06 * Math.sin(4 * ph)) * env;
  }
  return out;
}

function reverse(s: Float32Array) { return s.slice().reverse(); }

// ---------- harmony ----------
// i - VI - III - VII in D minor, one chord per kind, three times round
const CHORDS = [
  { bass: 38, pad: [57, 60, 64, 65] },   // Dm9
  { bass: 34, pad: [57, 60, 62, 65] },   // Bbmaj9
  { bass: 41, pad: [55, 57, 60, 64] },   // Fmaj9
  { bass: 36, pad: [55, 60, 62, 64] },   // Cadd9
];
// one bell per kind: the twelve-note line the outro replays
const MELODY = [81, 77, 84, 79, 81, 86, 88, 86, 89, 93, 91, 88];

// ---------- the hook (0 - 6 s) ----------
for (let b = 0; b < 12; b++) {
  const t = b * 0.5;
  if (t === 3.5 || t === 4.0) continue; // a held breath for "Literally."
  put(tick(b % 2 ? 2300 : 3300), t, 0.22 + b * 0.012, b % 2 ? 0.25 : -0.25, 0.08);
}
put(pad([50, 57, 62], 5.6, 500, 1100, 1.5, 1.0), 0.3, 0.17, 0, 0.35, false);
put(noiseSweep(0.55, 700, 2600, 1.2, (u) => Math.sin(Math.PI * u) ** 2), CUE.hook.line1 - 0.05, 0.05, -0.3, 0.3);
put(noiseSweep(0.55, 800, 3000, 1.2, (u) => Math.sin(Math.PI * u) ** 2), CUE.hook.line2 - 0.05, 0.05, 0.3, 0.3);
const PINGS = [74, 77, 79, 81, 84, 86, 89, 91, 93, 96, 98, 101];
PINGS.forEach((m, i) => put(bell(mtof(m), 1.6, 3.5, 1.4, 0.45), CUE.hook.fan + i * 0.06 + 0.04, 0.055, -0.6 + (i / 11) * 1.2, 0.35));
put(pad([50, 53, 57, 60, 64], 1.7, 400, 2200, 1.2, 0.6), CUE.hook.title, 0.2, 0, 0.35);
put(noiseSweep(1.0, 300, 6000, 0.9, (u) => u ** 2.2), 5.0, 0.16, 0, 0.2);
put(reverse(bell(mtof(MELODY[0]), 1.0, 3.5, 2, 0.5)), 5.0, 0.12, 0, 0.3);

// ---------- the groove (6 - 54 s) ----------
for (let t = 6; t < 54 - 0.01; t += 1) {
  const g = (t - 6) % 4 === 0 ? 1.0 : 0.72;
  const k = kick(g);
  put(k, t, 0.32, 0, 0.02);
  const i0 = Math.round(t * SR);
  for (let i = 0; i < SR * 0.35 && i0 + i < N; i++) kickEnv[i0 + i] = Math.max(kickEnv[i0 + i], g * Math.exp(-(i / SR) * 9));
}
for (let t = 6; t < 54 - 0.01; t += 0.25) {
  const onBeat = Math.abs(t * 2 - Math.round(t * 2)) < 1e-6;
  const n = Math.round(t * 4);
  put(tick(n % 2 ? 2400 : 3400, 0.03), t, onBeat ? 0.11 : 0.06, n % 2 ? 0.35 : -0.35, 0.05);
}
// a soft snap on two and four once the kinds turn human (reference on)
for (let t = 22.5; t < 54; t += 1) {
  const s = noiseSweep(0.09, 1700, 1500, 1.3, (u) => Math.exp(-u * 9));
  put(s, t, 0.16, 0.1, 0.25);
  put(thump(220, 180, 0.08, 40), t, 0.08, 0, 0.1);
}
KINDS.forEach((kd, i) => {
  const ch = CHORDS[i % 4];
  const t0 = kd.start;
  const bright = 1300 + i * 160;
  put(pad(ch.pad, 4.0, bright, bright * 1.3, 0.25, 0.9), t0 - 0.05, 0.21, 0, 0.3, true);
  for (let b = 0; b < 2; b++) put(bass(ch.bass, 1.85), t0 + b * 2, 0.14, 0, 0, true);
  put(bell(mtof(MELODY[i]), 3.2, 3.5, 2.0, 1.0), t0, 0.24, (i % 3 - 1) * 0.35, 0.4);
  // an arpeggio from the fifth kind on, brighter as the kinds go on
  if (i >= 4) {
    const tones = [...ch.pad, ...ch.pad.map((m) => m + 12)];
    for (let s = 0; s < 16; s++) {
      const m = tones[[0, 2, 4, 6, 7, 5, 3, 1][s % 8]];
      put(pluck(mtof(m), 0.6, 0.35 + i * 0.02, 0.995), t0 + s * 0.25, 0.09 + (i - 4) * 0.005, s % 2 ? 0.45 : -0.45, 0.3);
    }
  }
});

// ---------- cues, scene by scene ----------
const C = CUE;
// 01 event: the dot falls and lands, a counter rolls and locks
put(boom(2.0), 6.0, 0.32, 0, 0.25);
put(noiseSweep(0.5, 3000, 600, 1.0, (u) => u * Math.exp(-u * 2)), 6.0, 0.06, 0, 0.2);
put(thump(120, 50, 0.6, 7), C.event.touch, 0.42, 0, 0.2);
put(bell(mtof(93), 2.0, 1.4, 1.5, 0.7), C.event.touch, 0.06, 0, 0.5);
put(noiseSweep(1.2, 400, 160, 1.0, (u) => Math.exp(-u * 4)), C.event.touch, 0.08, 0, 0.4);
for (let i = 0; i < 18; i++) put(click(2600 + (i % 3) * 300, 0.01), C.event.roll + i * 0.045, 0.1, 0.2, 0.05);
for (let i = 0; i < 5; i++) put(click(1800, 0.02, 3), C.event.lock - 0.4 + i * 0.1, 0.22, -0.1 + i * 0.05, 0.08);
// 01 -> 02 ripple iris
put(noiseSweep(0.95, 500, 4000, 0.8, (u) => Math.sin(Math.PI * u) ** 1.5), TRANS[1].a, 0.13, 0, 0.25);
// 02 valid: the lifespan stretches, is cut, and the word is struck
put(glide(220, 440, 0.7, "tri", (u) => Math.sin(Math.PI * u) * 0.6), C.valid.grow, 0.06, 0, 0.3);
put(click(5200, 0.015, 1.5), C.valid.cut, 0.35, 0.2, 0.1);
put(click(3800, 0.02, 2), C.valid.cut + 0.03, 0.25, 0.2, 0.1);
put(noiseSweep(0.3, 2400, 3600, 2.5, (u) => (0.5 + 0.5 * Math.sin(u * 60)) * Math.sin(Math.PI * u)), C.valid.strike, 0.13, 0.1, 0.05);
// 02 -> 03 the page tears along the line
put(noiseSweep(0.75, 1200, 5000, 0.9, (u) => (hash(Math.floor(u * 90)) * 0.7 + 0.3) * Math.sin(Math.PI * u)), TRANS[2].a + 0.02, 0.2, 0, 0.15);
put(noiseSweep(0.9, 200, 900, 0.7, (u) => Math.sin(Math.PI * u)), TRANS[2].a + 0.2, 0.14, 0, 0.3);
// 03 record: a supernova, its light crossing the frame left to right, arriving
put(boom(2.6), C.record.burst, 0.3, -0.6, 0.45);
put(noiseSweep(2.0, 6000, 1200, 0.7, (u) => Math.exp(-u * 3)), C.record.burst, 0.12, -0.6, 0.6);
{
  const d = C.record.arrive - C.record.travel;
  const w = noiseSweep(d, 900, 2400, 3, (u) => Math.sin(Math.PI * u) ** 0.8);
  const g = glide(1200, 1700, d, "sin", (u) => Math.sin(Math.PI * u) * 0.3);
  // pan the light with the comet
  const steps = 24;
  for (let s = 0; s < steps; s++) {
    const a = Math.floor((s / steps) * w.length), b = Math.floor(((s + 1) / steps) * w.length);
    put(w.slice(a, b), C.record.travel + a / SR, 0.08, -0.7 + 1.4 * (s / steps), 0.3);
    put(g.slice(a, b), C.record.travel + a / SR, 0.05, -0.7 + 1.4 * (s / steps), 0.3);
  }
}
put(bell(mtof(88), 2.4, 3.5, 1.6, 0.8), C.record.arrive, 0.11, 0.6, 0.5);
// 03 -> 04 a flash charges, the shutter fires
put(glide(1800, 7000, 0.4, "sin", (u) => u * u * 0.4), C.flash - 0.4, 0.06, 0.2, 0.05);
put(click(2500, 0.02, 1.2), C.flash, 0.5, 0, 0.12);
put(thump(400, 200, 0.05, 60), C.flash, 0.25, 0, 0.05);
put(click(2000, 0.025, 1.2), C.flash + 0.07, 0.4, 0, 0.12);
// 04 source: a copy slides out, the twin stamps chime together
put(noiseSweep(0.45, 600, 2200, 1.0, (u) => Math.sin(Math.PI * u) ** 2), C.source.copy - 0.05, 0.1, 0.4, 0.2);
put(bell(mtof(86), 1.8, 3.5, 1.5, 0.6), C.source.pulse, 0.08, -0.4, 0.4);
put(bell(mtof(86) * 1.003, 1.8, 3.5, 1.5, 0.6), C.source.pulse + 0.02, 0.08, 0.4, 0.4);
// 04 -> 05 the card flips
put(noiseSweep(0.18, 900, 3500, 1.4, (u) => Math.sin(Math.PI * u)), C.flip - 0.12, 0.14, 0, 0.1);
put(noiseSweep(0.14, 3500, 1200, 1.4, (u) => Math.sin(Math.PI * u)), C.flip + 0.02, 0.11, 0, 0.1);
// 05 reference: written, tomorrow lands right; read later, tomorrow lands wrong
put(click(4200, 0.02, 4), C.ref.written, 0.18, 0.2, 0.1);
put(pluck(mtof(74), 0.8, 0.6), C.ref.land1 - 0.12, 0.2, 0.1, 0.3);
put(pluck(mtof(81), 0.9, 0.6), C.ref.land1, 0.22, 0.2, 0.3);
put(click(4200, 0.02, 4), C.ref.read, 0.16, 0.5, 0.1);
put(pluck(mtof(74), 0.6, 0.6), C.ref.land2 - 0.12, 0.16, 0.5, 0.3);
put(glide(220, 207, 0.32, "tri", (u) => Math.min(1, u * 30) * Math.exp(-u * 3)), C.ref.cross, 0.12, 0.5, 0.1);
put(glide(233, 220, 0.32, "tri", (u) => Math.min(1, u * 30) * Math.exp(-u * 3)), C.ref.cross, 0.12, 0.5, 0.1);
// 05 -> 06 ink rain: the drops land where the picture lands them
for (let i = 0; i < 120; i += 3) {
  const fromNote = i % 3 === 0;
  const ts = 25.3 + hash(i * 1.7) * 0.42;
  const y0 = fromNote ? 610 - 40 + hash(i * 5.3) * 120 : 560 + hash(i * 5.3) * 100;
  const land = ts + Math.sqrt((2 * (720 - y0)) / 2600);
  put(drop(1400 + hash(i * 9) * 1600), land, 0.07, (hash(i * 3.1) - 0.5) * 1.4, 0.3);
}
// 06 sequence: two drops at the same instant, a tie that rattles, then an order
put(pluck(mtof(69), 0.7, 0.7), C.seq.dropA, 0.3, -0.15, 0.2);
put(pluck(mtof(69), 0.7, 0.7), C.seq.dropB, 0.3, 0.15, 0.2);
for (let i = 0; i < 14; i++) put(click(1500 + (i % 2) * 500, 0.008, 3), C.seq.dropB + 0.1 + i * 0.055, 0.08, i % 2 ? 0.3 : -0.3, 0.05);
put(pluck(mtof(69), 0.8, 0.6), C.seq.order + 0.3, 0.26, -0.3, 0.25);
put(pluck(mtof(76), 0.9, 0.6), C.seq.order + 0.42, 0.26, 0.3, 0.25);
// 06 -> 07 the stamp falls and lands
put(noiseSweep(0.45, 3000, 300, 0.8, (u) => u ** 1.5), C.stamp - 0.45, 0.16, 0, 0.1);
put(thump(160, 55, 0.7, 6), C.stamp, 0.55, 0, 0.12);
put(noiseSweep(0.12, 2000, 800, 0.8, (u) => Math.exp(-u * 6), "lp"), C.stamp, 0.3, 0, 0.2);
// 07 verification: the months tick by since the check, a question is left
for (let k = 1; k <= 31; k++) {
  // invert the picture's io2 ease to find when the marker passes month k
  let lo = 0, hi = 1;
  for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2; if (ease.io2(mid) < k / 31) lo = mid; else hi = mid; }
  put(click(2200 + (k % 12 === 0 ? -600 : 0), 0.01, 3), C.verify.pass + hi * (C.verify.passEnd - C.verify.pass), k % 12 === 0 ? 0.14 : 0.07, 0.1, 0.05);
}
put(glide(330, 495, 0.35, "sin", (u) => Math.sin(Math.PI * u)), C.verify.passEnd + 0.02, 0.1, 0.3, 0.35);
// 07 -> 08 the ink bleeds
put(noiseSweep(0.95, 150, 900, 0.7, (u) => Math.sin(Math.PI * u) ** 1.2, "lp"), TRANS[7].a, 0.32, 0, 0.35);
put(glide(55, 41, 1.0, "sin", (u) => Math.sin(Math.PI * u)), TRANS[7].a, 0.22, 0, 0.1);
// 08 access: rows tap in, sort, and warm
for (let i = 0; i < 3; i++) put(click(1400 + i * 200, 0.015, 2), C.access.rows + i * 0.08, 0.14, -0.2 + i * 0.2, 0.1);
put(noiseSweep(0.6, 500, 1800, 1.2, (u) => Math.sin(Math.PI * u) ** 2), C.access.sort, 0.1, 0, 0.2);
put(pad([62, 69, 74], 0.6, 600, 1400, 0.15, 0.6), C.access.heat, 0.12, 0, 0.4);
// 08 -> 09 the light closes to a point, then opens on lime
put(noiseSweep(0.4, 2500, 400, 1.0, (u) => u ** 1.5 * (1 - u * 0.3)), C.spot.close - 0.4, 0.14, 0, 0.1);
put(click(1200, 0.02, 2), C.spot.close, 0.2, 0, 0.2);
put(bell(mtof(98), 1.2, 1.4, 2.5, 0.35), C.spot.open, 0.08, 0, 0.4);
put(noiseSweep(0.3, 1500, 8000, 0.8, (u) => Math.exp(-u * 5)), C.spot.open, 0.12, 0, 0.3);
// 09 volatility: days count, the fast fact runs dry, then the slow one
for (let k = 1; k <= 30; k++) {
  let lo = 0, hi = 1;
  for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2; if (ease.io2(mid) < k / 30) lo = mid; else hi = mid; }
  put(click(3000, 0.008, 3), C.vol.count + hi * (C.vol.countEnd - C.vol.count), 0.06, 0.6, 0.02);
}
const gurgle = (t: number, pan: number) => { for (let i = 0; i < 6; i++) put(drop(300 + hash(t * 10 + i) * 300), t + i * 0.05, 0.09, pan, 0.2); };
const dayAt = (d: number) => { let lo = 0, hi = 1; for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2; if (120 * ease.io2(mid) < d) lo = mid; else hi = mid; } return C.vol.count + hi * (C.vol.countEnd - C.vol.count); };
gurgle(dayAt(5), -0.3);
gurgle(dayAt(84), 0);
// 09 -> 10 the lime drains away
put(noiseSweep(1.0, 1400, 200, 0.9, (u) => Math.sin(Math.PI * u)), TRANS[9].a, 0.16, 0, 0.2);
for (let i = 0; i < 10; i++) put(drop(250 + hash(i * 4) * 250), TRANS[9].a + 0.1 + i * 0.07, 0.07, (hash(i) - 0.5), 0.2);
// 10 intended: typed, then a leap forward that lands
for (let i = 0; i < 22; i++) put(click(2000 + hash(i) * 1500, 0.012, 2), C.intend.type + i / 30, 0.07, -0.4, 0.05);
put(glide(500, 1500, C.intend.land - C.intend.leap, "sin", (u) => Math.sin(Math.PI * u) * 0.5), C.intend.leap, 0.08, 0.2, 0.3);
put(noiseSweep(C.intend.land - C.intend.leap, 800, 3500, 1.5, (u) => Math.sin(Math.PI * u) ** 2), C.intend.leap, 0.08, 0.2, 0.3);
put(bell(mtof(93), 2.0, 3.5, 1.8, 0.7), C.intend.land, 0.11, 0.5, 0.45);
// 10 -> 11 the line curls into a year
put(noiseSweep(1.0, 400, 2600, 4, (u) => Math.sin(Math.PI * u)), TRANS[10].a, 0.1, 0, 0.3);
// 11 business: the ring ratchets round to April 6, then the year glows round once
{
  const step = (TAU / 365) * 7;
  let last = 0;
  for (let t = C.bus.rotate; t < C.bus.lock + 0.25; t += 0.001) {
    const ang = (95 / 365) * TAU * ease.spring(Math.max(0, Math.min(1, (t - C.bus.rotate) / (C.bus.lock + 0.2 - C.bus.rotate))));
    const n = Math.floor(ang / step);
    if (n !== last) { put(click(3200, 0.006, 4), t, 0.07, 0.3, 0.05); last = n; }
  }
}
put(click(1500, 0.03, 2), C.bus.lock, 0.25, 0.3, 0.15);
for (let i = 0; i < 8; i++) put(bell(mtof([74, 77, 81, 84, 86, 89, 93, 96][i]), 1.2, 3.5, 1.0, 0.4), C.bus.lock + 0.05 + i * 0.09, 0.035, -0.5 + i * 0.14, 0.4);
// 11 -> 12 whip
put(noiseSweep(0.4, 600, 6000, 1.0, (u) => u ** 3), C.whip - 0.4, 0.2, -0.3, 0.1);
put(noiseSweep(0.45, 6000, 500, 1.0, (u) => (1 - u) ** 2), C.whip, 0.18, 0.3, 0.2);
// 12 as-of: the reading rewinds to 2005 and comes back
const tape = (t0: number, t1: number, up: boolean) => {
  const d = t1 - t0, out = buf(d), bp = new Biquad();
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const u = i / out.length, sp = Math.sin(Math.PI * u);
    const f = (up ? 300 : 900) * Math.pow(up ? 3 : 1 / 3, ease.ioExpo(u)) * (1 + 0.08 * Math.sin(u * 90));
    ph += f / SR; if (ph > 1) ph -= 1;
    if (i % 32 === 0) bp.set("bp", 1200 + 1500 * sp, 1.2);
    out[i] = bp.run(2 * ph - 1) * sp ** 0.7;
  }
  put(out, t0, 0.12, 0, 0.15);
};
tape(C.asof.back, C.asof.backEnd, false);
tape(C.asof.fwd, C.asof.fwdEnd, true);
put(click(900, 0.03, 1.5), C.asof.flip9, 0.3, 0.2, 0.1);
put(bell(mtof(98), 1.5, 3.5, 1.4, 0.5), C.asof.flip9 + 0.05, 0.06, 0.6, 0.4);
put(click(900, 0.03, 1.5), C.asof.flip8, 0.3, 0.2, 0.1);

// ---------- the pull back and the outro (53.4 - 60 s) ----------
put(noiseSweep(1.4, 200, 3000, 0.7, (u) => u ** 1.6), 53.6, 0.12, 0, 0.4);
put(pad([50, 57, 60, 62, 65], 3.2, 700, 1800, 0.6, 1.0), 53.9, 0.15, 0, 0.4);
put(bass(34, 2.8), 54.0, 0.12, 0, 0);
for (let h = 1; h <= 12; h++) put(bell(mtof(MELODY[h - 1]), 2.0, 3.5, 1.6, 0.7), hourHit(h), 0.15, -0.6 + ((h - 1) / 11) * 1.2, 0.45);
put(bell(mtof(62), 6, 1.4, 3.0, 2.4), C.outro.bell, 0.3, 0, 0.5);
put(bell(mtof(86), 4, 3.5, 1.5, 1.6), C.outro.bell + 0.01, 0.08, 0.2, 0.6);
put(boom(2.5), C.outro.bell, 0.2, 0, 0.3);
put(pad([50, 54, 57, 61, 64], 2.6, 900, 2400, 0.12, 1.4), C.outro.bell, 0.22, 0, 0.5);
put(bass(38, 2.4), C.outro.bell, 0.16, 0, 0);
put(bell(mtof(105), 1.6, 3.5, 1.0, 0.6), C.outro.mark, 0.04, 0.3, 0.6);

// ---------- mix ----------
// sidechain: the pad and bass breathe with the kick
for (let i = 0; i < N; i++) { const d = 1 - 0.55 * kickEnv[i]; dryL[i] += duckL[i] * d; dryR[i] += duckR[i] * d; revL[i] += duckL[i] * d * 0.2; revR[i] += duckR[i] * d * 0.2; }

// Freeverb: eight damped combs and four all-passes per side, the right side detuned
function freeverb(inp: Float32Array, spread: number, room = 0.86, damp = 0.3) {
  const sc = SR / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((x) => ({ b: new Float32Array(Math.round((x + spread) * sc)), i: 0, f: 0 }));
  const aps = [556, 441, 341, 225].map((x) => ({ b: new Float32Array(Math.round((x + spread) * sc)), i: 0 }));
  const pre = Math.round(0.022 * SR);
  const out = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const x = (n >= pre ? inp[n - pre] : 0) * 0.015;
    let y = 0;
    for (const c of combs) {
      const o = c.b[c.i];
      c.f = o * (1 - damp) + c.f * damp;
      c.b[c.i] = x + c.f * room;
      if (++c.i >= c.b.length) c.i = 0;
      y += o;
    }
    for (const a of aps) {
      const o = a.b[a.i];
      a.b[a.i] = y + o * 0.5;
      y = o - y;
      if (++a.i >= a.b.length) a.i = 0;
    }
    out[n] = y;
  }
  return out;
}
const wl = freeverb(revL, 0), wr = freeverb(revR, 23);
const L = new Float32Array(N), R = new Float32Array(N);
const hpL = new Biquad().set("hp", 36, 0.7), hpR = new Biquad().set("hp", 36, 0.7);
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = t > 59.0 ? Math.max(0, (60 - t) / 1.0) ** 1.5 : 1;
  L[i] = hpL.run(dryL[i] + wl[i] * 3.2) * fade;
  R[i] = hpR.run(dryR[i] + wr[i] * 3.2) * fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
// gentle bus saturation, then normalise to -1 dBFS; loudness is set later by ffmpeg's loudnorm
const pre = 1.2 / peak;
let peak2 = 0;
for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i] * pre); R[i] = Math.tanh(R[i] * pre); peak2 = Math.max(peak2, Math.abs(L[i]), Math.abs(R[i])); }
const g = 0.891 / peak2;

// 32-bit float WAV
const data = Buffer.alloc(N * 8);
for (let i = 0; i < N; i++) { data.writeFloatLE(L[i] * g, i * 8); data.writeFloatLE(R[i] * g, i * 8 + 4); }
const h = Buffer.alloc(44);
h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22);
h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34);
h.write("data", 36); h.writeUInt32LE(data.length, 40);
mkdirSync(new URL("../out/", import.meta.url), { recursive: true });
writeFileSync(new URL("../out/score.wav", import.meta.url), Buffer.concat([h, data]));
console.log("out/score.wav", (N / SR).toFixed(1) + "s", "pre-peak", peak.toFixed(2));
