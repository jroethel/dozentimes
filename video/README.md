# video - "Twelve Times"

The current film is [A Dozen Times](dozen/README.md) in `dozen/`.
This README covers the earlier cut, kept for comparison.

A 60-second motion-graphics video proving the twelve kinds of time from
`test/kinds/`. Storyboard and microscript: [storyboard.md](storyboard.md).
Share page with download and captions: [share.html](share.html) (open it, the
video and downloads are relative to `out/`).

## Outputs

| File                                     | What it is                             |
| ---------------------------------------- | -------------------------------------- |
| `out/dozentimes-twelve-times-1080p.mp4`  | Master: 1080p30 H.264 CRF 16, AAC 320k |
| `out/dozentimes-twelve-times-social.mp4` | Same video, CRF 23, for fast uploads   |
| `out/poster.jpg`                         | Poster frame (the OCT 14 dial)         |
| `out/score.wav`                          | The composed score on its own          |

## Rebuild

```sh
npm install          # skia-canvas, one dependency
node src/music.ts    # compose the 60s score from the timeline
node src/render.ts   # render 1800 frames and encode, one ffmpeg pass
node src/still.ts 9.3 frame.png   # any single frame for QC
```

## Layout

- `src/timeline.ts` - the single source of truth: scene times, copy, accents.
  The renderer, the music, and the storyboard all read it.
- `src/draw.ts` - typography, grain, vignette, the reading-head motif, helpers.
- `src/scenes.ts` - the fourteen scene painters plus the transition wipe.
- `src/music.ts` - the composed score: drone, heartbeat, a scale note per kind,
  typewriter ticks, stamp thuds, whooshes, chimes, outro resolve. No samples.
- `src/render.ts` - pipes raw RGBA frames into ffmpeg with the score and a
  two-pass loudnorm to -14 LUFS.

Music and sound are synthesized, so the video is fully copyright-free.
