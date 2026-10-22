import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../freshtime-core/index.ts";
import { fallbackIntent } from "../../freshtime-intf/intent.ts";
import { readFacts } from "../../freshtime-agnt/ledger.ts";
import { build, replay, tmp } from "./helpers.ts";

const NOW = "2026-10-22";
const ask = async () => {
  const { repo } = build("event");
  const db = openDb(":memory:");
  await replay(db, repo, tmp("event-work"), ["2026-08-20", "2026-08-28", "2026-09-03", "2026-09-17", "2026-10-05"]);
  const { intent } = fallbackIntent("what did orchard ship in September", { now: NOW, ambient: null });
  return { intent, res: readFacts(db, intent, { now: NOW, ledger: true, verify: false }) };
};

test("a September question returns September-dated facts and excludes August and October", async () => {
  const { intent, res } = await ask();
  assert.equal(intent.asof_mode, "range");
  assert.deepEqual([intent.anchor!.start, intent.anchor!.end], ["2026-09-01", "2026-09-30"]);
  const dates = res.facts.map((f) => f.valid_at).sort();
  assert.deepEqual(dates, ["2026-09-03", "2026-09-17"]);
});

test("a fact written in October that says it shipped 2026-09-03 counts as a September event", { todo: "not built: in-text event dates" }, async () => {
  const { res } = await ask();
  assert.ok(res.facts.some((f) => f.text.includes("shipped on 2026-09-03")));
});
