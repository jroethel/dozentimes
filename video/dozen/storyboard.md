# A Dozen Times - storyboard and microscript

A 60-second motion-graphics film on the twelve kinds of time in dozentimes' design.
Each kind gets one question, one real or plainly illustrative example, and about four seconds.
`src/timeline.ts` holds every time, word and cue below, and the picture and the score both read it.

## Concept

The lead-in is the idiom "If I've told you once, I've told you a dozen times."
The word "times" leaves the sentence and becomes twelve copies on a clock face, and "Literally." turns the idiom into the thesis.
From there the film is a clock: a small dial in the corner counts the hours, and each kind of time is one hour.
The outro pulls back to show all twelve scenes as the hours of one dial, the hand sweeps once, and the line pays off the hook: "There. Now I've told you a dozen times."

One object carries the visual argument: a line.
It is a timeline in event time, a lifespan in valid time, two lanes in record time, a calendar strip in reference time, a draining level in volatility, a ring in business time, and a scrubber in as-of time.
Every transition is a cut on action, motivated by the scenes on both sides of it, so no wipe repeats.

## Research, and how this differs

What writers on motion design report for 2026, from the two sources listed under Sources:

- "In 2026, the trend has moved away from chaotic, 'look-at-me' effects toward purposeful motion" [7].
- Leading brands are adopting motion-first identities, with variable fonts whose weight and width shift during animation [7].
- Kinetic type works as "a pacing mechanism that shapes how information is absorbed", and the advice is "short, purposeful motion that settles fast" [8].

This film follows that advice: one motion per idea, settled inside each kind's four seconds.
It does not use library wipes.
Its cuts come from the content: a ripple becomes an iris, starlight becomes a camera flash, a photo turns over to the note on its back, a stamp lands.
It also teaches with real facts (Apollo 11, Pluto, SN 1987A, the UK tax year), not abstract icons.

## Design system

- Type: Instrument Serif for names and payoffs, Inter for questions and labels, Geist Mono for dates and counters, Caveat for handwriting.
  All four are under the SIL Open Font License (`fonts/`).
- Ground: dark scenes and light scenes alternate, with two signal-color punches (ember for source time, lime for volatility).
- Accent: one hue per kind, which returns as that kind's marker on the outro dial.
- Texture: film grain at 24 changes per second, a soft vignette, a slow light bloom on dark grounds.
- Motion: expo and cubic easing, a damped spring for settles, staggered word reveals out of a mask, and true motion blur (sub-frames over a 180-degree shutter) on the seven fastest transitions.
- Reading budget: `node src/timeline.ts` counts the words on screen per scene and fails above 4 words per second, numbers included.

## Overview

| Time        | Scene                | On screen                                           | Out             |
| ----------- | -------------------- | --------------------------------------------------- | --------------- |
| 0.0 - 6.0   | Hook                 | If I've told you once, I've told you a dozen times. | dial dive       |
| 6.0 - 10.0  | 01 Event time        | When did it happen?                                 | ripple iris     |
| 10.0 - 14.0 | 02 Valid time        | When was it true?                                   | line split      |
| 14.0 - 18.0 | 03 Record time       | When did we find out?                               | starlight flash |
| 18.0 - 22.0 | 04 Source time       | When was it made?                                   | card flip       |
| 22.0 - 26.0 | 05 Reference time    | Which day is "tomorrow"?                            | ink rain        |
| 26.0 - 30.0 | 06 Sequence time     | Which came first?                                   | stamp slam      |
| 30.0 - 34.0 | 07 Verification time | Last checked when?                                  | ink bleed       |
| 34.0 - 38.0 | 08 Access time       | Last looked at when?                                | spotlight iris  |
| 38.0 - 42.0 | 09 Volatility        | Shelf life?                                         | drain           |
| 42.0 - 46.0 | 10 Intended time     | When should it happen?                              | curl            |
| 46.0 - 50.0 | 11 Business time     | Which calendar?                                     | whip spin       |
| 50.0 - 54.0 | 12 As-of time        | From which "now"?                                   | pull back       |
| 54.0 - 60.0 | Outro                | There. Now I've told you a dozen times.             | fade to black   |

## Microscript

Times are seconds from the start of the film.
Each scene lists what is on screen, the action, the transition out, and the sound.

### Hook (0.0 - 6.0)

