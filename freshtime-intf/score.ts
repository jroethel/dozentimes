// node freshtime-intf/score.ts  - scores the fallback path and the Jev path on test/fixtures/intent-questions.json.
import { readFileSync } from "node:fs";
import type { Anchor } from "../freshtime-core/contract.ts";
import { jevEnabled } from "../freshtime-core/jev.ts";
import { parseIntent } from "./intent.ts";

interface Item { question: string; ambient: Anchor | null; asof_mode: string; anchor: { start: string; end: string } | null; basis: string }
const { now, items } = JSON.parse(readFileSync(new URL("../test/fixtures/intent-questions.json", import.meta.url), "utf8")) as { now: string; items: Item[] };

async function score(jev: boolean) {
  const hit = { asof_mode: 0, anchor: 0, basis: 0 };
  const miss: string[] = [];
  let ms = 0;
  for (const it of items) {
    const t0 = performance.now();
    const { intent: i } = await parseIntent(it.question, { now, ambient: it.ambient }, { jev });
    ms += performance.now() - t0;
    const ok = {
      asof_mode: i.asof_mode === it.asof_mode,
      anchor: (i.anchor?.start ?? null) === (it.anchor?.start ?? null) && (i.anchor?.end ?? null) === (it.anchor?.end ?? null),
      basis: i.basis === it.basis,
    };
    for (const k of Object.keys(hit) as (keyof typeof hit)[]) if (ok[k]) hit[k]++;
    const bad = Object.entries(ok).filter(([, v]) => !v).map(([k]) => k);
    if (bad.length) miss.push(`  ${bad.join(",")}: ${it.question} -> ${i.asof_mode} ${i.anchor?.start ?? "-"}..${i.anchor?.end ?? "-"} ${i.basis}${i.fallback_reason ? " [" + i.fallback_reason + "]" : ""}`);
  }
  const pct = (n: number) => `${n}/${items.length}`;
  console.log(`${jev ? "jev" : "fallback"}: asof_mode ${pct(hit.asof_mode)}  anchor ${pct(hit.anchor)}  basis ${pct(hit.basis)}  avg ${Math.round(ms / items.length)} ms/question`);
  miss.forEach((m) => console.log(m));
}

await score(false);
if (jevEnabled()) await score(true);
else console.log("jev: skipped (no TYPESAFE_API_KEY or FRESHTIME_JEV=off)");
