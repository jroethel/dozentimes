// Render all 1800 frames and encode, in one pass: raw RGBA piped into ffmpeg.
// usage: node src/render.ts [--still-preview]
import { Canvas } from "skia-canvas";
import { spawn } from "node:child_process";
import { paintFrame } from "./scenes.ts";
import { W, H, FPS, DUR } from "./timeline.ts";

const frames = Math.round(DUR * FPS);
const ff = spawn("ffmpeg", [
  "-y",
  "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${W}x${H}`, "-framerate", String(FPS), "-i", "pipe:0",
  "-i", "out/score.wav",
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "320k", "-ar", "48000",
  "-af", "loudnorm=I=-14:TP=-1.5:LRA=17:measured_I=-18.22:measured_TP=-2.17:measured_LRA=7.30:measured_thresh=-29.11:linear=true",
  "-shortest", "-movflags", "+faststart",
  "out/freshtime-twelve-times-1080p.mp4",
], { stdio: ["pipe", "inherit", "inherit"] });

const canvas = new Canvas(W, H);
const ctx = canvas.getContext("2d");
const t0 = Date.now();
for (let f = 0; f < frames; f++) {
  paintFrame(ctx, f / FPS, f);
  const raw = Buffer.from(await canvas.toBuffer("raw"));
  if (!ff.stdin.write(raw)) {
    await new Promise<void>((res) => ff.stdin.once("drain", res));
  }
  if (f % 150 === 0) {
    const s = (Date.now() - t0) / 1000;
    console.log(`frame ${f}/${frames}  ${s.toFixed(0)}s  (${(f / s).toFixed(1)} fps)`);
  }
}
ff.stdin.end();
await new Promise<void>((res) => ff.on("close", (code) => { console.log("ffmpeg exit", code); res(); }));
