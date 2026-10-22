import { test } from "node:test";
import assert from "node:assert/strict";

process.env.FRESHTIME_JEV = "off";
const { runAll, interaction } = await import("./ablation.ts");

test("both tools together beat either alone on the synthetic script", async () => {
  const { totals: t } = await runAll(false);

  // Together: every gold fact with the right status, and nothing false shown as true.
  assert.equal(t.both.status_ok, 1);
  assert.equal(t.both.harm, 0);
  for (const c of ["none", "intf", "agnt"] as const) assert.ok(t.both.status_ok > t[c].status_ok, c);

  // Harm falls by more than the sum of what each tool removes alone.
  // The ledger alone removes none: it fixes current questions and breaks historical ones.
  assert.ok(interaction(t, "harm") < 0);
  assert.equal(t.agnt.harm, t.none.harm);
});

test("intent spends the ledger's re-reads only where the question is about now", async () => {
  const { totals: t } = await runAll(false, true);
  assert.ok(t.both.checks < t.agnt.checks);
  assert.ok(t.both.caught >= 1);
  assert.equal(t.both.harm, 0);
});
