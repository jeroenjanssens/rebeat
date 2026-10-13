# Plan: the Timeline: patterns and sections, a linear arrangement, automation, audio and tempo across the song

Status: agreed 2026-10-13 (decisions D180–D195; Jeroen's answers are in §13). How we work: on
`main`, commit early and often, e2e once at the end of the batch.

The idea in one line: **patterns are the content, sections place them in the song, and the
timeline shows the sections in song time.** The song order is already a timeline with one lane
where every block follows the one before. This batch:

- renames "page" to **pattern** and the song's entries to **sections**
- draws the song as a timeline
- lets a section differ from its clones without unlinking them
- adds what only makes sense in song time: automation, audio that runs across sections, and
  tempo changes.

## 0. Where it starts

- `Project.slots: PageSlot[]` (`{ id, patternId, repeats }`) is the song order. A **clone** is a
  slot with another slot's `patternId`, a **copy** a new pattern (`model/project.ts: copySlot,
cloneSlot, unlinkSlot, deleteSlot, linkCount`). The code already says `Pattern`; the
  interface says "page".
- The **page strip** (`panels/drum-machine/PageStrip.tsx`) shows the slots as equal-width
  thumbnails: click (edit, or queue while playing), drag to reorder, Alt+drag copy,
  Alt+Shift+drag clone, a context menu (repeats, steps, size, color), Loop page / Song.
- The **transport** (`engine/transport.ts`):
  - walks the slots in song mode (`nextSlot`: repeats, queued pages, the song's end, `songLoop`)
  - counts `cycles` per slot for `1:2` conditions
  - plays a step with `playPageStep(project, pattern, pageStep, time, dur, cycle, fill)`
  - always starts at step 0 of the edited page (`play()`)
  - uses one tempo everywhere: `project.bpm` (`stepDuration`, the arp, `nextBeatTime`).
- The **offline render** (`engine/render.ts`) already lays the song out:
  `timeline(project) → { entries: { slot, pattern, start, cycle }[], duration }`, and calls the
  same `playPageStep`.
- **Recording at a time** (D164): `transport.positionAt(time)` gives the slot and step.
  `model/takePlan.ts` adds pages, makes copies and unrolls repeats (`unroll`).
- **Knob addresses**: MIDI learn names every value with a target string:
  - `track:<id>:sound.x`, `track:<id>:volume`, `track:<id>:fx:<fxId>:<param>`,
    `track:<id>:synth:<path>`
  - `bus:<id>`, `master:volume`
  - read by `midi/mapping.ts: readTarget`, set by `audio-io/midi.ts: applyTarget`.
- **What can change at an audio time**:
  - channel values use `rampTo(…, now)` from `reconcile` (`TrackChannel.update`, and
    `lockStep` for the filter)
  - synth macros can be locked at a time (`WorkletSynth.lockMacros`)
  - the worklet takes a `tempo` message, but not at a time
  - effects set their values directly (`Inner.set`), and tempo-synced ones are rebuilt
    through `FxChain.sync(effects, bpm)`.
- **Clips** (`engine.startClip(track, time, pageDur, oneshot)`):
  - start at a page's step 0 and stop at its end; a track has one clip playing (`S.clips`)
  - warp is fixed when the clip starts (`bpm / clipBpm`)
  - offline renders change a warped clip's pitch along with its speed instead of stretching it
    (§0.7).
- `model/schema.ts: projectSampleIds` is the one list of a project's samples (export,
  `.rebeat`, Used in project, loading).
- The built-in vocal `demo:vox-hook` (`engine/kits.ts`) is 2 bars in C minor at 112 BPM,
  synthesized offline with the kits (seeded).

## 1. Principles (robust and intuitive)

1. **Words people already know.**
   - **Pattern** is what the drum machine edits, as on every drum machine and in FL Studio.
   - **Section** is an entry in the song, as in Maschine's arranger, and is what musicians call
     a verse or a chorus.
   - Copy, clone (linked) and repeats stay.
2. **Nothing new to unlearn.**
   - The timeline uses the song strip's gestures: click to edit, Alt+drag copy, Alt+Shift+drag
     clone, the link color, ×N.
   - The strip stays as the compact view, and both edit the same sections.
3. **No hidden state.** Whatever makes a section sound different from its clones (mutes,
   transpose, fill, a shorter length) shows as a badge in three places: on the timeline block,
   on the strip, and in the drum machine while that section is being edited.
4. **Things move with their music.**
   - Automation, audio and tempo changes are anchored to a section, not to a bar number: move
     the chorus and its sweep, its vocal and its tempo change move with it.
   - Positions are in quarter notes, so tempo changes never move the music, only its timing in
     seconds.
5. **Everything is undoable, nothing is lost silently.**
   - Every edit is one `commit`, and drags use a merge key.
   - Deleting a section that carries automation, audio or tempo changes says what went with it
     in the toast ("Deleted section 6 with 1 audio clip and 4 automation points · Undo").
6. **Snap by default.**
   - Blocks snap to whole repeats; audio, points and tempo changes snap to the grid (Shift while
     dragging: free).
   - Values show in their real units while dragging (Hz, dB, %, BPM).
7. **Same live and offline.** Every new sound path is shared by the transport and
   `renderProject`, so exports, stems and the golden levels hear what you hear.
8. **Honest limits.**
   - Only knobs that can follow a curve at an audio time can be automated. The others don't
     offer it (no button) rather than half working.
   - Where an export can't match live playback (audio during a tempo change), the timeline says
     so on the clip.

## 2. Pattern and section: the rename (D180)

### 2.1 The words

| Before                      | After                                           | Meaning                                                                     |
| --------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- |
| Page (what you edit)        | **Pattern**                                     | The steps of every track: its length, step size, swing, transpose, key      |
| Page (an entry in the song) | **Section**                                     | One entry in the song: plays a pattern ×repeats, with its own settings (§6) |
| Clone page (linked)         | **Clone section (linked)**                      | A new section that shares its pattern: edit one, all of them change         |
| Copy page                   | **Copy section**                                | A new section with its own copy of the pattern                              |
| New page                    | **New section**                                 | A new section with a new, empty pattern                                     |
| Page strip                  | **Song strip**                                  | The thumbnails above the drum machine (the compact song)                    |
| Loop page / Song            | **Loop / Song**                                 | Loop repeats the edited section; the hint says so                           |
| Steps per page, page length | **Pattern length**                              | `stepCount × stepSize`                                                      |
| Page switch (Settings)      | **Switching sections: at the end / beat / bar** | When a clicked section starts                                               |
| Page range (Export: "Page") | **This section**                                | Renders the edited section with its settings                                |

- The **name** belongs to the pattern, so a clone shows its pattern's name. Rename says "Rename
  pattern (its 3 linked sections too)" when the pattern is linked.
- A track's own step count still "loops inside the pattern" (D9's wording updated).

### 2.2 What changes

- **Interface text**: every "page" in labels, menus, toasts, tooltips, commands, the Settings
  dialog, the Export dialog, the Launchpad/Push texts, the MiniLab's display feed and the
  welcome dialog. About 60 source files.
- **Guide and hints**: about 110 mentions in 10 chapters and 80 in the hints. Anchors that
  contain "page" get new ids, and the old ids redirect (`guide.ts` keeps an alias map), so the
  hints' `guide` links and links in old notes keep working.
- **Commands**: `page.next` / `page.previous` become `section.next` / `section.previous`.
  Rebound shortcuts saved under the old ids are read through an alias map in `commands.ts`,
  once, and saved under the new ids.
- **Code**, where the change is cheap and tsc checks it:
  - the type `PageSlot` becomes `Section`, `PageStrip` becomes `SongStrip`, `playPageStep`
    becomes `playStep`
  - hint ids `dm.page.*` become `dm.section.*` (the hints test catches any miss)
  - saved field names stay (`slots`, `patternId`, `editSlotId`): **no migration**, and old
    projects and `.rebeat` files load as they are.
- **Docs**: PLAN.md §2 (glossary) and §3.3, AGENTS.md (vocabulary, map, data model), with a
  note on D8 that D180 renamed the words.
- **Tests**: e2e text selectors ("Loop page", "Clone page") and unit tests that read labels.

This is step 0. It lands before anything else, so the new panel, the guide chapter and the
demo song use the new words from the start.

## 3. The data (schema 10, D182)

```ts
/** An entry in the song (saved in `Project.slots`; was PageSlot). */
interface Section {
  id: string;
  patternId: string;
  repeats: number;
  // section settings (D183): this section only; its clones keep the link
  mutes?: string[]; // track ids silent here
  transpose?: number; // semitones on Notes, added to the pattern's own (−12..12)
  fill?: "last" | "all"; // FILL conditions pass on the last repeat / on every repeat
  steps?: number; // play only the first N steps of the pattern (1..stepCount)
}

interface Project {
  // …
  bpm: number; // the tempo at the song's start (and everywhere without tempo changes)
  tempo?: TempoChange[]; // D192
  automation?: AutomationLane[]; // D186
  regions?: AudioRegion[]; // D188
}

/** A position anchored to a section: where it is inside that section's span (all repeats). */
interface SongAnchor {
  slotId: string;
  at: number; // quarter notes from the section's start, 0 ≤ at < span (length × repeats)
}

interface TempoChange extends SongAnchor {
  bpm: number; // 20..300
  ramp?: boolean; // ramp to it from the change before (linear in quarter notes); else a jump
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
  length: number; // quarter notes (it may run past its section's end, into the next ones)
  offset: number; // seconds into the sample where it starts
  gain?: number; // dB, −24..12
  fadeIn?: number;
  fadeOut?: number; // quarter notes
}
```

- **Song time** is counted in quarter notes (`stepCount × STEP_SIZE_QUARTERS`). Seconds come
  from the tempo map when playing (§8).
- **Migration 9 → 10** adds nothing, because every new field is optional. A test checks that a
  v9 project loads unchanged.
- **`normalizeProject`**:
  - drops lanes, points, tempo changes and regions whose target, track or section is gone
  - sorts them by song position
  - clamps `steps`, `transpose`, `at` and `bpm`.
- **`projectSampleIds`** adds the regions' samples: export, `.rebeat`, Used in project, the
  library's "still used" warning, and loading at open.

## 4. The arrangement model (`model/arrangement.ts`, pure, D181)

One module answers every "where is what" question, for the timeline, the transport, the render
and the MIDI export.

- **Layout**:
  - `layout(project) → Block[]`: per section `{ section, pattern, index, start, length, span,
perRepeat, repeats, settings }`, in quarter notes; `length` honors `steps`
  - `songLength(project)`, `blockAt(project, q)`
  - `toSong(project, anchor) → q`, and `toAnchor(project, q) → SongAnchor` (the block under q;
    past the end: the last block).
- **Bars**: `bars(project)` gives the ruler's bar lines. **Every section starts a bar** (D185):
  bars count from each block's start in the project's meter. A section shorter than a bar (a
  2-beat stop) is a short bar, as in a score, and the bars after it stay on their downbeats.
- **Values**:
  - `valueAt(lane, project, q)`: points in song order, linear between them (`hold`: a step);
    before the first point the first value, after the last point the last value
  - `segments(lane, project, from, to)`: the ramps between two song positions, for scheduling
  - `regionsAt(project, trackId, from, to)`: the regions that sound in a window, with where in
    the sample.
- **Keeping anchors** when sections change (D187): `reanchor(project, map)`, where `map` says,
  for a section that goes away or splits, which section and offset its content moves to. The
  same rules hold for automation points, tempo changes and regions:
  - **Delete** (`deleteSlot`): what's anchored to the deleted section goes with it, counted for
    the toast. A region from an earlier section that ran into it keeps its length, so it now
    runs into what follows.
  - **Copy / clone** (`copySlot` / `cloneSlot`, and the Alt+drags): the new section gets copies
    of everything anchored to the original, and its settings too. You duplicate what you see
    (Jeroen).
  - **Unroll and split** (`unroll` in takePlan, `splitLongPages` in the builder): repeat k of a
    section becomes section k, so an anchor at `at` moves to section `⌊at / length⌋` at
    `at mod length`.
  - **Changing repeats or a pattern's length**: anchors keep their `at`. Ones past the new span
    are **hidden, not deleted** (as steps are when a pattern shrinks, D9), and come back when
    the span grows.

## 5. The Timeline panel (`panels/timeline/`, D184)

A new Dockview panel, `timeline`:

- registered in `app/panels.tsx`, with `panel.timeline` in the command palette
- part of a new layout preset, **Arrange**: the Timeline across the top, the drum machine
  below, the Inspector at the side
- the default Compose layout doesn't change, so people's saved layouts stay as they are.

```
┌ Timeline ──────────────────────────────────────────────────────────────────────────────┐
│ [Loop|Song] ⟲  Snap: Bar ▾   Tracks ▾   + Automation   − ▭ +  Fit   ⤓ Follow  ⟲ Back to automation │
├──────────┬─────────────────────────────────────────────────────────────────────────────┤
│          │1    3    5    7    9    11   13   15   17   19   21   23   25   27   29    │ ruler (▼ start)
│          │0:00      0:17      0:34      0:51      1:08      1:26      1:44            │ time (follows the tempo)
│ Tempo    │112 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓100━━━━━╱112━━━━━│ jumps and ramps
│ Sections │┌Intro ×2─┐┌Verse ×4 🔗──────────────┐┌Pre ×2 F┐┌Chorus ×4 🔗─────────┐┌Brk 🔗│
│          ││▤▤ ┆ ▤▤  ││▤▤▤ ┆ ▤▤▤ ┆ ▤▤▤ ┆ ▤▤▤ 🔇2 ││▤▤ ┆ ▤▤ ││▤▤▤ ┆ ▤▤▤ ┆ ▤▤▤ ┆ ▤▤▤ ││🔇4 ▤ │
│          │└─────────┘└─────────────────────────┘└────────┘└─────────────────────┘└──────│
│ Kick     │  ····     ▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪   ▪▪▪▪▪▪▪▪  ▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪  ░░░░░ │ muted here: hatched
│ Bass     │           ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬   ▬ ▬ ▬ ▬   ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬  ░░░░░ │
│ Vox      │                                        [≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋]                   │ audio across sections
│  └ Send A ──────────────────────────────────────────────────────────╱╲________________ │ an automation lane
│ Master   │                                                                             │
│  └ HP cutoff ________________________________________╱‾‾‾‾‾‾|_________________________ │
└──────────┴─────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 The Sections row

- **Blocks**:
  - one block per section, as wide as its span
  - a block with repeats shows its pattern's thumbnail once per repeat, with thin dividers
  - it shows the name, the number, `×N`, and the link icon in the pattern's link color (as the
    strip's thumbnails do).
- **Badges** for section settings (§6): 🔇 with the number of muted tracks, `+2` for transpose,
  `F` for fill, a cut corner for a shorter length. Hovering one says what it is in a sentence
  ("2 tracks muted in this section: Op Hat, Keys").
- **Gestures**, the same as the strip:
  | Gesture                   | What it does                                                                               |
  | ------------------------- | ------------------------------------------------------------------------------------------ |
  | Click                     | Edit that section (the drum machine follows); while playing, queue it                      |
  | Double-click              | Focus the drum machine on it                                                               |
  | Drag                      | Reorder (a drop line between blocks); its automation, audio and tempo changes move with it |
  | Alt+drag / Alt+Shift+drag | Copy / clone to where it's dropped (with its automation, audio and tempo changes)          |
  | Drag the right edge       | Repeats (snaps to whole repeats, shows ×N while dragging; 1–64)                            |
  | Alt+drag the right edge   | Play only the first … steps (snaps to beats; the cut corner shows)                         |
  | Shift+click               | Select a range of blocks (then Copy, Clone, Delete, Move, Duplicate after)                 |
  | ⌘D / ⇧⌘D                  | Duplicate the selection after itself as copies / clones (`timeline.duplicate…`)            |
  | Delete                    | Delete the selection (not the last section)                                                |
  | Right-click               | The section menu (as on the strip) + Mute tracks…, Transpose, Fill, Play only…             |
- **Loop mode**: the edited block gets a loop brace on the ruler and the rest dims, so it's
  clear that only that section plays.

### 5.2 The ruler, the time line and the playhead

- **Ruler**: bars (from `bars()`, D185), beats when zoomed in. Under the bars, the time in mm:ss,
  which follows the tempo map (a slower part shows its seconds further apart). The song's total
  length is at the right.
- **Start position** (D190):
  - a click on the ruler puts the start marker (▼) there, snapped to the bar, and makes that
    block the edited section; Space plays from the marker
  - choosing a section anywhere else (strip, Launchpad) moves the marker to that section's
    start, so Space keeps meaning "play from the edited section", as today
  - double-clicking the ruler plays from there.
- **Playhead**: it runs from `transport.songPosition()` on the shared frame loop. **Follow**
  scrolls the view with it (one setting for the timeline and the strip: the existing `follow`).

### 5.3 The Tempo lane (§8)

- **Where**: a lane under the ruler, folded to a thin line when the song has one tempo. Its
  header shows the **start tempo** (`project.bpm`) as a number to drag or type.
- **Editing** works like an automation lane:
  - click to add a change; drag it up or down (whole BPM; Shift: 0.1) or sideways
  - right-click: **Jump** or **Ramp** (a ramp runs from the change before), or Delete
  - the BPM shows while dragging.
- **Drawing**: jumps are steps, and ramps are slopes.

### 5.4 Track rows (Tracks ▾: All, Only with automation or audio, None)

- **Rows**: one row per track, with its name in the track color. Each block shows a read-only
  miniature of that track's lane (hits as ticks, notes as bars, a pattern clip as a band),
  drawn in one canvas per row.
- **Muting a track in one section**: click its cell. The cell hatches and the block's 🔇 count
  goes up. The cursor shows a speaker, and the hint says it's this section only.
- **Clip tracks** also show their **audio regions** (§9) as waveform boxes across the blocks.
- **Row headers**: the track's own mute and solo, and the add-automation button for that track.
- **Below the last track** there's a drop area: "Drop a sample here for a new audio track".

### 5.5 Automation lanes (§7)

- **Where**: under their track's row, or under **Master** and the **buses**, which get header
  rows when they have lanes.
- **Header**: the target's name ("Pad · Brightness", "Vox · Send A"), on/off, and a menu
  (Clear, Delete lane, Pick another knob).
- **Editing**:
  - click to add a point, drag it (Shift: free), double-click or Delete to remove it
  - a box drag selects points
  - right-click: Ramp / Hold, Delete
  - the value under the pointer shows in real units (`toUnit` / patch params).
- **Adding a lane** two ways:
  - **+ Automation** in the toolbar opens a picker of automatable knobs, grouped by track,
    Master and buses
  - every automatable knob gets **Automate** in its context menu: it adds the lane with one
    point at the playhead, at the knob's value, and reveals it.

### 5.6 Zoom and scale

- **Zoom**: pixels per bar, with the − / + buttons or ⌘+scroll; **Fit** fits the song.
  Horizontal scroll with the wheel or a trackpad. The zoom is a setting (`timelineZoom`).
- **Narrow blocks** show the number only; the thumbnail stays.
- **Performance**:
  - blocks are DOM (dozens)
  - row contents and lanes are canvases, redrawn only when their pattern, section or lane
    changes (immer identity)
  - the playhead is one transformed element
  - a 100-section song stays smooth.

## 6. Section settings (D183)

What a section can change without breaking the link to its clones:

| Setting        | What it does                                                                                                                  | Where you set it                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Mutes**      | These tracks are silent in this section (steps, notes and pattern clips; audio regions belong to song time and keep playing)  | Click track cells on the timeline; "Mute in this section" in a track row's menu in the drum machine |
| **Transpose**  | Notes play N semitones up or down here (added to the pattern's transpose; hits and audio don't move, as with every transpose) | Block menu → Transpose (−12…+12)                                                                    |
| **Fill**       | FILL / !FILL conditions act as if Fill were held on the last repeat (or on all)                                               | Block menu → Fill on the last repeat / on every repeat                                              |
| **Play only…** | Only the first N steps of the pattern play (a stop, a pickup, a 2/4 bar)                                                      | Block menu → Play only the first … steps; or Alt+drag the right edge                                |

- **Engine**:
  - `playStep` takes the section (`{ mutes, transpose, fill }`) next to the pattern
  - a track plays only if `isAudible` and it isn't muted here
  - `transpose` adds to `pattern.transpose`, and fill joins `fillHeld || fillLatched`
  - `scheduleStep` ends a section at `steps`, and `render.ts: timeline()` uses `layout()`
  - the same code path runs live and offline.
- **The drum machine** shows the edited section's settings:
  - a row muted here is hatched with "Muted in this section (7)"
  - a bar under the song strip says "This section: +2, Fill on the last repeat · Clear"
  - edits to steps still edit the pattern (all its clones), as now.
- **Recording**:
  - into a transposed section, notes are written un-transposed (as played minus the
    transpose), so they sound as you played them there
  - into a shorter section, only its steps are written.
- **Unlink** keeps the settings, because they belong to the section, not the pattern.
- **MIDI file export** applies mutes, transpose and length (it uses `layout()` too).

## 7. Automation (D186, D187, D189, D191)

### 7.1 What can be automated (D189)

A knob can be automated when the engine can move it at an audio time. `model/automation.ts`
holds the table `AUTOMATABLE`, and each entry says how its value reaches the audio:

| Target                                               | How                                                                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `track:<id>:volume`, `mix.pan`, `mix.width`          | ramps on the channel's fader, panner, widener                                                                                      |
| `track:<id>:mix.sendA`, `mix.sendB`                  | ramps on the send gains (throws still win: the higher of the two, as now)                                                          |
| `track:<id>:mix.low/mid/high`                        | ramps on `FlatEQ`'s gains                                                                                                          |
| `track:<id>:sound.cutoff`, `sound.reso` (samples)    | ramps on the channel filter (as `lockStep` does)                                                                                   |
| `track:<id>:sound.macro1..8` (synths)                | a new worklet message `automate(macro, value, time)`; the core glides at control rate                                              |
| `track:<id>:fx:<id>:<param>` for some effects        | `FxNode.automate(param, value, time)`: Filter cutoff/reso, Delay mix/feedback, Reverb mix, Distortion drive, EQ3 gains, Pump depth |
| `bus:<id>` (volume), `master:volume`                 | ramps on the faders                                                                                                                |
| `master:fx:<id>:<param>`, `bus:<id>:fx:<id>:<param>` | the same effect params (new targets, also learnable by MIDI)                                                                       |

These have no Automate item for now:

- step-time knobs read per hit (tune, decay, start…)
- the synth editor's raw patch paths (use a macro instead)
- the performance controls.

Tempo isn't a knob here: it has its own lane (§8).

### 7.2 Playing it

- **Scheduling**: `engine/automation.ts: automationStep(project, songQ, time, dur)` runs for
  every step, called from `scheduleStep` and from `renderProject`. For each lane that's on, it
  schedules `linearRampToValueAtTime` (or `setValueAtTime` for holds) from the lane's segments
  in the step's window. It's one function, live and offline (like `effectsStep`, D104).
- **The engine owns an automated value while playing**:
  - `reconcile` leaves an automated target's param alone (`S.automated`), so the store's value
    doesn't fight the curve
  - stopped, the lane's value at the start marker plays, so what you see is what plays.
- **Chasing** (D190):
  - starting anywhere sets every lane's value at that position before the first step
  - a jump (a queued section, Loop) sets the values at the new position.
- **Knobs show the curve**: an automated knob gets a small "A" mark, and its ring follows the
  value while playing (the modulation rings already do this for synths).

### 7.3 Touching an automated knob, as in Ableton (D191)

- **Override**: turning an automated knob (mouse or MIDI) overrides its lane until you choose
  **Back to automation**. That button lights up in the timeline toolbar and in the transport
  bar, and it's on the knob's menu.
- **While overridden**:
  - the lane draws dimmed and the knob's "A" mark is hollow
  - the override is session state, not saved (it's for trying things)
  - it holds for every overridden lane until Back to automation brings them all back, as
    Ableton's Re-Enable Automation does.
- **Record automation** (a toggle next to Record, `transport.recordAutomation`):
  - while recording in Song mode, turning knobs writes points at their song position
  - the points are thinned to the turn's shape (Ramer–Douglas–Peucker; at most about one point
    per beat while the knob is still)
  - they replace the points under the turn
  - one undo step per take
  - recorded lanes aren't left overridden.

## 8. Tempo changes (D192, D193)

### 8.1 The tempo map (`model/tempo.ts`, pure)

- **What it is**: `project.bpm` is the tempo at the song's start. `project.tempo` lists the
  changes after it, anchored to sections like everything else.
  - A change is a **jump** (the new tempo from that point) or a **ramp** (linear in quarter
    notes, from the change before).
  - Copying a section copies its tempo changes. Deleting one removes them (§4).
- **Functions**:
  - `tempoAt(project, q)`
  - `secondsBetween(project, q0, q1)`: the exact integral of 60 / bpm(q). For a linear ramp
    from b0 to b1 over L quarters, that's `60·L / (b1 − b0) · ln(b1 / b0)`.
  - `quarterAt(project, seconds)`
  - `songDuration(project)`
  - results are cached per project identity (immer), so the scheduler's lookups stay cheap.
- **Without changes, nothing changes**: `secondsBetween` reduces to today's `60 / bpm ×
quarters`. A unit test checks that every step duration is identical, so the golden levels of
  every existing song and template stay as they are.

### 8.2 The scheduler and the render

- **Step durations**:
  - each step lasts `secondsBetween(songQ, songQ + stepQ)`
  - swing keeps its share of each pair of steps (even steps `2·swing` of the pair, odd ones the
    rest), so swing still works inside a ramp
  - `stepDuration` gets the step's song position instead of a bpm.
- **Every scheduled step knows its tempo**: `ScheduledStep` gets `bpm` (the tempo at the step's
  middle) and `songQ`. `transport.tempoNow()` reads it. While stopped, it's the tempo at the
  start marker.
- **Everything that read `project.bpm` for timing reads the step's tempo instead**:
  - the arpeggiator's rate (`arpeggiate`)
  - `nextBeatTime` / `nextBarTime`
  - the count-in (the tempo at the start position)
  - the play styles and Auto (`state/perform.ts`: `quarters * 60 / bpm` uses `tempoNow()`)
  - the looper's take length
  - Pump (it already gets `secPerQ` per step: pass the step's).
- **Tempo-synced sounds follow at their audio time**, through `tempoStep(bpm, time)`, which runs
  once per step when the tempo moved, live and offline:
  - synced Delays: `FxNode.tempo(bpm, time)` ramps `delayTime` over the step
  - synths: the worklet's `tempo` message gets a time, for synced LFOs
  - warped clips and regions: the live stretch node reschedules its rate for the step.
- **`reconcile` while playing** passes `tempoNow()` instead of `project.bpm` to `FxChain.sync`
  and `updateSynth`, so a project edit mid-song doesn't snap the delays back to the start tempo
  (a gotcha for AGENTS.md).
- **Offline**: `render.ts` walks the same step durations, so exports, stems and the golden
  levels include tempo changes.
- **The known gap**: offline renders change a warped clip's pitch along with its speed (§0.7),
  so during a tempo change an exported clip bends in pitch, where live playback stretches it
  and keeps its pitch.
  - On the timeline, audio inside a tempo change gets a small ⚠ with the hint "Exports bend this
    clip's pitch while the tempo changes".
  - The demo song keeps its vocal out of its tempo changes.

### 8.3 The BPM field and Loop mode (D193)

- **The transport bar's BPM**:
  - without tempo changes: the project tempo, as today
  - with tempo changes: it shows the current tempo while playing (with a small curve icon),
    and the start marker's tempo while stopped.
- **Typing or dragging the BPM** in a song with tempo changes **overrides** the tempo map
  with one tempo, until **Back to automation** (as any automated knob, §7.3, as in Ableton's
  tempo automation). The start tempo is edited in the Tempo lane's header.
- **MIDI**: a learned tempo control does the same.
- **Loop mode**: the looped section plays the tempo map over its own span. Each time round it
  starts again at the section's starting tempo, so a ramp inside a section ramps on every loop.
- **MIDI file export** writes the tempo map as Set Tempo events: jumps as one event, ramps as an
  event every 16th.
- **Recording**: notes are in steps, so they don't depend on tempo. A clip take recorded during
  a ramp stores the tempo at its start, and the record menu warns that it won't line up.

## 9. Audio on the timeline: regions (D188)

- **What a region is**: a piece of a sample placed in song time on a Clip track. It's anchored
  to a section (`start`), and its length in quarter notes can run across section boundaries.
  Uses: a vocal line over a section change, a long take, a riser into the drop, a one-off
  spoken word.
- **Making one**:
  - drag a sample from the library onto the timeline: below the tracks, it makes a new Clip
    track ("Audio 1") with the region; onto a Clip track's row, it adds it to that track
  - "Place on the timeline" in a pattern clip's menu turns the clip into a region at that
    section
  - **Record to the timeline** (a toggle in the Clip track's record menu): a take recorded in
    Song mode becomes a region where it was recorded instead of a pattern clip (`positionAt`,
    D164).
- **Editing**:
  - drag to move (snaps to the grid; Shift: free; Alt: copy)
  - drag the edges to trim (the left edge moves `offset` too)
  - fade handles at the top corners, gain on the box's menu
  - split at the playhead (S), Delete.
- **Playing**:
  - `engine.startRegion(track, region, time, intoQ)` plays it with its own sources (keyed
    `region:<id>`) through the track's channel. So its effects, fader, mute and solo, and warp
    and pitch from the track's SOUND knobs apply, as for pattern clips.
  - `regionStep`, the sibling of `automationStep`, starts regions from the scheduled steps.
    That makes starting mid-region, jumps, stop (panic, D99) and offline renders work the same.
- **One sound per track** (D188, my assessment of question 2). A region wins over the track's
  pattern clip while it sounds:
  - Playing both would double the sound by surprise. Silencing the region would make audio
    you placed by hand not play. One sound per track is also how a Clip track already works
    (one clip at a time) and how Ableton's arrangement works.
  - To make that rarely surprising, a drop below the tracks makes a new audio track. Dropping
    onto a Clip track that has pattern clips highlights the sections it will cover, and the
    drop hint says "Plays instead of this track's clips while it sounds".
  - The drum machine's clip view says "Timeline audio plays here" on those sections.
  - Two regions on one track don't overlap: the later one's start cuts the earlier one, and the
    cut part draws dimmed.
- **Mutes**: a section's mutes don't silence regions (they belong to song time, not to the
  pattern). The track's own mute does.
- **Loop mode**: regions that start inside the looped section play each time round. Regions
  from earlier sections don't.

## 10. The demo song: "Long Way Home" (D194)

A new example song (`templates/arrangement.ts`, listed in `examples.ts` as "Rebeat demo · the
timeline"):

- nu-disco / synth-pop, **112 BPM, C minor**, about 2:05
- built only from built-in sounds: the 909 kit, factory synths and two built-in vocals, so it
  renders offline
- each section shows one or two capabilities, and the guide's chapter walks through it.

### 10.1 A four-bar vocal (Jeroen)

A new built-in sample, **`demo:vox-verse`** ("Vox verse 112"), so a region visibly spans a whole
section change:

- **What it is**: 4 bars at 112 BPM in C minor, synthesized like the hook (`engine/kits.ts`: the
  same formant voice, vibrato and vowels). A phrase of 16 beats that answers the hook: it rises
  to E♭5 in bar 2, falls through D and C in bar 3, and ends on G in bar 4 (written out in
  `[beat, length, note, vowel]` like `renderVox`).
- **Rendering**: it's rendered **after** the existing sounds in `renderKits`, so their seeded
  randomness and their levels don't move (the golden levels of every other song check this).
- **In the library**: it shows with the built-ins (Samples → Demo).
- **No stretching**: at the song's own tempo and key it isn't stretched or bent, so it sounds
  the same live and offline (§8.2).

### 10.2 Tracks

- **Drums** (909): Kick, Snare, Clap, Cl Hat, Op Hat, Crash.
- **Synths** (factory):
  - Bass (a synth bass)
  - Pad (Juno strings, Brightness = macro 1)
  - Keys (an electric piano synth: chord stabs through a tempo-synced dotted-8th Delay, which
    follows the tempo changes)
  - Lead (a pluck lead, the hook)
  - Riser (noise riser).
- **Vox**: a Clip track with regions only.
- **Master**: a **Filter** effect in high-pass, at its lowest cutoff (transparent) except where
  it's automated.

### 10.3 Sections

| #   | Section  | Pattern        | Bars  | Tempo         | What it shows                                                                                                                                                    |
| --- | -------- | -------------- | ----- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Intro    | Intro          | 2 × 2 | 112           | **Automation across sections**: Pad Brightness opens from the Intro's start to the Verse's second repeat (one lane over two sections)                            |
| 2   | Verse 1  | Verse          | 2 × 4 | 112           | **Mutes in a section**: the same pattern as Verse 2, with Op Hat and Keys muted here                                                                             |
| 3   | Pre      | Pre            | 2 × 2 | 112           | **Fill on the last repeat**: the snare's FILL roll and the toms only the second time; the **master high-pass** sweeps up over the 4 bars                         |
| 4   | Chorus 1 | Chorus         | 2 × 4 | 112           | **The 4-bar vocal starts in the Pre's last two bars and runs two bars into the Chorus** (one region over a section change); the high-pass drops at once (a hold) |
| 5   | Verse 2  | Verse (clone)  | 2 × 4 | 112           | The full verse; the 2-bar hook (`demo:vox-hook`) in its last two bars, with **Vox Send A throws** on its last word (two points up, two down)                     |
| 6   | Break    | Chorus (clone) | 2 × 2 | **→ 100**     | **A tempo jump**: the break floats at 100; **mutes on a clone**: Kick, Bass, hats muted (pad, lead and keys stay), still linked to the chorus                    |
| 7   | Stop     | Chorus (clone) | ½     | 100           | **Play only the first 8 steps**: a two-beat stab with the crash, then the ruler's short bar (D185)                                                               |
| 8   | Pre 2    | Pre (clone)    | 2 × 2 | **100 ↗ 112** | **A tempo ramp** (accelerando) over the build, with the high-pass sweep: copied with the section (D187); fill on the last repeat again                           |
| 9   | Final    | Chorus (clone) | 2 × 4 | 112           | **Transpose +2** on a clone: the key change to D minor (the notes move, the drums don't); fill on the last repeat                                                |
| 10  | Outro    | Intro (clone)  | 2 × 2 | **112 ↘ 88**  | **A ritardando** (a ramp down) with **Master volume fading out** and Pad Brightness closing; transpose +2 (it stays in D minor)                                  |

- **Patterns**: four of them (Intro, Verse, Pre, Chorus) make a ten-section song, so the
  timeline shows the link colors at a glance. The Chorus has FILL steps (a snare roll and the
  toms into what follows) for the Final's fill.
- **Vocals**: two regions, both at 112 and in C minor. There are none after the key change,
  because audio doesn't follow a section's transpose, and none in the tempo changes (§8.2). The
  guide says why in a sentence each.
- **Tempo**: three tempo changes (a jump, a ramp up, a ramp down) show both kinds. The Keys'
  synced delay and the synths' synced LFOs follow them.
- **Golden levels**: the song gets its own golden file (`e2e/golden/long-way-home.json`), which
  also covers automation, regions, section settings and tempo changes offline. About two
  minutes of song adds about two minutes to the golden test. The other songs' and templates'
  levels mustn't move: nothing in them uses the new fields, and the new vocal renders last.
- **Unit test** (`templates/arrangement.test.ts`): the song uses every feature it's meant to
  show:
  - a section with mutes, one with transpose, one with fill, one with `steps`
  - a region crossing a section boundary
  - automation lanes across sections
  - a tempo jump and ramps both ways.

  It also checks that every target in it is automatable, and that no region overlaps a tempo
  change or a transposed section.

## 11. Building it (D180–D195)

| Step | What                                                                                                                                                                                                       | Decisions  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 0    | The rename: page → pattern / section in the interface, guide (anchor aliases), hints, commands (id aliases), types (`Section`, `SongStrip`, `playStep`), e2e, PLAN.md §2, AGENTS.md                        | D180       |
| 1    | `model/arrangement.ts`: `layout`, positions, bars, `toSong`/`toAnchor`; `render.ts: timeline()` on top of it; tests                                                                                        | D181, D185 |
| 2    | Schema 10 (types, migration, normalize, `projectSampleIds`), `reanchor` in delete/copy/clone/unroll/split; tests                                                                                           | D182, D187 |
| 3    | Section settings in `playStep`/`scheduleStep`/render, MIDI export, recording un-transposed; the strip's badges, the section menu items; tests                                                              | D183       |
| 4    | The tempo map: `model/tempo.ts`, step durations from it (live and render), `tempoNow()`, the readers of `project.bpm`, `tempoStep` (delays, worklet, stretch), reconcile while playing; tests              | D192       |
| 5    | `transport.songPosition()`, play from a position (`play({ from })`), the start marker, chasing                                                                                                             | D190       |
| 6    | The Timeline panel: ruler with time, Sections row (blocks, gestures, selection, the right edge), zoom, follow, the Arrange preset, commands                                                                | D184       |
| 7    | Track rows: miniatures, mutes by cell; the drum machine's "This section" bar and hatched rows                                                                                                              | D183, D184 |
| 8    | Automation: `AUTOMATABLE`, `engine/automation.ts` (ramps, `S.automated`, worklet `automate`, `FxNode.automate`, new master/bus fx targets), lanes, Automate in knob menus, override and Back to automation | D186, D189 |
| 9    | The Tempo lane, the BPM field (current tempo, override), MIDI file tempo events, the ⚠ on audio in tempo changes                                                                                           | D193       |
| 10   | Record automation (thinned)                                                                                                                                                                                | D191       |
| 11   | Regions: `startRegion`/`regionStep`, panic, one sound per track; drops (new track, onto a track), edit, split, fades; Record to the timeline                                                               | D188       |
| 12   | The 4-bar vocal `demo:vox-verse` (rendered last); the demo song "Long Way Home", its test, its golden levels                                                                                               | D194       |
| 13   | Guide chapter `timeline.md` (+ the song's walk-through), hints for every new control, PLAN.md §0.6o and D180–D195, AGENTS.md (map, data model, gotchas); e2e                                               | D195       |

- **Checks**: each step is a commit (or a few), with `just check` passing. Playwright runs once
  at the end (the e2e-at-the-end way of working).
- **Screenshots**: a throwaway spec checks the panel's look in a few themes and the narrow and
  compact sizes.
- **Step 0's own run**: it changes a lot of text, so it gets its own e2e run right away, so a
  broken selector doesn't hide among the later changes.

### 11.1 Files

- **New**:
  - model: `arrangement.ts`, `tempo.ts`, `automation.ts` (each with a test)
  - engine: `automation.ts` (automation, regions and tempo steps)
  - `panels/timeline/`: `Timeline.tsx`, `Ruler.tsx`, `TempoLane.tsx`, `SectionsRow.tsx`,
    `TrackRows.tsx`, `AutomationLane.tsx`, `RegionBox.tsx`, `zoom.ts`
  - `state/timelineActions.ts`
  - `templates/arrangement.ts` (+ test)
  - `help/chapters/timeline.md`, `help/hints/timeline.ts`
  - `e2e/timeline.spec.ts`, `e2e/golden/long-way-home.json`.
- **Changed**:
  - model: `types.ts`, `project.ts` (copy, clone and delete keep anchors), `schema.ts` (v10),
    `takePlan.ts` (`unroll`), `midiFile.ts` (sections, tempo)
  - templates: `builder.ts` (`splitLongPages`; helpers `section`, `automate`, `tempoChange`,
    `region`), `examples.ts`
  - engine: `transport.ts`, `render.ts`, `engine.ts` (regions, `S.automated`, reconcile's
    tempo), `channel.ts` (scheduled values), `effects.ts` (`automate`, `tempo`),
    `synth/{core,worklet,node}.ts` (`automate`, a timed `tempo`), `kits.ts` (the 4-bar vocal),
    `looper.ts`
  - `state/perform.ts` (`tempoNow`)
  - MIDI: `audio-io/midi.ts` and `midi/mapping.ts` (master and bus effect targets)
  - `components/Encoder.tsx` (the A mark, the Automate item)
  - drum machine: `PageStrip.tsx` → `SongStrip.tsx`, `TrackRow.tsx`, `ClipView.tsx`
  - app: `TransportBar.tsx` (BPM), `panels.tsx`, `layouts.ts`, `commands.ts`,
    `defaultCommands.ts`
  - `help/guide.ts` (anchor aliases)
  - `storage/rebeatFile.ts` (through `projectSampleIds`)
  - plus the rename's text changes across the interface (step 0).

## 12. Tests

- **Unit, the arrangement** (`model/arrangement.test.ts`):
  - layout with repeats and `steps`; bars with a short section
  - `toSong`/`toAnchor` round trips; `valueAt` before, between, on holds and after
  - reordering sections moves anchored points, tempo changes and regions
  - delete counts and removes them; copy and clone duplicate them
  - unroll and split re-anchor them (a point in repeat 3 lands in section 3)
  - hidden points come back when repeats grow; normalize drops orphans.
- **Unit, tempo** (`model/tempo.test.ts`):
  - without changes, every step's duration is identical to today's
  - a jump; a ramp's duration matches the closed form and a fine numeric sum
  - `quarterAt` inverts `secondsBetween`; swing inside a ramp keeps its share
  - the song's duration.
- **Unit, schema** (`schema.test.ts`): v9 → v10 unchanged; the regions' samples are in
  `projectSampleIds`.
- **Unit, the transport** (in `transport.test.ts`'s style, with the mocked engine):
  - mutes silence a track in one section only; transpose adds to the notes
  - fill plays on the last repeat only; a section with `steps: 8` ends after 8 steps
  - playing from a position starts at the right section, repeat (its cycle for `1:2`) and step
  - steps get shorter through a ramp up; the arp's rate follows the step's tempo.
- **Unit, the synth** (`engine/synth/core.test.ts`): an automated macro reaches its value by the
  given time; a synced LFO follows a timed tempo change.
- **Unit, automation** (`model/automation.test.ts`): every `AUTOMATABLE` target resolves; the
  thinning keeps a ramp's shape with few points.
- **Unit, the rename**: old command ids and old guide anchors resolve to the new ones.
- **E2E** (`timeline.spec.ts`):
  - open the panel; its blocks match the sections
  - drag to reorder (the strip follows); Alt+Shift+drag clones (link color); drag the edge to ×3
  - Shift+click a range and ⇧⌘D
  - click a track cell to mute it in that section: the block's badge, the drum machine's
    hatched row, and silence there while the other clone plays (`masterLevel` / solo)
  - add an automation lane from a knob's menu, add points, and hear the send move (a level
    poll); turn the knob (overridden), then Back to automation
  - add a tempo ramp and see the step events come faster (record them, as `pages.spec.ts` does)
  - the BPM field shows the current tempo
  - drag a sample below the tracks: a new audio track, heard starting mid-section
  - play from the ruler
  - delete a section with points and undo
  - explain mode covers every new `data-hint`.
- **E2E, the rename**: the existing specs, updated to the new words; nothing else changes.
- **Golden levels**: every existing song and template unchanged; Long Way Home recorded.
- **Manual**: the panel in a few themes and sizes (screenshots); a 100-section song for
  smoothness; Long Way Home live against its export (the tempo changes and the vocal across
  Pre → Chorus).

## 13. Jeroen's answers (2026-10-13)

1. **The demo's audio**: a four-bar vocal (`demo:vox-verse`, §10.1).
2. **A region and a pattern clip on one track**: left to my assessment. One sound per track: the
   region plays instead while it sounds, a drop below the tracks makes a new audio track, and
   the drop says what it covers (§9).
3. **Touching an automated knob**: as in Ableton: an override until Back to automation (§7.3).
4. **Copying a section copies its automation, audio and tempo changes**: yes (§4).
5. **"Long Way Home", nu-disco at 112 BPM in C minor**: yes (§10).
6. **Tempo changes**: in this batch (§8), shown by the song (a jump, a ramp up, a ramp down).
7. **Pattern and section instead of page**: yes, as step 0 (§2).

## 14. Decisions

- **D180 — Pattern and section.** The interface says **pattern** for what the drum machine edits
  (as drum machines and FL Studio do) and **section** for an entry in the song (as Maschine's
  arranger does, and as musicians name verse and chorus). "Page" is gone: on Elektron machines
  it means a 16-step part of a pattern. Saved fields stay (`slots`, `patternId`), so there's no
  migration; old command ids and guide anchors are aliases. Supersedes D8's wording. Alt: keep
  "page"; "scene" (Ableton's word, but a scene there is a row of clips, not a song entry).
- **D181 — The arrangement is the sections.** Patterns are the content and sections place them.
  A pure `model/arrangement.ts` lays them out in quarter notes, for the timeline, the transport,
  the render and the MIDI export. Alt: a separate arrangement with its own clips per track (FL
  Studio's playlist), which would make tracks per section and break clones (D13).
- **D182 — Schema 10, all optional.** Section settings on the saved slots, `Project.tempo`,
  `Project.automation`, `Project.regions`; the migration only bumps the version. Alt: an
  `arrangement` object holding the sections (a bigger migration for nothing).
- **D183 — Section settings.** Mutes, transpose, fill and play-only-N-steps on a section change
  it without unlinking it, shown as badges everywhere the section is shown. Per-repeat settings
  aren't offered: unroll the repeats instead. Alt: unlinking for every change (before).
- **D184 — The Timeline panel.** A new panel and an Arrange layout; the song strip stays as the
  compact view with the same gestures. Alt: replace the strip (it loses the compact view in the
  drum machine).
- **D185 — Every section starts a bar.** The ruler counts bars from each block's start, and a
  short section is a short bar. Alt: bars from the song's start (bar lines drift after an odd
  section).
- **D186 — Automation lanes by target.** A lane is a MIDI-learn target string with points
  anchored to sections, linear or held. The engine schedules them per step, live and offline.
  Alt: automation inside patterns (that's what parameter locks already are, and clones would
  share it).
- **D187 — Anchors follow the music.** Points, tempo changes and regions are anchored to a
  section and an offset. Reorder moves them, delete removes them (and the toast says so), copy
  duplicates them (Jeroen), unroll and split re-anchor them, a shorter span hides them. Alt:
  absolute bars (Ableton), which leave automation behind when you move a section.
- **D188 — Audio regions, one sound per track.** Pieces of samples in song time on Clip tracks,
  across section boundaries, through the track's channel. A region plays instead of the track's
  pattern clip while it sounds, and regions on one track don't overlap. A drop below the tracks
  makes a new audio track, and a drop onto a track with clips shows what it covers. Alt: both
  play (doubled sound by surprise); pattern clips win (placed audio not heard); clips that run
  free across sections (D10's alternative).
- **D189 — Only schedulable knobs automate.** `AUTOMATABLE` lists the targets the engine can move
  at an audio time: channel values, macros, a few effect params, buses, master, and new master
  and bus effect targets. The others have no Automate item. Alt: automating anything through
  the store (a commit per frame, and not in exports).
- **D190 — Play from anywhere, chase what's running.** A start marker on the ruler. Playing
  starts at that section, repeat and step, sets the lanes' values and the tempo, and starts
  regions part-way. Alt: always from a section's start (before).
- **D191 — Touching an automated knob, as in Ableton.** It overrides its lane (session state)
  until Back to automation, which brings back every overridden lane. Record automation writes
  thinned points while recording in Song mode. Alt: the knob edits the lane's point under the
  playhead.
- **D192 — Tempo changes.** `project.bpm` is the start tempo, and `project.tempo` lists jumps and
  ramps (linear in quarter notes) anchored to sections. Step durations are the exact integral,
  live and offline, and identical to before without changes. Everything timed reads the step's
  tempo, and synced delays, LFOs and stretched clips follow at their audio time. Exports bend
  warped audio in a tempo change (marked ⚠). Alt: tempo as an ordinary automation lane (0..1
  values, and the scheduler's seconds would depend on a knob's curve); one tempo per section
  (no ramps).
- **D193 — The Tempo lane and the BPM field.** A lane under the ruler (the start tempo in its
  header) for jumps and ramps. The BPM field shows the current tempo while playing, and typing
  or dragging it overrides the map until Back to automation. In Loop mode a section plays the
  map over its own span, and the MIDI file gets Set Tempo events. Alt: the BPM field edits the
  start tempo and moves every change with it.
- **D194 — Long Way Home and a four-bar vocal.** A demo song for the timeline:
  - section mutes, transpose, fill and a short section on clones
  - automation across sections
  - a four-bar vocal over a section change (`demo:vox-verse`, rendered after the other
    built-ins so their levels don't move)
  - a tempo jump, an accelerando and a ritardando.

  It uses only built-in sounds, and its vocals stay out of the tempo changes and the key change,
  so it renders the same offline. Alt: adding the features to an existing song (it would change
  that song's golden levels); the 2-bar hook alone.

- **D195 — The timeline's guide and hints.** A chapter (`timeline.md`) with the song as the
  walk-through, a hint for every control; the pattern and song chapters point to it. Alt: —
