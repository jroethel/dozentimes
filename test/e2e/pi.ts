// Minimal pi RPC client: spawn, send JSONL commands, collect events until agent_settled.
import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
export const AGENT_DIR = join(REPO, "pi-time", "agent");
type Ev = Record<string, any>;

export interface Pi {
  prompt(message: string, timeoutMs?: number): Promise<Ev[]>;
  close(): Promise<void>;
  stderr: () => string;
}

export async function startPi(opts: { cwd: string; sessionDir: string; env: Record<string, string>; raw: string }): Promise<Pi> {
  const auth = join(AGENT_DIR, "auth.json");
  if (!existsSync(auth) && existsSync(join(homedir(), ".pi/agent/auth.json"))) symlinkSync(join(homedir(), ".pi/agent/auth.json"), auth);
  const p: ChildProcess = spawn("pi", ["--mode", "rpc", "--no-skills", "--provider", "zai", "--model", "glm-5.3", "--session-dir", opts.sessionDir], {
    cwd: opts.cwd,
    env: { ...process.env, PI_CODING_AGENT_DIR: AGENT_DIR, FRESHTIME_REPO: REPO, PI_SKIP_VERSION_CHECK: "1", ...opts.env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let err = "";
  p.stderr!.on("data", (d) => { err += d; });
  let buf = Buffer.alloc(0);
  let listener: ((e: Ev) => void) | null = null;
  const dead = new Promise<never>((_, rej) => p.on("exit", (c) => rej(new Error(`pi exited (${c}): ${err.slice(-500)}`))));
  dead.catch(() => {});
  p.stdout!.on("data", (d: Buffer) => {
    buf = Buffer.concat([buf, d]);
    let i: number;
    while ((i = buf.indexOf(10)) >= 0) { // split on LF only, not readline
      const line = buf.subarray(0, i).toString("utf8").replace(/\r$/, "");
      buf = buf.subarray(i + 1);
      if (!line) continue;
      appendFileSync(opts.raw, line + "\n");
      try { listener?.(JSON.parse(line)); } catch { /* skip malformed */ }
    }
  });
  const send = (o: object) => p.stdin!.write(JSON.stringify(o) + "\n");
  const wait = (done: (e: Ev) => boolean, ms: number): Promise<Ev[]> => new Promise((res, rej) => {
    const evs: Ev[] = [];
    const t = setTimeout(() => { listener = null; rej(new Error(`timeout after ${ms}ms`)); }, ms);
    listener = (e) => { evs.push(e); if (done(e)) { clearTimeout(t); listener = null; res(evs); } };
    dead.catch((e) => { clearTimeout(t); rej(e); });
  });
  // Startup is done when get_state answers (extensions load and session_start runs first).
  const ready = wait((e) => e.type === "response" && e.id === "boot", 60000);
  send({ id: "boot", type: "get_state" });
  await ready;
  return {
    stderr: () => err,
    async prompt(message, timeoutMs = 240000) {
      const w = wait((e) => e.type === "agent_settled", timeoutMs);
      send({ id: "p", type: "prompt", message });
      return w;
    },
    async close() { p.stdin!.end(); await new Promise((r) => { p.on("exit", r); setTimeout(() => { p.kill(); r(null); }, 5000); }); },
  };
}
