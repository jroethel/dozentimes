// Suite 3: real pi (glm-5.3, RPC mode) through pi-time over a temp copy of the ablation fixtures.
// The statement turns from statements.json follow the questions in the same conversation (issue #3).
// Usage: npm run e2e -- [--runs N] [--fallback] [--keep]. Output goes under $TMPDIR/dozentimes-e2e/, never the repo.
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, parseIso } from "../../dozentimes-core/index.ts";
import { discoverSources, ingestPaths } from "../../dozentimes-agnt/ledger.ts";
import { judge } from "./judge.ts";
import type { Judged } from "./judge.ts";
import { startPi } from "./pi.ts";

const FIX = fileURLToPath(new URL("../fixtures/ablation/", import.meta.url));
const plan = JSON.parse(readFileSync(join(FIX, "edits.json"), "utf8"));
const questions = JSON.parse(readFileSync(join(FIX, "questions.json"), "utf8")).questions as
  { id: string; q: string; must: Record<string, string[]>; harmful: string[] }[];
const gold = JSON.parse(readFileSync(new URL("./gold.json", import.meta.url), "utf8")).turns as
  Record<string, { asof_mode: string; anchor: string | null; basis: string | null }>;
const statements = JSON.parse(readFileSync(new URL("./statements.json", import.meta.url), "utf8")).turns as
  { id: string; q: string; record_tag?: string; must_from_record?: string; harmful?: string[];
    gold?: { asof_mode: string; anchor: string | null; basis: string | null } }[];

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
  checks: { tool: boolean | null; reading: boolean | null; facts: boolean | null; must: boolean | null; harmful: boolean | null; stated: boolean | null; answered: boolean; record: boolean | null; closed: boolean | null };
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
    env: { DOZENTIMES_DB: db, DOZENTIMES_ROOTS: work, DOZENTIMES_NOW: plan.now, DOZENTIMES_TRACE_FILE: trace, ...(fallback ? { TYPESAFE_API_KEY: "bad" } : {}) },
  });
  for (const e of plan.edits) { appendFileSync(join(work, e.file), e.append); stamp(join(work, e.file), e.at); }
  const turns: Turn[] = [];
  let lines = 0;
  // Send one prompt and collect what the checks need: events, this turn's trace lines, tools, answer and facts.
  const ask = async (q: string) => {
    let evs: any[] = [];
    let error = "";
    try { evs = await pi.prompt(q); } catch (e) { error = e instanceof Error ? e.message : String(e); }
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
    const facts: { text: string; status: string; source_path?: string }[] = tools.filter((t) => t.name === "dozentimes_ask").flatMap((t: any) => t.r?.details?.facts ?? []);
    return { error, tl, reading, asks, tools, text, cost, tokens, facts };
  };
  const push = (id: string, q: string, a: Awaited<ReturnType<typeof ask>>, checks: Turn["checks"], judged: Turn["judged"]): void => {
    turns.push({ id, q, tools: a.tools.map(({ name, args, isError }) => ({ name, args, isError })), text: a.text, reading: a.reading, asks: a.asks, cost: a.cost, tokens: a.tokens, checks, judged, overall: false });
  };
  for (const q of questions) {
    const a = await ask(q.q);
    const g = gold[q.id];
    const called = a.tools.some((t) => t.name === "dozentimes_ask");
    const rd = a.reading && a.reading.asof_mode === g.asof_mode && (a.reading.anchor?.start ?? null) === g.anchor && (g.basis === null || a.reading.basis === g.basis);
    const factsOk = Object.entries(q.must).every(([tag, ok]) => a.facts.some((f) => f.text.toLowerCase().includes(tag.toLowerCase()) && ok.includes(f.status)));
    let judged: Turn["judged"] = null;
    if (a.text) {
      const must = Object.fromEntries(Object.keys(q.must).map((t) => [t, factText(work, t)]));
      const harm = Object.fromEntries(q.harmful.map((t) => [t, factText(work, t)]));
      try { judged = await judge(q.q, a.text, must, harm); } catch (e) { judged = { error: e instanceof Error ? e.message : String(e) }; }
    }
    const j = judged && "stated" in judged ? judged : null;
    push(q.id, q.q, a, {
      tool: called, reading: !!rd, facts: factsOk, answered: !!a.text && !a.error,
      must: j && Object.values(j.must).every((p) => p >= 0.5),
      harmful: j && Object.values(j.harmful).every((p) => p < 0.5),
      stated: j && j.stated >= 0.5, record: null, closed: null,
    }, judged);
  }
  // Statement turns, after the questions, in the same conversation (#3).
  const recorded: Record<string, string | null> = {}; // turn id -> the new_text its record trace event carries
  for (const s of statements) {
    const a = await ask(s.q);
    if (s.record_tag) {
      // record: this turn called ledger_record with holds false and a new text; a statement's reading is not what #3 tests
      const rec = a.tl.filter((l) => l.event === "record" && l.holds === false && !!l.new_text).at(-1) ?? null;
      recorded[s.id] = rec?.new_text ?? null;
      push(s.id, s.q, a, { tool: null, reading: null, facts: null, must: null, harmful: null, stated: null, answered: !!a.text && !a.error, record: !!rec, closed: null }, null);
    } else {
      // must_from_record: judged on the conversation fact the named turn recorded, which exists in no fixture file
      const g = s.gold!;
      const called = a.tools.some((t) => t.name === "dozentimes_ask");
      const rd = a.reading && a.reading.asof_mode === g.asof_mode && (a.reading.anchor?.start ?? null) === g.anchor && (g.basis === null || a.reading.basis === g.basis);
      const factsOk = a.facts.some((f) => f.source_path?.startsWith("conversation:") && f.status === "current");
      const newText = recorded[s.must_from_record!] ?? null;
      let judged: Turn["judged"] = null;
      if (a.text && newText) {
        const must = { [s.must_from_record!]: newText };
        const harm = Object.fromEntries((s.harmful ?? []).map((t) => [t, factText(work, t)]));
        try { judged = await judge(s.q, a.text, must, harm); } catch (e) { judged = { error: e instanceof Error ? e.message : String(e) }; }
      }
      const j = judged && "stated" in judged ? judged : null;
      push(s.id, s.q, a, {
        tool: called, reading: !!rd, facts: factsOk, answered: !!a.text && !a.error,
        must: j && Object.values(j.must).every((p) => p >= 0.5),
        harmful: j && Object.values(j.harmful).every((p) => p < 0.5),
        stated: j && j.stated >= 0.5, record: null, closed: null,
      }, judged);
    }
  }
  await pi.close();
  let fb: { total: number; errors: number } | null = null;
  const rdb = openDb(db);
  fb = rdb.prepare("SELECT COUNT(*) AS total, COUNT(error) AS errors FROM traces WHERE tool = 'intf.parse'").get() as { total: number; errors: number };
  // closed, read from the ledger after the run: the fact holding record_tag shows closed_by user
  const closedStmt = rdb.prepare("SELECT 1 AS hit FROM facts WHERE closed_by = 'user' AND instr(lower(text), lower(?)) > 0 LIMIT 1");
  for (const s of statements) {
    const t = turns.find((x) => x.id === s.id);
    if (s.record_tag && t) t.checks.closed = !!closedStmt.get(s.record_tag);
  }
  rdb.close();
  // A record turn passes record, closed and answered; every other turn passes its seven checks.
  // Fallback runs only need an answer; the reading comes from the fallback parser there.
  for (const t of turns) {
    const keys: (keyof Turn["checks"])[] = t.checks.record !== null ? ["record", "closed", "answered"] : ["tool", "reading", "facts", "must", "harmful", "stated", "answered"];
    t.overall = fallback ? t.checks.answered : keys.every((k) => t.checks[k] === true);
  }
  if (keep) console.log(`kept ${dir}`); else rmSync(dir, { recursive: true, force: true });
  return { turns, traces: fb, stderr: pi.stderr().slice(-2000) };
}

const out = join(process.env.TMPDIR ?? tmpdir(), "dozentimes-e2e", new Date().toISOString().replace(/[:.]/g, "-") + (fallback ? "-fallback" : ""));
mkdirSync(out, { recursive: true });
const results = [];
for (let n = 1; n <= runs; n++) results.push(await once(n, out));
writeFileSync(join(out, "results.json"), JSON.stringify({ fallback, runs: results }, null, 2));

// Summary ("-" marks a check that does not apply to a statement turn)
const yn = (v: boolean | null) => (v === null ? "-" : v ? "ok" : "FAIL");
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
const names = ["tool", "reading", "facts", "must", "harmful", "stated", "answered", "record", "closed"] as const;
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
