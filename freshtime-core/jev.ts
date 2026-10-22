// Minimal Jev (TypeSafe System One) client. See docs/research/jev-api.md.
// Callers always have a deterministic fallback, so this throws instead of guessing.

const URL = "https://api.typesafe.ai/v1/systemone";
const MODEL = process.env.FRESHTIME_JEV_MODEL ?? "jev-1.13.0";

export type JevQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string };

export type JevAnswer =
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "noul"; noul: number };

export const jevEnabled = (): boolean =>
  !!process.env.TYPESAFE_API_KEY && process.env.FRESHTIME_JEV !== "off";

export async function askJev(
  state: string,
  questions: Record<string, JevQuestion>,
  timeoutMs = 4000,
): Promise<{ answers: Record<string, JevAnswer>; ms: number; tokens: number }> {
  if (!jevEnabled()) throw new Error(process.env.TYPESAFE_API_KEY ? "jev disabled by FRESHTIME_JEV=off" : "TYPESAFE_API_KEY not set");
  const t0 = performance.now();
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, state, questions }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json()) as { answers?: Record<string, JevAnswer>; usage?: { input_tokens: number } };
  if (!res.ok || !json.answers) throw new Error(`jev ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return { answers: json.answers, ms: Math.round(performance.now() - t0), tokens: json.usage?.input_tokens ?? 0 };
}
