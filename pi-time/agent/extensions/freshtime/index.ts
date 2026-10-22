// pi-time: freshtime tools, status line and /freshtime command for pi.
// Imports the repo modules by relative path. Startup never throws.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { jevEnabled, openDb, recentTraces, today } from "../../../../freshtime-core/index.ts";
import type { Session, TemporalIntent } from "../../../../freshtime-core/index.ts";
import { describeIntent, parseIntent } from "../../../../freshtime-intf/intent.ts";
import { discoverSources, ingestPaths, maintain, readFacts, summary, verifyFact } from "../../../../freshtime-agnt/ledger.ts";

const REPO = process.env.FRESHTIME_REPO ?? join(import.meta.dirname, "..", "..", "..", "..");
const ISSUE_REPO = "jroethel/freshtime";

let db: DatabaseSync | null = null;
let session: Session = { now: today(), ambient: null };
let lastIntent: TemporalIntent | null = null;
let turn: { prompt: string; intent: TemporalIntent } | null = null;
let traceBase = 0;

type Ctx = { ui: { notify(m: string, l?: "info" | "warning" | "error"): void; setStatus(k: string, t?: string): void }; hasUI: boolean };

const home = (p: string): string => relative(homedir(), p);
const roots = (): string[] =>
  process.env.FRESHTIME_ROOTS ? process.env.FRESHTIME_ROOTS.split(":").filter(Boolean) : [join(homedir(), "create"), join(homedir(), "repos")];

function out(ctx: Ctx, text: string, level: "info" | "warning" | "error" = "info"): void {
  ctx.ui.notify(text, level);
  if (!ctx.hasUI) console.error(text);
}

const need = (): DatabaseSync => {
  if (!db) db = openDb();
  return db;
};

const sha1 = (c: string): string => createHash("sha1").update(c).digest("hex");

async function ingest(): Promise<string> {
  const d = need();
  const now = today();
  const empty = (d.prepare("SELECT COUNT(*) AS n FROM facts").get() as { n: number }).n === 0;
  const all = discoverSources(roots());
  const known = new Map((d.prepare("SELECT path, hash FROM sources").all() as { path: string; hash: string }[]).map((r) => [r.path, r.hash]));
  const paths = empty ? all : all.filter((p) => known.get(p) !== sha1(readFileSync(p, "utf8")));
  const r = await ingestPaths(d, paths, now);
  const s = summary(d, now);
  const split = Object.entries(s.kindPaths).map(([k, n]) => `${k} ${n}`).join(", ") || "none";
  return `${empty ? "Built ledger" : "Refreshed ledger"}: ${paths.length}/${all.length} sources ingested, ${r.added} facts added, ${r.replaced} replaced. Classification: ${split}.`;
}