- On screen: "If I've told you once," then "I've told you a dozen times." with "a dozen" in italic and "times." in lime.
- Action: a faint clock face turns behind the words from the first frame.
  At 2.4 the sentence rises out, and at 2.95 "times." glides to the centre.
  At 3.3 twelve copies fly to the twelve hours, one every 0.06 s.
  "Literally." holds for half a second.
  Then "Twelve kinds of time." takes the centre and the clock face brightens.
- Out: dial dive.
  Hour 1 lights, shrinks to a dot, and the camera falls into it.
- Sound: a clock ticks on every beat and goes quiet for "Literally."
  Twelve glass pings rise with the copies, a pad swells under the title, and a riser lands the beat drop at 6.0.

### 01 Event time (6.0 - 10.0) - When did it happen?

- On screen: "Apollo 11", "20:17 UTC", "July 20, 1969".
- Action: the dot falls onto a 1955 - 1985 timeline over the Moon's limb and lands at 6.5 with three ripples.
  A pin rises, the clock digits roll and lock left to right, and the date rises in.
- Out: ripple iris.
  A new ripple from the landing point grows until the paper of valid time fills the frame.
- Sound: a boom and a kick on the drop, a soft touchdown thump with a high bell, and counter clicks that lock.

### 02 Valid time (10.0 - 14.0) - When was it true?

- On screen: "Pluto is a planet", "1930", "2006", and the payoff "Facts expire."
- Action: the event dot stretches into a cobalt lifespan from 1930 to 2006.
  At 11.7 the bar is cut at 2006 and a dashed ghost runs on to today.
  At 11.8 "planet" is struck through.
- Out: line split.
  The page is cut along the timeline, and its halves part, casting shadows, onto the two lanes of record time.
- Sound: a short rising stretch tone, a snip on the cut, a pen scratch on the strike, and a paper tear on the split.

### 03 Record time (14.0 - 18.0) - When did we find out?

- On screen: the lanes "Happened" and "Seen", "~166,000 BC", "~168,000 years", and "1987".
- Action: a supernova bursts on the top lane at 14.3 and leaves a glowing remnant.
  Its light travels as a comet across the gap and lands on the bottom lane at 1987, at 15.95.
- Out: starlight flash.
  The arrival point blooms into a white-out, which becomes a camera flash at 17.9.
- Sound: a deep boom with a falling shimmer, a whoosh panned left to right with the light, a bell on arrival, a flash charging, and a two-click shutter.

### 04 Source time (18.0 - 22.0) - When was it made?

- On screen: a photo stamped "AUG 1 2019", "Downloaded today", and the payoff "A copy isn't new."
- Action: out of the flash, a polaroid develops on an ember ground.
  At 19.05 a copy slides out.
  At 19.85 both date stamps glow and a dotted thread joins them.
- Out: card flip.
  The original turns to the centre and flips, and the cut lands edge-on at 21.85.
- Sound: a slide whoosh, two bells a hair apart for the twin stamps, and a card flip.

### 05 Reference time (22.0 - 26.0) - Which day is "tomorrow"?

- On screen: a handwritten note "See you tomorrow!" dated "Mar 3", a strip of days 3 to 10, "Written", "Read", "tomorrow", and "tomorrow?".
- Action: written on Mar 3, an arc lands "tomorrow" on Mar 4 in yellow.
  Read on Mar 9, the same word lands on Mar 10, dashed, and is crossed out at 24.5.
- Out: ink rain.
  The note falls away, its handwriting and the calendar break into drops, and a dark curtain drops with them.
- Sound: a pencil tick, a rising two-note pluck for the right answer, a low detuned buzz for the wrong one, and drops that land in time with the picture.

### 06 Sequence time (26.0 - 30.0) - Which came first?

- On screen: "09:00:00", the balls "A" and "B", the payoff "Clocks tie. Order doesn't.", and the credit "Lamport, 1978".
- Action: A and B drop onto the same second and rattle against each other.
  At 27.45 they part into an order, with counters 1 and 2 and an arrow.
- Out: stamp slam.
  A "PASSED" stamp falls through the frame, its shadow growing, and lands at 30.0.
- Sound: two identical plucks, a rattle of clicks, two rising notes for the order, a descending whoosh, and a heavy stamp.

