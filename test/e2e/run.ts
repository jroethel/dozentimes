// Suite 3: real pi (glm-5.3, RPC mode) through pi-time over a temp copy of the ablation fixtures.
// Usage: npm run e2e -- [--runs N] [--fallback] [--keep]. Output goes under $TMPDIR/freshtime-e2e/, never the repo.
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, parseIso } from "../../freshtime-core/index.ts";
import { discoverSources, ingestPaths } from "../../freshtime-agnt/ledger.ts";
import { judge } from "./judge.ts";
import type { Judged } from "./judge.ts";
import { startPi } from "./pi.ts";

const FIX = fileURLToPath(new URL("../fixtures/ablation/", import.meta.url));
const plan = JSON.parse(readFileSync(join(FIX, "edits.json"), "utf8"));
const questions = JSON.parse(readFileSync(join(FIX, "questions.json"), "utf8")).questions as
  { id: string; q: string; must: Record<string, string[]>; harmful: string[] }[];
const gold = JSON.parse(readFileSync(new URL("./gold.json", import.meta.url), "utf8")).turns as
  Record<string, { asof_mode: string; anchor: string | null; basis: string | null }>;

const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const runs = Number(argv[argv.indexOf("--runs") + 1]) || 1;
const fallback = flag("--fallback");
const keep = flag("--keep");

// Full fixture line for a tag, so the judge gets a clear sentence.
function factText(dir: string, tag: string): string {
  for (const f of readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((x) => x.endsWith(".md"))) {
    const l = readFileSync(join(dir, f), "utf8").split("\n").find((x) => x.toLowerCase().includes(tag.toLowerCase()));
    if (l) return l.replace(/^\s*(- (\[.\] )?)?(Next: )?/, "").trim();
  }
  return tag;
}

interface Turn {
  id: string; q: string; tools: { name: string; args: unknown; isError: boolean }[]; text: string; reading: any;
  asks: any[]; cost: number; tokens: number;
  checks: { tool: boolean; reading: boolean; facts: boolean; must: boolean | null; harmful: boolean | null; stated: boolean | null; answered: boolean };
  judged: Judged | { error: string } | null; overall: boolean;
}

async function once(n: number, out: string) {
  const dir = mkdtempSync(join(tmpdir(), "ft-e2e-"));
  const db = join(dir, "ledger.db");
  const trace = join(dir, "trace.jsonl");
  const work = join(dir, "work");
  cpSync(FIX, work, { recursive: true, filter: (p) => !p.endsWith(".json") });
  const stamp = (file: string, day: string) => utimesSync(file, parseIso(day), parseIso(day));
  for (const p of discoverSources([work])) stamp(p, plan.ingest_at);
  const ldb = openDb(db);
  await ingestPaths(ldb, discoverSources([work]), plan.ingest_at);
  ldb.close();
  const raw = join(out, `run${n}.events.jsonl`);
  const pi = await startPi({
    cwd: work, sessionDir: join(dir, "sessions"), raw,
    env: { FRESHTIME_DB: db, FRESHTIME_ROOTS: work, FRESHTIME_NOW: plan.now, FRESHTIME_TRACE_FILE: trace, ...(fallback ? { TYPESAFE_API_KEY: "bad" } : {}) },
  });
  for (const e of plan.edits) { appendFileSync(join(work, e.file), e.append); stamp(join(work, e.file), e.at); }
  const turns: Turn[] = [];
  let lines = 0;
  for (const q of questions) {
    let evs: any[] = [];
    let error = "";
    try { evs = await pi.prompt(q.q); } catch (e) { error = e instanceof Error ? e.message : String(e); }
    const tl = existsSync(trace) ? readFileSync(trace, "utf8").trim().split("\n").filter(Boolean).slice(lines).map((l) => JSON.parse(l)) : [];
    lines += tl.length;
    const reading = tl.find((l) => l.event === "turn")?.intent ?? null;
    const asks = tl.filter((l) => l.event === "ask");
    const tools = evs.filter((e) => e.type === "tool_execution_end").map((e) => ({ name: e.toolName, args: null as unknown, isError: !!e.isError, r: e.result }));
    evs.filter((e) => e.type === "tool_execution_start").forEach((s, i) => { if (tools[i]) tools[i].args = s.args; });
    const msgs = evs.filter((e) => e.type === "message_end" && e.message?.role === "assistant").map((e) => e.message);
    const text = msgs.length ? (msgs[msgs.length - 1].content as any[]).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim() : "";
    const cost = msgs.reduce((a, m) => a + (m.usage?.cost?.total ?? 0), 0);
    const tokens = msgs.reduce((a, m) => a + (m.usage?.totalTokens ?? 0), 0);
    const facts: { text: string; status: string }[] = tools.filter((t) => t.name === "freshtime_ask").flatMap((t: any) => t.r?.details?.facts ?? []);
    const g = gold[q.id];
    const called = tools.some((t) => t.name === "freshtime_ask");
    const rd = reading && reading.asof_mode === g.asof_mode && (reading.anchor?.start ?? null) === g.anchor && (g.basis === null || reading.basis === g.basis);
    const factsOk = Object.entries(q.must).every(([tag, ok]) => facts.some((f) => f.text.toLowerCase().includes(tag.toLowerCase()) && ok.includes(f.status)));
    let judged: Turn["judged"] = null;
    if (text) {
      const must = Object.fromEntries(Object.keys(q.must).map((t) => [t, factText(work, t)]));
      const harm = Object.fromEntries(q.harmful.map((t) => [t, factText(work, t)]));
      try { judged = await judge(q.q, text, must, harm); } catch (e) { judged = { error: e instanceof Error ? e.message : String(e) }; }
    }
    const j = judged && "stated" in judged ? judged : null;
    const checks = {
      tool: called, reading: !!rd, facts: factsOk, answered: !!text && !error,
      must: j && Object.values(j.must).every((p) => p >= 0.5),
      harmful: j && Object.values(j.harmful).every((p) => p < 0.5),
      stated: j && j.stated >= 0.5,
    };
    // Fallback runs only need an answer; the reading comes from the fallback parser there.
    const overall = fallback ? checks.answered : Object.values(checks).every((v) => v === true);
    turns.push({ id: q.id, q: q.q, tools: tools.map(({ name, args, isError }) => ({ name, args, isError })), text, reading, asks, cost, tokens, checks, judged, overall });
  }
  await pi.close();
  let fb: { total: number; errors: number } | null = null;
  const rdb = openDb(db);
  fb = rdb.prepare("SELECT COUNT(*) AS total, COUNT(error) AS errors FROM traces WHERE tool = 'intf.parse'").get() as { total: number; errors: number };
  rdb.close();
  if (keep) console.log(`kept ${dir}`); else rmSync(dir, { recursive: true, force: true });
  return { turns, traces: fb, stderr: pi.stderr().slice(-2000) };
}

