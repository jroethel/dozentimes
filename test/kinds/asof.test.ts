import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../../freshtime-core/index.ts";
import type { Session } from "../../freshtime-core/index.ts";
import { parseIntent } from "../../freshtime-intf/intent.ts";
import { readFacts } from "../../freshtime-agnt/ledger.ts";
import { build, replay, tmp } from "./helpers.ts";

const NOW = "2026-10-22";

test("a stated as-of carries until a new period or a now question changes it", async () => {
  const { repo } = build("asof");
  const db = openDb(":memory:");
  await replay(db, repo, tmp("asof-work"), ["2026-09-05", "2026-10-01", "2026-10-20"]);
  let session: Session = { now: NOW, ambient: null };
  const turn = async (q: string) => {
    const r = await parseIntent(q, session, { jev: false });
    session = r.session;
    const facts = readFacts(db, r.intent, { now: NOW, ledger: true, verify: false }).facts.filter((f) => f.text.startsWith("Next:"));
    return { i: r.intent, facts: facts.map((f) => `${f.text.slice(6, 11)}:${f.status}`) };
  };

  const t1 = await turn("As of Oct 14, what was the plan for orchard?");
  assert.deepEqual([t1.i.basis, t1.i.asof_mode, t1.i.anchor?.start], ["stated", "past", "2026-10-14"]);
  assert.equal(session.ambient?.start, "2026-10-14");
  assert.deepEqual(t1.facts, ["revie:current_then"]);

  const t2 = await turn("and the next step for orchard?");
  assert.deepEqual([t2.i.basis, t2.i.asof_mode, t2.i.anchor?.start], ["inherited", "past", "2026-10-14"]);
  assert.deepEqual(t2.facts, ["revie:current_then"]);

  const t3 = await turn("and in September, what was the plan for orchard?");
  assert.deepEqual([t3.i.basis, t3.i.asof_mode, t3.i.anchor?.start, t3.i.anchor?.end], ["stated", "range", "2026-09-01", "2026-09-30"]);
  assert.deepEqual(t3.facts, ["draft:current_then"]);

  const t4 = await turn("what is the orchard plan now?");
  assert.deepEqual([t4.i.asof_mode, t4.i.anchor, session.ambient], ["current", null, null]);
  assert.deepEqual(t4.facts.sort(), ["draft:replaced", "revie:replaced", "ship :current"]);
});
