// Charge: how much a fact has mattered lately, after mnemodyne's reinforce-on-recall (swombat/mnemodyne).
// Each read adds a share of the remaining headroom to a fact's charge, and charge halves every
// CHARGE_HALF_LIFE_DAYS, so frequent recent reads outrank one stray read and old reads fade.
// Facts returned by the same read get a co-read link that is reinforced and decays the same way.
// Decay is computed when a value is read or written, from its stamp, so there is no sweep to schedule.
import type { DatabaseSync } from "node:sqlite";
import { daysBetween } from "../dozentimes-core/index.ts";

export const CHARGE_HALF_LIFE_DAYS = 14;
export const REINFORCE = 0.1; // a read adds this share of the headroom left below 1
export const LINK = 0.1; // a co-read adds this share of the headroom left on the link
export const MAX_LINKED = 8; // only the first facts of a read are linked, so one broad read cannot wire everything

// A value stamped at `at`, decayed to `now`. A value with no stamp is 0.
export const decayed = (value: number, at: string | null, now: string): number =>
  at === null ? 0 : value * 0.5 ** (Math.max(0, daysBetween(at, now)) / CHARGE_HALF_LIFE_DAYS);

const grow = (v: number, share: number): number => v + share * (1 - v);

// Called with the facts one read returned, in rank order.
export function reinforce(db: DatabaseSync, ids: number[], now: string): void {
  const uniq = [...new Set(ids)];
  const get = db.prepare("SELECT charge, charge_at FROM facts WHERE id = ?");
  const set = db.prepare("UPDATE facts SET charge = ?, charge_at = ?, last_accessed_at = ?, access_count = access_count + 1 WHERE id = ?");
  for (const id of uniq) {
    const r = get.get(id) as { charge: number; charge_at: string | null } | undefined;
    if (r) set.run(grow(decayed(r.charge, r.charge_at, now), REINFORCE), now, now, id);
  }
  const linked = uniq.slice(0, MAX_LINKED);
  const getL = db.prepare("SELECT weight, updated_at FROM fact_links WHERE a = ? AND b = ?");
  const setL = db.prepare("INSERT OR REPLACE INTO fact_links (a, b, weight, updated_at) VALUES (?, ?, ?, ?)");
  for (let i = 0; i < linked.length; i++)
    for (let j = i + 1; j < linked.length; j++) {
      const [a, b] = linked[i] < linked[j] ? [linked[i], linked[j]] : [linked[j], linked[i]];
      const l = getL.get(a, b) as { weight: number; updated_at: string } | undefined;
      setL.run(a, b, grow(l ? decayed(l.weight, l.updated_at, now) : 0, LINK), now);
    }
}

export function chargeOf(db: DatabaseSync, id: number, now: string): number {
  const r = db.prepare("SELECT charge, charge_at FROM facts WHERE id = ?").get(id) as { charge: number; charge_at: string | null } | undefined;
  return r ? decayed(r.charge, r.charge_at, now) : 0;
}

// The strongest link from this fact to a companion that was closed, by anything but a rewording, after this fact was
// last verified. Facts read together tend to go stale together, so a changed companion is a reason to check first.
export function changedCompanion(db: DatabaseSync, id: number, lastVerified: string, now: string): number {
  const rows = db.prepare(`SELECT l.weight, l.updated_at FROM fact_links l
    JOIN facts g ON g.id = CASE WHEN l.a = @id THEN l.b ELSE l.a END
    WHERE (l.a = @id OR l.b = @id) AND g.invalid_at IS NOT NULL AND g.invalid_at > @lv AND g.invalid_at <= @now
      AND g.closed_by IS NOT 'reworded'`).all({ id, lv: lastVerified, now }) as { weight: number; updated_at: string }[];
  return Math.max(0, ...rows.map((r) => decayed(r.weight, r.updated_at, now)));
}

// The most charged live facts, for summaries.
export function hottest(db: DatabaseSync, now: string, n = 5): { id: number; project: string; text: string; charge: number }[] {
  return (db.prepare("SELECT id, project, text, charge, charge_at FROM facts WHERE invalid_at IS NULL AND charge_at IS NOT NULL").all() as any[])
    .map((r) => ({ id: r.id as number, project: r.project as string, text: r.text as string, charge: decayed(r.charge, r.charge_at, now) }))
    .filter((r) => r.charge > 0.001)
    .sort((a, b) => b.charge - a.charge || a.id - b.id)
    .slice(0, n);
}
