# A Dozen Times

A 60-second motion-graphics film on the twelve kinds of time in dozentimes' design.
It opens on "If I've told you once, I've told you a dozen times." and closes on "Now I've told you a dozen times."
The storyboard, the microscript for every scene and transition, and the sources for every fact are in [storyboard.md](storyboard.md).

## Files

| File                            | Use it for                                                            |
| ------------------------------- | --------------------------------------------------------------------- |
| `out/a-dozen-times-4k60.mp4`    | Watching on a laptop or a big screen: 3840x2160, 60 fps, H.264.       |
| `out/a-dozen-times-1080p.mp4`   | Slack, LinkedIn, X, YouTube, Instagram feed: 1920x1080, 60 fps.       |
| `out/poster.jpg`                | A thumbnail or cover image where a platform asks for one.             |
| `a-dozen-times.srt`             | Captions, only where a platform asks for them (see below).            |
| `share.html`                    | A local page with the video, the downloads and draft post text.       |

Both videos have 48 kHz AAC audio at -14 LUFS, are tagged BT.709, and start playing before the download ends (faststart).

## Posting

- Slack: drag `out/a-dozen-times-1080p.mp4` into the message box.
  It plays inline.
- LinkedIn, X, YouTube: upload the same 1080p file.
  Add `out/poster.jpg` as the thumbnail where offered.
- Captions: the film shows every word it says, so captions repeat what is on screen.
  Upload the `.srt` only where a platform requires captions or for viewers who use a screen reader.
- Reels, TikTok, Shorts: they accept 16:9, but the frame is small on a phone.
  There is no vertical cut yet.

To find the files in Finder:

```sh
open -R out/a-dozen-times-1080p.mp4
```

## Rebuild

```sh
npm install                       # skia-canvas, the one dependency
node src/timeline.ts              # reading-budget and transition checks
node src/render.ts --preview      # 1080p QC render to out/preview.mp4, about 2 minutes
node src/render.ts                # 4K master, 1080p social cut and poster, about 17 minutes
node src/still.ts 9.5 frame.png   # any single frame
node src/still.ts grid6 sheet.png 5.3 9.4 13.8   # chosen frames on one sheet
```

`render.ts` composes the score first (`src/music.ts`), measures it, and applies a two-pass loudness normalisation as it encodes.

## Layout

- `src/timeline.ts`: timing, copy, palettes and sound cues, the single source of truth.
- `src/kit.ts`: fonts, easing, colour, word reveals, glow, grain, vignette.
- `src/scenes.ts`: the hook and the twelve scene painters.
- `src/frame.ts`: the thirteen transitions, the hour dial in the corner, the outro, and the frame compositor.
- `src/music.ts`: the score and every sound effect, synthesized, no samples.
- `src/render.ts`, `src/still.ts`: encoding and QC frames.

## Rights

The music and sound are composed in code for this film, so nothing in the soundtrack is licensed from anyone.
The fonts are Instrument Serif, Inter, Geist Mono and Caveat, all under the SIL Open Font License, with their licenses in `fonts/`.
