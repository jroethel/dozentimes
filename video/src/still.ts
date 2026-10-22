// Render single frames for QC: node src/still.ts <t> <out.png> [t out.png ...]
import { Canvas } from "skia-canvas";
import { writeFileSync } from "node:fs";
import { paintFrame } from "./scenes.ts";
import { W, H } from "./timeline.ts";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("usage: node src/still.ts <t> <out.png> [t out.png ...]");
  process.exit(1);
}
for (let i = 0; i < args.length; i += 2) {
  const t = parseFloat(args[i]);
  const out = args[i + 1];
  const c = new Canvas(W, H);
  const ctx = c.getContext("2d");
  paintFrame(ctx, t, Math.round(t * 30));
  c.png.then((b) => {
    writeFileSync(out, b);
    console.log(out, "t=" + t);
  });
}
