// The 1+1=3 test: the same question script under four configurations.
// Run `node test/ablation.ts` for the table. Flags: --jev lets intf call Jev live, --cold re-ingests before every question.

import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, parseIso } from "../dozentimes-core/index.ts";
import type { LedgerFact, Session, TemporalIntent } from "../dozentimes-core/index.ts";
import { discoverSources, ingestPaths, readFacts } from "../dozentimes-agnt/ledger.ts";
import { parseIntent } from "../dozentimes-intf/intent.ts";

const FIX = fileURLToPath(new URL("./fixtures/ablation/", import.meta.url));
const plan = JSON.parse(readFileSync(join(FIX, "edits.json"), "utf8"));
const script = JSON.parse(readFileSync(join(FIX, "questions.json"), "utf8")).questions as Question[];

interface Question { id: string; q: string; must: Record<string, string[]>; harmful: string[] }
export const CONFIGS = ["none", "intf", "agnt", "both"] as const;
type Config = (typeof CONFIGS)[number];

export interface Row { config: Config; id: string; recall: number; status_ok: number; harm: number; checks: number; caught: number }

const has = (f: LedgerFact, tag: string) => f.text.toLowerCase().includes(tag.toLowerCase());
const asTrue = (f: LedgerFact) => f.status === "current" || f.status === "current_then";

function score(q: Question, facts: LedgerFact[]) {
  const tags = Object.keys(q.must);
  const found = tags.filter((t) => facts.some((f) => has(f, t)));
  const ok = tags.filter((t) => facts.some((f) => has(f, t) && q.must[t].includes(f.status)));
  const harm = q.harmful.filter((t) => facts.some((f) => has(f, t) && asTrue(f))).length;
  return { recall: found.length / tags.length, status_ok: ok.length / tags.length, harm };
}

// A fresh copy of the fixtures, ingested at ingest_at, then edited behind the ledger's back.
async function setup(config: Config) {
  const dir = mkdtempSync(join(tmpdir(), `ft-ablation-${config}-`));
  cpSync(FIX, dir, { recursive: true, filter: (p) => !p.endsWith(".json") });
  const db = openDb(":memory:");
  const stamp = (file: string, day: string) => utimesSync(file, parseIso(day), parseIso(day));
  for (const p of discoverSources([dir])) stamp(p, plan.ingest_at);
  await ingestPaths(db, discoverSources([dir]), plan.ingest_at);
  for (const e of plan.edits) {
    appendFileSync(join(dir, e.file), e.append);
    stamp(join(dir, e.file), e.at);
  }
  return { db, done: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}

// cold = every question meets a freshly ingested ledger, so one question's re-reads cannot pay for the next.
// The conversation (intf session) still carries across turns in both modes.
export async function runConfig(config: Config, jev = false, cold = false): Promise<Row[]> {
  const useIntf = config === "intf" || config === "both";
  const ledger = config === "agnt" || config === "both";
  let session: Session = { now: plan.now, ambient: null };
  let env = await setup(config);
  const rows: Row[] = [];
  try {
    for (const q of script) {
      if (cold && rows.length) { env.done(); env = await setup(config); }
      let intent: TemporalIntent | null = null;
      if (useIntf) ({ intent, session } = await parseIntent(q.q, session, { jev }));
      const r = readFacts(env.db, intent, { now: plan.now, ledger, verify: ledger, query: q.q });
      rows.push({ config, id: q.id, ...score(q, r.facts), checks: r.checks, caught: r.caught });
    }
  } finally {
    env.done();
  }
  return rows;
}

export interface Totals { recall: number; status_ok: number; harm: number; checks: number; caught: number }

export function totals(rows: Row[]): Totals {
  const n = rows.length;
  const sum = (k: keyof Totals) => rows.reduce((a, r) => a + r[k], 0);
  return { recall: sum("recall") / n, status_ok: sum("status_ok") / n, harm: sum("harm"), checks: sum("checks"), caught: sum("caught") };
}

// Interaction term: (both - none) - (intf - none) - (agnt - none). Positive means the pair beats the sum of its parts.
export const interaction = (t: Record<Config, Totals>, k: keyof Totals): number =>
  t.both[k] - t.intf[k] - t.agnt[k] + t.none[k];

export async function runAll(jev = false, cold = false) {
  const rows: Row[] = [];
  for (const c of CONFIGS) rows.push(...(await runConfig(c, jev, cold)));
  const t = Object.fromEntries(CONFIGS.map((c) => [c, totals(rows.filter((r) => r.config === c))])) as Record<Config, Totals>;
  return { rows, totals: t };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const jev = process.argv.includes("--jev");
  const cold = process.argv.includes("--cold");
  if (!jev) process.env.DOZENTIMES_JEV = "off";
  const { rows, totals: t } = await runAll(jev, cold);
  const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(5);
  console.log(`intf path: ${jev ? "jev" : "fallback"}, ledger: ${cold ? "cold per question" : "carried through the script"}\n`);
  console.log("question  " + CONFIGS.map((c) => c.padEnd(16)).join(""));
  for (const q of script) {
    const cells = CONFIGS.map((c) => {
      const r = rows.find((x) => x.config === c && x.id === q.id)!;
      return `${pct(r.status_ok)} h${r.harm} c${r.checks}`.padEnd(16);
    });
    console.log(q.id.padEnd(10) + cells.join(""));
  }
  console.log("\ntotals    recall status_ok harm checks caught");
  for (const c of CONFIGS) {
    const x = t[c];
    console.log(`${c.padEnd(10)}${pct(x.recall)}  ${pct(x.status_ok)}    ${String(x.harm).padStart(3)}  ${String(x.checks).padStart(4)}  ${String(x.caught).padStart(5)}`);
  }
  console.log("\ninteraction (both - intf - agnt + none)");
  for (const k of ["recall", "status_ok", "harm"] as const) console.log(`  ${k.padEnd(10)} ${interaction(t, k).toFixed(2)}`);
  console.log("\ncell = status_ok, h = harmful facts shown as true, c = source re-reads");
}
