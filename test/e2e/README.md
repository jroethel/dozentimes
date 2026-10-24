# pi-time end-to-end suite

This suite drives real pi (provider zai, model glm-5.3) in RPC mode through the pi-time agent dir.
It runs over a temp copy of `test/fixtures/ablation/`, with the seven ablation questions and the two statement turns from `statements.json` asked as one conversation.
The statement turns (issue #3) come after the questions, so q6 has already shown the gamma S3 fact with its `#id`.

## What it does

The harness builds the ledger in a temp `DOZENTIMES_DB` with the ledger functions at `ingest_at`.
It starts pi with `DOZENTIMES_NOW` at the question date and `DOZENTIMES_ROOTS` at the temp copy, and waits for startup to finish.
Then it applies the edits from `edits.json`, so they happen behind the ledger.
It sends each question as a prompt and waits for `agent_settled`.

## Checks per turn

- tool: `dozentimes_ask` was called at least once.
- reading: the turn's `asof_mode`, anchor start and basis match `gold.json` (a null basis in the gold is not checked).
- facts ok: the `dozentimes_ask` result holds each must tag with an acceptable status.
- judge must: one Jev noul probability per must tag, passes at 0.5 or more.
- judge harmful: one probability per harmful tag, passes below 0.5.
- judge stated: the answer says which date or period it answers for, passes at 0.5 or more.
- overall: all of the above.

The judge sends one batched Jev request per turn, using the full fixture line for each tag.
It runs in the harness process with the real `TYPESAFE_API_KEY`.

## Statement turns

The two statement turns in `statements.json` are sent after the questions, in the same conversation.

s1 tells pi a correction: the gamma attachments no longer live in S3, they moved into the gamma Postgres database.
Two checks apply, and the `dozentimes_ask` and reading checks do not, shown as `-`, because a statement's time reading is not what #3 tests:

- record: the turn's trace lines hold a `record` event with `holds: false` and a non-empty `new_text`.
- closed: read from the ledger after the run, the fact containing the `record_tag` has `closed_by = 'user'`.
- s1 overall: `record`, `closed` and `answered`.

s2 asks the gamma attachments question again, with "today" so it does not inherit q7's Sep 30 as-of.
It passes on the question checks (tool, reading, judge, answered), with two changes:

- facts ok: a `dozentimes_ask` fact whose `source_path` starts `conversation:` and whose status is `current`.
- judge must: the sentence is the `new_text` from s1's `record` trace event, because the new value exists in no fixture file.

## Test hook

The extension appends one JSON line per turn reading and per `dozentimes_ask` call to the file in `DOZENTIMES_TRACE_FILE`.
The harness reads the reading from there, because RPC mode does not expose the extension's per-turn state.

## Run

```sh
npm run e2e                      # one conversation
npm run e2e -- --runs 5          # five fresh conversations, pass rates per check
npm run e2e -- --fallback        # pi gets TYPESAFE_API_KEY=bad
npm run e2e -- --keep            # keep the temp dir (fixtures, ledger db, sessions, trace file)
```

Raw pi events (`run<N>.events.jsonl`) and `results.json` go to `$TMPDIR/dozentimes-e2e/<timestamp>/`, never the repo.
The exit code is 1 if any turn fails.

## Fallback scenario

With `--fallback`, pi runs with a bad Jev key, so the reading falls back to the chrono parser.
Each turn must still produce a final answer, and the ledger `traces` table must hold `intf.parse` rows with an error.
The reading and judge checks are still printed in this mode but do not count toward overall.

## Cost

One conversation takes about two minutes and about 70k pi tokens, roughly 0.05 in the cost pi reports.
The judge adds eight small Jev calls (the seven questions and s2; s1 has no judge).

## Flakiness

Model output varies, so judged checks and the tool check can flip between runs.
Known sources of noise:

- The Jev reading of "next step for alpha now" has returned mode future instead of current.
- The harmful check reads "alpha is now launched" in a note after an as-of answer as presenting it as current.
- A paraphrase of a must fact (for example "the credentials wait ended") can score low on the must check.
- In one run of three the model answered every dated question through `ledger_query` instead of `dozentimes_ask`.
  The answers and readings were right, but the tool check failed those turns.

Use `--runs` to separate a stable defect from noise.
