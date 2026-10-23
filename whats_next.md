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
- [x] Research notes in docs/research/ (Jev API, pi extensions), corpus survey.
- [x] core, intf, agnt, ablation test, pi-time extension. `npm test` 20/20.
- [x] Ablation (fallback and Jev paths): both 100% right status and 0 harm. Status gains add (interaction 0), harm falls superadditively (interaction -2), cold re-reads 9 vs 24.
- [x] Interactive E2E in a herdr pane on a throwaway ledger: past as-of, inherited follow-up, now question with 7 re-checks, /freshtime and /freshtime trace.
- [x] Remaining work filed as GitHub issues #1-#11. pi-time lists them at startup.
- Next: Jeremy runs `./pi-time/pi-time` for the first real ledger build (~/.freshtime/ledger.db does not exist yet, so the first run builds it, about 13 seconds).

## Judgment calls (reversible)
- One language (TypeScript on Node 26), because pi extensions run in-process. No Python or Rust.
- SQLite FTS5 for retrieval instead of qmd (issue #11).
- Learning guides are ingested: each <dt> and first table cell is a fact, dated by its h2 date or the title's last date (closed #2).
- Replacement now also covers same-day Next: lines in one file and state-like sections (State, Next step, Recent artifacts) of a later handoff. Before this, 0 of 809 real facts were ever replaced.
- Retrieval takes a text-match pool of 5x the limit, then prefers live and newer facts.
- last_verified_at at ingest is the date the author wrote the line, not the ingest date. Otherwise every first build reads as all fresh.
- Jev's as-of choice cannot override an inherited reading unless Jev also says the question changes the period. Live Jev otherwise read "And the next step for alpha?" as future.
- The ablation reports a cold mode (fresh ledger per question) for re-read spend, because in the carried script one early "now" question pays for later checks.
- The launcher passes `--no-skills`, so shared ~/.agents skills stay out of pi-time. It symlinks auth.json and fd from ~/.pi/agent, both gitignored.
- The 20-question intent score (rules 20/20, Jev 19/20) is a regression check, not accuracy, because the labels were written next to the rules (issue #1).

## 2026-10-22 test suites (in progress)
- Asked: a pi-time end-to-end suite, a real-data replay from git, and a test method with data and generators for each of the twelve kinds.
- Plan: docs/plans/2026-10-22.test-suites.md. Three workers build test/kinds/, test/replay/ and test/e2e/ in parallel.
- Recommendation given: the six open issues go to a fresh session after the suites land, gated by them.
- [x] Kinds suite: 50 pass, 12 todo, 0 fail (`npm run kinds`). Found two defects: batch ingest closed every Next: at the newest date (fixed, chain to successor), same-day handoffs never replace (#12).
- [x] Replay suite: against git, recall 0.998 and precision 1.0 excluding backdated lines. Status 7-day shelf life flags about 7 facts per real change (posted on #4). Rule (d) supersedes 6416 line-dates, over-reach unknown (#12). Re-added lines stayed invalid (fixed, reopen).
- [x] E2E suite: 14/14 turns over 2 runs after two fixes: explicit "now" words beat Jev's mode (Jev read "next step ... now" as future), and the judge asks "true for the asked time" instead of "currently true".
- Observation: on every labeled set so far, Jev's intent reading adds nothing over the rules and needed two guards. Its value is untested until the blind set (#1).
- [x] Jev probe (`npm run probe`, 21 contrived questions): traps worded to fool the rules score rules 0/10, Jev alone 9/10. The keyword "now" guard had thrown away three of Jev's right answers (combined 6/10). Changed: on the Jev path, "about right now?" is Jev's own judgment, not a keyword. Combined is now 9/10. score.ts, ablation --jev and e2e 14/14 unchanged.
- Known Jev weakness: it reads "next step" as future at 0.9 confidence while its own now judgment says now (0.8). The combine uses the now judgment.
- Contract gap: a past with no date ("before the launch", "back when we used Postgres") has no anchor, so it reads as now. Filed.
- [x] Design explanation: docs/design/freshtime-design/ (HTML and 16-page PDF, elucid-flow), content master and claims ledger in docs/content/freshtime-design/. Known layout gap: PDF page 2 is mostly empty because Fig 1 is kept whole.
- [x] Fallback path regression from the Jev combine change fixed ("Will the importer ship?" after a stated as-of read as inherited instead of future). Fallback e2e 7/7.
- Next: the open issues (#3 to #7, #12, #13 idea) in a fresh session, gated by npm test, npm run probe, npm run e2e and npm run replay. #1 waits on Jeremy's blind questions.

## 2026-10-22 video: A Dozen Times
- Asked: a 60-second motion-graphics video on the twelve kinds of time, with a microscript per scene, original or copyright-free sound, laptop quality and an easy upload path, built with no further input.
- Built in `video/dozen/` as a new film, because the earlier cut in `video/` was dim, used small type and explained test fixtures.
  The earlier cut is kept and its source is committed.
- Storyboard, microscript, transitions, sound cues and claims with sources: `video/dozen/storyboard.md`.
  Rebuild and posting guide: `video/dozen/README.md`.
  Local share page with draft post text: `video/dozen/share.html`.
- Outputs (not in git): `video/dozen/out/a-dozen-times-4k60.mp4`, `a-dozen-times-1080p.mp4`, `poster.jpg`.
- Not built: a native vertical (9:16) cut for Reels, TikTok and Shorts.

## 2026-10-22 ledger issues plan (#3 to #7, #12)
- Asked: a plan for #3, #4, #5, #6, #7 and #12, in a form Rubix review can run on.
  #1 and #13 are held, and #13's schema feeds #1's blind set.
- Plan: docs/plans/2026-10-22.I3.I4.I5.I6.I7.I12.ledger-issues-plan.md, eight serial tasks, all on freshtime-agnt/ledger.ts.
- Decided by Jeremy: rule (d) replaces only within a shared slug or when the later handoff names the earlier one (#12).
- Every test in the plan was run against HEAD f87a374 and behaves as its task predicts, except Task 4's one-word guard, which needs Task 1's closed_by column first.
- The e2e statement wording was checked offline with the fallback parser: s2 needs "today", or it inherits q7's Sep 30 as-of.
- Rubix review (2026-10-22): 16 findings, Jeremy applied all.
  Revision notes are at the end of the plan.
- Jeremy decided: replay may print a 20-case sample of one rule's closures to the terminal only (--show-sample), never to a file.
- The plan now stops at checkpoints A (after T2), B (after T3), C (before T6, the P_STALE value) and D (after T8).
- All revised plan tests were re-run against f87a374 and behave as predicted, with reword tests 2, 4 and 5 needing Task 1's column first.
- Next: execute the plan from Task 1.
  The chain has since merged T1 and T2, and the gate journal `docs/reviews/2026-10-22.I3.ledger-issues-batch-review.md` tracks progress.

## 2026-10-22 pi-time on main, chain start
- Decided by Jeremy: pi-time must not live only on a branch, because it is the tool that tests branches before they merge.
- main was fast-forwarded to f87a374 (the POC without the ledger plan commits) and pushed, with 3242595 on top: the branch launcher `pi-time/pi-time-branch` and the brief `docs/briefs/2026-10-22.I3.ledger-issues-brief.md`.
- The launcher is installed as `~/.local/bin/pi-time`: `pi-time` runs main with the real ledger, `pi-time --branch <b>` runs a branch from a detached worktree under `~/.freshtime/worktrees/` with its own ledger under `~/.freshtime/branches/`.
- This branch now differs from main only by the ledger plan commits, so the chain drives it: the ownership gate passes with 2 changed files.
- The plan's "no merge to main" line predates this, and the chain's merge card is now the normal review step, decided by Jeremy when it comes up.
- Next: Jeremy runs `pi-time` once for the first real ledger build on main, and the chain runs the ledger plan from Task 1.

## 2026-10-22 ledger issues chain lands (#3 to #7, #12)
- All eight tasks of docs/plans/2026-10-22.I3.I4.I5.I6.I7.I12.ledger-issues-plan.md are done on the integration branch, one commit per task, gated through docs/reviews/2026-10-22.I3.ledger-issues-batch-review.md.
- Landed: `facts.closed_by` and `checks.kind` (T1), rule (d) scoped to one unit of work (T2, #12), rule (e) for status-family bullets (T3, #7), reworded-line matching (T4, #6), the `ledger_record` tool for what the person says (T5, #3), shelf lives fitted from checks at 30 distinct facts (T6, #4), Jev reclassification in `maintain` (T7, #5), and the e2e statement turns with this doc pass (T8).
- Replay numbers at the gates: superseded-while-present fell 3657 to 558 and rule (d) over-reach (different file and slug) fell 1160 to 94 at T2, recall_git rose 0.9971 to 0.9979, precision stayed 1, and the T2 repair and T3 pairs moved nothing.
- Rule (e) is inert on today's real corpus: 0 status-family bullets in the 313 current handoff, HANDOFF and whats_next files scanned at the T3 gate.
- `npm test` at the tip: tests 92, pass 85, fail 0, todo 7, from tests 63, pass 52, fail 0, todo 11 before Task 1.
- E2E with the new statement turns: 27 of 27 turns over 3 runs, with s1 and s2 passing 3 of 3 each, and the fallback run answering 9 of 9 turns.
- The probe is unchanged from the pre-plan baseline at 17 of 21 combined, as expected, because no task touches `freshtime-intf/`.
- Open: checkpoint D, where Jeremy runs `./pi-time/pi-time` on his real docs, tells it one fact changed, asks about it, then says the old fact still holds.
- The driver also files the D6 follow-up at checkpoint D: a later doc edit should be able to close a conversation fact.
- #3 stays open until checkpoint D; #4, #5, #6, #7 and #12 are closed.
