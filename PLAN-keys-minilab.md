# Plan: the keys, recording notes, the MiniLab 3 (panel, display, browsing), CPU meter, zoom

Status: agreed and built 2026-10-10 (PLAN.md §0.6j, decisions D126–D131), with the defaults in §4.
What's left needs the device: step H.

How we work (Jeroen, 2026-10-10): on `main` (wave-1 agents work in worktrees, merged into main
locally), commit early and often, and run the end-to-end tests **only once, at the very end**
(they take long). While building: prettier, tsc, eslint and vitest.

## 0. What I found (the causes, with places in the code)

| #   | Issue                                   | Cause                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a  | Recording overwrites existing notes     | Live recording calls `apply(step, …, merge = false)` (`state/input.ts:74`), which replaces the notes on the step.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 1b  | Chords can't be recorded                | MIDI calls `padInput` once per note-on (`audio-io/midi.ts:474`). With merge off, each key of a chord replaces the one before, so only the last key is kept. Step entry while stopped does merge (a 60 ms chord window); live recording doesn't.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 1c  | Every note is one step long             | `length: 1` is hardcoded (`input.ts:38`). Note-off never reaches recording; it only stops the sound.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 1d  | Velocity                                | Velocity is already stored, per note and on the step. It survives once 1a/1b are fixed, so this item only needs a test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 1e  | Off-grid notes                          | A `Note` has no start of its own. Its start is its step, and the only offset is the step's `nudge`, which all of a chord's notes share. Q Off records that nudge, but the piano roll ignores it when drawing and only edits whole steps.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2   | Playing the keys cuts the track's notes | Live keys and the sequencer play the same voice per track. (a) About 15 factory synths are mono or legato: a live key takes the only voice, and while it's held, sequenced note-offs glide back to it (`engine/synth/core.ts:445–506`). (b) Sampled instruments release by pitch: Tone.Sampler's `triggerRelease(hz)` and smplr's default `stopId` stop every note of that pitch, sequenced ones too (`engine/instruments.ts:126–131, 200–203, 272–275`). (c) Poly synths with few voices steal the oldest one. (d) With Rec on, 1a also deletes the track's stored notes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3   | No device picture                       | It doesn't exist yet. `onMidiMessage` gives the raw messages, but nothing says "fader 2 = 87". The monitor only stores formatted text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 4   | Faders 1–3 jumpy, fader 4 smooth        | All four take the same code path (`applyMapping`, `midi.ts:374–421`); the store, React and the engine don't treat them differently. The likely cause is that **relative-mode auto-detection switches a fader to an encoder mode** (`midi.ts:396–403`, `detectMode` in `midi/mapping.ts:30`). It runs on every CC of a map slot, faders included, over the last 6 values (from older movements too). A single repeated value in 57–71, 1–15 or 113–127 flips the slot to rel64, rel2c or relsign, and the change is **saved for good** in the settings. After that, the fader's positions are read as steps, so the target creeps and jumps. Fader 4 (master) usually sits near CC 102 (0 dB), outside those windows; the sends often sit low (1–15) or in the middle. Possible amplifier: `startMidi(true)` asks for a new `MIDIAccess` without clearing the old handlers, so each message could be handled twice, which always creates repeats. To confirm on your device in 1 minute: Settings → MIDI, the MiniLab 3 slots: do faders 1–3 say "Relative (…)"? |
| 5   | The keys always play the selected track | `playNote` sends every non-pad note to the selected Notes track (`midi.ts:457`). Library previews are trackless (`audition.ts`, `libraryEdit.ts`), but the keys can't reach them, and previews bypass the master.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 6   | Text on the MiniLab display             | Rebeat sends nothing to the MiniLab today; there's only Launchpad/Push SysEx. It should be possible: Arturia's own DAW scripts write the MiniLab 3's screen with SysEx (manufacturer id `00 20 6B`) on its DAW port. The manual doesn't document it, so it has to be checked on the device (see 6 below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 7   | No single list of playable sounds       | The library has locations per family. None of them lists everything the keys can play, and the main encoder has no slot in the MiniLab map.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 8   | CPU meter always ~1%                    | **It isn't a CPU meter.** It times the JavaScript in the shared animation-frame callbacks (`render/raf.ts:9–17`) as a share of 16.7 ms, smoothed. Audio runs in AudioWorklets and the scheduler in a worker, so neither is counted. Canvas drawing takes well under 1 ms per frame, so it reads 0–2%. Its hint (`help/hints/app.ts:78`) overstates what it measures.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 9   | Zoom feels odd                          | The buttons multiply by 1.15 and Ctrl+wheel by 1.1/0.9 (`HeaderBar.tsx:249,260`, `TrackList.tsx:291`), so the levels are 115%, 132%, 152%… Worse, `geometry()` (`layout.ts:100`) only uses zoom to scale the min/max clamps of a width that already fits the panel. In the middle of the range, zoom often changes nothing, and then suddenly it does.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## 1. The shape of the solution

