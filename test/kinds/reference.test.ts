import { test } from "node:test";
import assert from "node:assert/strict";
import { fallbackIntent } from "../../dozentimes-intf/intent.ts";
import { openDb } from "../../dozentimes-core/index.ts";
import { readFacts } from "../../dozentimes-agnt/ledger.ts";
import { build, data, ingestDir } from "./helpers.ts";

interface Q { q: string; now: string; start: string; end: string }

for (const g of data<Q[]>("reference", "questions.json")) {
  test(`"${g.q}" on ${g.now} resolves to ${g.start}..${g.end}`, () => {
    const { intent } = fallbackIntent(g.q, { now: g.now, ambient: null });
    assert.deepEqual([intent.anchor?.start, intent.anchor?.end], [g.start, g.end]);
  });
}

test("a doc line saying next week, written in a 2026-09-07 session, resolves to the week of 2026-09-14", { todo: "not built: relative phrases in docs" }, async () => {
  const { repo } = build("reference");
  const db = openDb(":memory:");
  await ingestDir(db, repo, "2026-09-07");
  const [f] = readFacts(db, null, { now: "2026-09-07", ledger: true, verify: false, query: "ship the orchard importer" }).facts;
  assert.match(f.text, /next week we ship/i);
  assert.match(JSON.stringify(f), /2026-09-14/);
});