### 07 Verification time (30.0 - 34.0) - Last checked when?

- On screen: an elevator inspection card, "Mar 2024", "Today", and the payoff "True when checked. Unknown since."
- Action: the stamp lands with a shake.
  A marker walks 31 months from the inspection to today while the stamp fades to grey.
  A red question mark pops in its place.
- Out: ink bleed.
  The stamp's red ink spreads outward until the page is warm and dark.
- Sound: one soft tick per month, a curious upward glide on the question mark, and a low wet swell for the bleed.

### 08 Access time (34.0 - 38.0) - Last looked at when?

- On screen: a file list with "Last opened" times "today", "last week" and "2023", and the payoff "Read most, check first."
- Action: three files tap in unsorted, then sort by last opened at 34.95.
  At 35.75 heat rises on the most recently read rows.
- Out: spotlight iris.
  The light closes on the most-read file, holds as a point, and opens on lime.
- Sound: three UI taps, a slide, a warm chord for the heat, an iris close, and a bright pop.

### 09 Volatility (38.0 - 42.0) - Shelf life?

- On screen: three tubes "Status 7 days", "Decision 90 days" and "Name never", a "Day" counter to 120, and the payoff "Facts have half-lives."
- Action: the counter runs from day 0 to 120.
  Status runs dry within the first week, decision runs dry at day 90, and name stays full.
- Out: drain.
  All three drain, and the lime ground falls away with a wavy edge to reveal the night of intended time.
- Sound: fast counter clicks, a gurgle as each fact runs dry, and a falling whoosh with drops for the drain.

### 10 Intended time (42.0 - 46.0) - When should it happen?

- On screen: "Remind me next Tuesday", "Now", the days ahead, and the payoff "It points forward."
- Action: the request types itself.
  At 43.3 an arc leaps from Now over the dashed future and plants a flag on Tuesday at 43.95.
- Out: curl.
  The future line keeps going and curls round into a ring as the ground turns green.
- Sound: soft typing, a rising swoosh with the arc, a bell as the flag lands, and a swirl for the curl.

### 11 Business time (46.0 - 50.0) - Which calendar?

- On screen: a year ring with month labels, "Jan 1", then "Apr 6" and "UK tax year", and the payoff "A leftover from 1752."
- Action: at 46.85 the ring ratchets round so April 6 sits under the year-start pointer.
  A gold arc then sweeps the UK tax year once round.
- Out: whip spin.
  The ring winds up and the whole frame spins away with motion blur, then lands on the as-of line.
- Sound: ratchet clicks, one per week of rotation, a lock click, a harp-like run of bells, and a whip both ways.

### 12 As-of time (50.0 - 54.0) - From which "now"?

- On screen: "How many planets?", a split-flap numeral, a row of planets, a 1930 - 2026 line with the old Pluto span, "As of today" and "As of 2005".
- Action: the as-of handle scrubs back to 2005.
  At 51.16 the numeral flips from 8 to 9 as Pluto rejoins the row.
  It scrubs forward to today, and at 52.27 it flips back to 8.
- Out: pull back.
  The scene shrinks into hour 12 of a dial of all twelve scenes.
- Sound: a tape rewind and a fast-forward, a flap clack on each flip, and a high bell when Pluto returns.

### Outro (54.0 - 60.0)

- On screen: twelve tiles, then the twelve names round a dial, "There.", "Now I've told you a dozen times.", and "dozentimes".
- Action: from 55.0 the hand sweeps once round.
  Each tile turns into its name and a dot in its kind's color as the hand passes.
  At 56.7 the closing line rises, at 58.1 the dozentimes mark appears, and from 59.2 the frame fades to black.
- Sound: the drums drop out, and a bell replays each kind's note as the hand passes it.
  A deep bell and a D major chord land at 57.0.

## Transitions

