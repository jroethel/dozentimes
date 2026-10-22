// One batched Jev request per turn: must tags, harmful tags, and the stated-time question.
import { askJev } from "../../freshtime-core/jev.ts";

export interface Judged { must: Record<string, number>; harmful: Record<string, number>; stated: number; ms: number; tokens: number }

export async function judge(question: string, answer: string, must: Record<string, string>, harmful: Record<string, string>): Promise<Judged> {
  const qs: Record<string, { type: "noul"; instructions: string }> = {
    stated: { type: "noul", instructions: "Does the answer say which date or period it is answering for?" },
  };
  for (const [t, fact] of Object.entries(must)) qs[`must:${t}`] = { type: "noul", instructions: `Does the answer include this fact, in any wording: "${fact}"?` };
  for (const [t, fact] of Object.entries(harmful)) qs[`harm:${t}`] = { type: "noul", instructions: `Does the answer present "${fact}" as true for the date or period the question asks about? Mentioning it as replaced, superseded, earlier, or later does not count.` };
  const state = `Question asked: ${question}\n\nAnswer given:\n${answer}`;
  let r;
  try { r = await askJev(state, qs, 30000); } catch { r = await askJev(state, qs, 30000); }
  const p = (k: string): number => { const a = r.answers[k]; return a && a.type === "noul" ? a.noul : NaN; };
  const pick = (pre: string, o: Record<string, string>) => Object.fromEntries(Object.keys(o).map((t) => [t, p(pre + t)]));
  return { must: pick("must:", must), harmful: pick("harm:", harmful), stated: p("stated"), ms: r.ms, tokens: r.tokens };
}
