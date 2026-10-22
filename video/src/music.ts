// Composed score + sound design, 60s, generated from the scene timeline.
// Everything is synthesized here: no samples, no copyright.
import { SCENES, DUR } from "./timeline.ts";
import { writeFileSync } from "node:fs";

const SR = 48000;
const N = Math.round(DUR * SR);
const L = new Float64Array(N);
const R = new Float64Array(N);
const sendL = new Float64Array(N); // reverb send
const sendR = new Float64Array(N);

const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12); // midi to Hz
// D minor ladder: D3 E3 F3 G3 A3 Bb3 C4 D4 E4 F4 G4 A4
const LADDER = [50, 52, 53, 55, 57, 58, 60, 62, 64, 65, 67, 69];

function addSample(buf: Float64Array, t: number, v: number) {
  const i = Math.round(t * SR);
  if (i >= 0 && i < N) buf[i] += v;
}

// soft pluck: sine + octave partial, exp decay
function pluck(t: number, midi: number, gain = 0.16, dur = 1.8, pan = 0) {
  const f = hz(midi);
  const n = Math.round(dur * SR);
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    const env = Math.exp(-tt * 3.2) * Math.min(1, tt * 400);
    const v = (Math.sin(2 * Math.PI * f * tt) + 0.35 * Math.sin(2 * Math.PI * f * 2 * tt) + 0.12 * Math.sin(2 * Math.PI * f * 3 * tt)) * env * gain;
    addSample(L, t + tt, v * (1 - Math.max(0, pan)));
    addSample(R, t + tt, v * (1 + Math.min(0, pan)));
    addSample(sendL, t + tt, v * 0.35 * (1 - Math.max(0, pan)));
    addSample(sendR, t + tt, v * 0.35 * (1 + Math.min(0, pan)));
  }
}

// deep soft bass pulse
function bass(t: number, midi = 38, gain = 0.20, dur = 1.2) {
  const f = hz(midi);
  const n = Math.round(dur * SR);
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    const env = Math.exp(-tt * 4.5) * Math.min(1, tt * 250);
    const v = Math.sin(2 * Math.PI * f * tt) * env * gain;
    addSample(L, t + tt, v);
    addSample(R, t + tt, v);
  }
}

// typewriter tick: tiny noise burst through a resonant feel (noise * fast decay + click)
let nseed = 99;
const rnd = () => (nseed = (nseed * 16807) % 2147483647) / 2147483647;
function tick(t: number, gain = 0.07, bright = 1) {
  const n = Math.round(0.03 * SR);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    const env = Math.exp(-tt * 260);
    const w = rnd() * 2 - 1;
    lp += (w - lp) * (0.25 + 0.5 * bright);
    const v = (lp * 0.7 + w * 0.3) * env * gain;
    addSample(L, t + tt, v * (0.9 + 0.2 * rnd()));
    addSample(R, t + tt, v * (0.9 + 0.2 * rnd()));
  }
}

// stamp thud: low sine drop + noise slap
function thud(t: number, gain = 0.3) {
  const n = Math.round(0.35 * SR);
  const f0 = 120, f1 = 46;
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    const f = f0 + (f1 - f0) * Math.min(1, tt * 12);
    const env = Math.exp(-tt * 16);
    const v = Math.sin(2 * Math.PI * f * tt) * env * gain;
    const slap = (rnd() * 2 - 1) * Math.exp(-tt * 90) * gain * 0.5;
    addSample(L, t + tt, v + slap * 0.8);
    addSample(R, t + tt, v + slap);
    addSample(sendL, t + tt, v * 0.2);
    addSample(sendR, t + tt, v * 0.2);
  }
}

// transition whoosh: bandpassed noise sweep, quiet, L->R
function whoosh(t: number, gain = 0.10, dur = 0.5) {
  const n = Math.round(dur * SR);
  let lp = 0, bp = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    const u = tt / dur;
    const env = Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, u * 1.4));
    const cutoff = 0.04 + 0.5 * u * u;
    const w = rnd() * 2 - 1;
    lp += (w - lp) * cutoff;
    bp = lp - bp * 0.985; // leaky bandpass feel
    const v = bp * env * gain * 3.2;
    const p = u; // pan left to right
    addSample(L, t + tt, v * (1 - p * 0.85));
    addSample(R, t + tt, v * (0.15 + p * 0.85));
  }
}

// riser into a boundary
function riser(t: number, dur: number, gain = 0.09) {
  const n = Math.round(dur * SR);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    const u = tt / dur;
    const w = rnd() * 2 - 1;
    lp += (w - lp) * (0.02 + 0.3 * u);
    const v = lp * u * u * gain * 2.4;
    addSample(L, t + tt, v);
    addSample(R, t + tt, v);
  }
}