const out = join(process.env.TMPDIR ?? tmpdir(), "freshtime-e2e", new Date().toISOString().replace(/[:.]/g, "-") + (fallback ? "-fallback" : ""));
mkdirSync(out, { recursive: true });
const results = [];
for (let n = 1; n <= runs; n++) results.push(await once(n, out));
writeFileSync(join(out, "results.json"), JSON.stringify({ fallback, runs: results }, null, 2));

// Summary
const yn = (v: boolean | null) => (v === null ? "err" : v ? "ok" : "FAIL");
const pad = (s: unknown, w: number) => String(s).padEnd(w);
const fmt = (p: number) => (Number.isNaN(p) ? "?" : p.toFixed(2));
results.forEach((r, i) => {
  console.log(`\nrun ${i + 1}${fallback ? " (fallback, TYPESAFE_API_KEY=bad for pi)" : ""}`);
  console.log(["turn", "tool", "reading", "facts ok", "judge must/harm/stated", "overall"].map((h, k) => pad(h, [5, 6, 8, 9, 24, 8][k])).join(""));
  for (const t of r.turns) {
    const j = t.judged && "stated" in t.judged ? t.judged : null;
    const jc = j ? `${Object.values(j.must).map(fmt).join(",") || "-"} / ${Object.values(j.harmful).map(fmt).join(",") || "-"} / ${fmt(j.stated)}` : "no judge";
    console.log(pad(t.id, 5) + pad(yn(t.checks.tool), 6) + pad(yn(t.checks.reading), 8) + pad(yn(t.checks.facts), 9) + pad(jc, 24) + (t.overall ? "pass" : "FAIL"));
  }
  const cost = r.turns.reduce((a, t) => a + t.cost, 0);
  const tok = r.turns.reduce((a, t) => a + t.tokens, 0);
  console.log(`pi usage: ${tok} tokens, cost ${cost.toFixed(4)}${cost ? "" : " (not reported)"}; intf.parse traces ${r.traces?.total}, with error ${r.traces?.errors}`);
});
const names = ["tool", "reading", "facts", "must", "harmful", "stated", "answered"] as const;
console.log(`\npass rates over ${runs} run(s), ${results.flatMap((r) => r.turns).length} turns`);
const all = results.flatMap((r) => r.turns);
for (const k of names) console.log(`  ${pad(k, 9)} ${all.filter((t) => t.checks[k] === true).length}/${all.length}`);
console.log(`  ${pad("overall", 9)} ${all.filter((t) => t.overall).length}/${all.length}`);
let bad = 0;
if (fallback) {
  const miss = results.filter((r) => !r.traces || r.traces.errors === 0).length;
  console.log(`  ${pad("trace err", 9)} ${results.length - miss}/${results.length} runs have intf.parse rows with an error`);
  bad += miss;
}
console.log(`\nresults: ${out}/results.json (raw events run*.events.jsonl)`);
process.exit(all.every((t) => t.overall) && !bad ? 0 : 1);
