import { test } from "node:test";
import assert from "node:assert/strict";
import { fallbackIntent } from "../../freshtime-intf/intent.ts";
import { data } from "./helpers.ts";

interface Q { q: string; now: string; kinds: string[]; fy: { start: string; end: string } }

for (const g of data<Q[]>("business", "questions.json")) {
  test(`"${g.q}" adds the business kind`, () => {
    const { intent } = fallbackIntent(g.q, { now: g.now, ambient: null });
    for (const k of g.kinds) assert.ok(intent.kinds.includes(k as any), `kinds were ${intent.kinds}`);
  });

  // FRESHTIME_FISCAL_START is the proposed knob for the fiscal calendar, month-day of the first day of FY.
  test(`"${g.q}" with a July 1 fiscal year anchors ${g.fy.start}..${g.fy.end}`, { todo: "#9" }, () => {
    process.env.FRESHTIME_FISCAL_START = "07-01";
    try {
      const { intent } = fallbackIntent(g.q, { now: g.now, ambient: null });
      assert.deepEqual([intent.anchor?.start, intent.anchor?.end], [g.fy.start, g.fy.end]);
    } finally { delete process.env.FRESHTIME_FISCAL_START; }
  });
}