function remaining(): { source: string; lines: string[] } {
  try {
    const j = execFileSync("gh", ["issue", "list", "--repo", ISSUE_REPO, "--label", "agent:todo", "--state", "open", "--json", "number,title"],
      { timeout: 2000, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const issues = JSON.parse(j) as { number: number; title: string }[];
    return { source: "GitHub agent:todo issues", lines: issues.map((i) => `#${i.number} ${i.title}`) };
  } catch {
    const f = join(REPO, "REMAINING.md");
    if (!existsSync(f)) return { source: "none (gh failed, no REMAINING.md)", lines: [] };
    const lines = readFileSync(f, "utf8").split("\n").filter((l) => /^\s*[-*] /.test(l)).map((l) => l.replace(/^\s*[-*] /, ""));
    return { source: "REMAINING.md (gh unavailable)", lines };
  }
}

const remainingText = (): string => {
  const r = remaining();
  return `Remaining work (${r.source}):\n${r.lines.length ? r.lines.map((l) => `  - ${l}`).join("\n") : "  no list found"}`;
};

function status(ctx: Ctx): void {
  try {
    if (!db) return;
    const s = summary(db, today());
    const reading = lastIntent ? describeIntent(lastIntent).replace(/^answering /, "") : "none yet";
    const fb = (db.prepare("SELECT COUNT(*) AS n FROM traces WHERE id > ? AND path = 'fallback' AND error IS NOT NULL").get(traceBase) as { n: number }).n;
    const jev = fb ? `jev FALLBACK ${fb}` : jevEnabled() ? "jev ok" : "jev off";
    ctx.ui.setStatus("freshtime", `ft ${s.total} facts | ${s.byStatus.needs_check} stale | reading: ${reading} | ${jev}`);
  } catch { /* status is best effort */ }
}

async function parse(question: string): Promise<TemporalIntent> {
  const r = await parseIntent(question, { now: today(), ambient: session.ambient }, { db: need() });
  session = r.session;
  lastIntent = r.intent;
  return r.intent;
}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

function renderFacts(intent: TemporalIntent | null, res: ReturnType<typeof readFacts>): string {
  const lines = res.facts.map((f) =>
    `[${f.status}] ${f.project} - ${f.text} (valid ${f.valid_at}, verified ${f.last_verified_at} by ${f.verified_by}, source ${home(f.source_path)})`);
  const head = intent ? `Reading: ${describeIntent(intent)}` : "Reading: explicit override";
  return [head, ...(lines.length ? lines : ["no matching facts"]), `checks: ${res.checks}, caught: ${res.caught}`].join("\n");
}

const askTool = defineTool({
  name: "freshtime_ask",
  label: "Freshtime ask",
  description: "Answer a question about the user's projects, plans, status or decisions from the dated fact ledger. Reads the time reference, retrieves facts, re-checks stale ones against their source, and returns each fact with its status.",
  parameters: Type.Object({ question: Type.String({ description: "The user's question, in their words" }) }),
  async execute(_id, params) {
    const intent = turn && turn.prompt === params.question ? turn.intent : await parse(params.question);
    const res = readFacts(need(), intent, { now: today(), ledger: true, verify: true, query: params.question });
    return { ...text(renderFacts(intent, res)), details: { intent, facts: res.facts, checks: res.checks, caught: res.caught } };
  },
});

const intentTool = defineTool({
  name: "temporal_intent",
  label: "Temporal intent",
  description: "Read the time reference in a question (as-of mode, anchor date, inherited or stated). Updates the conversation's remembered as-of date like a normal turn.",
  parameters: Type.Object({ question: Type.String() }),
  async execute(_id, params) {
    const intent = await parse(params.question);
    return { ...text(`${describeIntent(intent)}\n${JSON.stringify(intent)}`), details: { intent } };
  },
});

const queryTool = defineTool({
  name: "ledger_query",
  label: "Ledger query",
  description: "Query the fact ledger directly with an explicit time reading, to override the automatic one. asof_mode is current, past, range, mixed or none. anchor_date is YYYY-MM-DD, required for past, range and mixed. Omit both for the current state.",
  parameters: Type.Object({
    question: Type.String(),
    asof_mode: Type.Optional(Type.String({ description: "current | past | range | mixed | none" })),
    anchor_date: Type.Optional(Type.String({ description: "YYYY-MM-DD" })),
  }),
  async execute(_id, params) {
    const mode = (params.asof_mode ?? (params.anchor_date ? "past" : "current")) as TemporalIntent["asof_mode"];
    if (["past", "range", "mixed"].includes(mode) && !params.anchor_date) throw new Error(`asof_mode ${mode} needs anchor_date`);
    const intent: TemporalIntent | null = params.asof_mode || params.anchor_date
      ? { asof_mode: mode, anchor: params.anchor_date ? { start: params.anchor_date, end: params.anchor_date, text: params.anchor_date } : null,
          basis: "stated", kinds: [], confidence: 1, path: "fallback", query: params.question }
      : null;
    const res = readFacts(need(), intent, { now: today(), ledger: true, verify: true, query: params.question });
    return { ...text(renderFacts(intent, res)), details: { intent, facts: res.facts, checks: res.checks, caught: res.caught } };
  },
});

const verifyTool = defineTool({
  name: "ledger_verify",
  label: "Ledger verify",
  description: "Re-check one ledger fact against its source file. Returns the fact status before and after.",
  parameters: Type.Object({ fact_id: Type.Number() }),
  async execute(_id, params) {
    const d = need();
    const now = today();
    const st = (): string => {
      const r = d.prepare("SELECT invalid_at, last_verified_at, verified_by FROM facts WHERE id = ?").get(params.fact_id) as
        { invalid_at: string | null; last_verified_at: string; verified_by: string };
      return r.invalid_at ? "replaced" : `current (verified ${r.last_verified_at} by ${r.verified_by})`;
    };
    const before = st();
    const changed = verifyFact(d, params.fact_id, now);
    const after = st();
    return { ...text(`fact ${params.fact_id}: before ${before}; after ${after}; changed ${changed}`), details: { before, after, changed } };
  },
});

const guidance = (intent: TemporalIntent): string => [
  "",
  "## Freshtime reading for this turn",
  `Reading: ${describeIntent(intent)}`,
  `Intent: ${JSON.stringify(intent)}`,
  "For questions about the user's projects, plans, status or decisions, call freshtime_ask and report each fact with its status.",
  "Say the reading back in one short line (\"Answering as of ...\").",
  "Never present a replaced or needs_check fact as current. For needs_check facts say they could not be confirmed.",
].join("\n");

async function command(args: string, ctx: Ctx): Promise<void> {
  const d = need();
  const now = today();
  const [sub, arg] = args.trim().split(/\s+/);
  const traces = (n: number): string =>
    recentTraces(d, n).map((t) => `${t.ts} ${t.tool} ${t.path ?? "-"} ${t.ms ?? "-"}ms ${t.error ?? ""} ${t.output ?? ""}`.trim()).join("\n");
  let msg: string;
  if (sub === "ingest") msg = await ingest();
  else if (sub === "maintain") { const r = maintain(d, now, Number(arg ?? 10) || 10); msg = `maintain: checked ${r.checked}, changed ${r.changed}`; }
  else if (sub === "asof") {
    if (arg === "clear") { session = { ...session, ambient: null }; msg = "session as-of cleared"; }
    else if (/^\d{4}-\d{2}-\d{2}$/.test(arg ?? "")) { session = { ...session, ambient: { start: arg, end: arg, text: arg } }; msg = `session as-of set to ${arg}`; }
    else msg = "usage: /freshtime asof <YYYY-MM-DD>|clear";
  } else if (sub === "trace") msg = traces(Number(arg ?? 10) || 10);
  else {
    const s = summary(d, now);
    msg = [
      `facts ${s.total}  status ${JSON.stringify(s.byStatus)}  fallback traces ${s.fallbacks}`,
      `kind ${JSON.stringify(s.byKind)}`,
      `session as-of: ${session.ambient ? session.ambient.text : "none"}`,
      "top projects:", ...s.byProject.map(([p, n]) => `  ${n}  ${p}`),
      "last 10 traces:", traces(10),
      remainingText(),
    ].join("\n");
  }
  out(ctx, msg);
  status(ctx);
}

export default function (pi: ExtensionAPI) {
  pi.registerTool(askTool);
  pi.registerTool(intentTool);
  pi.registerTool(queryTool);
  pi.registerTool(verifyTool);
  pi.registerCommand("freshtime", {
    description: "Ledger summary. Subcommands: ingest, maintain [n], asof <date>|clear, trace [n]",
    handler: async (args, ctx) => {
      try { await command(args ?? "", ctx); } catch (e) { out(ctx, `freshtime: ${e instanceof Error ? e.message : String(e)}`, "error"); }
    },
  });

  pi.on("session_start", async (_e, ctx) => {
    const report: string[] = [];
    try {
      session = { now: today(), ambient: null };
      lastIntent = null;
      turn = null;
      const d = need();
      traceBase = (d.prepare("SELECT COALESCE(MAX(id), 0) AS n FROM traces").get() as { n: number }).n;
      report.push(await ingest());
    } catch (e) {
      out(ctx, `[pi-time] startup ledger error: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
    try { report.push(remainingText()); } catch (e) { report.push(`remaining work unavailable: ${e instanceof Error ? e.message : String(e)}`); }
    const msg = report.join("\n");
    ctx.ui.notify(msg, "info");
    for (const l of msg.split("\n")) console.error(`[pi-time] ${l}`);
    status(ctx);
  });

  pi.on("before_agent_start", async (e, ctx) => {
    try {
      const intent = await parse(e.prompt);
      turn = { prompt: e.prompt, intent };
      console.error(`[pi-time] reading: ${describeIntent(intent)} | mode ${intent.asof_mode} anchor ${intent.anchor?.start ?? "none"} basis ${intent.basis} path ${intent.path}`);
      status(ctx);
      return { systemPrompt: e.systemPrompt + guidance(intent) };
    } catch (err) {
      console.error(`[pi-time] intent parse failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  pi.on("turn_end", async (_e, ctx) => { status(ctx); });
  pi.on("tool_execution_end", async (_e, ctx) => { status(ctx); });
}