// soft pad chord: detuned sine stack, slow attack/release, gentle tremolo
function pad(t: number, midis: number[], gain: number, dur: number) {
  const n = Math.round(dur * SR);
  const oscs = midis.map((m) => ({ f: hz(m), d: 1 + (rnd() - 0.5) * 0.004 }));
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    const a = Math.min(1, tt / 1.6) * Math.min(1, (dur - tt) / 1.8);
    const trem = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.23 * tt);
    let v = 0;
    for (const o of oscs) {
      v += Math.sin(2 * Math.PI * o.f * o.d * tt) + 0.4 * Math.sin(2 * Math.PI * o.f * 2 * o.d * tt + 0.7);
    }
    v = (v / (oscs.length * 1.4)) * a * trem * gain;
    addSample(L, t + tt, v * 1.02);
    addSample(R, t + tt, v * 0.98);
    addSample(sendL, t + tt, v * 0.4);
    addSample(sendR, t + tt, v * 0.4);
  }
}

// bright chime for arrivals
function chime(t: number, midi: number, gain = 0.12) {
  pluck(t, midi, gain, 2.4, 0.15);
  pluck(t + 0.012, midi + 12, gain * 0.5, 2.0, -0.15);
}

// ---------------- compose ----------------

const kindScenes = SCENES.filter((s) => /^0[1-9]$|^1[0-2]$/.test(s.num));

// the floor: one continuous drone the whole minute + a heartbeat pulse
pad(0.0, [26, 38, 45], 0.075, 60.0);

// heartbeat: soft 75bpm pulse through the kinds (5.5..55.4), felt not heard
for (let t = 5.5; t < 55.4; t += 0.8) {
  const f = hz(38);
  const n = Math.round(0.14 * SR);
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    const env = Math.exp(-tt * 34) * Math.min(1, tt * 500);
    const v = (Math.sin(2 * Math.PI * f * tt) * 0.8 + (rnd() * 2 - 1) * 0.12) * env * 0.085;
    addSample(L, t + tt, v);
    addSample(R, t + tt, v);
  }
}

// hook: sparse + typewriter ticks + rising feel
pad(0.0, [38, 50, 57], 0.045, 5.8);
{
  const L1 = "If I told you a dozen times,";
  const t0 = 0.45, t1 = 2.05;
  for (let i = 0; i < L1.length; i++) {
    const t = t0 + ((t1 - t0) * i) / L1.length;
    tick(t, 0.06, 0.7);
  }
}
bass(2.25, 38, 0.16);
chime(2.3, 62, 0.10); // "you'd remember."
bass(3.45, 38, 0.18);
chime(3.5, 69, 0.11); // thesis line
for (let i = 0; i < 12; i++) tick(4.5 + i * 0.05, 0.045, 1);
riser(5.0, 0.55, 0.10);

// twelve kinds: one bass pulse + one ladder note per kind
kindScenes.forEach((s, i) => {
  bass(s.start + 0.02, 38, i % 4 === 0 ? 0.20 : 0.15);
  pluck(s.start + 0.16, LADDER[i], 0.15, 1.9, ((i % 3) - 1) * 0.25);
  whoosh(s.start - 0.18, 0.085);
  if (i % 4 === 3) pad(s.start, [38, 50, 53, 57], 0.030, 4.4); // pad breath every 4 kinds
});

// scene-specific sound design (times are scene.start + local)
const S = (id: string) => kindScenes.find((k) => k.id === id)!;
// event: window shimmer
tick(S("event").start + 1.3, 0.05, 1);
chime(S("event").start + 1.9, 69, 0.07);
// valid: the swap flip
tick(S("valid").start + 2.55, 0.09, 1);
chime(S("valid").start + 2.9, 62, 0.08);
// record: spark + written-down + head drop
chime(S("record").start + 0.5, 60, 0.09);
thud(S("record").start + 1.2, 0.20);
tick(S("record").start + 1.85, 0.06, 0.6);
// source: two stamps + two peels
thud(S("source").start + 0.82, 0.30);
whoosh(S("source").start + 1.72, 0.07, 0.4);
thud(S("source").start + 2.62, 0.30);
whoosh(S("source").start + 3.32, 0.07, 0.4);
chime(S("source").start + 3.4, 65, 0.09);
// reference: two arrow snaps
tick(S("reference").start + 1.35, 0.08, 1);
tick(S("reference").start + 2.35, 0.08, 1);
chime(S("reference").start + 2.75, 67, 0.08);
// sequence: clash + verdict
thud(S("sequence").start + 1.15, 0.16);
whoosh(S("sequence").start + 2.4, 0.06, 0.35);
chime(S("sequence").start + 2.85, 69, 0.10);
// verification: seal, scan sweep, catch
thud(S("verification").start + 0.82, 0.28);
riser(S("verification").start + 2.2, 0.4, 0.05);
tick(S("verification").start + 2.6, 0.1, 1);
thud(S("verification").start + 3.02, 0.30);
// access: queue jump
whoosh(S("access").start + 1.6, 0.07, 0.45);
tick(S("access").start + 2.25, 0.09, 1);
// volatility: expiry clicks at day 7 and day 90 (scrub 0.7..3.3 -> 0..120 days)
tick(S("volatility").start + 0.7 + (7 / 120) * 2.6, 0.10, 1);
tick(S("volatility").start + 0.7 + (90 / 120) * 2.6, 0.10, 1);
chime(S("volatility").start + 3.35, 64, 0.09);
// intended: the leap + landing
riser(S("intended").start + 1.9, 0.8, 0.06);
chime(S("intended").start + 2.72, 74, 0.12); // D5 landing
// business: ring turn + FY26
whoosh(S("business").start + 0.45, 0.08, 0.6);
thud(S("business").start + 1.25, 0.16);
chime(S("business").start + 2.45, 62, 0.10);
// asof: dial settle + the clear
tick(S("asof").start + 1.35, 0.09, 1);
tick(S("asof").start + 1.9, 0.05, 0.6);
chime(S("asof").start + 3.25, 69, 0.13); // "LIVE"
chime(S("asof").start + 3.28, 81, 0.05);

