import { test } from "node:test";
import assert from "node:assert/strict";

process.env.FRESHTIME_JEV = "off";
const { runAll, interaction } = await import("./ablation.ts");

test("both tools together beat either alone on the synthetic script", async () => {
  const { rows, totals: t } = await runAll(false);
  const harm = (c: string, id: string) => rows.find((r) => r.config === c && r.id === id)!.harm;

  // Together: every gold fact with the right status, and nothing false shown as true.
  assert.equal(t.both.status_ok, 1);
  assert.equal(t.both.harm, 0);
  for (const c of ["none", "intf", "agnt"] as const) assert.ok(t.both.status_ok > t[c].status_ok, c);

  // Harm falls by more than the sum of what each tool removes alone.
  assert.ok(interaction(t, "harm") < 0);
  // Why: the ledger alone fixes the "now" question but shows the newest fact as true for past and inherited ones,
  // and intent alone reads the past right but shows a stale fact as current.
  assert.equal(harm("agnt", "q1"), 0);
  for (const id of ["q2", "q3", "q4"]) assert.ok(harm("agnt", id) > 0, id);
  assert.ok(harm("intf", "q1") > 0);
});

test("intent spends the ledger's re-reads only where the question is about now", async () => {
  const { totals: t } = await runAll(false, true);
  assert.ok(t.both.checks < t.agnt.checks);
  assert.ok(t.both.caught >= 1);
  assert.equal(t.both.harm, 0);
});
