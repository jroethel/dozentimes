// node freshtime-agnt/cli.ts <ingest|summary|query|maintain|trace> [args]
import { homedir } from "node:os";
import { join } from "node:path";
import { openDb, recentTraces, today } from "../freshtime-core/index.ts";
import { discoverSources, ingestPaths, maintain, readFacts, summary } from "./ledger.ts";

const [cmd, ...args] = process.argv.slice(2);
const db = openDb();
const now = today();

if (cmd === "ingest") {
  const roots = args.length ? args : [join(homedir(), "create"), join(homedir(), "repos")];
  const paths = discoverSources(roots);
  const r = await ingestPaths(db, paths, now);
  console.log(`files ${paths.length} added ${r.added} replaced ${r.replaced}`);
} else if (cmd === "summary") {
  const s = summary(db, now);
  console.log(`facts ${s.total}  last ingest ${s.lastIngest ?? "never"}  fallback traces ${s.fallbacks}`);
  console.log("status", JSON.stringify(s.byStatus));
  console.log("kind", JSON.stringify(s.byKind));
  console.log("kind source", JSON.stringify(s.kindPaths));
  for (const [kind, l] of Object.entries(s.lives))
    console.log(`shelf life ${kind}: ${l.days === null ? "never goes stale" : `${l.days} days`} (${l.fitted ? "fitted" : "hand-set"}, checks ${l.n}, facts ${l.facts}, user ${l.user})`);
  for (const [p, n] of s.byProject) console.log(`  ${String(n).padStart(5)}  ${p}`);
} else if (cmd === "query") {
  const r = readFacts(db, null, { now, ledger: true, verify: false, query: args.join(" ") });
  for (const f of r.facts) console.log(`[${f.status}] (${f.kind}, ${f.valid_at}) ${f.project}: ${f.text.slice(0, 160)}`);
} else if (cmd === "maintain") {
  console.log(JSON.stringify(await maintain(db, now, Number(args[0] ?? 20))));
} else if (cmd === "trace") {
  for (const t of recentTraces(db, Number(args[0] ?? 10))) console.log(`${t.ts} ${t.tool} ${t.path ?? "-"} ${t.ms ?? "-"}ms ${t.error ?? ""} ${t.output ?? ""}`);
} else {
  console.log("usage: cli.ts ingest [roots...] | summary | query <text> | maintain [budget] | trace [n]");
  process.exitCode = 1;
}
