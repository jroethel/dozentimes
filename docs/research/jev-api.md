# Jev API reference for a TypeScript client

Verified 2026-10-21 against docs.typesafe.ai and live calls with Node 26.12 and plain fetch.
Local notes had no API shapes, so shapes come from live docs and my own calls.

## Endpoint and auth

- `POST https://api.typesafe.ai/v1/systemone` (one endpoint for every question type).
- `GET https://api.typesafe.ai/v1/models` lists aliases.
- Header `Authorization: Bearer $TYPESAFE_API_KEY` and `Content-Type: application/json`.
- Models: `jev-1.13.0` (what `jev-latest` points to), `jev-1.14.0` (`jev-preview`).
- Pin a versioned id so tuned thresholds do not move.
- The response `model` field names the id that answered.
- An official SDK exists: `npm install @typesafe-ai/sdk` (Node 22+, `choice()` and `noul()` helpers).
- Not used here.

## Request shape

Top level: `model`, `state` (string, object or array), `questions` (map of your own ids to question objects).
Question ids are for your code only and are not sent to the model.
Put the full meaning in `instructions`.
Backticked paths like `` `ticket.text` `` can reference nested state.

## Primitive 1: Choice (pick one label)

`criteria` is required (422 without it).
Keys are labels, values describe each label.
Limit is 255 options per question (OpenAPI `maxProperties: 255`).
Request (call 2 of 2 in my session, single question):

```json
{"model":"jev-1.13.0","state":"Next quarter we will probably switch vendors.","questions":{"asof":{"type":"choice","instructions":"Which time reference does the text need?","criteria":{"current":"now","past":"a past moment","range":"a span of time","future":"a future moment","mixed":"several","none":"no time reference"}}}}
```

Response (HTTP 200):

```json
{"model":"jev-1.13.0","answers":{"asof":{"type":"choice","choice":"future","confidence":1.0,"probabilities":{"current":0.0,"past":0.0,"range":0.0,"future":1.0,"mixed":0.0,"none":0.0}}},"usage":{"input_tokens":374,"output_tokens":60}}
```

- `choice` is the winning label. `probabilities` sums to about 1 over all labels.
- `confidence` is 0 to 1 and measures how concentrated the distribution is (1 means all mass on one label).
- Avoid overlapping labels.
- They split the probability.
- Add `other` or `none` when the list may not cover the input.

## Primitive 2: Noul (yes/no)

`instructions` is the question or a statement to judge. `criteria` is optional: `{"true": "...", "false": "..."}`.
Request:

```json
{"model":"jev-1.13.0","state":"Thanks, that fixed it!","questions":{"human":{"type":"noul","instructions":"Is the customer asking for a human agent?"}}}
```

Response (HTTP 200):

```json
{"model":"jev-1.13.0","answers":{"human":{"type":"noul","noul":0.03}},"usage":{"input_tokens":281,"output_tokens":20}}
```

- `noul` is P(yes) from 0 to 1.
- There is no separate `confidence` for Noul.
- Use `Math.abs(noul - 0.5) * 2` if you want a confidence-like number (the docs suggest distance from 0.5).
- A value near 0.5 means yes and no are about equally likely, not "somewhat true".
- Docs example thresholds: 0.9 to act on a costly yes, 0.5 when errors are symmetric.
- Tune on your own data.

## Batching

Put several questions in one request and mix types freely.
They are evaluated in parallel against the same `state`, cannot see each other, and come back under the same ids.
There is no limit on question count.
The only limits are 64k tokens per request and 32k per question.
Header `TypeSafe-Danger-Zone-Long-Context: true` raises both to 262k at the same price but slower and less accurate.
The docs' parallel-questions cookbook reports batching 13 questions as 12.2x cheaper and 10.0x faster than separate calls (vendor claim, not re-measured).
Request and response from my real mixed call (1 Choice plus 1 Noul):

```json
{"model":"jev-1.13.0","state":"My home address is 12 Oak St. I moved there in 2019 and I might move again next year.","questions":{"volatility":{"type":"choice","instructions":"How quickly does the fact in this text go stale?","criteria":{"identity":"Almost never changes (name, birthplace)","preference":"Changes slowly (tastes, habits)","decision":"A choice that may be revisited (plans, commitments)","status":"Current situation that changes often (address, job, availability)"}},"mentions_move":{"type":"noul","instructions":"Does the text mention a possible future move?"}}}
```

```json
{"model":"jev-1.13.0","answers":{"volatility":{"type":"choice","choice":"status","confidence":0.96,"probabilities":{"identity":0,"preference":0,"decision":0.03,"status":0.97}},"mentions_move":{"type":"noul","noul":0.99}},"usage":{"input_tokens":420,"output_tokens":67}}
```

## Errors

Body is JSON. Rule violations and statuses, per docs/api/errors:

| Status | Meaning                                                   |
| ------ | --------------------------------------------------------- |
| 400    | Bad body (invalid UTF-8, nesting over 64, NaN, bad gzip) or request over context length |
| 401    | Bad or missing key                                        |
| 413    | Body over 32 MiB                                          |
| 415    | Unsupported Content-Encoding (gzip and zstd are accepted) |
| 422    | Validation failure                                        |
| 429    | Rate limit (per organization, see console.typesafe.ai/rate-limits) |
| 529    | Overloaded                                                |

Observed in my session:

- 401: `{"detail":{"error_type":"authentication_error","message":"Cannot authenticate with the server. Please check your API key and try again."}}`
- 422 (choice without criteria): `{"detail":[{"type":"missing","loc":["body","questions","a","choice","criteria"],"msg":"Field required","input":{"type":"choice","instructions":"q"}}]}`
- Retry 429 and 529 with exponential backoff.
- I did not trigger either, so the retry-after header is untested.

## Latency (measured from this Mac, wall clock including TLS, 6 calls)

| Call                          | Time    |
| ----------------------------- | ------- |
| Choice only (curl)            | 134 ms  |
| Noul only (curl)              | 183 ms  |
| Choice plus Noul, 1st (fetch) | 241 ms  |
| Choice plus Noul, 2nd, 3rd    | 93, 143 ms |

Plan on roughly 100 to 250 ms per request over the public internet.
Vendor figure is 0.114 s for a whole workflow (not re-measured).

## Cost

- $0.042 per million input tokens (jev-1.13 and jev-1.14).
- Output tokens are free.
- Source: docs.typesafe.ai/models.
- Billing is on `usage.input_tokens`.
- Even a one-line state costs 281 to 374 tokens, so each request carries a few hundred tokens of overhead plus question text.
- Mixed call above: 420 tokens, about $0.0000176 (420 / 1,000,000 x 0.042).

## Minimal TypeScript client

File: `docs/research/jev-example.ts`.
Run with `node docs/research/jev-example.ts` (Node 26 strips types, wrapped in `main()` because a bare .ts file is treated as CommonJS and has no top-level await).

```ts
const URL = "https://api.typesafe.ai/v1/systemone";

async function jev(body: object) {
  const t0 = performance.now();
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  const ms = Math.round(performance.now() - t0);
  if (!res.ok) throw new Error(`jev ${res.status}: ${JSON.stringify(json)}`);
  return { json, ms };
}
```