Items 1, 2, 5 and 7 all touch "the keys". Today, three separate paths play notes:

- MIDI `playNote`
- the on-screen `Keyboard` (synth editor only)
- the computer keyboard and pads in the pad view

Only some of them record, and each picks its own target. I'd fix this once with a new module,
**`state/keys.ts`: the keys** (D126). It does four things:

- **A target (what the keys play):** `{ kind: "selected" }` (follow the selected track, as
  today and the default), `{ kind: "track", id }` (locked to one track) or
  `{ kind: "sound", entry }` (a library sound with no track). It's UI state that isn't saved
  in the project; the last library sound is remembered in the settings.
- **`noteOn(pitch, velocity, source) → noteOff()`:** every source of held notes goes through
  this (MIDI, the on-screen keyboard, the computer keys, the piano roll's key column). It
  handles sustain, scale lock and chord mode (`playedNotes`), and recording.
- **Live voices:** the keys play their own voice, never the sequencer's (fixes 2).
- **Pitch bend, mod wheel and aftertouch** go to the keys' voice.

Pads on the pads channel keep playing tracks by position (D119), as now.

## 2. Workstreams

Each workstream lists its files so two agents never edit the same code. Where two depend on
each other, the interface is written first (phase 0) and both build against it.

### WS-A. The keys: target and live voices (fixes 2, half of 5)

1. `state/keys.ts` as above. `midi.ts: playNote`, `PadView` keys/pads, the synth editor's
   `Keyboard` and the piano roll's key column all call `keys.noteOn`. The synth editor's
   library tabs (D91) keep their own voice.
2. **Live voices** (`engine/engine.ts`, `engine/instruments.ts`): a second `InstrumentVoice`
   per track for the keys. It's created on the first live note, on the same channel input (so
   level, effects, mute and sends apply), rebuilt when the track's sound changes (reconcile),
   disposed after 30 s idle and included in `panic()`.
   - Synths: a second worklet node with the same patch and macros. A mono bass line and a
     live mono lead no longer steal from each other.
   - smplr/sf2: a unique `stopId` per held note, so a release stops only that note.
   - Tone.Sampler: a second sampler that shares the first one's buffers.
   - Parameter locks stay on the sequencer's voice; the keys play the track's knob values.
3. **A library sound on the keys** (`{ kind: "sound" }`): built like `libraryEdit.ts:
trackOf` (factor it out as `library/soundTrack.ts: trackFor(entry)`), played through a new
   **Keys strip**:
   - an engine channel into the **master** (so it goes through the master chain, the DJ filter
     and the Performance tools, unlike previews), with a level and Reverb/Delay sends
   - shown in the mixer while the keys play a library sound
   - not in exports; it's a live instrument
   - samples play chromatically, root C4 or the sample's detected key
4. **The keys chip** in the transport bar. It shows what the keys play ("Keys: BASS",
   "Keys: Rhodes (library)") and opens a menu:
   - Follow the selected track
   - each Notes track
   - Lock to this track
   - Recent library sounds
   - **Add as a track**: a library target becomes a Notes track with that sound
     (`trackActions.applyEntry`), and the keys follow it

   In the library, each playable row gets a **Play on the keys** button (keyboard icon), and
   **K** does the same for the selected item. A setting, **Selecting a sound puts it on the
   keys** (off; on in the Playable view, see WS-D), saves the click.

5. Tests:
   - unit: target resolution; noteOn/noteOff with sustain
   - e2e: hold a key while a mono-synth bass plays and check the bass keeps playing (record
     `engine` events, not levels alone); play a library sound with no track (master level
     rises, tracks unchanged); Add as a track
   - golden levels must not change

### WS-B. Recording notes (fixes 1)

Contract with WS-A: `recordNoteOn(trackId, pitch, velocity) → id` and `recordNoteOff(id)` in
`state/input.ts`. WS-A calls them; WS-B fills them in. Can start at the same time as WS-A.

