# Plan: FT2's envelopes, fadeouts, vibrato, slides, arpeggios and panning in imported modules

Status: agreed (Jeroen: "go", every proposed default) and built 2026-10-17 on the `tracker`
branch. One change from this plan: arpeggios became an Arp bend, not notes per tick (D284 in
PLAN.md says why). Decisions D284–D290 are proposals with defaults; §6
lists what's Jeroen's to settle. Builds on the `.xm` import (D279–D283).

The idea in one line: **write each FT2 effect into what Rebeat already has where it fits (notes,
bends, the release, automation), and teach the engine the one thing it can't do yet: bend a
sampled sound.** Imported songs stay editable; nothing is a frozen render.

## 0. Where it starts

- Imported instruments play as samples (`sample` or `multi` sounds, `Tone.Sampler` in
  `engine/instruments.ts: samplerVoice`) or as hits of a sample (`playDrum`).
- `Note.bend` (D220) has seven shapes: Scoop (from below or above into the note), Rise (there and
  stays), Dip, Shake (vibrato with a rate and depth), Next, Fall and Doit (at release). One bend
  per note. **Sampled sounds ignore bends** (D225): only the synth's worklet reads them.
- A sample voice has an attack and a release (the track's `sound.attack`, `sound.release`); there
  is no per-note volume curve and no per-note pan.
- Automation lanes (D186) can move a track's pan and level over song time, anchored to sections.

## 1. Arpeggios: 0xy as notes (D284)

FT2 cycles note, +x, +y on each tick of the row. Write it as real notes: one short note per tick
(1/speed of a step), placed with `Note.offset` (a tick past the half of the row goes to the next
step with a negative offset). At speed 6 that's six notes per row; the piano roll and the tracker
show them, and they play on any sound.

- Alt: the track's arpeggiator (per track, not per row); a new "stepped" bend shape.

## 2. Bends on sampled sounds (D285, the engine change)

The sampler voice and drum hits get bends: when a note with a bend starts, the voice schedules its
source's `playbackRate` from `bendAt` (a value curve sampled every 10 ms over the note, its
release tail included for Fall and Doit). Tone's Sampler keeps its sources private
(`_activeSources`, already used by `panic`); if that's too brittle, the sampler voice gets its own
small zone player (nearest zone, attack, release) instead of `Tone.Sampler`.

This is useful beyond imports: the Bend card would then work on samples and sampled instruments.
smplr and SoundFont voices stay without bends (D225 stays for them).

## 3. Vibrato and slides as bends (D286)

| FT2                                               | Bend                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 4xy, 6xy, volume column Sx/Vx; instrument vibrato | **Shake**: rate from x (ticks per cycle at the row's tempo), depth from y; delay = the row it starts on |
| 1xx, 2xx, E1x, E2x, X1x, X2x (slides)             | **Rise** by the total semitones slid while the note sounds, over the rows it slides                     |
| 3xx, 5xy, volume column Mx (tone portamento)      | **Scoop** into the new note from the old one's pitch, time from the slide speed (the old note ends)     |

One bend per note: when a note has two (a vibrato after a slide), the larger movement wins and the
other is listed in the toast. Linear vs Amiga slides: the linear table (most modules); Amiga
slides are converted at the note's pitch.

## 4. Envelopes and fadeouts (D287)

The volume envelope up to its sustain point (with its loop, if it has one) is played into the
rendered sample, tick by tick at the song's starting tempo. After key-off FT2 runs the rest of the
envelope and the fadeout: that becomes the track's **release** (`sound.release`: the time from
sustain to silence, the longer of the two). An envelope without a sustain point is all baked in.

Because a sampler repitches its zones, an envelope baked at the root plays faster an octave up.
Instruments with an envelope get **a zone per octave they play** (so it's at most ±6 semitones
off), not one per sample.

Panning envelopes are baked the same way, as stereo samples (left and right gains per tick).

- Alt: a per-note volume curve in the engine (exact, but a new kind of data on every note).

## 5. Panning (D288)

- 8xx, volume column Px and E8x set a channel's pan; Pxy slides it. Rebeat's pan belongs to the
  track, so they become a **pan automation lane** on the instrument's track (a point where it's
  set, a ramp where it slides).
- When channels playing one instrument pan it differently at the same time, the last one wins and
  the toast says so. The sample's own panning stays the track's pan (D283), as now.
- Alt: a track per instrument and pan position (more tracks, exact).

## 6. Volume slides (D289), since slides are both

Axy, 5xy/6xy's volume part and the volume column's slides change a sounding note's volume. Two
ways, for Jeroen:

1. **Level automation** on the track, like panning: one lane, exact for a lone channel, and
   approximate when several channels share the instrument.
2. **A per-note gain curve** in the engine: exact, but new data on notes (schema 15).

Proposed: 1 now, 2 later if songs need it.

## 7. Tests and phases (D290)

| Phase | What                                                                        | Done when                                                                                        |
| ----- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| X1    | arpeggios as notes                                                          | unit: 0x37 at speed 6 writes six notes per row with the right pitches and offsets                |
| X2    | bends on sampler voices and drum hits                                       | e2e: a rendered Rise moves a sample's pitch by its amount; the Bend card works on a sample track |
| X3    | vibrato and slides as bends                                                 | unit: 4xy, 1xx, 3xx give the bends; e2e: an imported vibrato renders with a wobbling pitch       |
| X4    | envelopes and fadeouts baked, zones per octave, release from the fadeout    | unit: an envelope's shape in the render; a key-off's tail as long as the fadeout                 |
| X5    | panning and volume slides as automation                                     | unit: 8xx and Axy become points and ramps; e2e: the imported lane moves the pan                  |
| X6    | guide (what each effect becomes), the toast lists only what's still missing | full verification; golden levels unchanged (no existing song changes)                            |

## 8. What Jeroen decides

1. Bends on sampled sounds everywhere (the Bend card on samples too), or only for imports?
2. Volume slides: level automation (proposed) or per-note gain curves (schema 15)?
3. Envelopes: baked with a zone per octave (proposed), or a per-note volume curve in the engine?
4. Two effects on one note: the larger one wins (proposed), or the note is split in two?
