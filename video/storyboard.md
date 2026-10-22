# Twelve Times - storyboard and microscript

A 60-second motion-graphics video that proves the twelve kinds of time in
`test/kinds/`, drawn scene by scene from the test cases. Every scene answers a
different form of the question "when", and each proof is the behavior its test
file asserts.

Design language: near-black ground, warm paper-white ink, Didot for statements,
Menlo for machine labels. One accent hue per kind on a shared spectral journey
(amber to orchid). A vertical reading head recurs in every scene in a different
role. A soft grain and vignette keep it filmic. Transitions are a reading-head
wipe line that sweeps the frame at every cut.

Music: composed in code (`src/music.ts`) from the same timeline - a drone floor,
a 75 BPM heartbeat through the twelve kinds, one ascending scale note per kind,
typewriter ticks in the hook, stamp thuds, whooshes at each wipe, chimes at each
arrival, and a resolving chord in the outro. No samples, fully copyright-free.

## Microscript

Times are seconds. LT is local time inside the scene.

| Time       | Scene      | Statement (Didot) or question      | Action beats                                                       |
| ---------- | ---------- | ---------------------------------- | ------------------------------------------------------------------ |
| 0.0 - 5.5  | HOOK       | "When" is not one question.        | Types "If I told you a dozen times," then "you'd remember."; swap to the thesis; "It's twelve." with twelve rising ticks |
| 5.5 - 9.7  | 01 EVENT   | When did it happen?                | "what shipped in September?" types in; the September window lights; in-window commits lift and get date tags; Aug 28 and Oct 2 dots slide out, excluded |
| 9.7 - 13.9 | 02 VALID   | When was it true?                  | Two Next: cards; a SWAPPED OCT 14 boundary; the head sweeps; before it, card 1 is CURRENT THEN; after, card 1 is struck out as REPLACED and card 2 is CURRENT NOW |
| 13.9 - 18.1| 03 RECORD  | When did we learn it?              | Two lanes: the event sparks Sept 12; the record lands Oct 1; the reading head drops at Sept 15; the blind spot shades the gap: "not yet known" |
| 18.1 - 22.3| 04 SOURCE  | When was the file last touched?    | notes.md card; IMPORTED OCT 22 stamp slams and peels off; a fresh clone gets the same treatment; the engraving WRITTEN AUG 1 glows on both |
| 22.3 - 26.5| 05 REFERENCE | What does "last week" point at?  | A 4-week strip; said Sunday Oct 11, the phrase lights the week before; said Monday Oct 12, it lights the week just ended; one day later, a new answer |
| 26.5 - 30.7| 06 SEQUENCE | When the day ties, what breaks it? | Two OCT 14 cards slide in and jitter; SAME DAY badge; page lines and LINE 12 / LINE 40 markers; the later line wins, the other is SUPERSEDED |
| 30.7 - 34.9| 07 VERIFICATION | Who vouched, and when?         | Fact card sealed BY AUTHOR - OCT 3; a re-read of the source scans it; the source says beta: OCT 8 - THE SOURCE DRIFTED; second seal: RE-CHECKED OCT 22 - CHANGED |
| 34.9 - 39.1| 08 ACCESS  | When did we last look?             | budget: re-check 1; the stale fact read 2 days ago glides ahead CHECKED FIRST; the one unread for 60 days is STILL WAITING |
| 39.1 - 43.3| 09 VOLATILITY | How long until it goes stale?   | DAY counter scrubs to 120; STATUS (7 days) runs dry first, DECISION (90) later, IDENTITY never; expired cards read NEEDS A CHECK |
| 43.3 - 47.5| 10 INTENDED | When should it become true?       | "remind me next week to check the importer" types; an arc leaps from NOW (Thu Oct 8) into the NEXT WEEK block, landing as a chip; the only kind right of now |
| 47.5 - 51.7| 11 BUSINESS | Which calendar is it?             | A 12-month ring rotates July to the top; fiscal quarter arcs re-grid; FY26 = JUL 2025 - JUN 2026 in the center |
| 51.7 - 55.9| 12 AS-OF   | Which now are we reading in?       | "As of Oct 14, what was the plan?" winds the dial to OCT 14; "and for beta?" inherits it; "now" clears the dial to LIVE |
| 55.9 - 60.0| OUTRO      | One question. Twelve answers.      | The twelve kinds fly into a 3x4 grid, each in its accent; "each one proven, not named - test/kinds"; freshtime mark |

## Provenance

Each scene dramatizes the pass case of its `test/kinds/<kind>.test.ts`:

- event: window filter on heading dates, out-of-window facts dropped
- valid: current_then before the swap, replaced after, the new Next answers
- record: valid Sept 12 but recorded Oct 1; a Sept 15 reading cannot see it
- source: import date rejected, clone mtime rejected, the engraving (mtime) stands
- reference: Monday-based weeks, the Sunday/Monday edge flips the answer
- sequence: file order breaks the same-day tie inside one file
- verification: verified_by author at ingest, source re-read catches the change
- access: maintain with budget 1 re-checks the recently read fact first
- volatility: needs_check at 7 days, decision at 90, identity never
- intended: a reminder intent anchored to next Monday-Sunday
- business: FY26 / Q3 with the July 1 fiscal start
- asof: a stated date sets the ambient reading and "now" clears it