| #   | When          | Name            | What carries the cut                                          |
| --- | ------------- | --------------- | ------------------------------------------------------------- |
| 1   | 5.3 - 6.3     | dial dive       | The camera falls into hour 1, which becomes the event dot.    |
| 2   | 9.3 - 10.25   | ripple iris     | The touchdown ripple grows until valid time is inside it.     |
| 3   | 13.4 - 14.3   | line split      | The page is cut along the timeline and parts on two lanes.    |
| 4   | 17.5 - 18.4   | starlight flash | The supernova light arrives and becomes a camera flash.       |
| 5   | 21.4 - 22.3   | card flip       | The photo turns over, cut edge-on, to the note on its back.   |
| 6   | 25.3 - 26.35  | ink rain        | The handwriting breaks into drops that fall onto a line.      |
| 7   | 29.45 - 30.3  | stamp slam      | An inspection stamp falls through the frame and lands.        |
| 8   | 33.35 - 34.3  | ink bleed       | The faded stamp's ink spreads until the page is dark.         |
| 9   | 37.4 - 38.3   | spotlight iris  | The light closes on the most-read file, then opens on lime.   |
| 10  | 41.35 - 42.35 | drain           | The liquid drains and takes the lime ground with it.          |
| 11  | 45.3 - 46.35  | curl            | The future line keeps going and curls into a year.            |
| 12  | 49.45 - 50.3  | whip spin       | The year spins away and lands on the as-of line.              |
| 13  | 53.4 - 55.0   | pull back       | The last scene shrinks into hour 12 of a clock of all twelve. |

## Sound

The score is composed in code (`src/music.ts`) and uses no samples, so it is original and free to publish.
It is in D minor at 120 BPM, so one kind lasts two bars, and it moves through i - VI - III - VII three times.
Each kind starts on its own bell note, and the outro replays all twelve as the hand passes.
The score is normalised in two passes to -14 LUFS with a -1 dBTP ceiling, which is the common target for social platforms.

## Claims and sources

| Claim on screen                                     | Kind         | Status                  | Source |
| --------------------------------------------------- | ------------ | ----------------------- | ------ |
| Apollo 11 landed 20:17 UTC, July 20, 1969           | Event        | fact                    | [1]    |
| Pluto counted as a planet from 1930 to 2006         | Valid, As-of | fact                    | [2]    |
| SN 1987A was seen in 1987, light ~168,000 years old | Record       | fact, approximate       | [3]    |
| Exploded ~166,000 BC                                | Record       | derived: 1987 - 168,000 | [3]    |
| Photo taken Aug 1, 2019, downloaded today           | Source       | illustrative            | none   |
| Note written Mar 3, read Mar 9                      | Reference    | illustrative            | none   |
| Logical order, not clocks: Lamport, 1978            | Sequence     | attribution             | [4]    |
| Elevator inspection passed Mar 2024                 | Verification | illustrative            | none   |
| Files last opened today, last week, 2023            | Access       | illustrative            | none   |
| Status 7 days, decision 90 days, name never         | Volatility   | dozentimes' own rule    | [5]    |
| Remind me next Tuesday                              | Intended     | illustrative            | none   |
| UK tax year starts April 6, a leftover from 1752    | Business     | fact                    | [6]    |
| How many planets: 9 as of 2005, 8 today             | As-of        | fact                    | [2]    |

1. Lunar Module Eagle landing, 20:17:40 UTC: https://en.wikipedia.org/wiki/Lunar_Module_Eagle
2. Pluto discovered 1930, reclassified August 24, 2006: https://www.smithsonianmag.com/science-nature/once-the-solar-systems-ninth-planet-pluto-was-reclassified-20-years-ago-heres-why-planetary-scientists-and-the-public-alike-love-the-small-icy-body-180989383/
3. SN 1987A in the Large Magellanic Cloud: https://science.nasa.gov/asset/hubble/supernova-1987a-in-the-large-magellanic-cloud/ (published distances run from about 160,000 to 170,000 light-years, so both figures carry a "~")
4. Lamport, "Time, Clocks, and the Ordering of Events in a Distributed System", CACM 21(7), 1978: https://amturing.acm.org/p558-lamport.pdf
5. dozentimes' volatility rule: `test/kinds/METHODS.md` (status needs a check after 7 days, decision after 90, identity never).
   On screen these read as general examples, but they are dozentimes' own shelf lives.
6. Why the UK tax year starts on April 6 (Lady Day, the 11 days dropped in 1752, the 1800 leap-day shift): https://theconversation.com/why-the-uk-tax-year-starts-on-april-6-57247
7. Kinetic typography trends for 2026: https://www.jumbla.com/news/kinetic-typography-make-your-brand-message-unforgettable
8. Kinetic typography as a web trend: https://www.digitalsilk.com/web-design/web-trends/kinetic-typography/
