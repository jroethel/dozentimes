# pi-time end-to-end suite

This suite drives real pi (provider zai, model glm-5.3) in RPC mode through the pi-time agent dir.
It runs over a temp copy of `test/fixtures/ablation/`, with the seven ablation questions asked as one conversation.

## What it does

The harness builds the ledger in a temp `FRESHTIME_DB` with the ledger functions at `ingest_at`.
It starts pi with `FRESHTIME_NOW` at the question date and `FRESHTIME_ROOTS` at the temp copy, and waits for startup to finish.
Then it applies the edits from `edits.json`, so they happen behind the ledger.
It sends each question as a prompt and waits for `agent_settled`.

## Checks per turn

- tool: `freshtime_ask` was called at least once.
- reading: the turn's `asof_mode`, anchor start and basis match `gold.json` (a null basis in the gold is not checked).
- facts ok: the `freshtime_ask` result holds each must tag with an acceptable status.
- judge must: one Jev noul probability per must tag, passes at 0.5 or more.
- judge harmful: one probability per harmful tag, passes below 0.5.
- judge stated: the answer says which date or period it answers for, passes at 0.5 or more.
- overall: all of the above.

The judge sends one batched Jev request per turn, using the full fixture line for each tag.
It runs in the harness process with the real `TYPESAFE_API_KEY`.

## Test hook

The extension appends one JSON line per turn reading and per `freshtime_ask` call to the file in `FRESHTIME_TRACE_FILE`.
The harness reads the reading from there, because RPC mode does not expose the extension's per-turn state.

## Run

```sh
npm run e2e                      # one conversation
npm run e2e -- --runs 5          # five fresh conversations, pass rates per check
npm run e2e -- --fallback        # pi gets TYPESAFE_API_KEY=bad
npm run e2e -- --keep            # keep the temp dir (fixtures, ledger db, sessions, trace file)
```

Raw pi events (`run<N>.events.jsonl`) and `results.json` go to `$TMPDIR/freshtime-e2e/<timestamp>/`, never the repo.
The exit code is 1 if any turn fails.

## Fallback scenario

With `--fallback`, pi runs with a bad Jev key, so the reading falls back to the chrono parser.
Each turn must still produce a final answer, and the ledger `traces` table must hold `intf.parse` rows with an error.
The reading and judge checks are still printed in this mode but do not count toward overall.

## Cost

One conversation takes about two minutes and about 70k pi tokens, roughly 0.05 in the cost pi reports.
The judge adds seven small Jev calls.

## Flakiness

Model output varies, so judged checks and the tool check can flip between runs.
Known sources of noise:

- The Jev reading of "next step for alpha now" has returned mode future instead of current.
- The harmful check reads "alpha is now launched" in a note after an as-of answer as presenting it as current.
- A paraphrase of a must fact (for example "the credentials wait ended") can score low on the must check.

Use `--runs` to separate a stable defect from noise.
