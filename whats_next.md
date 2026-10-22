# whats_next - freshtime pi-time POC

Started 2026-10-21 on branch `feat/pi-time-poc`.
Goal: a working pi-time proof of concept with two tools, `freshtime-intf` (temporal intent) and `freshtime-agnt` (freshness ledger), sharing `freshtime-core`, plus an isolated pi environment `pi-time` that uses both.

## Decisions from Jeremy (2026-10-21)
- Repo stays public (jroethel/freshtime).
- Push the feature branch and file remaining work as `agent:todo` issues without asking. No merge to main.
- Demo data: his real project docs under ~/create and ~/repos (learning guides, whats_next.md, handoffs).
- Jev live with deterministic fallback, pi-time model zai glm-5.3.

## Guardrail that follows from "public repo" + "real docs"
- No extracted personal facts, ledger databases, or copied doc text enter git.
- The ledger DB lives in `~/.freshtime/` (outside the repo).
- Test fixtures are synthetic files that imitate the real formats.

## Working definition of 1+1=3
An ablation test over four configurations: none, intf only, agnt only, both.
Score each question for correct facts with the correct status label.
Success means both beats each single tool, and the interaction term is positive:
score(both) - score(none) > (score(intf) - score(none)) + (score(agnt) - score(none)).
Secondary metric: verification actions spent (both should spend fewer, on the facts that matter).

## Stack (proposed)
- TypeScript on Node 26 (type stripping), one language because pi extensions are TS and load in-process.
- `node:sqlite` (built in) for the ledger and traces, FTS5 for text retrieval.
- chrono-node for date phrases, Jev over fetch for judgments.
- `node --test` for tests.

## Status
- [x] Read research pages, chose stack, asked guardrail questions.
- [ ] Research notes: docs/research/jev-api.md, docs/research/pi-extensions.md, corpus survey (subagents running).
- [ ] Contract and ablation test written first.
- [ ] core, intf, agnt, pi-time built against the test.