1. **Overdub or Replace** (D127), a toggle next to the Record button in the transport bar, also
   shown in the piano roll's header. Default **Overdub**.
   - Overdub adds notes and keeps what's there. A note of the same pitch on the same step is
     replaced.
   - Replace clears the notes of a step the first time you play onto it in this pass of the
     loop. Steps you don't play over are kept, so it's a punch-in, not a wipe.
   - Hits tracks behave the same way, which only matters for a step's velocity and nudge.
2. **Chords:** each note-on writes its own note, so chords simply accumulate. The 60 ms chord
   window stays for step entry while stopped.
3. **Lengths:** a note-on writes the note with a provisional length (one grid unit), and its
   note-off sets the real length: the end minus the start in steps, through the loop's wrap,
   at most the page length, at least one grid unit. A held sustain pedal extends it until it's
   released. Both writes go to one undo step (merge key `rec-<track>`). The step's `gate` isn't
   touched.
4. **Velocity:** kept per note, and the step's velocity is the loudest note's. Test it.
5. **Snap (D128).** A magnet toggle beside Q: on = starts and lengths snap to Q's grid, off =
   free. It replaces Q's "Off" entry, so Q always names a grid size. Free notes need a start
   inside the step, per note:
   - **`Note.offset?: number`** (−0.5..0.5 of a step), **schema 9**: an optional field, with a
     no-op migration and a test, per the convention. Lengths are already numbers.
   - Playback: `playNotes` schedules each note at `time + offset × stepDur`. A step's nudge
     still moves the whole step. Check the clamp to `audioNow()` for early notes on the first
     scheduled step.
   - Recording with Snap off rounds to the nearest step and stores the rest as `offset`, the
     length unrounded (min 0.05 step).
   - Piano roll: notes are drawn at `(step + offset) × colW` and `length × colW`. When Snap is
     off, or with Alt held, dragging and resizing are free. **Quantize selection** snaps them
     back. `noteOps.ts` gets offset-aware `moveNotes`/`resize`, with unit tests.
   - MIDI file export/import carry the offset and the fractional length.
6. Also fix: recording ignores a lane's `stepSizeOverride` (`input.ts:51`), which puts notes on
   the wrong step on tracks with their own rate.
7. Tests:
   - unit (`input` against a fake transport position): chord of 3 → 3 notes; overdub keeps old
     notes; replace punches only the played steps; length from note-off, through the wrap and
     with sustain; Snap off → offset and fractional length; velocity per note; the schema 9
     migration
   - e2e with `midiKeyboard`: record a held chord while playing and check notes, lengths and
     velocities in the store
   - golden levels unchanged, since old projects have no offsets

### WS-C. MIDI controller fixes and the controller event stream (fixes 4; base for 3, 6, 7)

1. **Faders never switch modes (D129).** Map slots get a `kind` (`knob | fader | encoder |
button | pad`).
   - Only `knob` and `encoder` slots are sniffed.
   - Sniffing needs one gesture (values less than 250 ms apart) and stronger evidence: at least
     two repeats, or six values that hover around their center. A slow fader drift no longer
     looks like an encoder.
   - On load, fader slots that were switched before are reset to Absolute (a settings
     migration, so your saved MiniLab map is fixed without relearning).
   - `startMidi(true)` removes the old access's handlers, so messages are handled once.
   - With pickup on, the pickup state of `selected:*` roles resets when the selection changes.
   - Unit tests for each; e2e: a slow fader stream with repeats in 57–71 stays absolute and
     moves the send smoothly.
2. **Controller events (contract for WS-D and WS-E):** `midi/controllerEvents.ts`,
   `onControllerEvent(fn)` with `{ device, control: { kind, index }, value, raw, target?,
targetValue? }`. It's emitted from `handle()` after the routing, so it also says what
   Rebeat did. The active map's slots name the controls. Keys and pads come from note
   messages; touch strips from pitch bend and CC 1. Monitor entries get the structured fields
   too.
3. **MiniLab 3 map additions:**
   - the main encoder as an `encoder` slot: turn → the new role `browse:sound` (WS-F), click →
     **Add as a track**, Shift + turn → page through the list
   - Shift and the octave buttons as `button` slots for the picture
   - CCs from the manual or Arturia's DAW script; to be confirmed with the Monitor (step H)
