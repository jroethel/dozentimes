// Render and encode, one pass: raw RGBA frames are piped into ffmpeg with the loudness-normalised score.
//   node src/render.ts                 the 4K60 master, then the 1080p social cut and the poster
//   node src/render.ts --preview       a quick 1080p60 render for QC (out/preview.mp4)
//   node src/render.ts --from 9 --to 11 --preview    a slice
// Transitions marked with a blur count get true motion blur: that many sub-frames across a 180-degree shutter.
import { Canvas } from "skia-canvas";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { writeFileSync, statSync } from "node:fs";
import { setup, paintFrame, blurSamples } from "./frame.ts";
import { FPS, DUR } from "./timeline.ts";

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const preview = process.argv.includes("--preview");
const from = parseFloat(arg("--from", "0")!), to = parseFloat(arg("--to", String(DUR))!);
const scale = preview ? 1 : 2;
const W = 1920 * scale, H = 1080 * scale;
const OUT = new URL("../out/", import.meta.url).pathname;
const master = OUT + (preview ? "preview.mp4" : "a-dozen-times-4k60.mp4");

// ---------- audio: compose, then measure for a linear two-pass loudnorm to -14 LUFS, -1 dBTP ----------
execFileSync("node", [new URL("./music.ts", import.meta.url).pathname], { stdio: "inherit" });
const pass1 = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", OUT + "score.wav",
  "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], { encoding: "utf8" });
const j = JSON.parse(pass1.stderr.match(/\{[\s\S]*\}/)![0]);
console.log(`score measured: ${j.input_i} LUFS, ${j.input_tp} dBTP`);
// TP -1.5 leaves room for the AAC encoder, which lifts true peak a few tenths above the WAV's
const AF = `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}` +
  `:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true:print_format=summary`;

// ---------- video ----------
const COLOR = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];
const ff = spawn("ffmpeg", [
  "-y", "-hide_banner", "-loglevel", "warning", "-nostats",
  "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${W}x${H}`, "-framerate", String(FPS), "-i", "pipe:0",
  "-ss", String(from), "-t", String(to - from), "-i", OUT + "score.wav",
  "-map", "0:v", "-map", "1:a",
  "-vf", "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p",
  "-c:v", "libx264", "-preset", preview ? "veryfast" : "slow", "-crf", preview ? "18" : "15",
  "-profile:v", "high", "-level:v", preview ? "4.2" : "5.2", "-x264-params", "aq-mode=3:aq-strength=0.9:colorprim=bt709:transfer=bt709:colormatrix=bt709",
  ...COLOR,
  "-af", AF, "-c:a", "aac", "-b:a", "320k", "-ar", "48000",
  "-movflags", "+faststart", "-shortest", master,
], { stdio: ["pipe", "inherit", "inherit"] });

setup(W, H);
const canvas = new Canvas(W, H);
const ctx = canvas.getContext("2d");
const n0 = Math.round(from * FPS), n1 = Math.round(to * FPS);
const acc = new Uint16Array(W * H * 4);
const outBuf = Buffer.alloc(W * H * 4);
const t0 = Date.now();
for (let f = n0; f < n1; f++) {
  const t = f / FPS;
  const k = blurSamples(t);
  let frame: Buffer;
  if (k > 1) {
    acc.fill(0);
    for (let s = 0; s < k; s++) {
      const ts = t + ((s + 0.5) / k - 0.5) * (0.5 / FPS);
      paintFrame(ctx, ts, t);
      const raw = await canvas.toBuffer("raw");
      for (let i = 0; i < raw.length; i++) acc[i] += raw[i];
    }
    for (let i = 0; i < acc.length; i++) outBuf[i] = Math.round(acc[i] / k);
    frame = outBuf;
  } else {
    paintFrame(ctx, t, t);
    frame = Buffer.from(await canvas.toBuffer("raw"));
  }
  // the blur buffer is reused, so hand ffmpeg a copy
  if (!ff.stdin.write(frame === outBuf ? Buffer.from(outBuf) : frame)) await new Promise<void>((r) => ff.stdin.once("drain", r));
  if ((f - n0) % 300 === 0) {
    const s = (Date.now() - t0) / 1000;
    process.stderr.write(`\nframe ${f}/${n1}  ${s.toFixed(0)}s  ${((f - n0 + 1) / Math.max(s, 0.01)).toFixed(1)} fps\n`);
  }
}
ff.stdin.end();
const code: number = await new Promise((r) => ff.on("close", r));
if (code !== 0) throw new Error("ffmpeg failed " + code);
console.log(`\n${master}  ${(statSync(master).size / 1e6).toFixed(1)} MB  in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

if (!preview && from === 0 && to === DUR) {
  // the social cut: 1080p60 from the master, sized for quick uploads
  const social = OUT + "a-dozen-times-1080p.mp4";
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "warning", "-i", master, "-i", OUT + "score.wav",
    "-map", "0:v", "-map", "1:a",
    "-vf", "scale=1920:1080:flags=lanczos:in_color_matrix=bt709:out_color_matrix=bt709",
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-maxrate", "16M", "-bufsize", "32M",
    "-profile:v", "high", "-level:v", "4.2", "-pix_fmt", "yuv420p",
    "-x264-params", "aq-mode=3:colorprim=bt709:transfer=bt709:colormatrix=bt709", ...COLOR,
    "-af", AF, "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-shortest", social], { stdio: "inherit" });
  console.log(`${social}  ${(statSync(social).size / 1e6).toFixed(1)} MB`);
  // the poster, painted directly rather than pulled from the encode
  setup(1920, 1080);
  const pc = new Canvas(1920, 1080);
  paintFrame(pc.getContext("2d"), 4.9, 4.9);
  writeFileSync(OUT + "poster.jpg", await pc.toBuffer("jpg", { quality: 0.93 }));
  console.log(OUT + "poster.jpg");
}
