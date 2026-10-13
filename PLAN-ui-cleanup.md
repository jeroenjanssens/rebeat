# A tidier interface: the Controller panel, the top bar, effects everywhere (§0.6q, D206–D219)

Agreed with Jeroen on 2026-10-13; every default below was accepted. Build order at the end.

## What was wrong

- **The top bar** had about 25 controls and scrolled sideways even at 1600 px. Many were also
  in panels: Loop/Song (song strip, Timeline), Q (drum machine), Overdub/Replace and Snap (piano
  roll), Swing (drum machine), the Keys chip and Edit sound (Controller panel).
- **The Controller panel** stacked 4–5 wrapping rows above the device in Chord/Key/Next mode;
  they reflowed whenever a play style was switched on, so the picture jumped.
- **Automation of effects** covered only every effect's Mix and a few knobs (Filter
  cutoff/reso, Delay feedback, EQ3 bands, Pump depth): Tremolo's Rate, Depth and Spread
  couldn't be automated. The knob picker was one flat list.
- **The Keys strip** in the mixer had no FX button, pan or buttons row, so it didn't line up.
- **Effects** couldn't be copied between tracks.

## 1. The Controller panel (D213)

- One header row: the map's name as a dropdown (other maps, Settings → MIDI), the Pads switch,
  the Key chip (Key and Next modes), the Keys chip (Edit sound moves into its menu).
- A **settings column** of foldable cards next to the picture (right when wide, below when
  narrow; folds remembered): **Chords** (Voicing, Smooth, Transpose), **Bass** (octaves, sound,
  Split), **Suggest** (on, Safe/Common/Bold, progression and Auto in Next mode), **Play** (one
  line per style: Strum, Slop, Arp, Pattern, Latch, Balance; a style's details open inside its
  line). Drum mode shows Play only. "Knob: At once / On press" goes into the Key chip's menu.
- The picture's knob labels are clickable: they reveal and flash their card.
- Controllers without a picture get the same column.

## 2. The top bar (D214, D215)

Stays: logo, project, **Play**, **Rec ▾**, position, **BPM ▾**, **Click ▾**, **Loop | Song**,
⟲ Auto while something is overridden; on the right the Keys chip, CPU (the audio status in its
tooltip and dot), master level, and the app buttons.

| Was in the top bar         | Now                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------ |
| Auto (record automation)   | Rec ▾ (Recording) and an Arm automation toggle in the Timeline; Rec shows an A badge |
| Ovd/Rep, Snap, Q           | Rec ▾ (still in the piano roll and drum machine headers)                             |
| Loop (Clip record length)  | Rec ▾ and the Clip view                                                              |
| Tap, time signature, swing | BPM ▾ (Tempo & groove); T still taps; time signature also in the Timeline ruler menu |
| 1234 (count-in)            | Click ▾                                                                              |
| Edit sound                 | the Keys chip's menu                                                                 |

Panels don't get their own Play buttons: one global transport, as every DAW has. The floating
transport (panel full screen) gets Rec.

## 3. Every effect knob can be automated (D206–D209)

- Every effect knob gets an audio-time path, live and offline. Knobs that were plain properties
  are rebuilt from native nodes so they're AudioParams: Tremolo's spread (a sine and a cosine
  LFO mixed per side), Chorus depth and delay, Phaser octaves and base (detune from the LFO),
  Distortion's drive (a pre-gain into a fixed tanh curve, then 1/√g), the Filter LFO's amount (a
  gain), Pump's release (read per step).
- Stepped knobs (Delay time, Bitcrusher bits, Pump rate) jump instead of ramping.
- Not automatable, greyed with the reason: Reverb size, decay and pre-delay (they rebuild the
  reverb), Delay ping-pong and Filter type (they rebuild the effect).
- Every effect's **On** can be automated too (its wet and dry gains).
- **The knob picker** (D208): a popover with a search box and a tree: owner → Sound / Mix /
  Effects → one item per effect → its knobs. Used by the Timeline's "+ Automation", a track's
  "+ automation", a lane's "Pick another knob…" (any owner) and the Inspector's automation
  table (its title is the picker).
- Lanes of a removed effect stay, marked "effect removed" (D209): Undo or "Pick another knob…".

## 4. The Keys strip (D212)

Laid out like a track strip: FX, sends, pan, fader, meter, value, M (S is an empty slot), "K".
The keys mix in settings grows to `{ volume, pan, sendA, sendB, mute, effects }` (not in
projects, no undo); effects through an FxTarget `"keys"`; MIDI learn targets `keys:volume`,
`keys:mix.pan`, `keys:mix.sendA|B`, `keys:fx:<id>:<param>`.

## 5. Copying effects (D210, D211)

- An app-level effect clipboard (not in the project; survives switching projects).
- Right-click any FX button (mixer strips, a drum-machine row, buses, master): Copy effects,
  Paste (replace the chain), Paste after, Copy chain to…, Remove all.
- The effect editor's header gets a ⋯ menu (also on right-click): Copy, Duplicate, Paste after,
  Paste settings (same type: keeps its id, so lanes and mappings stay), Copy to…
- One undo step each. A Limiter isn't pasted onto tracks.
- "Add effect" menus are grouped: Dynamics, EQ & filter, Drive, Modulation, Space, Utility (D217).

## 6. New effects (D216)

Parametric EQ (6 bands), Gate, Flanger, Saturator (tube / tape, wow and flutter), Vibrato,
Auto-Wah, Frequency Shifter (with ring mod), Utility (gain, mono, phase, width). Every knob
automatable. Later (worklets or routing): multiband compressor, transient shaper, real
sidechain, convolution reverb, vocoder, pitch shifter, granular delay.

## 7. Auto at beat speeds (D218)

A new setting `autoBeats` (2, 1 or ½ beat, or null): when set, Auto changes every that many
beats instead of every `autoEvery` units. One stepper over ½ beat · 1 beat · 2 beats · 1 bar ·
2 · 3 · 4 · 6 · 8 (beat steps only when shorter than the unit; in 4/4 "2 beats" reads "½ bar").
A pattern play style keeps its place in time across the faster changes.

## 8. Edit sound follows the editor (D219)

When Edit sound opens a synth editor (a track's or a library synth), it turns on "Follow the
synth editor in focus" (and says so). It stays on until unticked in the Keys menu.

## Build order

1. Effect automation in the engine. 2. The knob picker. 3. The effect clipboard and grouped
   menus. 4. The Keys strip. 5. The Controller panel and Edit sound. 6. Auto at beat speeds. 7. The
   top bar. 8. New effects. 9. Docs (PLAN.md §0.6q, D206–D219, AGENTS.md, the guide, hints).

Schema stays 11. Golden levels must not change. Playwright runs once at the end.

## Deviations (filled in while building)
