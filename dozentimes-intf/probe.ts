// node dozentimes-intf/probe.ts [--runs N] - is Jev doing anything the rules do not?
// Scores three paths on test/fixtures/intent-probe.json: the rules alone, Jev's raw mode choice alone, and the
// combined parseIntent (rules + Jev + guards). Jev never sees the rules' answer, so agreement is not copying.
import { readFileSync } from "node:fs";
import type { Anchor } from "../dozentimes-core/contract.ts";
import { jevEnabled } from "../dozentimes-core/jev.ts";
import { fallbackIntent, jevAnswers, parseIntent } from "./intent.ts";

interface Item { group: string; why: string; question: string; ambient: Anchor | null; modes: string[]; anchor: { start: string; end: string } | null | "any" }
const { now, items } = JSON.parse(readFileSync(new URL("../test/fixtures/intent-probe.json", import.meta.url), "utf8")) as { now: string; items: Item[] };
if (!jevEnabled()) { console.log("needs TYPESAFE_API_KEY"); process.exit(1); }
const runs = Number(process.argv[process.argv.indexOf("--runs") + 1]) || 1;

const anchorOk = (it: Item, a: { start: string; end: string } | null) =>
  it.anchor === "any" || (it.anchor === null ? a === null : a?.start === it.anchor.start && a?.end === it.anchor.end);

type Path = "rules" | "jev" | "combined";
const tally: Record<string, Record<Path, number>> = {};
const flips: string[] = [];
const rows: string[] = [];
for (let r = 0; r < runs; r++) {
  for (const it of items) {
    const session = { now, ambient: it.ambient };
    const rules = fallbackIntent(it.question, session).intent;
    const raw = await jevAnswers(it.question, session);
    const a = raw.asof;
    const jevMode = a?.type === "choice" ? a.choice : "?";
    const jevConf = a?.type === "choice" ? a.confidence : 0;
    const comb = (await parseIntent(it.question, session, { jev: true })).intent;
    const ok = {
      rules: it.modes.includes(rules.asof_mode) && anchorOk(it, rules.anchor),
      jev: it.modes.includes(jevMode),
      combined: it.modes.includes(comb.asof_mode) && anchorOk(it, comb.anchor),
    };
    const t = (tally[it.group] ??= { rules: 0, jev: 0, combined: 0 });
    for (const k of Object.keys(ok) as Path[]) if (ok[k]) t[k]++;
    if (r === 0) {
      const mark = (b: boolean) => (b ? "ok " : "-- ");
      rows.push(`${it.group.padEnd(8)}${mark(ok.rules)}${rules.asof_mode.padEnd(8)} ${mark(ok.jev)}${(jevMode + " " + jevConf.toFixed(2)).padEnd(13)} ${mark(ok.combined)}${comb.asof_mode.padEnd(8)} ${it.question.slice(0, 52)}`);
      if (ok.jev && !ok.rules && !ok.combined) flips.push(`  guard or threshold kept the rules' wrong answer: ${it.question}`);
      if (!ok.jev && ok.rules && !ok.combined) flips.push(`  Jev overrode a right rules answer: ${it.question}`);
    }
  }
}

console.log(`group   rules           jev (raw, conf)       combined         question (run 1 of ${runs})`);
rows.forEach((r) => console.log(r));
console.log("\naccuracy by group (as-of mode; rules and combined also need the anchor)");
for (const [g, t] of Object.entries(tally)) {
  const n = items.filter((i) => i.group === g).length * runs;
  console.log(`  ${g.padEnd(8)} rules ${t.rules}/${n}   jev ${t.jev}/${n}   combined ${t.combined}/${n}`);
}
if (flips.length) { console.log("\nwhere the combination lost what Jev had right, or Jev broke the rules:"); flips.forEach((f) => console.log(f)); }