4. **Output to the MiniLab** (`audio-io/controllers/minilab3.ts`):
   - find its output port, ask for SysEx (Chrome asks once)
   - `showText(line1, line2)` with a debounce, so scrolling fast doesn't flood the device
   - a **Send test text** button in Settings → MIDI under the MiniLab 3 map, plus **Show names
     on the MiniLab display** (on)
   - a fake MIDI output for e2e that records the bytes sent

   **Risk:** the SysEx format comes from Arturia's DAW integration, not the manual. It may only
   work on the DAW port or in DAW mode, and the screen may fall back to its own text after a
   few seconds. Step H checks this first. If it doesn't work, the panel's mirrored display (WS-D)
   still shows the text.

### WS-D. The Controller panel (3)

New panel `panels/controller/` ("Controller", id `controller`), registered in `panels.tsx` and
added to the **Perform** layout below the Performance panel (`layouts.ts`). A saved Perform
layout only gets it when you re-apply the preset; I'd show a one-time toast that offers it.

1. A top-down **SVG of the MiniLab 3** that follows the real layout:
   - 25 keys
   - 8 pads (bank A/B shown)
   - 8 knobs, 4 faders
   - the main encoder with its screen
   - pitch and mod touch strips
   - Shift, Hold, Octave − / +

   I'll draw it from Arturia's top-view product images and check it against your device or a
   photo.

2. **Live:** keys go down with velocity shading, pads light up (pressure while held), knobs and
   faders move. Every control shows what it's mapped to: knobs the selected track's SOUND
   names from `soundDefs`, faders Level / Reverb / Delay / Master, and the encoder "Browse".
   Values are the target's (so a relative encoder shows its knob's real position), batched per
   animation frame through `render/raf.ts` rather than a React render per MIDI message.
3. The screen mirrors what's sent to the device (WS-C 4). Hovering a control shows its slot
   and its current mapping. Clicking keys and pads plays them through `keys.noteOn`. That's
   handy without the device, and the e2e tests use it.
4. Other maps (MPK, Launchkey) get a simple generic picture (their slots as rows) until they
   have drawings. With no controller it shows "Plug in a controller".
5. Hints for every part; guide: "Your controller" gets a section about the panel.

### WS-E. Library: the Playable list and browsing with the encoder (7, the other half of 5)

Needs WS-A's `keys.setTarget` and WS-C's controller events; it builds against their phase 0
stubs.

1. A new location, **Playable** (first under All), in one list:
   - synths
   - sampled instruments
   - Your sounds
   - samples

   It has the usual section headings, search and filters, plus a **Samples** filter chip
   (see question Q3). It's built as a pure function, `library/playable.ts: playableList()`,
   so the encoder can browse it while the Library panel is closed.

2. **Selecting an item in Playable puts it on the keys** at once: a debounce of about 150 ms
   when it's moved by the encoder or arrows, so scrolling doesn't load 40 instruments. The
   chip, the Controller panel and the MiniLab screen say "Loading…" until a streamed
   instrument is ready. The previous voice is released and disposed.
3. **The role `browse:sound`** (relative): each encoder step moves one item, with Shift a
   section. Every move:
   - selects and scrolls the item in the panel (if open)
   - puts it on the keys
   - shows it on the display: line 1 the name, line 2 "Synth · 12/318"

   A click adds it as a track. The command palette gets **Next/Previous playable sound** too,
   so any controller can learn them.

