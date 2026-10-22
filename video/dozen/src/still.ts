// QC frames.
//   node src/still.ts <t> <out.png> [<t> <out.png> ...]      single 1080p frames
//   node src/still.ts sheet <out.png> <from> <to> <step>       a contact sheet of 1080p frames, 6 across
//   node src/still.ts grid <out.png> <t> <t> ...               chosen frames, 2 across at half size
//   node src/still.ts grid6 <out.png> <t> <t> ...              chosen frames, 6 across
import { Canvas } from "skia-canvas";
import { writeFileSync } from "node:fs";
import { setup, paintFrame } from "./frame.ts";

const args = process.argv.slice(2);
setup(1920, 1080);
const c = new Canvas(1920, 1080);
const ctx = c.getContext("2d");

if (args[0] === "grid" || args[0] === "grid6") {
  const [, out, ...rest] = args;
  const ts = rest.map(Number);
  const cols = args[0] === "grid" ? 2 : 6;
  const tw = 1920 / cols, th = 1080 / cols, rows = Math.ceil(ts.length / cols);
  const sheet = new Canvas(cols * tw, rows * (th + 30));
  const s = sheet.getContext("2d");
  s.fillStyle = "#222"; s.fillRect(0, 0, sheet.width, sheet.height);
  for (let i = 0; i < ts.length; i++) {
    paintFrame(ctx, ts[i]);
    const x = (i % cols) * tw, y = Math.floor(i / cols) * (th + 30);
    s.drawImage(c, x, y, tw, th);
    s.fillStyle = "#ddd"; s.font = "22px Mono";
    s.fillText(ts[i].toFixed(2), x + 8, y + th + 23);
  }
  writeFileSync(out, await sheet.toBuffer("png"));
  console.log(out);
} else if (args[0] === "sheet") {
  const [, out, from, to, step] = args;
  const ts: number[] = [];
  for (let t = +from; t <= +to + 1e-9; t += +step) ts.push(+t.toFixed(3));
  const cols = 6, tw = 480, th = 270, rows = Math.ceil(ts.length / cols);
  const sheet = new Canvas(cols * tw, rows * (th + 28));
  const s = sheet.getContext("2d");
  s.fillStyle = "#222"; s.fillRect(0, 0, sheet.width, sheet.height);
  for (let i = 0; i < ts.length; i++) {
    paintFrame(ctx, ts[i]);
    const x = (i % cols) * tw, y = Math.floor(i / cols) * (th + 28);
    s.drawImage(c, x, y, tw, th);
    s.fillStyle = "#ddd"; s.font = "20px Mono";
    s.fillText(ts[i].toFixed(2), x + 8, y + th + 21);
  }
  writeFileSync(out, await sheet.toBuffer("png"));
  console.log(out, ts.length, "frames");
} else {
  for (let i = 0; i < args.length; i += 2) {
    paintFrame(ctx, parseFloat(args[i]));
    writeFileSync(args[i + 1], await c.toBuffer("png"));
    console.log(args[i + 1], "t=" + args[i]);
  }
}
