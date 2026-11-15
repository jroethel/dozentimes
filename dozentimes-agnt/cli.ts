// node dozentimes-agnt/cli.ts <ingest|summary|query|maintain|trace|remind|capsules|resolve> [args]
import { homedir } from "node:os";
import { join } from "node:path";
import { openDb, recentTraces, today } from "../dozentimes-core/index.ts";
import type { CapsuleState } from "../dozentimes-core/index.ts";
import { parseIntent } from "../dozentimes-intf/intent.ts";
import { discoverSources, ingestPaths, maintain, readFacts, summary } from "./ledger.ts";
import { describeCapsule, fireCapsules, listCapsules, resolveCapsule, sealCapsule } from "./capsules.ts";

const [cmd, ...args] = process.argv.slice(2);
const db = openDb();
const now = today();
const intentOf = async (text: string) => (await parseIntent(text, { now, ambient: null }, { db })).intent;

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
  for (const h of s.hottest) console.log(`charge ${h.charge.toFixed(2)}  #${h.id} ${h.project}: ${h.text.slice(0, 100)}`);
} else if (cmd === "query") {
  const r = readFacts(db, null, { now, ledger: true, verify: false, query: args.join(" ") });
  for (const f of r.facts) console.log(`[${f.status}] (${f.kind}, ${f.valid_at}) ${f.project}: ${f.text.slice(0, 160)}`);
} else if (cmd === "maintain") {
  console.log(JSON.stringify(await maintain(db, now, Number(args[0] ?? 20))));
} else if (cmd === "trace") {
  for (const t of recentTraces(db, Number(args[0] ?? 10))) console.log(`${t.ts} ${t.tool} ${t.path ?? "-"} ${t.ms ?? "-"}ms ${t.error ?? ""} ${t.output ?? ""}`);
} else if (cmd === "remind") {
  // remind "<what, with when>" seals a capsule; the time phrase in the text is read the way a question is
  const text = args.join(" ");
  console.log(describeCapsule(sealCapsule(db, text, await intentOf(text), now), now));
} else if (cmd === "capsules") {
  fireCapsules(db, now);
  const cs = listCapsules(db, args[0] as CapsuleState | undefined);
  console.log(cs.length ? cs.map((c) => describeCapsule(c, now)).join("\n") : "no capsules");
} else if (cmd === "resolve") {
  // resolve <id> surface | dismiss <reason> | rearm <when>
  const [id, action, ...rest] = args;
  const r = action === "surface" ? { action: "surface" as const }
    : action === "dismiss" ? { action: "dismiss" as const, reason: rest.join(" ") }
    : action === "rearm" ? { action: "rearm" as const, intent: await intentOf(rest.join(" ")) }
    : null;
  if (!r) { console.log("usage: cli.ts resolve <id> surface | dismiss <reason> | rearm <when>"); process.exitCode = 1; }
  else console.log(describeCapsule(resolveCapsule(db, Number(id), r, now), now));
} else {
  console.log("usage: cli.ts ingest [roots...] | summary | query <text> | maintain [budget] | trace [n] | remind <text> | capsules [state] | resolve <id> <action> [...]");
  process.exitCode = 1;
}