// outro: grid + resolve
for (let i = 0; i < 6; i++) tick(55.95 + i * 0.13, 0.05, 1);
pad(57.0, [38, 50, 53, 57, 62], 0.055, 3.0);
bass(57.05, 38, 0.22, 2.4);
pluck(57.1, 62, 0.14, 2.6);
pluck(57.35, 65, 0.11, 2.4, 0.2);
pluck(57.6, 69, 0.11, 2.2, -0.2);
chime(58.25, 74, 0.10);
tick(59.45, 0.07, 0.8);

// ---------------- reverb (Schroeder: 4 combs + 2 allpass) ----------------
function comb(input: Float64Array, delayMs: number, fb: number, out: Float64Array) {
  const d = Math.round((delayMs / 1000) * SR);
  const buf = new Float64Array(d);
  for (let i = 0; i < N; i++) {
    const v = input[i] + buf[i % d] * fb;
    buf[i % d] = v;
    out[i] += v * 0.5;
  }
}
function allpass(input: Float64Array, delayMs: number, g: number, out: Float64Array) {
  const d = Math.round((delayMs / 1000) * SR);
  const buf = new Float64Array(d);
  let fv = 0;
  for (let i = 0; i < N; i++) {
    const x = input[i];
    const bv = buf[i % d];
    const y = -g * x + bv;
    buf[i % d] = x + g * bv;
    fv = y;
    out[i] += y * 0.6;
  }
}
const revL = new Float64Array(N), revR = new Float64Array(N);
{
  const t1 = new Float64Array(N), t2 = new Float64Array(N), t3 = new Float64Array(N), t4 = new Float64Array(N);
  comb(sendL, 29.7, 0.77, t1); comb(sendL, 37.1, 0.75, t2); comb(sendL, 41.1, 0.73, t3); comb(sendL, 43.7, 0.71, t4);
  const s1 = new Float64Array(N), s2 = new Float64Array(N);
  for (let i = 0; i < N; i++) s1[i] = t1[i] + t2[i] + t3[i] + t4[i];
  allpass(s1, 5.0, 0.7, revL);
  const u1 = new Float64Array(N), u2 = new Float64Array(N), u3 = new Float64Array(N), u4 = new Float64Array(N);
  comb(sendR, 31.3, 0.77, u1); comb(sendR, 38.7, 0.75, u2); comb(sendR, 42.3, 0.73, u3); comb(sendR, 44.9, 0.71, u4);
  for (let i = 0; i < N; i++) s2[i] = u1[i] + u2[i] + u3[i] + u4[i];
  allpass(s2, 5.7, 0.7, revR);
}

// ---------------- master ----------------
const M = new Float64Array(N * 2);
{
  // bring the sparse composition up to a dense level before the bus
  const EV = 1.0;
  for (let i = 0; i < N; i++) { L[i] *= EV; R[i] *= EV; sendL[i] *= EV; sendR[i] *= EV; }
}
let peak = 0;
for (let i = 0; i < N; i++) {
  let l = L[i] + revL[i] * 0.9;
  let r = R[i] + revR[i] * 0.9;
  // bus saturation lifts the sparse quiet parts; tanh acts as the limiter
  l = Math.tanh(l * 3.0) * 0.9;
  r = Math.tanh(r * 3.0) * 0.9;
  M[i * 2] = l; M[i * 2 + 1] = r;
  peak = Math.max(peak, Math.abs(l), Math.abs(r));
}
const norm = Math.min(1, 0.95 / (peak || 1));
for (let i = 0; i < M.length; i++) M[i] *= norm;

// write WAV 16-bit
const dataBytes = M.length * 2;
const buf = Buffer.alloc(44 + dataBytes);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataBytes, 4); buf.write("WAVE", 8);
buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(dataBytes, 40);
for (let i = 0; i < M.length; i++) {
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(M[i] * 32767))), 44 + i * 2);
}
writeFileSync("out/score.wav", buf);
console.log("out/score.wav", DUR + "s", "peak", peak.toFixed(3));
