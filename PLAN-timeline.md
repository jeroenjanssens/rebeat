# Plan: the Timeline: pages on a linear arrangement, placements, song lanes

Status: proposed 2026-10-13 (decisions D180–D192 proposed; Jeroen's answers to §11 pending).
How we work: on `main`, commit early and often, e2e once at the end of the batch.

The idea in one line: **pages stay the content, slots become placements on a timeline.** The
song order is already a timeline with one lane where every block follows the one before. This
batch draws it as one, lets a placement differ from its clones without unlinking them, and adds
the few things that only make sense in song time: automation and audio that runs across pages.

## 0. Where it starts

- `Project.slots: PageSlot[]` (`{ id, patternId, repeats }`) is the song order; a **clone** is a
  slot with another slot's `patternId`, a **copy** a new pattern (`model/project.ts: copySlot,
cloneSlot, unlinkSlot, deleteSlot, linkCount`).
- The **page strip** (`panels/drum-machine/PageStrip.tsx`) shows the slots as equal-width
  thumbnails: click (edit, or queue while playing), drag to reorder, Alt+drag copy,
  Alt+Shift+drag clone, a context menu (repeats, steps, size, color), Loop page / Song.
- The **transport** (`engine/transport.ts`) walks the slots in song mode (`nextSlot`: repeats,
  queued pages, the song's end, `songLoop`), counts `cycles` per slot for `1:2` conditions and
  plays a step with `playPageStep(project, pattern, pageStep, time, dur, cycle, fill)`. It
  always starts at step 0 of the edited page (`play()`).
- The **offline render** (`engine/render.ts`) already lays the song out:
  `timeline(project) → { entries: { slot, pattern, start, cycle }[], duration }` and calls the
  same `playPageStep`.
- **Recording at a time** (D164): `transport.positionAt(time)` gives the slot and step;
  `model/takePlan.ts` adds pages, makes copies and unrolls repeats (`unroll`).
- **Knob addresses**: MIDI learn names every value with a target string (`track:<id>:sound.x`,
  `track:<id>:volume`, `track:<id>:fx:<fxId>:<param>`, `track:<id>:synth:<path>`, `bus:<id>`,
  `master:volume`), read by `midi/mapping.ts: readTarget` and set by `audio-io/midi.ts:
applyTarget`.
- **What can change at an audio time**: channel values use `rampTo(…, now)` from `reconcile`
  (`TrackChannel.update`, `lockStep` for the filter); synth macros can be locked at a time
  (`WorkletSynth.lockMacros`); effects set their values directly (`Inner.set`), not at a time.
- **Clips** (`engine.startClip(track, time, pageDur, oneshot)`) start at a page's step 0 and stop
  at its end; a track has one clip playing (`S.clips` by track id).
- `model/schema.ts: projectSampleIds` is the one list of a project's samples (export,
  `.rebeat`, Used in project, loading).

## 1. Principles (robust and intuitive)

1. **Nothing new to unlearn.** The timeline uses the page strip's gestures and words (click to
   edit, Alt+drag copy, Alt+Shift+drag clone, the link color, ×N). The page strip stays, as the
   compact view; both edit the same slots.
2. **No hidden state.** Whatever makes a placement sound different from its clones (mutes,
   transpose, fill, a shorter length) shows as a badge on the block, in the page strip too, and
   in the drum machine while that placement is the edited page.
3. **Things move with their music.** Automation and audio on the timeline are anchored to a
   placement, not to a bar number: move the chorus and its sweep and its vocal move with it.
4. **Everything is undoable, nothing is lost silently.** Every edit is one `commit` (drags with a
   merge key). Deleting a page that carries automation or audio says what went with it in the
   toast ("Deleted page 6 with 1 audio clip and 4 automation points · Undo").
5. **Snap by default.** Blocks snap to whole repeats, audio and points to the grid (Shift while
   dragging: free). Values show in their real units while dragging (Hz, dB, %).
6. **Same live and offline.** Every new sound path is shared by the transport and `renderProject`,
   so exports, stems and the golden levels hear what you hear.
7. **Honest limits.** Only knobs that can follow a curve at an audio time can be automated; the
   others don't offer it (no button), instead of half working.

## 2. The data (schema 10, D181, D185, D187)

```ts
interface PageSlot {
  id: string;
  patternId: string;
  repeats: number;
  // placement overrides (D182): this placement only; its clones keep the link
  mutes?: string[]; // track ids silent here
  transpose?: number; // semitones on Notes, added to the pattern's own (−12..12)
  fill?: "last" | "all"; // FILL conditions pass on the last repeat / on every repeat
  steps?: number; // play only the first N steps of the page (1..stepCount)
}

interface Project {
  // …
  automation?: AutomationLane[]; // D185
  regions?: AudioRegion[]; // D187
}

/** A point is anchored to a placement: where it is inside that slot's span (all repeats). */
interface SongAnchor {
  slotId: string;
  at: number; // quarter notes from the slot's start, 0 ≤ at < span (span = length × repeats)
}

interface AutomationLane {
  id: string;
  target: string; // a concrete MIDI-learn target: "track:<id>:mix.sendA", "master:volume"…
  on: boolean; // off: the knob's own value plays
  points: (SongAnchor & { value: number; hold?: boolean })[]; // value 0..1 (knob position)
}

interface AudioRegion {
  id: string;
  trackId: string; // a Clip track
  sampleId: string;
  start: SongAnchor;
  length: number; // quarter notes (it may run past its slot's end, into the next pages)
  offset: number; // seconds into the sample where it starts
  gain?: number; // dB, −24..12
  fadeIn?: number;
  fadeOut?: number; // quarter notes
}
```

- Song time is counted in **quarter notes** (`stepCount × STEP_SIZE_QUARTERS`), never in
  seconds, so tempo changes and swing don't move anything. Seconds come from `project.bpm` when
  playing.
- Migration 9 → 10 adds nothing (every new field is optional); a test checks a v9 project
  loads unchanged. `normalizeProject` drops lanes and points whose target or slot is gone,
  regions whose track or slot is gone, sorts points by song position, clamps `steps`,
  `transpose` and `at`.
- `projectSampleIds` adds the regions' samples (export, `.rebeat`, Used in project, the
  library's "still used" warning, loading at open).

## 3. The arrangement model (`model/arrangement.ts`, pure, D180)

One module answers every "where is what" question, for the timeline UI, the transport and the
render:

- `layout(project) → Block[]`: per slot `{ slot, pattern, index, start, length, span, perRepeat,
repeats, overrides }`, in quarter notes; `length` honors `steps`.
- `songLength(project)`, `blockAt(project, q)`, `toSong(project, anchor) → q`,
  `toAnchor(project, q) → SongAnchor` (the block under q; past the end: the last block).
- `bars(project)`: the ruler's bar lines. **Every page starts a bar** (D184): bars count from
  each block's start in the project's meter, so a page shorter than a bar (a 2-beat stop) is a
  short bar, as in a score, and the bars after it stay on their downbeats.
- `valueAt(lane, project, q)`: the lane's value at q: points in song order, linear between them
  (`hold`: a step), before the first point the first value, after the last the last value.
- `segments(lane, project, from, to)`: the ramps between two song positions, for scheduling.
- `regionsAt(project, trackId, from, to)`: the regions that sound in a window, with where in
  the sample.
- **Keeping anchors** when slots change (D186): `reanchor(project, map)` where `map` says, for a
  slot that goes away or splits, which slot and offset its content moves to. Used by:
  - `deleteSlot`: points and regions anchored to the deleted slot go with it (counted for the
    toast); a region from an earlier slot that ran into it keeps its length (it now runs into
    what follows).
  - `copySlot` / `cloneSlot` (and the Alt+drags): the new placement gets copies of the points
    and regions anchored to the original (you duplicate what you see); its overrides too.
  - `unroll` (takePlan) and `splitLongPages` (builder): repeat k of a slot becomes slot k; a
    point at `at` moves to slot `⌊at / length⌋` at `at mod length`.
  - Changing `repeats` or a page's step count: anchors keep their `at`; ones past the new span
    are **hidden, not deleted** (as steps are when a page shrinks, D9), and come back when the
    span grows.

## 4. The Timeline panel (`panels/timeline/`, D183)

A new Dockview panel, `timeline`, registered in `app/panels.tsx`, in a new layout preset
**Arrange** (Timeline across the top, the drum machine below, the Inspector at the side), and
`panel.timeline` in the command palette. The default Compose layout doesn't change (people's
saved layouts stay as they are).

```
┌ Timeline ──────────────────────────────────────────────────────────────────────────────┐
│ [Song|Loop page] ⟲  Snap: Bar ▾   Tracks ▾   + Automation   − ▭ +  Fit   ⤓ Follow       │
├────────┬───────────────────────────────────────────────────────────────────────────────┤
│        │1    3    5    7    9    11   13   15   17   19   21   23   25   27   29      │ ruler (▼ start)
│ Pages  │┌Intro ×2─┐┌Verse ×4 🔗────────────┐┌Pre ×2 F┐┌Chorus ×4 🔗──────────┐┌Break 🔗│
│        ││▤▤ ┆ ▤▤  ││▤▤▤ ┆ ▤▤▤ ┆ ▤▤▤ ┆ ▤▤▤   ││▤▤ ┆ ▤▤ ││▤▤▤ ┆ ▤▤▤ ┆ ▤▤▤ ┆ ▤▤▤  ││🔇4 ▤ ┆ │
│        │└─────────┘└───────────────────────┘└────────┘└──────────────────────┘└────────│
│ Kick   │  ····     ▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪   ▪▪▪▪▪▪▪▪  ▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪  ░░░░░░░ │ muted here: hatched
│ Bass   │           ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬   ▬ ▬ ▬ ▬   ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬  ░░░░░░░ │
│ Vox    │                                   [≋≋≋≋≋≋≋≋≋≋≋]  [≋≋≋≋≋≋]                    │ audio across pages
│  └ Send A ─────────────────────────────────────────────╱╲___________________________  │ an automation lane
│ Master │                                                                               │
│  └ Volume ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾╲___ │
└────────┴───────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 The Pages row

- One **block** per slot, as wide as its span. A block with repeats shows its page's thumbnail
  once per repeat, with thin dividers; the name, the number, `×N`, and the link icon in the
  pattern's link color (as the thumbnails do).
- **Badges** for placement overrides (§5): 🔇 with the number of muted tracks, `+2` for
  transpose, `F` for fill, a cut corner for a shorter length. Hover: what they are in a
  sentence ("2 tracks muted here: Kick, Bass").
- Gestures, the same as the page strip:
  | Gesture                   | What it does                                                                       |
  | ------------------------- | ---------------------------------------------------------------------------------- |
  | Click                     | Edit that page (the drum machine follows); while playing, queue it                 |
  | Double-click              | Focus the drum machine on it                                                       |
  | Drag                      | Reorder (a drop line between blocks); its automation and audio move with it        |
  | Alt+drag / Alt+Shift+drag | Copy / clone to where it's dropped                                                 |
  | Drag the right edge       | Repeats (snaps to whole repeats, shows ×N while dragging; 1–64)                    |
  | Shift+click               | Select a range of blocks (then Copy, Clone, Delete, Move, Duplicate after)         |
  | ⌘D / ⇧⌘D                  | Duplicate the selection after itself as copies / clones (`timeline.duplicate…`)    |
  | Delete                    | Delete the selection (not the last page)                                           |
  | Right-click               | The page menu (as now) + This placement: Mute tracks…, Transpose, Fill, Play only… |
- **Loop page** mode: the edited block gets a loop brace on the ruler, and the rest dims, so it's
  clear only that page plays.

### 4.2 The ruler and the playhead

- Bars (from `bars()`, D184), beats when zoomed in, the song's total length (mm:ss) at the right.
- **Start position** (D189): a click on the ruler puts the start marker (▼) there, snapped to the
  bar, and makes that block the edited page; Space plays from the marker. Choosing a page anywhere
  else (page strip, Launchpad) moves the marker to that page's start, so Space keeps meaning
  "play from the edited page" as today. Double-click on the ruler: play from there.
- The playhead runs from `transport.songPosition()` on the shared frame loop; **Follow** scrolls
  the view with it (one setting for the timeline and the strip, the existing `follow`).

### 4.3 Track rows (Tracks ▾: All, Only with automation or audio, None)

- One row per track, the name in the track color; per block a read-only miniature of that lane
  (hits as ticks, notes as bars, a page clip as a band), drawn in one canvas per row.
- **Placement mutes by clicking a cell**: the cell hatches and the block's 🔇 count goes up.
  The cursor shows a speaker; the hint says it's this placement only.
- **Clip tracks** also show their **audio regions** (§7) as waveform boxes across the blocks.
- Row headers: mute/solo (the track's own), the add-automation button for that track.

### 4.4 Automation lanes (§6)

- Under their track's row (or under **Master** and the **buses**, which get header rows when
  they have lanes). Header: the target's name ("Pad · Brightness", "Vox · Send A"), on/off, a
  menu (Clear, Delete lane, Pick another knob).
- Editing: click to add a point, drag (Shift: free), double-click or Delete to remove, a box
  drag selects points, right-click: Ramp / Hold, Delete. The value under the pointer shows in
  real units (`toUnit` / patch params).
- **+ Automation** in the toolbar opens a picker of automatable knobs, grouped by track,
  Master and buses; and every automatable knob gets **Automate** in its context menu (it adds the
  lane with one point at the playhead, at the knob's value, and reveals it).

### 4.5 Zoom and scale

- Pixels per bar: − / + buttons, ⌘+scroll; **Fit** fits the song. Horizontal scroll with the
  wheel or a trackpad. The zoom is a setting (`timelineZoom`).
- Blocks narrower than their name show the number only; the thumbnail stays.
- Performance: blocks are DOM (dozens), row contents and lanes are canvases redrawn only when
  their pattern, slot or lane changes (immer identity), the playhead is one transformed element.
  A 100-page song stays smooth.

## 5. Placement overrides (D182)

What a placement can change without breaking the link to its clones:

| Override       | What it does                                                                                                                  | Where you set it                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Mutes**      | These tracks are silent here (steps, notes and page clips; audio regions aren't page content and keep playing)                | Click track cells on the timeline; "Mute here" in a track row's menu in the drum machine |
| **Transpose**  | Notes play N semitones up or down here (added to the pattern's transpose; hits and audio don't move, as with every transpose) | Block menu → Transpose (−12…+12)                                                         |
| **Fill**       | FILL / !FILL conditions act as if Fill were held on the last repeat (or on all)                                               | Block menu → Fill on the last repeat / on every repeat                                   |
| **Play only…** | Only the first N steps of the page play (a stop, a pickup, a 2/4 bar)                                                         | Block menu → Play only the first … steps; or Alt+drag the right edge                     |

- **Engine**: `playPageStep` takes the slot (`{ mutes, transpose, fill }`) next to the pattern;
  `isAudible` ∧ not muted here; `transpose` adds to `pattern.transpose`; fill joins
  `fillHeld || fillLatched`. `scheduleStep` ends a page at `steps`; `render.ts: timeline()`
  uses `layout()`. Same code path live and offline.
- **The drum machine** shows the edited placement's overrides: a muted-here row is hatched with
  "Muted on this page (placement 7)"; a bar under the page strip says "This placement: +2, Fill
  on the last repeat · Clear". Edits to steps still edit the pattern (all clones), as now.
- **Recording** into a transposed placement writes the notes un-transposed (as played minus the
  transpose), so they sound as you played them there; into a shorter placement, only its steps.
- **Unlink** keeps the overrides on the slot (they're the placement's, not the pattern's).
- MIDI file export applies mutes, transpose and length (it uses `layout()` too).

## 6. Automation (D185, D186, D188)

### 6.1 What can be automated (D188)

A knob can be automated when the engine can move it at an audio time. `model/automation.ts`
holds the table `AUTOMATABLE`, and each entry says how its value reaches the audio:

| Target                                               | How                                                                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `track:<id>:volume`, `mix.pan`, `mix.width`          | ramps on the channel's fader, panner, widener                                                                                      |
| `track:<id>:mix.sendA`, `mix.sendB`                  | ramps on the send gains (throws still win: max of both, as now)                                                                    |
| `track:<id>:mix.low/mid/high`                        | ramps on `FlatEQ`'s gains                                                                                                          |
| `track:<id>:sound.cutoff`, `sound.reso` (samples)    | ramps on the channel filter (as `lockStep` does)                                                                                   |
| `track:<id>:sound.macro1..8` (synths)                | a new worklet message `automate(macro, value, time)`; the core glides at control rate                                              |
| `track:<id>:fx:<id>:<param>` for some effects        | `FxNode.automate(param, value, time)`: Filter cutoff/reso, Delay mix/feedback, Reverb mix, Distortion drive, EQ3 gains, Pump depth |
| `bus:<id>` (volume), `master:volume`                 | ramps on the faders                                                                                                                |
| `master:fx:<id>:<param>`, `bus:<id>:fx:<id>:<param>` | the same effect params (new targets, also learnable by MIDI)                                                                       |

Not automatable now (no Automate item): step-time knobs read per hit (tune, decay, start…),
the synth editor's raw patch paths (use a macro), tempo, the performance controls. §10 lists them.

### 6.2 Playing it

- `engine/automation.ts: automationStep(project, songQ, time, dur)` is called from `scheduleStep`
  and from `renderProject` for every step: for each lane that's on, schedule
  `linearRampToValueAtTime` (or `setValueAtTime` for holds) from the lane's segments in the
  step's window. One function, live and offline (like `effectsStep`, D104).
- **The engine owns an automated value while playing**: `reconcile` leaves an automated target's
  param alone (`S.automated`), so the store's value doesn't fight the curve. Stopped, the knob's
  own value plays again (or the lane's value at the start marker, so what you see is what plays).
- **Chasing** (D189): starting anywhere sets every lane's value at that position before the first
  step; a jump (queued page, Loop page) sets the values at the new position.
- **Knobs show the curve**: an automated knob gets a small "A" mark and its ring follows the value
  while playing (the modulation rings already do this for synths).

### 6.3 Touching an automated knob (D186)

- Turning an automated knob (mouse, MIDI) **overrides** its lane until you choose **Back to
  automation** (a button that lights up in the timeline toolbar and on the knob's menu); the lane
  draws dashed meanwhile. The override is session state, not saved (it's for trying things).
- **Record automation** (a toggle next to Record, `transport.recordAutomation`): while recording
  in Song mode, turning knobs writes points at their song position (thinned to the turns' shape:
  Ramer–Douglas–Peucker, about one point per beat at most when the knob is still), replacing
  points under the turn. One undo step per take.

## 7. Audio on the timeline: regions (D187)

- A **region** is a piece of a sample placed in song time on a Clip track, anchored to a
  placement (`start`), with a length in quarter notes that can run across page boundaries: a
  vocal line over a page change, a long take, a riser into the drop, a one-off spoken word.
- **Making one**: drag a sample from the library onto a Clip track's row in the timeline;
  "Place on the timeline" in a page clip's menu (the clip as a region at that page);
  **Record to the timeline** (a toggle in the Clip track's record menu): a take recorded in Song
  mode becomes a region where it was recorded instead of a page clip (`positionAt`, D164).
- **Editing**: drag to move (snap to the grid, Shift free, Alt copy), drag the edges to trim (the
  left edge moves `offset` too), fade handles at the top corners, gain on the box's menu. Split at
  the playhead (S), Delete.
- **Playing** (`engine.startRegion(track, region, time, intoQ)`): its own sources keyed
  `region:<id>`, through the track's channel (so its effects, fader, mutes and solo, warp and
  pitch from the track's SOUND knobs, as page clips). Started by `automationStep`'s sibling
  `regionStep` from the scheduled steps, so starting mid-region, jumping, stop (panic, D99) and
  offline renders work the same.
- **A region wins over page clips** on its track (D187): while a region sounds, that track's page
  clip is silent; the drum machine's clip view says "Timeline audio plays here". Two regions on
  one track don't overlap: the later one's start cuts the earlier one (drawn dimmed).
- Placement mutes don't silence regions (they belong to song time, not to the page); the track's
  own mute does.
- In **Loop page** mode regions anchored inside the looped page play each time it loops; regions
  from earlier pages don't.

## 8. The demo song: "Long Way Home" (D191)

A new example song (`templates/arrangement.ts`, listed in `examples.ts` as "Rebeat demo · the
timeline"): nu-disco / synth-pop, **112 BPM, C minor**, about 1:55, built only from the 909 kit,
factory synths and the built-in vocal (`demo:vox-hook`, 2 bars, C minor at 112 BPM: at its own
tempo it isn't stretched, so it sounds the same live and offline). Every section shows one
capability, and the guide's chapter walks through it.

Tracks: Kick, Snare, Clap, Cl Hat, Op Hat, Crash (909); Bass (a factory synth bass); Pad (Juno
strings, Brightness = macro 1); Keys (an electric piano synth, chord stabs); Lead (a pluck
lead, the hook); Vox (Clip track, the vocal, regions only); Riser (noise riser). The master
gets a **Filter** effect in high-pass, at its lowest cutoff (transparent) except where it's
automated.

| #   | Placement | Page (pattern) | Bars  | What it shows                                                                                                                                                             |
| --- | --------- | -------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Intro     | Intro          | 2 × 2 | **Automation across pages**: Pad Brightness opens from the Intro's start to the Verse's second repeat (one lane, two placements)                                          |
| 2   | Verse 1   | Verse          | 2 × 4 | **Placement mutes**: the same page as Verse 2, with Op Hat and Keys muted here                                                                                            |
| 3   | Pre       | Pre            | 2 × 2 | **Fill on the last repeat**: the snare's FILL roll and the toms only the second time; the **master high-pass** sweeps up over the 4 bars                                  |
| 4   | Chorus 1  | Chorus         | 2 × 4 | The hook; **a vocal region starts in the Pre's last bar and runs into the Chorus** (the pickup over the page change); the high-pass drops at once (a hold point)          |
| 5   | Verse 2   | Verse (clone)  | 2 × 4 | The full verse; a second vocal region; **Vox Send A throws** on the vocal's last word (two points up, two down)                                                           |
| 6   | Break     | Chorus (clone) | 2 × 2 | **Mutes on a clone**: Kick, Bass, hats muted: the chorus stripped to pad, lead and keys, still linked (edit the chorus, the break follows)                                |
| 7   | Stop      | Chorus (clone) | ½     | **Play only the first 8 steps**: a two-beat stab with the crash, then the ruler's short bar (D184)                                                                        |
| 8   | Pre 2     | Pre (clone)    | 2 × 2 | Fill on the last repeat again, and the same high-pass sweep: **automation belongs to the placement**, so this clone has its own copy of it (as Alt+drag would make, D186) |
| 9   | Final     | Chorus (clone) | 2 × 4 | **Transpose +2** on a clone: the key change to D minor (the Notes move, the drums don't), fill on the last repeat                                                         |
| 10  | Outro     | Intro (clone)  | 2 × 2 | Transpose +2 (stays in D minor); **Master volume fades out** over the last 4 bars and Pad Brightness closes                                                               |

- Four patterns (Intro, Verse, Pre, Chorus) make a ten-placement song, so the timeline shows
  the link colors at a glance. The Chorus has FILL steps (a snare roll and the toms into the
  next section) for the Final's fill.
- Regions: two placements of `demo:vox-hook` (the vocal is in C minor, so none after the key
  change: the plan keeps audio out of transposed placements, and the guide says why: audio doesn't
  follow a placement's transpose).
- **Golden levels**: the song gets its own golden file (`e2e/golden/long-way-home.json`), which
  also covers automation, regions and overrides offline. About two minutes adds about two minutes
  to the golden test (§0.7 note on Laser Highway). The other songs' levels mustn't move (nothing
  in them uses the new fields).
- **Unit test** (`templates/arrangement.test.ts`): the song uses every feature it's meant to show
  (a placement with mutes, with transpose, with fill, with `steps`, a region crossing a slot
  boundary, automation lanes across slots), and every target in it is automatable.

## 9. Building it (D180–D192)

| Step | What                                                                                                                                                                                                          | Decisions  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1    | `model/arrangement.ts`: `layout`, positions, bars, `toSong`/`toAnchor`; `render.ts: timeline()` on top of it; tests                                                                                           | D180, D184 |
| 2    | Schema 10 (types, migration, normalize, `projectSampleIds`), `reanchor` in delete/copy/clone/unroll/split; tests                                                                                              | D181, D186 |
| 3    | Placement overrides in `playPageStep`/`scheduleStep`/render, MIDI export, recording un-transposed; the strip's badges, the block menu items; tests                                                            | D182       |
| 4    | `transport.songPosition()`, play from a position (`play({ from })`), the start marker; chasing                                                                                                                | D189       |
| 5    | The Timeline panel: ruler, Pages row (blocks, gestures, selection, repeats edge), zoom, follow, Arrange preset, commands                                                                                      | D183       |
| 6    | Track rows: miniatures, placement mutes by cell; the drum machine's "this placement" bar and hatched rows                                                                                                     | D182, D183 |
| 7    | Automation: `AUTOMATABLE`, `engine/automation.ts` (ramps, `S.automated`, worklet `automate`, `FxNode.automate`, new master/bus fx targets), lanes UI, Automate in knob menus, override and Back to automation | D185, D188 |
| 8    | Record automation (thinned)                                                                                                                                                                                   | D186       |
| 9    | Regions: `startRegion`/`regionStep`, panic, region wins over page clips; drag from the library, edit, split, fades; Record to the timeline                                                                    | D187       |
| 10   | The demo song "Long Way Home", its test, its golden levels                                                                                                                                                    | D191       |
| 11   | Guide chapter `timeline.md` (+ the song walk-through), hints for every new control, PLAN.md §0.6o and D180–D192, AGENTS.md (map, data model, gotchas); e2e                                                    | D190, D192 |

Each step is a commit (or a few), with `just check` passing; Playwright runs once at the end
(the e2e-at-the-end way of working), plus a throwaway screenshot spec for the panel's look in a
few themes and the narrow/compact sizes.

### 9.1 Files

- New: `model/arrangement.ts` (+ test), `model/automation.ts` (+ test), `engine/automation.ts`,
  `panels/timeline/` (`Timeline.tsx`, `Ruler.tsx`, `PagesRow.tsx`, `TrackRows.tsx`,
  `AutomationLane.tsx`, `RegionBox.tsx`, `zoom.ts`), `state/timelineActions.ts`,
  `templates/arrangement.ts` (+ test), `help/chapters/timeline.md`, `help/hints/timeline.ts`,
  `e2e/timeline.spec.ts`, `e2e/golden/long-way-home.json`.
- Changed: `model/types.ts`, `model/project.ts` (copy/clone/delete keep anchors),
  `model/schema.ts` (v10), `model/takePlan.ts` (`unroll`), `model/midiFile.ts`,
  `templates/builder.ts` (`splitLongPages`; helpers `placement`, `automate`, `region`),
  `engine/transport.ts`, `engine/render.ts`, `engine/engine.ts` (regions, `S.automated`,
  reconcile), `engine/channel.ts` (scheduled values), `engine/effects.ts` (`automate`),
  `engine/synth/{core,worklet,node}.ts` (`automate` macro message), `audio-io/midi.ts` and
  `midi/mapping.ts` (master/bus fx targets), `components/Encoder.tsx` (the A mark, Automate
  item), `panels/drum-machine/{PageStrip,TrackRow,ClipView}.tsx`, `app/{panels,layouts,
defaultCommands}.ts(x)`, `templates/examples.ts`, `storage/rebeatFile.ts` (through
  `projectSampleIds`).

## 10. Tests

- **Unit** (`model/arrangement.test.ts`): layout with repeats and `steps`; bars with a short
  page; `toSong`/`toAnchor` round trips; `valueAt` (before, between, holds, after); reordering
  slots moves anchored points; delete counts and removes; copy/clone duplicate anchors; unroll
  and split re-anchor (a point in repeat 3 lands in slot 3); hidden points come back when repeats
  grow; normalize drops orphans.
- **Unit** (`schema.test.ts`): v9 → v10 unchanged; regions' samples in `projectSampleIds`.
- **Unit** (transport, `transport.test.ts` style with the mocked engine): mutes silence a track
  in one placement only; transpose adds to the notes; fill on the last repeat only; a placement
  with `steps: 8` ends after 8 steps; playing from a position starts at the right slot, repeat
  (its cycle for `1:2`) and step.
- **Unit** (`engine/synth/core.test.ts`): an automated macro reaches its value by the given time.
- **Unit** (`model/automation.test.ts`): every `AUTOMATABLE` target resolves; the thinning keeps
  a ramp's shape with few points.
- **E2E** (`timeline.spec.ts`): open the panel; blocks match the slots; drag to reorder (the
  strip follows); Alt+Shift+drag clones (link color); drag the edge to ×3; Shift+click a range
  and ⇧⌘D; click a track cell to mute it here (the block's badge, the drum machine's hatched row,
  and it's silent there while the other clone plays: `masterLevel` / solo); add an automation
  lane from a knob's menu, add points, hear the send move (a level poll); drag a sample onto a
  Clip track row and hear it start mid-page; play from the ruler; delete a page with points and
  undo; explain mode covers every new `data-hint`.
- **Golden levels**: all existing songs and templates unchanged; Long Way Home recorded.
- **Manual**: the panel in a few themes and sizes (screenshots), a 100-page song for smoothness.

## 11. Open questions

1. **The demo's audio**: use the existing 2-bar vocal (proposed: no new built-in sample, the
   kits stay as they are), or synthesize a longer 4-bar vocal phrase (`demo:vox-verse`) so a
   region visibly spans a whole page change?
2. **Region vs page clip on one track**: the region wins while it sounds (proposed), or both
   play?
3. **Touching an automated knob**: override until "Back to automation" (proposed, as in Ableton),
   or the knob edits the lane's point under the playhead?
4. **Copying a page copies its automation and audio** (proposed: you duplicate what you see), or
   copies only the page?
5. **The demo song's name and style**: "Long Way Home", nu-disco at 112 BPM in C minor (proposed:
   the built-in vocal fixes tempo and key), or something else?
6. **Tempo changes over the song** (a tempo lane) are left for later (the scheduler, clips' warp,
   delay times and the bar ruler all assume one tempo). Fine to leave out of this batch?

## 12. Decisions (proposed)

- **D180 — The arrangement is the slots.** Pages stay the content and slots are placements; a
  pure `model/arrangement.ts` lays them out in quarter notes, for the timeline, the transport, the
  render and the MIDI export. Alt: a separate arrangement with its own clips per track (FL
  Studio's playlist), which would make tracks per placement and break clones (D13).
- **D181 — Schema 10, all optional.** Placement overrides on `PageSlot`, `Project.automation`,
  `Project.regions`; the migration only bumps the version. Alt: an `arrangement` object holding
  the slots (a bigger migration for nothing).
- **D182 — Placement overrides.** Mutes, transpose, fill and play-only-N-steps on a slot change
  that placement without unlinking it, shown as badges everywhere the page is shown. Per-repeat
  overrides aren't offered: unroll the repeats instead. Alt: unlinking for every change (today).
- **D183 — The Timeline panel.** A new panel and an Arrange layout; the page strip stays as the
  compact view with the same gestures. Alt: replace the page strip (loses the compact view in
  the drum machine).
- **D184 — Every page starts a bar.** The ruler counts bars from each block's start; a short
  page is a short bar. Alt: bars from the song's start (bar lines drift after an odd page).
- **D185 — Automation lanes by target.** A lane is a MIDI-learn target string and points
  anchored to placements, linear or held; the engine schedules them per step, live and offline.
  Alt: automation inside patterns (that's what parameter locks already are, and clones would
  share it).
- **D186 — Anchors follow the music.** Points and regions are anchored to a slot and an offset:
  reorder moves them, delete removes them (and the toast says so), copy duplicates them, unroll
  and split re-anchor them, a shorter span hides them. Alt: absolute bars (Ableton), which leave
  automation behind when you move a section.
- **D187 — Audio regions.** Pieces of samples in song time on Clip tracks, across page
  boundaries, through the track's channel; a region wins over the page clip while it sounds; no
  overlaps on one track. Alt: page clips that run free across pages (D10's alternative).
- **D188 — Only schedulable knobs automate.** `AUTOMATABLE` lists the targets the engine can
  move at an audio time (channel values, macros, a few effect params, buses, master, new
  master/bus effect targets); the others have no Automate item. Alt: automating anything
  through the store (a commit per frame, not in exports).
- **D189 — Play from anywhere, chase what's running.** A start marker on the ruler; playing
  starts at that slot, repeat and step, sets the lanes' values and starts regions part-way.
  Alt: always from a page's start (today).
- **D190 — Touching an automated knob overrides it** until Back to automation; Record
  automation writes thinned points while recording in Song mode. Alt: the knob edits the lane.
- **D191 — Long Way Home.** A demo song for the timeline: placement mutes, transpose, fill and a
  short placement on clones, automation across pages, vocal regions over a page change; only
  built-in sounds, at the vocal's own tempo and key so it renders the same offline. Alt: adding
  the features to an existing song (it would change that song's golden levels).
- **D192 — The timeline's guide and hints.** A chapter (`timeline.md`) with the song as the
  walk-through, a hint for every control; the page chapter points to it. Alt: —
