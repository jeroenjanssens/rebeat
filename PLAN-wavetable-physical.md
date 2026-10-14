# Plan: wavetable oscillators and physical models in the synth

Status: agreed 2026-10-14 (Jeroen: the default answers to every open question, §12), being
built; decisions D241–D261. Where the build differs from this plan: §14.
How we work: on `main`, commit early and often, e2e once at the end of the batch.

Two parts, one synth:

1. **Wavetables** (§2–§5): each of the three oscillators can be **Analog** (today's shape morph)
   or **Wavetable**: a table of single-cycle frames, a Position that moves through them, a warp,
   factory tables made in code, your own tables from samples, a picture you scrub.
2. **Physical models** (§6–§9): the synth's sound source can be the **Oscillators** or a
   **Physical model**: an exciter (pluck, strike, bow, blow, noise, or the oscillators
   themselves) driving a resonator (a string, a bar, a bell, a membrane, a plate, a tube) and a
   body.

Everything else the synth has stays and works for both: the two filters, the three envelopes,
the LFOs, the mod matrix, the 8 macros, voice modes and glide, bends per note (D220), automation
of every knob and switch (D228–D231), MIDI learn, p-locks through macros, the Basic and Advanced
views, A/B, randomize, `.rbsynth` files. That's the reason for one synth instead of two new ones
(D241, D249).

Then: new factory synths (§10), a demo song (§10.3), the guide, hints and tests (§11), the build
order (§13).

---

## 0. Where it starts (the code today)

- **One synth, two views.** Basic (macros, Poly/Mono + Glide, scope, keyboard) and Advanced
  (every block) are views of the same patch (`SynthEditorPanel.tsx`, `Group`/`Box` per block:
  Oscillators, Filters, Envelopes, LFOs, Matrix · macros, Voice · output).
- **Patch v2** (`model/synth.ts`): `osc: [Osc, Osc, Osc]` with `shape` 0..3 (sine → triangle →
  saw → pulse, morphing), `pw`, unison, sync, drift…; sub, noise, ring, FM; `filters`, `envs`,
  `lfos`, `matrix` (`MOD_DESTS`), `macros`, `voice`, `output`. `makePatch`, `sanitizePatch`,
  `upgradePatch` (v1 → v2), `autoMacros`.
- **The DSP** (`engine/synth/core.ts`, ~1,070 lines, pure TS): `wave(shape, pw, t, dt)` is the
  oscillator (polyBLEP, morphing between neighbours, so it's a 4-frame table already).
  `control()` runs every 16 samples (`CONTROL`): envelopes 2–3, LFOs, the matrix, oscillator
  increments and gains, filter coefficients. `render()` runs per sample: oscillators (unison,
  sync, FM), sub, noise, ring → filters → amp envelope → output drive.
- **The worklet** (`worklet.ts`) gets everything as messages (`patch`, `on`, `off`, `automate`…);
  offline nodes get them in `processorOptions` (D92). Patches are JSON (no `structuredClone`
  in the worklet scope). **All processors of one context share one AudioWorkletGlobalScope**, so
  module-level data in the worklet is shared by every synth track of that context.
- **Automation** (D228): a lane on `track:<id>:synth:<path>` goes to the worklet as `automate`
  points; `SynthCore.resolve` writes them into a working copy of the patch in place, per control
  block. New knobs in `patchParams.ts` and switches in `patchSwitches.ts` are automatable by
  themselves; knobs read only at note start go in `NEXT_NOTE` (`model/automation.ts`).
- **37 factory synths** (`library/synths.ts`, `voiced()`), loudness balanced to about −21 dB RMS
  (`synthLevels.test.ts`, seeded).
- **Helpers we can reuse**: `library/fft.ts`, `library/pitch.ts` (YIN, a sample's base key),
  `library/wav.ts`, samples by SHA-256 in IndexedDB, blobs (`bbx:<sha>`, `.sf2` files) in
  `.rebeat` zips.

---

## 1. Words

- **Wavetable** (or **table**): a list of **frames**, each one cycle of a waveform.
- **Position**: where in the table an oscillator reads, 0–100%, blending neighbouring frames.
- **Warp**: a change to how a frame is read (bend, sync, formant…), with an amount.
- **Physical model**: a sound made by simulating an **exciter** (what you do: pluck, strike,
  bow, blow) and a **resonator** (what rings: a string, a bar, a membrane…), plus a **body**
  (what colours it: a guitar's box, a marimba's tube).
- In the editor: an oscillator is **Analog** or **Wavetable**; the synth's **Source** is
  **Oscillators** or **Physical model**.

---

## 2. Wavetable oscillators (D241–D245)

### 2.1 An oscillator type, not a new synth (D241)

`Osc` gets:

```ts
type: "analog" | "wavetable"; // default "analog": every existing patch sounds the same
table: string; // "factory:vowels", "user:<sha>"
position: number; // 0..1
warp: WarpMode; // "none" | "bend" | "sync" | "formant" | "mirror" | "asym"
//   | "squeeze" | "quantize" | "fm"
warpAmount: number; // 0..1 (bend: −1..1)
smooth: boolean; // blend between frames (on) or jump frame to frame (off)
```

Every other oscillator setting applies to a wavetable oscillator too: level, pan, octave, semi,
fine, unison (detune, width), drift, retrigger and phase, sync to oscillator 1, ring, FM. Shape
and Width are hidden while the type is Wavetable (they're kept, so switching back is exact).

Analog stays the default and keeps its own code path, so **no existing sound changes** and the
golden levels stay put. A factory table **Basic shapes** has sine, triangle, saw and square as
frames, for people who want today's shapes plus warps.

### 2.2 Tables (D242)

- A table is `{ id, name, frames: Float32Array[] }`. Frames are **2048 samples**, **1 to 256
  frames** (the format Serum and Vital use, so imported tables just work).
- **Factory tables are generated in code** (like the 808/909 kits): small to ship, deterministic,
  and no licence questions. About 16, in groups:

  | Group     | Tables                                                                                 |
  | --------- | -------------------------------------------------------------------------------------- |
  | Basic     | Basic shapes, PWM (pulse widths 50% → 5%), Harmonics (adds 1 → 64 partials)            |
  | Spectral  | Odd to even, Bright to dark (a tilt), Formant sweep, Comb sweep                        |
  | Vocal     | Vowels (A E I O U), Choir (formants with breath)                                       |
  | Analog    | Sync sweep (hard sync 1× → 8×), Saw stack (detuned saws in one cycle), Filtered saw    |
  | Digital   | FM sweep (ratio 1:1 → 1:7, index up), Bitcrush (fewer bits), Organ (drawbar settings)  |
  | Bell & FX | Bell (inharmonic partials cut to cycles), Grit (noise frozen into cycles, from a seed) |

  Each generator writes frames from a spectrum (amplitudes and phases per harmonic), so they are
  band-limited by construction and the mips (§2.3) are cheap.

- **Ids are stable** (`factory:<name>`), like the factory synth ids, because patches store them.
- **A missing table** (a `user:` table not in this browser, a factory table removed later) plays
  Basic shapes and the oscillator shows "Table not found" with the table's name.

### 2.3 Band-limiting, off the audio thread (D243)

A raw table aliases badly on high notes: a frame with 1,000 harmonics played at C6 folds most of
them back as noise. So every table has **mip levels**: one per octave, each keeping only the
harmonics that fit below Nyquist for the highest note it plays (level 0: up to 1,024 harmonics,
level 1: 512, … level 10: 1).

- **Built on the main thread side, in a worker** (`library/wavetables/mip.worker.ts`): an FFT per
  frame, then an inverse FFT per level with the harmonics above it cut. 256 frames × 11 levels is
  well under a second, and most tables have 64 frames. Never in the worklet: it would block audio.
- **Smaller levels are shorter** (a level with 64 harmonics needs 256 samples, not 2048), so the
  mips cost about as much memory as the table again: a 256-frame table is about 2 MB with its
  mips, a 64-frame one 0.5 MB.
- **Sent once per context.** The worklet keeps a module-level `Map<tableId, Mipped>` that every
  synth track in that context shares (one AudioWorkletGlobalScope per context). The node sends
  `{ type: "table", id, levels }` with the Float32Arrays transferred, the first time a patch or a
  lane needs it; the engine keeps track of what each context has. Offline renders put the tables
  in `processorOptions` (structured clone handles Float32Arrays) like every other message (D92);
  `scopeSettled` waits for the mips to be built.
- **Until a table arrives** the oscillator plays Basic shapes at the same position (silence would
  be worse than a brief wrong timbre). Tables used by the project are built when it loads, so in
  practice this only happens right after you pick a new one.

### 2.4 Reading a table (D244)

Per sample and unison voice:

1. The phase `t` (0..1) goes through the warp (§2.5) → `t'`.
2. The **level** comes from the note's increment (`dt`): the highest level whose harmonics all
   fit. Between two levels it **crossfades** by pitch, so a glide, a bend or vibrato never
   jumps in brightness.
3. The **frame**: position × (frames − 1). With Smooth on it blends the two frames beside it;
   off, it picks the nearest (the stepped "digital" sound, and no blend cost).
4. **Inside the frame**: linear interpolation (2048 samples per cycle make it clean enough; cubic
   costs double and isn't audible at that size, a unit test checks the noise floor).

So a sample is up to 2 frames × 2 levels × 2 points = 8 reads. With 3 oscillators × 8 unison
voices × 16 voices that's the worst case to budget (§9.4).

The position and the warp amount are read **per sample, interpolated across the control block**,
not once per block: a fast Position sweep (an LFO at audio-ish rates, a lane, a macro) would
otherwise step every 16 samples and crackle ("zipper"). The matrix still computes their
modulation per block; the render loop ramps from the last block's value to this one's.

**Position and modulation**: `osc1.position`, `osc2.position`, `osc3.position` and
`osc1.warp`… `osc3.warp` join `MOD_DESTS` (range 1). That's what makes wavetables come alive
per note: the mod envelope → position (every note sweeps), velocity → position (harder is
brighter), an LFO → position (movement).

### 2.5 Warps (D245)

One warp per oscillator, chosen from a menu, with an amount (a knob):

| Warp     | What it does to the phase or the frame                        | Sounds like                    |
| -------- | ------------------------------------------------------------- | ------------------------------ |
| None     |                                                               |                                |
| Bend     | squeezes the cycle toward its start or end (−/+)              | pulse width for any frame      |
| Sync     | reads the frame 1–8× faster and restarts each cycle           | hard sync without a second osc |
| Formant  | reads faster but windows each cycle, so the pitch stays       | vowels, a talking sound        |
| Mirror   | plays the first half forwards, then backwards                 | hollow, softer                 |
| Asym     | the first half faster than the second                         | lopsided, a bit nasal          |
| Squeeze  | stretches the middle of the cycle and squashes the ends       | brighter, a "phaser" edge      |
| Quantize | fewer steps per cycle (2048 → 4)                              | bitcrushed, lo-fi              |
| FM       | the oscillator above (2 for 1, 3 for 2, 1 for 3) wobbles `t'` | metallic, growls               |

Sync, Formant and Quantize add harmonics the mips can't remove. That's how other wavetable
synths behave too, and part of the sound; the guide says so. Bend, Mirror, Asym and Squeeze stay
mostly clean. The existing `fm` route (phase modulation between oscillators) still works for
wavetable oscillators; the FM warp is a per-oscillator shortcut.

---

## 3. Your tables (D246)

- **Make a table from a sample** (a library sample's menu → _Make a wavetable_, or the table
  menu's _From a sample…_). A small dialog with the sample's waveform and three ways to cut it:
  - **Cycles** (default for pitched sounds): finds the pitch (`pitch.ts`, YIN), cuts single
    cycles at zero crossings across the sample and resamples each to 2048. A sung vowel or a
    synth sweep becomes a table that moves the way the sound did.
  - **Even slices**: N frames (8, 16, 32, 64, 128, 256) spread over the sample, each 2048 samples
    as they are. For drums, noise, field recordings: rough and interesting.
  - **Whole file as frames**: the file is already a wavetable (2048-sample frames one after
    another; a WAV with a `clm ` chunk says its frame size). Picked automatically when the
    length divides by 2048 and the chunk is there.
  - You scrub the sample's waveform to choose a start and an end (the region the frames come
    from) and hear the table at once on a held note (the Hold toggle, §4.2).
  - Normalize and "remove DC" are always on; a **Smooth edges** toggle fades each frame's ends to
    avoid clicks at the wrap (on for Cycles and Even slices).
- **Dropping a WAV** on an oscillator's picture does the same with the file.
- **Storage**: a table is stored like a sample: frames as a WAV blob (`wt:<sha>`, SHA-256 of
  the frames) plus its name, in the `blobs` and `instruments` tables (Your sounds gets a
  **Wavetables** list). Content-addressed, so the same table imported twice is one table.
- **Projects and files**: `.rebeat` files include the `user:` tables the project's patches and
  lanes use (like samples and SoundFonts); `.rbsynth` files include the patch's tables.
- **Later** (§0.7): drawing frames by hand, resynthesis (a spectrum per frame with phases
  aligned, for smoother tables from any sound), exporting tables.

---

## 4. The wavetable in the editor (D247)

### 4.1 The oscillator box

- At the top of each oscillator's box: **Analog | Wavetable**.
- Wavetable shows, instead of Shape and Width:
  - the **table**: its name with a ▾ menu: the factory tables by group, Your tables, _From a
    sample…_, _Import a file…_, _Show in the library_
  - the **picture** (§4.2)
  - knobs: **Position**, **Warp amount**, with the **Warp** menu beside it, and **Smooth**
    (a switch)
  - then the oscillator's other knobs as now (level, pan, tuning, unison…)

### 4.2 The picture, and scrubbing

- The frames drawn **stacked in depth** (a light 3D view: the front frame is the current
  position; a few behind and ahead fade out). A thin row under it shows the whole table as a
  strip, with the position marked.
- **Drag on the picture (or the strip) to scrub the position.** It's the same parameter as the
  knob: a merge key per oscillator (`` `wt-${trackId}-${o}` ``) makes one drag one undo step;
  Shift for fine; double-click resets to where it was when the patch was loaded; the scroll wheel
  nudges.
- **What you hear is what you see**: with the editor open, the worklet's monitor (the live knob
  rings, `modulation()`) also reports each oscillator's position after modulation. The picture
  draws the set position solid and the moving one as a highlighted frame and a dot on the strip.
- **Hold** (a small toggle on the picture): while on, the editor's keyboard voice holds a note (the
  last key you played, C3 at first) so scrubbing makes sound without a MIDI keyboard. Off when the
  editor closes, at Stop, or when you play a key.
- The picture's menu: **Automate Position** (D228's Automate, a lane), MIDI learn, _Reset_,
  _Copy/paste the oscillator_ (the existing block clipboard).
- With automation recording on, a scrub is recorded like any knob (`recordAutomation`).
- **Explain mode**: the picture, the strip, Hold, the table menu, the warp menu each get a hint.

### 4.3 The Basic view

`autoMacros` learns about wavetable oscillators: **Character** moves the first wavetable
oscillator's Position (instead of the shape) and **Bite** its Warp amount when a warp is set. So
in Basic, Character is the wavetable knob ("Timbre"), and it's draggable like any macro. The
unit test that every factory patch sounds unchanged at rest covers the new ones.

---

## 5. What can be automated (wavetables)

| Path               | Kind                   | Notes                                            |
| ------------------ | ---------------------- | ------------------------------------------------ |
| `osc.N.position`   | knob, smooth           | the main one; ramped per sample (§2.4)           |
| `osc.N.warpAmount` | knob, smooth           | ramped per sample                                |
| `osc.N.type`       | switch, stepped        | Analog ↔ Wavetable at a section, e.g. for a drop |
| `osc.N.warp`       | switch, stepped        | changes how the amount reads                     |
| `osc.N.smooth`     | switch, stepped        |                                                  |
| `osc.N.table`      | switch, stepped (D248) | a lane's own list of tables                      |

All knobs go in `patchParams.ts` (section per oscillator), the switches in `patchSwitches.ts`,
so the picker's Synth group, Automate menus, MIDI learn and the timeline get them with no new
code. Plus everything automatable today.

### 5.1 Automating the table (D248)

A switch's lane saves its value as an option index (`index / (count − 1)`, D231). The tables
aren't a fixed list (your own come and go), so an index would point at another table after an
import. Instead:

- A lane on `osc.N.table` keeps **its own list of tables** (`AutomationLane.options?: string[]`,
  the table ids in the order the lane shows them). It starts with the oscillator's table; picking
  another table for a point (the point's menu, or the Inspector's table) appends it. The bands
  show those tables' names only, which reads better than 30 bands.
- Every table in a lane's list is **built and sent with the patch** (§2.3), so a switch is
  instant and sample-accurate, live and in exports. A switch blends over one control block (16
  samples) to avoid a click.

---

## 6. Physical models: a second sound source (D249)

`SynthPatch` gets:

```ts
source: "oscillators" | "physical"; // default "oscillators"
physical: {
  exciter: Exciter;
  resonator: Resonator;
  body: Body;
}
```

- **Oscillators** is today's synth (with wavetables). **Physical model** replaces the
  oscillator section's output (oscillators, sub, noise, ring) with exciter → resonator → body.
- The rest of the voice is shared: the filters after it, the amp envelope, the mod and filter
  envelopes, LFOs, the matrix, macros, voice modes (mono, legato, glide), bends, output.
- Exception, and the point of Corpus-style models: the exciter **Oscillators** feeds the
  oscillator section _into_ the resonator, so any synth sound (a saw, a wavetable, noise) can
  ring a string or a bell.
- **Amp envelope defaults** for a physical patch: attack 0, sustain 1, release 0.3 s: the
  resonator decides how a note decays, the envelope only shapes the ends. The editor says so
  next to the envelope ("A physical model decays by itself; set Decay in the resonator").

### Why not a separate synth

A new kind of sound (`source: "physical"` in `Sound`) would need its own worklet, editor, macros,
automation paths, library family and migration, and would lose the filters, LFOs, matrix and
glide. As a source of the same synth, it's one switch, and all of D79–D240 applies to it.
Alternatives in §12, question 1.

---

## 7. Exciters, resonators, bodies (D250–D252)

### 7.1 Exciters (D250)

| Exciter         | What it is                                                                | Its knobs                              |
| --------------- | ------------------------------------------------------------------------- | -------------------------------------- |
| **Pluck**       | a short burst shaped like a plucked string (noise through a soft filter)  | Hardness, Position, Noise              |
| **Strike**      | a mallet or hammer: a short impulse whose width is its softness           | Hardness, Position, Noise              |
| **Bow**         | continuous: a bow's friction on the resonator (stick and slip)            | Pressure, Speed, Position              |
| **Blow**        | continuous: breath and a reed or jet at the start of a tube (or noise)    | Pressure, Noise, Tone                  |
| **Noise**       | continuous filtered noise (rain on a plate, a brushed membrane)           | Tone, Level                            |
| **Oscillators** | the oscillator section, as an input (any synth sound rings the resonator) | Level (and the oscillators' own knobs) |

- **Velocity** drives the exciter: harder plucks and strikes are louder **and** brighter
  (Hardness rises with velocity, by the exciter's Velocity knob), which is most of what makes
  physical models feel played.
- **Position** is where along the resonator you excite it (near the end: thin and bright; the
  middle: round, odd harmonics). It's drawn on the picture (§8.2).
- Continuous exciters (Bow, Blow, Noise, Oscillators) play while the note is held; Pluck and
  Strike fire once at the note's start (and again on retrigger in mono).

### 7.2 Resonators (D251)

Two techniques, one menu:

**Waveguides** (a delay line one period long, with loss and dispersion in the loop):

| Model      | What it is                                                 | Typical                         |
| ---------- | ---------------------------------------------------------- | ------------------------------- |
| **String** | a delay line + damping filter (Karplus-Strong, extended)   | guitar, harp, koto, piano-ish   |
| **Tube**   | a delay line with a reflection at one end (open or closed) | clarinet (closed), flute (open) |

**Modal** (a bank of tuned resonators, up to 32 modes, one per partial):

| Model        | Partials (ratios)                                       | Typical                       |
| ------------ | ------------------------------------------------------- | ----------------------------- |
| **Bar**      | a free bar's (1, 2.76, 5.40, 8.93…), tuned bars' option | marimba, vibraphone, kalimba  |
| **Bell**     | a church bell's (hum, prime, tierce, quint, nominal…)   | bells, tubular bells          |
| **Membrane** | a drum head's (Bessel zeros: 1, 1.59, 2.14, 2.30…)      | toms, congas, timpani, tablas |
| **Plate**    | a rectangular plate's (dense, inharmonic)               | gongs, steel, metallic hits   |
| **Glass**    | few, pure, long partials                                | glass, bowls, music boxes     |

Knobs, for every model (each with a hint saying what it does in that model):

- **Decay** (seconds): how long it rings.
- **Damping**: how much faster high partials die (wood: a lot; metal: little). The single most
  important "material" control.
- **Inharmonicity** (Stiffness for strings): stretches the partials apart. A stiff piano string,
  a bar that sounds more like metal.
- **Structure** (modal only): morphs the partial ratios between neighbouring models' (a bar
  toward a bell), like Mutable Instruments' Rings.
- **Pickup**: where it's heard (for strings: a comb filter that thins and colours; for modal:
  which partials are loud). With **Width**, two pickups for left and right.
- **Release**: how much a note-off damps it (0: rings on like a piano with the pedal; 1: a
  palm mute).

### 7.3 Bodies (D252)

A short, fixed resonance after the resonator: **None**, **Guitar**, **Violin**, **Cello**,
**Piano** (a soundboard), **Box** (a cajón-like wooden box), **Marimba tube**. Each is a small
modal filter (a few fixed resonances and a short early reflection), not a convolution: cheap,
and **Size** scales it. **Mix** blends it in.

### 7.4 What isn't in this batch

- Two coupled resonators (Ableton Collision's "coupled"), sympathetic strings, a piano's hammer
  felt model, multi-string courses: later (§0.7).
- A physical **Resonator effect** (feed any track's audio through a tuned resonator): later,
  question 3.

---

## 8. The physical model in the editor

### 8.1 Where it is

- Advanced view, at the top of the Oscillators group: **Source: Oscillators | Physical model**.
  With Physical model, the group's title becomes "Physical model" and it shows three boxes:
  **Exciter**, **Resonator**, **Body**. The oscillator boxes fold away, except when the exciter is
  Oscillators (then they stay, under the Exciter box, titled "Into the resonator").
- Each box has its menu (exciter type, resonator model, body type) and its knobs from
  `patchParams.ts`.

### 8.2 The picture

- The **resonator's picture** draws the model: a string between two ends, a bar on its two
  supports, a round membrane, a bell's profile, a plate, a tube.
- **Two markers on it: where it's excited (Position) and where it's heard (Pickup).** Drag them,
  like scrubbing a wavetable (same merge keys, Shift, double-click, live dots from the monitor,
  the Hold toggle from §4.2, Automate from the menu).
- While a note plays, the picture **moves**: the string's or bar's shape from the modes'
  energies (a few points per partial, ~30 fps from the monitor), so you see which partials ring.
  It's a hint of the physics, not a simulation of the drawing.

### 8.3 The Basic view

`autoMacros` for a physical patch: **Brightness** → Damping (less) and exciter Hardness;
**Bite** → Hardness; **Character** → Structure (modal) or Position (strings); **Thickness** →
Body mix and Size; **Attack** → the exciter's softness (a slower bow or breath, a softer
mallet); **Release** → resonator Release; **Movement** → an LFO on Pickup; **Drive** → output
drive. The "unchanged at rest" test covers it.

---

## 9. The DSP (D253–D256)

### 9.1 Where the code goes

`engine/synth/core.ts` is already ~1,070 lines. The new parts are separate pure modules it calls,
all unit-tested in Node:

- `engine/synth/wavetable.ts`: `Mipped` (levels per frame), `readTable(m, position, smooth, t,
dt)`, warps (`warpPhase(mode, amount, t)`)
- `engine/synth/waveguide.ts`: `Delay` (a ring buffer with a fractional read), `StringModel`,
  `TubeModel`
- `engine/synth/modal.ts`: `ModalBank` (up to 32 two-pole resonators), the ratio tables per model,
  `Body`
- `engine/synth/exciters.ts`: pluck, strike, bow (a friction table), blow (a reed or jet),
  noise
- `model/wavetables.ts` (pure: the factory generators, frames from spectra, cutting a sample into
  frames) and `library/wavetables/` (storage, import, the mip worker)

Like `core.ts`, none of these may use `structuredClone` or throw at evaluation time (AGENTS.md
§8).

### 9.2 Tuning, glide and bends (D253)

- A string or tube is in tune only if its loop is exactly one period: the delay length is
  `sr / f` minus the loop filter's delay, read with a **fractional delay**.
- **Lagrange (3rd order) interpolation**, not an allpass: an allpass is flatter but clicks when
  its length changes, and here the length changes all the time (glide, bends per note, vibrato,
  the pitch strip). A unit test bends a string an octave in 100 ms and checks there's no click.
- The delay lines are long enough for the lowest note (A0 at 96 kHz: ~3,500 samples; 4,096 per
  voice). Above ~4 kHz the loop is very short; strings above C8 are clamped (the guide says so).
- Modal pitches update per control block (coefficients from `f × ratio`): bends and glide work,
  and partials above 0.45 × sample rate are switched off (aliasing, and stability).
- **Tests**: pitch measured with `pitch.ts` (YIN) on rendered notes from C1 to C7, within 3 cents,
  for String and Tube at several damping and stiffness settings.

### 9.3 Voices that decay by themselves (D254)

- With sustain at 1, the amp envelope never ends a plucked note; the resonator does. So a voice
  is **done when its gate is off and its output stayed below −90 dB for 50 ms** (an energy follower
  per voice), and for Pluck and Strike also when it's held but silent (a held pluck that has died
  away frees its voice). Without this, polyphony would fill with silent voices.
- **Release** damps the resonator on note-off (multiplies the loop loss / the modes' decay).
- **Panic** (D99) clears every delay line and mode state at once.
- **Voice stealing** of a ringing voice fades it over 5 ms instead of continuing from its level
  (today's rule for the oscillators), because a stolen string would carry its old pitch's energy.

### 9.4 Safety and CPU (D255)

- **Stability**: every loop gain is clamped below 1 (`sanitizePatch`), the friction and reed
  curves are bounded (`tanh`-shaped), each waveguide has a DC blocker, and modes are kept below
  Nyquist. A **fuzz test** renders 500 randomized physical patches (`model/randomize.ts`, seeded)
  and checks every sample is finite and below +12 dBFS.
- **CPU budget** (measured in Node, `perf.test.ts`, skipped on CI): 8 voices playing for 10 s must
  render at least 8× faster than real time on this laptop for each engine:
  - wavetable: 3 oscillators × 4 unison
  - String with a body, Tube
  - modal with 32 modes, with a body
- **Modes** (a switch in the Resonator box: 8 / 16 / 32, default 16 for bells and plates, 8
  for bars and membranes): fewer modes cost less and sound simpler. The CPU meter (`load.ts`)
  shows the real cost.
- **A wavetable oscillator skips unused work**: no unison voices beyond the count, no second
  frame with Smooth off or at a frame exactly, no level crossfade when the pitch doesn't move.

### 9.5 Offline renders and seeds (D256)

- Exciter noise uses the core's `rand()` (xorshift), which the offline seed (D98) makes
  deterministic, so exports and golden levels repeat.
- Tables go to offline nodes in `processorOptions` (§2.3). A new unit test renders a wavetable
  patch through `renderPatch` and checks it isn't the Basic-shapes fallback.

---

## 10. Patch version, factory synths, demo song (D257–D260)

### 10.1 Patch version 3, schema 13 (D257)

- `SynthPatch.version: 3`: `osc[n].type/table/position/warp/warpAmount/smooth`, `source`,
  `physical`. `upgradePatch` reads 1, 2 and 3; a v2 patch becomes v3 with analog oscillators and
  the Oscillators source (sounds the same). `sanitizePatch` clamps the new values.
- `SCHEMA_VERSION = 13`: the patches inside tracks are upgraded, `AutomationLane.options` (D248),
  and the `.rebeat` zip's `wavetables/` folder. A migration test, and the v6 fixtures still
  render with the same golden levels.
- `.rbsynth` files: version 3 patches, with their user tables.
- Saved sounds (Your sounds) upgrade when they're read (`userInstruments.ts: upgradeRecord`).

### 10.2 Factory synths (D258)

About 22 new ones, voiced with `voiced()`, ids stable, balanced to −21 dB RMS by the levels test,
in the existing groups (Bass, Leads, Pads, Keys, Plucks & stabs, FX) and marked with a small
badge in the library (**WT**, **PM**) plus tags (_Wavetable_, _Physical_) to filter by:

- **Wavetable** (10): Vowel Pad (Vowels, mod env → position), Growl Bass (FM sweep, Sync warp on
  a macro, LFO → position), Glass Keys (Bell + Harmonics), Digital Pluck (Bitcrush, Smooth off),
  Evolving Pad (Formant sweep, slow LFO), Choir Lead (Choir), Hoover-ish Lead (Saw stack + PWM),
  Comb Bass (Comb sweep), Organ (Organ, tremolo), Riser FX (Grit, position on a long envelope).
- **Physical** (12): Nylon Guitar, Steel Harp, Kalimba (Bar), Marimba (Bar + Marimba tube),
  Vibraphone (Bar, metal damping, tremolo LFO on amp), Tubular Bell (Bell), Glass Bowl (Glass,
  Bow), Steel Drum (Plate tuned), Bowed Cello (String + Bow + Cello body), Breathy Flute (Tube
  open + Blow), Clarinet-ish (Tube closed + Blow), Resonant Saw (Oscillators → String: a synth
  that rings).
- **For Hits** (a few physical drums that sound good on steps, D93): Tom, Conga, Woodblock,
  Cowbell, Gong (Membrane, Bar, Plate).

### 10.3 A demo song (D259)

One example song for both (`templates/`), working title **Wood, Wire and Glass**, ~2.5 minutes,
built to show the batch the way Sweeps and Bends shows automation:

- intro: Kalimba and Marimba patterns, a Glass Bowl drone (bowed, Pickup on a slow lane)
- verse: Nylon Guitar arpeggio (play styles), physical Tom and Conga hits, a Vowel Pad whose
  Position follows a slow lane
- build: Riser FX, the pad's Position ramps up with an ease, the Growl Bass's warp on a macro lane
- drop: the bass's **table switches** at the drop (a stepped lane, D248), the lead's Sync warp,
  Tubular Bell on the downbeats
- break: Bowed Cello and Breathy Flute alone, with bends per note (Scoop on the flute)

Its golden levels get recorded; the other songs' and templates' stay unchanged.

### 10.4 The synth wizard (D260)

The wizard (D169) gets two answers to "What should it sound like?": **Plucked or struck** (asks:
string, wood, metal, skin → a physical patch) and **Evolving** (→ a wavetable patch with
movement). Question 11 in §12.

---

## 11. Guide, hints, tests (D261)

### 11.1 Guide and hints

- `06-instruments.md` gets two sections: **Wavetables** (`{#instruments-wavetables}`: what a
  table, Position, Smooth and the warps do; scrubbing and Hold; making a table from a sample;
  aliasing from Sync/Formant/Quantize) and **Physical models** (`{#instruments-physical}`: exciter,
  resonator, body; which model for which sound; why notes decay by themselves; Modes and CPU).
- Hints for every new control: the type and source switches, the table menu, the picture, the
  strip, Hold, the warp menu, every exciter, resonator and body knob (generated from
  `patchParams` as today), the import dialog's options. `hints.test.ts` and `explain.spec.ts`
  check them.
- PLAN.md: §0.6s for the batch, D241–D261 in §6, the "later" items in §0.7. AGENTS.md: status,
  the code map (the new modules), §6.2 (wavetables, physical models), the gotchas (tables sent
  once per context; a voice ends on silence).

### 11.2 Unit tests

- Factory tables: deterministic (a hash per table), every frame normalized, no DC.
- Mips: a saw-like table played at C7 has no energy folded back above −70 dB (FFT of a render);
  levels crossfade without a jump on a glide from C2 to C7.
- Reading: Position 0 and 1 give the first and last frames exactly; Smooth off picks frames;
  the per-sample ramp: a position sweep in one control block has no step bigger than the
  frames' own difference.
- Warps: each maps 0..1 to 0..1, is continuous where it should be, amount 0 is identity.
- Import: Cycles finds a known pitch and gives frames that start at zero crossings; Even slices;
  a 2048 × 64 WAV with a `clm ` chunk reads as 64 frames.
- Physical: pitch within 3 cents (§9.2), the bend test, the fuzz test (§9.4), a voice frees
  after it dies away, Release damps, panic clears, stealing fades.
- Patch v3: upgrade from v1 and v2 unchanged in sound (`renderPatch` levels equal), sanitize
  clamps, randomize covers the new fields, `autoMacros` unchanged at rest for the new factory
  synths, the levels test balances them.
- Schema 13 migration; lanes with `options`.

### 11.3 End-to-end

- Switch an oscillator to Wavetable, pick a table, hear it (`masterLevel`); scrub the picture
  and the position changes in the store, as one undo step; Hold sounds without a key.
- Automate Position from the picture's menu (a lane), and a table lane with two tables switches
  in an export (the render's spectrum changes at the section).
- Make a table from a fixture WAV (Cycles), use it, reload, export a `.rebeat`, open it in a fresh
  profile: the table comes along.
- Physical: switch Source, play a Pluck note (level, then silence after it decays: the voice
  frees), drag the Position marker, export a physical patch offline.
- The demo song's golden levels; every hint on screen in both editor views (explain).

---

## 12. Open questions (each with a default)

1. **How physical models fit.**
   _Default_: a second **Source** of the same synth (§6), sharing filters, envelopes, LFOs,
   matrix, macros and automation.
   _Alternatives_: (a) a separate sound kind (`source: "physical"`) with its own engine and
   editor: cleaner separation, but none of the synth's modulation and a lot of duplicated work;
   (b) only a **Resonator effect** for now (cheap, but no played instruments).
2. **Which models in this batch.**
   _Default_: all of §7 (String, Tube, Bar, Bell, Membrane, Plate, Glass; Pluck, Strike, Bow,
   Blow, Noise, Oscillators; seven bodies), with Bow and Blow (the hardest to make sound right)
   as the last steps of the build order so they can slip to a next batch without holding the rest.
   _Alternatives_: only String + the modal models with Pluck and Strike (half the risk), or add
   coupled resonators and sympathetic strings now.
3. **A Resonator effect** (any track's audio through a tuned string or modal bank, tuned to the
   key's root, a chord, or the notes of a Notes track).
   _Default_: later (§0.7).
   _Alternative_: in this batch, as the last step (reuses `waveguide.ts`/`modal.ts`).
4. **Automating the table.**
   _Default_: a lane keeps its own list of tables (D248), every one preloaded.
   _Alternatives_: one global list (factory tables first, then yours in import order: simpler, but
   indexes shift when you import); or not automatable (the table is From the next note only).
5. **Making tables.**
   _Default_: from a sample (Cycles, Even slices, Whole file) and WAV files; drawing and
   resynthesis later.
   _Alternative_: a small frame editor now (draw, smooth, normalize, reorder frames).
6. **Table size.**
   _Default_: 2048 samples per frame, up to 256 frames (compatible with Serum and Vital files).
   _Alternative_: up to 512 frames (twice the memory for big imports), or 1024-sample frames
   (half the memory, slightly duller top end on low notes).
7. **Wavetables on all three oscillators.**
   _Default_: yes, each oscillator chooses.
   _Alternative_: only oscillator 1 (less to test and draw; less flexible).
8. **Warps per oscillator.**
   _Default_: one (like Vital's, Ableton's).
   _Alternative_: two in series (like Serum's).
9. **New factory synths.**
   _Default_: ~22 (10 wavetable, 12 physical) plus ~5 physical drums for Hits, in the existing
   groups with WT/PM badges and tags.
   _Alternatives_: fewer (~12) to keep the list short; or two new groups (_Wavetable_,
   _Physical_) instead of badges.
10. **The demo song.**
    _Default_: one song for both, **Wood, Wire and Glass** (§10.3).
    _Alternatives_: two songs (one per engine); another name.
11. **The synth wizard.**
    _Default_: two new answers (Plucked or struck, Evolving), as in §10.4.
    _Alternative_: later.
12. **Modes and CPU.**
    _Default_: a Modes switch per patch (8 / 16 / 32), defaults per model (§9.4); no global
    quality setting.
    _Alternative_: a global "synth quality" in Settings (Eco halves modes and unison everywhere).
13. **Hold for scrubbing.**
    _Default_: a toggle on the pictures that holds the last key played (C3 at first).
    _Alternative_: a held note only while you drag (no toggle); or nothing (play a key, as in
    Ableton).

---

## 13. Build order (each step committed, playable)

**Wavetables**

1. `model/wavetables.ts`: frames from spectra, the factory generators, their hashes (tests).
2. Patch v3 and schema 13 (the new fields, upgrade, sanitize, migration, tests); golden levels
   unchanged.
3. `engine/synth/wavetable.ts`: mips (built in a worker on the main-thread side), reading,
   per-sample ramps, warps; the `table` message, the per-context cache, offline
   `processorOptions`, `scopeSettled`; `core.ts` calls it for `type: "wavetable"` (tests: aliasing,
   ramps, warps).
4. The matrix destinations, `patchParams`/`patchSwitches` entries, `autoMacros`, randomize.
5. The editor: the Analog | Wavetable switch, the table menu, knobs, the picture and strip,
   scrubbing, the monitor's positions, Hold, Automate.
6. Your tables: the import dialog (Cycles, Even slices, Whole file), storage, the library's
   Wavetables list, drop on the picture, `.rebeat`/`.rbsynth` with tables.
7. Table lanes with their own options (D248).
8. The 10 wavetable factory synths and their levels.

**Physical models**

9. `waveguide.ts` (fractional delay, String with Pluck and Strike), the Source switch, voices
   that end on silence, Release, panic, stealing (tests: pitch, bends, freeing).
10. `modal.ts`: Bar, Bell, Membrane, Plate, Glass, Structure, Modes; bodies (tests: fuzz, CPU).
11. The Noise and Oscillators exciters.
12. The editor: Source, the three boxes, the resonator pictures with draggable markers, the
    moving picture, `autoMacros` for physical patches.
13. Bow (stick-slip on the string, a friction approximation on modal models) and Blow (Tube with a
    reed or jet): the steps that may slip (question 2).
14. The physical factory synths and drums, their levels; the wizard's answers (question 11).

**Together**

15. The demo song and its golden levels.
16. Guide, hints, PLAN.md (§0.6s, D241–D261, §0.7), AGENTS.md; the full verification and e2e
    once.

Rough size: steps 1–8 are a batch like §0.6e (the complete synth); 9–14 another of about the same
size; 13 is the riskiest (sounding good, not just working).

## 14. Where the build differs

- **Automating the table** (D248): instead of a lane keeping its own list of tables, each
  wavetable oscillator has **8 table slots** (slot 1 is its table, slots 2–8 `osc.N.tables`), and
  the automated switch is the slot (`osc.N.slot`). The options never change, so a lane's saved
  values never point at another table when you import one, and the worklet resolves the slot to a
  table itself; the lane's bands show the slots' table names.
- **Mip levels are built on the main thread** (a task after the current one), not in a worker: a
  64-frame table takes a few milliseconds, and the code stays testable in Node.
- **A table that hasn't arrived plays the analog morph** at the same position (that's what Basic
  shapes sounds like), so the worklet needs no fallback table.
- **Level crossfades** happen in the upper half of each octave only (the lower half reads one
  level): half the work, and still no jump in brightness on a glide.
- **A stolen or retriggered physical voice keeps ringing** (a string plucked again), rather than
  fading out over 5 ms first: the resonator's state is continuous, so there's no click.
- **The CPU budget** in the unit test is 6× real time for 8 voices (modal with 32 partials and a
  body is the slowest, about 7×); 8× was the plan.