4. Also on the display (setting on): the keys target when it changes (track or sound name),
   the selected track when you select one, and briefly a knob's name and value while it turns
   (like Arturia's own firmware).
5. e2e: send relative CC from the fake MiniLab and check the selection advances, the keys
   target follows, and the fake output received the name.

### WS-F. CPU meter (8)

Make the meter honest and useful (D130):

- **Audio**: if the browser has `AudioContext.renderCapacity` (Chromium, behind feature
  detection), show the audio thread's load from it, plus a count of dropouts from
  `ctx.playbackStats` where available.
- **Main**: the share of the last second that the main thread was busy, from
  `PerformanceObserver("long-animation-frame")`, plus the scheduler's lateness (how late the
  ticker runs compared with the 120 ms lookahead; that's what makes notes come late).

The chip shows the worst of these with the label of which one, and the hover card the details.
The hint and guide are rewritten. If neither audio API exists in the browser (to check in
today's Chrome and our Electron), the meter says "Main" and doesn't pretend to measure audio.
Unit test for the lateness meter; e2e that it's not stuck at a constant.

### WS-G. Zoom (9)

Fixed levels and a real pad size (D131):

- `zoom` becomes `number | "fit"`, saved in the settings. `"fit"` is the default and is
  today's behavior without the clamps' surprises: the steps fill the panel's width (with a
  minimum pad size, then scrolling).
- A number sets the pad width exactly: base width × zoom, with no fitting.
- In `HeaderBar` the − / + buttons step through **50, 67, 75, 80, 90, 100, 110, 125, 150, 175,
  200, 250%**, and so does Ctrl/Cmd + wheel (one level per notch, with a threshold for
  trackpads).
- The readout becomes a **combobox**: the levels, **Fit**, and a text field where you type any
  number (clamped to 25–400%, Enter applies).
- Commands **Zoom in / out / Fit / 100%** for the palette and shortcuts.
- `geometry()` gets unit tests for both modes. e2e: pick 150% → pad width × 1.5; Fit at two
  panel widths fills the width; type 133 → 133%.

### WS-H. With the device (you, about 15 minutes, before or during WS-C/WS-E)

1. Settings → MIDI: what do faders 1–3 say (Absolute or Relative)? This confirms cause 4.
2. The Monitor: what the main encoder sends when turned and clicked (and with Shift), and the
   octave and Shift buttons.
3. **Send test text**: does the screen show it, in ARTURIA mode and in DAW mode?
4. Later: a photo of the device for the drawing, and a run through the panel.

## 3. What runs in parallel

```
Phase 0 (me, ~1 commit, sequential)
  - contracts as stubs on main:
    state/keys.ts (types, no-op API), input.ts recordNoteOn/Off signatures,
    midi/controllerEvents.ts, library/playable.ts signature, Note.offset type + schema 9 stub
  ──────────────────────────────────────────────────────────────────────────────
Wave 1 (6 agents, each in its own worktree from main; no e2e runs)
  WS-A keys + live voices      engine.ts, instruments.ts, keys.ts, midi.ts:playNote, Keyboard, PadView
  WS-B recording + Snap        input.ts, types/schema, transport/playNotes, piano roll, noteOps, midiFile
  WS-C controller fixes        mapping.ts, midi.ts:applyMapping/handle/startMidi, controllers.ts, minilab3.ts
  WS-D controller panel        panels/controller/* (against the event stub), panels.tsx, layouts.ts
  WS-F CPU meter               TransportBar:CpuMeter, raf.ts, ticker.ts, hints/app.ts
  WS-G zoom                    HeaderBar, layout.ts, TrackList, store/settings zoom, commands
  (WS-H in parallel: you with the device)
  ──────────────────────────────────────────────────────────────────────────────
Merge A, B, C (in that order; the overlaps are midi.ts and the TransportBar, in different
functions and places), then D, F, G
  ──────────────────────────────────────────────────────────────────────────────
Wave 2 (2 agents)
  WS-E Playable + browsing + display names (needs A + C)
  Integration: Controller panel on the real event stream, Keys strip in the mixer
  ──────────────────────────────────────────────────────────────────────────────
Wave 3 (me): guide chapters, hints check, PLAN.md §0.6j + D126–D131, AGENTS.md (keys.ts,
  live voices, controller events, schema 9), the full verification once
  (prettier, tsc, eslint, vitest, playwright --workers=4, golden levels), screenshots of the
  panel, zoom and chip
```

Why this split:

- Every wave-1 stream owns its files. The interfaces they share are fixed in phase 0, so they
  don't wait on each other.
- Agents in wave 1 run prettier, tsc, eslint and vitest, and write their e2e specs without
  running them. The one e2e run is in wave 3.
- About 8 agents in total, within the size guideline.

## 4. Decisions (the defaults, agreed)

- **Q1.** Overdub is the default; the Overdub/Replace toggle sits beside Record in the transport
  bar and in the piano roll's header.
- **Q2.** Snap is a magnet toggle beside Q; Q's "Off" entry goes (old "Off" settings become Snap
  off with Q 1/16).
- **Q3.** Playable lists the synths, sampled instruments and Your sounds, and the samples that
  aren't drums (a detected pitch, or not a kit/drum category); a chip shows all samples.
- **Q4.** A library sound on the keys plays through the Keys strip into the master (heard in the
  Performance tools and the recorder, not in exports).
- **Q5.** Recording with a library sound on the keys doesn't make a track by itself; **Add as a
  track** does.
- **Q6.** On `main` (see the status), with local commits; nothing is pushed without asking.
- The end-to-end tests are written along the way but run once at the end (so the per-worktree
  Playwright port isn't needed).
