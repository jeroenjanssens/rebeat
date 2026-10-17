# Rebeat: overview for coding agents

This file is the fast way in. It explains what Rebeat is, how the code is organized, how the
pieces talk to each other, how to verify a change, and the gotchas that cost time before.
`PLAN.md` is the long-form record: the product spec (§1–§3), the original architecture (§4),
and every design decision (§6, D1–D240). When this file and the code disagree, the code wins.
Please fix this file in the same change.

Status (2026-10-15): every phase of the original roadmap is built, plus several feature batches
(PLAN.md §0.6b–§0.6g). The biggest recent batch is **step tracks** (§0.6f, D93–D98, built on
the `step-tracks` branch and merged): the drum / instrument / audio track kinds became one kind
of track with a **sound** (sample, synth, sampled instrument) and a **mode** (Hits, Notes,
Clip), schema 7, a library ordered by what you pick, one set of icons, and an Inspector Sound
section. The latest batch is **beatbox to step tracks** (§0.6h, D105–D118): a Beatbox panel and a small deep learning model (trained in `ml/`) that turn your
beatboxing into step tracks. Since then: MIDI controller maps (§0.6i) and **the keys and the
MiniLab 3** (§0.6j, D126–D131, plan in `PLAN-keys-minilab.md`): what keyboards play
(`state/keys.ts`), recording held notes with lengths and free starts (schema 9), a Controller
panel, the MiniLab's display and encoder browsing the library's Playable view, an honest CPU
meter, zoom levels. Then the MiniLab 3 work after the device arrived (D139–D148: chord voicing,
bass, relative knobs, pad colors, Shift + pads, the picture on the photo) and **play styles for
the keys** (§0.6k, D149–D154, plan in `PLAN-playstyles.md`): strum, slop, balance, a live
arpeggiator, latch, chord patterns, smooth voicing, the bass on its own track; and
**suggestions** (§0.6l, D158–D160, `PLAN-suggestions.md`): the next chord and the key to press, a
Next pad mode. The latest batch is **the timeline** (§0.6o, D180–D195, `PLAN-timeline.md`):
"page" became **pattern** and **section**, a Timeline panel draws the sections in song time,
sections have their own settings (mutes, transpose, fill, a shorter length) that keep clones
linked, and tempo changes, automation and audio on the timeline (all anchored to sections,
schema 10), with the demo song Long Way Home; and then **automation as a table** (§0.6p,
D196–D205, `PLAN-automation-editor.md`): a lane's points in the Inspector, eases in and out per
point and on tempo ramps, schema 11; and **a tidier interface** (§0.6q, D206–D219,
`PLAN-ui-cleanup.md`): the Keys panel's cards, a smaller top bar with ▾ menus, every effect
knob automatable with a grouped knob picker, a full Keys strip, copying effects, eight new
effects, Auto at beat speeds; and **bends, the synth on the timeline** (§0.6r, D220–D240,
`PLAN-bend-and-lanes.md`): a Bend card (seven shapes per note, recorded with the notes, schema
12), every knob and switch of a synth automatable through a new worklet path, stepped lanes for
every discrete setting, folding lanes, a rectangle and group drags across lanes, the demo song
Sweeps and Bends; and **wavetables and physical models** (§0.6s, D241–D261,
`PLAN-wavetable-physical.md`): each oscillator Analog or Wavetable (tables band-limited per octave,
scrubbed in a picture, 8 slots a lane switches between, your own from samples), the synth's Source
a physical model (an exciter into a string, a tube or a bank of partials, and a body), patch
version 3 and schema 13, 27 new factory synths, the demo song Wood, Wire and Glass; and a
**cleanup batch** (§0.6t, `PLAN-cleanup.md`): a raft of correctness, performance and tooling
improvements across 11 phases — errors and tests, perf, React, DSP, imports, schema, duplication,
big-file splits, bundle, robustness, and ESLint; and **the tracker** (§0.6u, D265–D277,
`PLAN-tracker.md`, on the `tracker` branch): a Tracker panel, the pattern as rows of text in the
look of Fast Tracker 2 (in the theme's colors), fully keyboard driven, schema 14. Left: tests with real hardware (mic, MIDI,
Launchpad/Push), signing the desktop release, the license (D6), and the "later" items in
PLAN.md §0.7. The repository is public and `main` deploys to GitHub Pages.

---

## 1. What Rebeat is

A browser music app (and an Electron desktop build) built around a **drum machine / step
sequencer**, with:

- **Step tracks** that play a sound (a sample, a synth or a sampled instrument) as **Hits**, as
  **Notes** (chords, piano roll, arpeggiator) or as a **Clip** (a loop station with overdubs,
  time-stretching, scratching).
- **A library** of samples, synths and sampled instruments: import, kits, online kits, analysis,
  favorites, tags, Your sounds.
- **A non-destructive sample editor.**
- **A full subtractive/FM synth with an editor**, with wavetable oscillators and physical models
  (an exciter and a resonator) as a second source.
- **A mixer** with insert effects (Pump among them: a beat-synced duck), send buses and a master
  chain.
- **Performance tools**: DJ filter, tape stop, beat repeat, crossfader, mute groups, section queueing.
- **MIDI**: learn, note input, pitch bend and mod wheel, Launchpad/Push as grid controllers.
- **Export**: WAV/MP3/OGG, stems, MIDI files, `.rebeat` project files.
- **Beatbox**: record or add beatboxing, label its hits, let a small model (trained in `ml/`,
  run in the browser with ONNX Runtime Web) calibrate to your voice, and convert takes into step
  tracks.
- **A built-in user guide**, plus an "explain mode" that shows a hover card on every control.

It should feel like a professional desktop DAW: dockable panels (Dockview), 20 themes,
keyboard-driven, autosaving projects in IndexedDB.

Vocabulary (PLAN.md §2):

- **Project**: everything that is saved.
- **Step track** (in code: `Track`): a row in the drum machine; tracks exist in every pattern. It has
  a **sound** and a **mode**: `hits`, `notes` or `clip` (D93).
- **Sound**: what makes a track's sound, in three families: a **sample**, a **synth**, or a
  **sampled instrument** (streamed, SoundFont, multi-sample) (D94).
- **Your sounds**: sounds saved to the library (synth copies, saved track sounds, SoundFonts…).
- **Pattern**: the step data for every track (called "page" before D180).
- **Section** (in code: a slot, `Section` in `Project.slots`): an entry in the song; it plays a
  pattern ×repeats, with its own settings. The song strip and the timeline show sections.
  - A **clone** is a section that shares its pattern with another (linked).
  - A **copy** is a section with its own copy of the pattern.
- **Sample**: immutable audio, identified by its SHA-256.
- **Sample settings**: non-destructive edits to a sample.

## 2. Getting started

Environment:

- macOS, Node 25, **pnpm** 12, **just**.
- Never use `pip`; Python tooling (rarely needed) goes through `uv`.

| Command                       | What it does                                                         |
| ----------------------------- | -------------------------------------------------------------------- |
| `just dev`                    | Vite dev server on http://localhost:5173                             |
| `just check`                  | `tsc` (app + Electron), `eslint`, `vitest run`                       |
| `just e2e [args]`             | Playwright (Chromium); starts its own Vite on **port 5391**          |
| `just build` / `just preview` | production build into `dist/` / serve it                             |
| `just desktop`                | Electron against the dev server                                      |
| `just desktop-build`          | package the desktop app into `release/` (unsigned)                   |
| `just e2e-desktop`            | desktop smoke tests (`playwright.desktop.config.ts`, `e2e-desktop/`) |
| `just fmt`                    | Prettier (print width 100)                                           |
| `just ml-fetch` / `ml-synth`  | beatbox model: download the datasets / make the synthetic takes      |
| `just ml-train <name>`        | train and evaluate a run into `ml/runs/<name>` (uv, PyTorch)         |
| `just ml-export <run> <ver>`  | ship a run as `public/models/beatbox/<ver>` (+ the parity fixtures)  |
| `just ml-test`                | the Python tests in `ml/`                                            |
| `ANALYZE=1 just build`        | production build + open `stats.html` (bundle treemap; P11.6)         |

**Verify every change** with the full sequence. Use `--workers=4`: more parallel browsers make
audio-timing tests flaky on a laptop.

```sh
pnpm prettier --write src e2e && pnpm tsc --noEmit && pnpm eslint . && pnpm vitest run \
  && pnpm playwright test --workers=4
```

Expect about 725 unit tests and about 300 e2e tests (around 7 minutes, most of it the golden
levels renders). Visual changes are
also checked in a real browser: a throwaway Playwright spec that takes a screenshot works well
(delete it afterwards).

CI: `.github/workflows/ci.yml` runs check, build and e2e on every push. `pages.yml` publishes
every push to main to GitHub Pages, https://jeroenjanssens.github.io/rebeat/ (built with
`BASE=/rebeat/`; use `import.meta.env.BASE_URL` for any path to a public file). `desktop.yml`
builds macOS, Windows and Linux on `v*` tags; signing secrets aren't set up yet.

**Commits and GitHub actions are authored by Jeroen Janssens only.** Never add a Claude/AI
author or `Co-Authored-By` line, even if a tool or template suggests one. Ask before anything
outward-facing (creating repos, releases, publishing).

## 3. Repository map

```
src/
  main.tsx, App.tsx    startup (audio context, library, projects, service worker) and the shell;
                       main.tsx also exposes window.__rebeat (see §8)
  app/                 shell UI and glue:
                       - Dock (Dockview), panels.tsx (the panel registry, lazy), layouts (presets)
                       - TransportBar (Play, Rec ▾, BPM ▾, the metronome ▾: D214, D215), commands
                         (registry, shortcuts), defaultCommands, CommandPalette
                       - dialogs: Settings (+ MidiSettings, Calibration), ProjectBrowser, Export,
                         SampleExport, Welcome, WavetableDialog (Make a wavetable)
                       - openers.ts: open a sample/synth editor tab, the guide, focus a panel
                       - ScopeStrip.tsx (D263: the top bar's scopes, inline or on a folding row)
                       - trackerCommands.ts (D274, D275: the tracker's keys as scoped commands)
                       - shell.ts (dock API handle), hintLayer.ts (explain mode)
  platform/            the Platform interface; web.ts and electron.ts (files, storage, full screen);
                       nothing else touches those browser APIs directly
  model/               pure data and operations (no React, no audio):
                       - types.ts (Track, Lane, Step, Note, Sound…), project.ts (setMode…)
                       - tracks.ts (modes and sounds: player, sampleOf, hitNoteOf, canClip…)
                       - schema.ts (versions + migrations, now v13), params.ts (knob definitions, toUnit)
                       - arrangement.ts (D181: sections laid out in quarter notes, bars, anchors,
                         curve values, keeping anchors on delete/copy/unroll), tempoMap.ts (D192:
                         jumps and ramps, exact seconds), automation.ts (D189: what can be
                         automated, knob values, thinning), ease.ts (D196: eases in and out, composed
                         `in(out(t))`)
                       - fixtures/v6/ (every example and template as schema 6 saved it, gzipped)
                       - tracker.ts (D268–D272: the row grid, a track's rows, note columns, the
                         effect commands), trackerEdit.ts (its edits as recipes, blocks, the
                         clipboard), trackerText.ts (each field's place and text)
                       - synth.ts (patch v3: wavetable oscillators, the physical model; macros,
                         refreshMacros), synthV1.ts (old patches, read only)
                       - wavetables.ts (D242–D246: the 16 factory tables, mip levels, cutting a
                         sample into frames, table names)
                       - patchParams.ts (the synth editor's knob table, the matrix's amounts),
                         patchSwitches.ts (D231: every switch and menu of a patch, as stepped
                         knobs), synthAutomation.ts (D228: a lane's target → patch path and value),
                         randomize.ts
                       - bend.ts (D220–D223: a note's bend over time, pure; the worklet, the
                         piano roll), steppedLanes.ts (D230: a sloped lane as a stepped one)
                       - notes, chords (names of held notes), padChords (the chord pads, D137), keyMode
                         (Key mode's chords, D138), perform (play styles: strum, slop, balance,
                         the arp's order, chord patterns, smooth voicing, D149–D154), suggest
                         (the next chord: roman numerals, moves, progressions, D158), patterns
                         (the 53 patterns in a lane notation, which notes a hit plays, D174),
                         takePlan
                         (room for an Auto take, D163), synthWizard (the wizard's questions and
                         patch, D169), noteOps
                         (piano roll), timing (polyrhythms), tempo, midiFile, effects
  state/               zustand stores:
                       - store.ts: project + undo + UI state
                       - settings.ts: persisted user settings
                       - actions (steps, function buttons), input (pads, step entry, recording:
                         recordNoteOn/Off, Overdub/Replace, Snap)
                       - keys.ts (D126): what every keyboard plays (a track or a library sound),
                         noteOn → release, sustain, bend/mod; live voices and the Keys channel;
                         the chord pads (D137), Key mode, transpose and the Key dial (D138), and
                         what each key down plays (`sounding`)
                       - perform.ts (D149): the play styles' scheduler (timed notes on the audio
                         clock) and rhythm engine (arp, patterns); keys.ts plays through it
                       - trackActions, effectActions, clipActions
                       - tracker.ts (D265–D277): the tracker's cursor, edit mode, selection,
                         clipboard and actions (`takeNote`: MIDI and the note keys in edit mode)
                       - timelineActions (sections, tempo changes, automation, regions: one commit
                         each; folding lanes; moving a selection across lanes), pointSelection
                         (D235: the points selected in every lane, the rectangle), bendControls
                         (the Bend card's values and MIDI-learn targets), automationOverride
                         (Ableton-style overrides, the typed tempo, D191, D193), recordAutomation,
                         automationKnob (Automate in knob menus, controlItems for switches)
  engine/              audio (no React):
                       - context.ts (native AudioContext + Tone)
                       - engine.ts (scoped graph: channels, voices, clips, metering, scratch)
                       - channel.ts (track/bus strips), effects.ts, tone.ts (replacements for two
                         Tone nodes)
                       - transport.ts (lookahead scheduler: sections, settings, the tempo map,
                         play from the start marker), ticker.ts (timing worker)
                       - automation.ts (D186, D188: curve events per step, regions in song time)
                       - instruments.ts (voices: synth, sample/multi-sample, smplr, sf2), synth/ (the
                         AudioWorklet synth: core.ts DSP, worklet.ts, node.ts; wavetable.ts (reading
                         tables, warps, the per-context table registry), tables.ts (main thread:
                         building and loading tables), physical.ts + modal.ts (exciters,
                         waveguides, partials, bodies))
                       - kits.ts (808/909 kits synthesized offline), samples.ts (buffers, peaks)
                       - looper, recorder, liveInput, metronome, stretch (Signalsmith), perf
                       - render.ts + offline.ts (offline export)
                       - load.ts (the CPU meter: audio render capacity, main thread, scheduler)
  audio-io/            mic.ts (one shared stream), midi.ts (Web MIDI: learn, notes, bend/mod,
                       sustain), controllers/ (Launchpad/Push grid model, profiles, runtime;
                       minilab3.ts: the MiniLab 3's display over SysEx)
  midi/                mapping.ts (pure: relative encoders, roles such as "selected:sound:3",
                       which mapping wins, pads by channel, pickup), controllers.ts (controller maps:
                       MiniLab 3, MPK Mini MK3, Launchkey Mini MK3/MK4; slot kinds),
                       keysKnobs.ts (pure static metadata for the 8 stepped knobs in Chord/Key mode:
                       slot, name, target, values count; used by audio-io/midi.ts and its unit test),
                       controllerEvents.ts (what each control did, for the Keys panel),
                       display.ts (a device's screen text, mirrored), displayFeed.ts (names to show),
                       padColors.ts (what the pads light in, D144)
  library/             samples and instruments:
                       - beatbox/ (D105–D118): classes, onsets (+ resample to 16 kHz), model.ts +
                         model.worker.ts (ONNX Runtime Web, loaded on first use), calibrate,
                         store (voices, recordings, hits in IndexedDB; predictions), record,
                         convert (grid, timing, velocity, folding), preview, transfer (dataset zips);
                         resample.worker.ts (windowed-sinc resampler off the main thread, P9.8)
                       - library.ts (import, dedupe, decode, versions), analysis (BPM/onsets/key/LUFS)
                       - processing (sample settings), editorOps, renderFx, encode, wav, fft
                       - audition.ts (previews), online kits (onlineKits, onlineImport, sources)
                       - synths.ts (91 factory synths), instruments.ts (catalog), userInstruments.ts
                         (Your sounds, SoundFonts, multi-samples, preset copies)
                       - xm/ (D279–D283: Fast Tracker 2 modules: parse.ts, convert.ts (a track per
                         instrument, samples rendered and tuned), write.ts (for tests), importXm.ts)
                       - synthTrack.ts (a track's synth: patch, macros, editPatch, soundDefs), libraryEdit.ts
                         (editing a library synth without a track), synthFile.ts + rbsynth.ts
                         (.rbsynth files), downloads, drop, sort
                       - wavetables.ts (Your tables: IndexedDB, the synth's loader, files)
                       - soundTrack.ts (a library sound as a track outside the project),
                         playable.ts (the Playable list and browsing it), pitch.ts (a sample's
                         base key: YIN)
  storage/             db.ts (Dexie: projects, samples, blobs, meta, instruments), projects.ts
                       (autosave, crash recovery, example forking), rebeatFile.ts (.rebeat zip)
  panels/              one folder per Dockview panel: drum-machine, library, inspector, mixer,
                       master-scope, piano-roll, sample-editor, performance, synth-editor, guide,
                       beatbox (recordings list, HitWaveform, RecordDialog, ConvertView, ModelView),
                       controller (the Keys panel, D264: the MiniLab 3 drawn live, other maps as lists; the settings as
                       Cards: Chords, Bass, Suggest, Play, D213; Bend, D222),
                       synth-editor (SynthEditorPanel.tsx: the shell and EditorView; basic.tsx:
                       the Basic view macros/voice/scope; matrix.tsx: macroDef, Macros, Matrix;
                       switches.tsx: Group, Box, and switch atoms Choice/Toggle/SwitchSelect/BoxToggle),
                       timeline (D184: ruler, Tempo lane, sections, track rows, curve lanes, regions;
                       canvases cover only the visible part, ViewCanvas; dragListeners.ts: pointer
                       event helpers shared across timeline drag gestures); tracker (D265:
                       TrackerPanel.tsx, palette.ts, lockPicker.ts); inspector/automation/
                       (D199–D204: the point table, its sources, ScrubField, parsing)
  components/          Encoder (knob), Fader, MiniFader, DragValue, Keyboard (piano), Scope,
                       PeaksCanvas, Playhead, Menu (contextMenu/dropdown, headings), Dialog, Toast,
                       EffectEditor, fxMenus (Add effect by group, copy/paste, Copy to…), EqCurve,
                       KnobPicker (D208), glide (smooth resets), soundIcons…
  render/              raf.ts (one shared animation loop), useCanvas, useElementSize (a hook that
                       tracks an element's ResizeObserver dimensions), theme (tokens, mixColor),
                       thumbnail, pixelFont.ts (D266: the tracker's bitmap font)
  help/                chapters/*.md (the user guide, one file per topic), guide.ts (renderer),
                       hints/ (explain-mode texts keyed by data-hint ids)
  templates/           builder.ts (song-writing helpers), example-id.ts (lightweight example
                       metadata, no heavy imports; used at startup), examples.ts (full example
                       songs, loaded lazily), showcase.ts,
                       synthSongs.ts, nightDrive.ts, index.ts (new-project templates)
public/worklets/       recorder.js, scratch.js, utility.js (plain JS AudioWorklets)
public/models/beatbox/ the beatbox model per version (model.onnx, model.json, report.md)
ml/                    training the beatbox model (uv): data, onsets (port of onsets.ts), synth,
                       windows, model, train, evaluate, tune, export; README.md, DATA.md
electron/              main.cts, preload.cts (compiled to electron/dist)
e2e/                   Playwright specs, helpers.ts (openApp, midiKeyboard), fixtures.ts (generated
                       WAVs and SoundFonts)
```

About 38k lines of TypeScript, with 31 unit test files next to the code (`*.test.ts`, Node) and
28 e2e specs.

## 4. Architecture in one page

1. **One source of truth.** `state/store.ts` holds the `Project` as plain, serializable data, plus
   the UI state.
   - Every project edit goes through `commit(recipe, key?)`, an immer recipe. It records an undo
     step (200 deep).
   - Commits with the same `key` within 600 ms merge into one step. Knob drags pass a key such as
     `` `enc-${trackId}-${param}` ``.
   - `withUndoKey(key, fn)` groups key-less edits, such as the frames of a glide.
   - `loadProject` replaces the project and resets the history.
   - `setPlayMode` saves without an undo step.
2. **The engine reconciles.** `engine.ts` subscribes to the store and builds or updates the audio
   graph to match (`reconcile`), much like React does for the DOM.
   - Immer's structural sharing lets it skip unchanged tracks and effects.
   - Runtime-only things live in an `EngineScope`: nodes, buffers, voices. `newScope()` plus
     `withScope(scope, fn)` runs the same engine code against an offline context for exports.
3. **Audio never waits for React.** `transport.ts` is a lookahead scheduler (120 ms) on the audio
   clock, driven by a worker ticker. `playStep` decides what each track plays on each step:
   probability, conditions, ratchets, nudge, swing, per-track step size and length, arpeggiator,
   parameter locks.
4. **Visuals bypass React.**
   - `onStep` events fire through `Tone.Draw` at the moment a step is heard and toggle CSS classes.
   - Canvases (scopes, meters, waveforms) draw from one shared `onFrame` loop (`render/raf.ts`)
     and skip work when nothing changes.
5. **Native AudioContext.** Tone.js runs on a native context; its default wrapper ran cycle
   detection on every `connect`, which cost about 90% of the main thread.
6. **Channel strip** (`channel.ts`): filter → drive → inserts → EQ → pan → width → fader →
   analyser.
   - Pan comes before width, so mono sounds get an equal-power pan law.
   - `engine/tone.ts` replaces Tone's `EQ3` and `Distortion`, which colored the sound when flat.
   - Built-in kits are normalized to −6 dBFS.
   - The master chain is EQ3 → compressor → limiter → master fader. Send buses: A = reverb,
     B = delay.
7. **Effects are data**: `{ id, name, params, bypass }`, built by a factory in `effects.ts`.
   `model/params.ts` defines their knobs (`EFFECT_PARAMS`, `EFFECT_GROUPS`). Each built effect
   has a `knobs` table (knob → AudioParams with units), used to set the knobs and to automate them
   (D206); what isn't an AudioParam is in its `set`.
8. **Platform layer.** File dialogs, storage persistence and full screen go through
   `platform/` (web or Electron). Load it lazily from modules that unit tests import, because
   it touches `window`.

## 5. Data model essentials (`model/types.ts`, `model/project.ts`)

- `Project`:
  - basics: `{ name, bpm, timeSignature, swing, metronome, countIn, key, playMode: "loop" | "song" }`
  - content: `tracks: Track[]`, `patterns: Record<id, Pattern>`, `slots: Section[]` (the song
    order: `{ id, patternId, repeats }`)
  - mixing and control: `buses`, `master`, `midiMappings`, `perf` (mute groups, crossfader sides)
- `Track` (a step track, D93):
  - identity: `{ id, name, mode: "hits" | "notes" | "clip", category, color, source (display name) }`
  - sound: `sound?: Sound` (none = silent, e.g. an empty Clip track), `hitNote?` (a voice playing
    hits), `layers?` (Clip overdubs)
  - mix: `mute`, `solo`, `arm`, `volume` (fader position: 0.8 = 0 dB, gain = (pos/0.8)²)
  - `params: Record<string, number>`: every knob value, 0..1, keyed `"sound.<id>"` or
    `"mix.<id>"`
  - `effects: Effect[]`, plus `transpose?` and `arp?`
- `Pattern`:
  - `{ id, name, stepCount, stepSize, swing?, keyOverride?, transpose?, linkColor }`
  - `lanes: Record<trackId, Lane>`: `Lane { steps: Step[128], stepCountOverride?,
stepSizeOverride?, swingOverride?, clip?: { active, launchMode } }`. Every lane has steps;
    Clip mode reads `clip` (`clipOf(lane)` gives the default), so switching modes keeps both.
- `Step`:
  - `{ on, velocity, probability, nudge, ratchet, pitch, gate, accent, condition? }`
  - `locks?`: parameter locks, `{ "sound.tune": 0.7, "sound.macro2": 0.9 }`
  - Hits read `on`, `pitch`, `gate`; Notes read `notes?: Note[]` (`{ pitch (MIDI, C4 = 60),
length (steps), velocity, slide? }`). A step keeps both.
- `Sound` (D94): `{ source: "sample" | "synth" | "smplr" | "sf2" | "multi", preset?, patch?, name?,
from?, sampleId?, rootNote?, zones? }`; `soundFamily(s)` → `sample | synth | instrument`.
  - `patch?`: a synth's own patch; without one, the factory synth `preset` plays
  - `from?` (`"user:<id>"`): the Your sounds entry it belongs to
- **Which part of the engine plays a track**: `player(track)` (`model/tracks.ts`) → `drum`
  (hits of a sample), `voice` (notes, and hits of a synth or sampled instrument) or `clip`.
- **SOUND knobs** follow the player (`SOUND_PARAMS[player]`): drum, voice, clip. **When a track
  plays a synth, the SOUND knobs are its 8 macros** (`sound.macro1..8`, see §6.2).
  `library/synthTrack.ts: soundDefs(track)` returns the right set, and every SOUND UI (encoder
  strip, Inspector, controllers) uses it. Every SOUND id means one thing in every mode (the
  voices' ADSR decay is `sound.envDecay`), so a track keeps every mode's knobs.
- `Section` (a slot, saved in `Project.slots`): `{ id, patternId, repeats, mutes?, transpose?,
fill?: "last" | "all", steps? }`. The settings are the section's own (D183): its clones keep the
  link.
- Song time (D181, D187): `SongAnchor { slotId, at }` (quarter notes into the section's span).
  `Project.tempo?: TempoChange[]` (`{ …anchor, bpm, ramp? }`, after the start tempo `bpm`),
  `Project.automation?: AutomationLane[]` (`{ id, target (a MIDI-learn target), on, points }`),
  `Project.regions?: AudioRegion[]` (`{ id, trackId, sampleId, start, length (quarters), offset
(seconds), gain?, fadeIn?, fadeOut? }`). Ask `model/arrangement.ts` where anything is.
  Points and tempo changes have `on?` (false: skipped) and `in?`/`out?` eases (`model/ease.ts`;
  none saved = Linear; an ease out of None holds until the next point). A lane on a knob with
  `steps` is stepped (D229): it holds each point, no eases; ask `lanePointsOf(project, lane)`,
  not `lanePoints(project, lane.points)`, for a lane's curve. `AutomationLane.folded?` and
  `Project.timelineFolded?` are the timeline's folds (D233).
- `Note.bend?` (D220, schema 12): a note's own bend (`NoteBend`: shape, amount, time, delay, unit
  "s" | "q", ease, rate); `model/bend.ts` says where it is at a moment.
- **Schema**: `model/schema.ts`, currently `SCHEMA_VERSION = 14` (8: MIDI mappings' `mode`; 9: `Note.offset`, a
  note's own start within its step, −0.5..0.5; 10: sections' settings, tempo changes, automation,
  regions, all optional; 11: eases per point, `hold` became an ease out of None; 12: `Note.bend`,
  folded lanes, and lanes on stepped effect knobs turned into points on their bands; 13: synth
  patches version 3, upgraded when read; 14: the tracker's `Note.col` and `Project.tracker`).
  - Every change to the saved shape bumps the version and adds a migration plus a test.
  - `migrate` + `normalizeProject` run on every load.
  - Migration 5 → 6 converted the old SOUND knobs on synth tracks into patch edits (it changes
    those tracks to the version 7 shape early, because `convertSynthKnobs` works on step tracks).
  - Migration 6 → 7 made step tracks (kinds → modes, sources → sounds, `sound.decay` of voices →
    `sound.envDecay` in params, locks and MIDI mappings). Saved sounds convert when they're read
    (`userInstruments.ts: upgradeRecord`).
- **Example songs** (`templates/examples.ts`) are generated in code, never stored, and open
  read-only (`"example:<id>"`). The first edit forks one into "<name> (copy)"
  (`storage/projects.ts`).
- **Templates** are written with `templates/builder.ts`:
  - tracks and pages: `hitsTrack`, `notesTrack` (with `synth(preset)` or `sampled(preset)`),
    `clipTrack`, `page`
  - content: `drum` (step strings `x X o p r < > c l .`), `notes`, `chord`, `note`
  - `splitLongPages`: pages of at most 32 steps.

## 6. Subsystems

### 6.1 Transport and triggering

- Entry points:
  - `transport.play/stop/toggle`
  - `engine.trigger(track, velocity, options)` by `player(track)`: hits of a sample via
    `playDrum` (one AudioBufferSourceNode per hit, choke groups); notes via `playNotes` →
    `InstrumentVoice.play`; hits of a voice play one note (`hitNotes`: the hit note plus the
    step's pitch, for its gate; transposes don't move hits)
  - `engine.holdNote(track, pitch, vel)`: held notes from on-screen keys and MIDI; returns
    `release()`
  - `engine.playOnce(track)`: click a waveform to hear it
- Page changes:
  - Song mode follows `slots` (with repeats); loop mode repeats the page being edited.
  - A clicked page is queued and starts when the current one ends.
  - The fill button, conditions (`1:2`, `FILL`…), beat repeat and count-in are handled here too.
- Parameter locks:
  - On hits of a sample they are applied per hit.
  - On tracks that play a synth, macro locks are sent to the worklet (`WorkletSynth.lockMacros(values, time,
end)`) and released at the note's end, unless a newer lock started.

### 6.2 The synth (D79–D92; the biggest recent area)

**Patch v3** (`model/synth.ts`; version 2 patches read as analog oscillators and the
Oscillators source):

- Three oscillators, each with:
  - shape morph 0..3 (sine → triangle → saw → pulse), pulse width
  - unison (up to 8, with detune and stereo width), drift
  - hard sync to oscillator 1, retrigger and start phase
- Sources and modulation between oscillators: sub (sine or square, −1 or −2 octaves), noise
  (white or pink), ring modulation, FM (routes 2>1, 3>1, 3>2, 1>1).
- Two filters, serial or parallel:
  - ZDF ladder: 24 dB low-pass that self-oscillates.
  - SVF: LP/HP/BP/notch.
- Three AHDSR envelopes (amp, filter, mod) with curves, velocity and loop.
- Three LFOs: seven shapes including S&H and smooth random; free or tempo-synced; delay;
  per voice or global; unipolar.
- An 8-slot mod matrix: source → destination × amount, with an optional "via" source that scales
  it.
- **Wavetables** (D241–D248): an oscillator's `type: "wavetable"` reads `table` (or one of its 8
  slots, `slot`/`tables`) at `position`, with a `warp` and `warpAmount` and `smooth`. Tables are
  built on the main thread (`engine/synth/tables.ts`: factory tables from `model/wavetables.ts`,
  yours through `library/wavetables.ts`), band-limited per octave, and sent once per context in a
  `table` message (offline: in `processorOptions`); the worklet's `TABLES` (wavetable.ts) holds them
  for every synth of the context. A table that hasn't arrived plays the analog morph.
- **Physical models** (D249–D255): `source: "physical"` replaces the oscillator section with
  `physical` (exciter → resonator → body), `engine/synth/physical.ts` (a `PhysVoice` per voice)
  and `modal.ts` (partial ratios, bodies). The exciter `oscillators` feeds the oscillator section
  into it. A physical voice ends when it has been quiet for 50 ms.
- 8 macros.
- Voice: poly, mono or legato; glide; voice stealing; velocity curve; bend range; tune.
- Output: drive, volume, pan, spread.

Helpers:

- `makePatch(spec)` builds a patch from a deep partial. Without macros in the spec it adds
  `autoMacros`.
- `upgradePatch(any)` reads version 1 or version 2 data and sanitizes it.
- `sanitizePatch` clamps every value.

**Engine** (`engine/synth/`):

- `core.ts` is pure TypeScript DSP, unit-tested in Node:
  - polyBLEP oscillators, ZDF filters
  - control rate of 16 samples for the matrix, the mod and filter envelopes and the LFOs
  - stolen voices continue from their current level
  - a note stack for mono and legato, glide
  - 303 slides (`slideTo`: the previous note's note-off is dropped and the voice glides)
- `worklet.ts` wraps it as the AudioWorkletProcessor `"rebeat-synth"`, one per track that plays
  a synth. Offline processors get a seed and their own seeded Math.random (D98).
- `node.ts: workletSynth(dest)` is the main-thread side:
  - it queues messages until the node exists
  - methods: `play`, `hold`, `setPatch`, `control` (bend, mod wheel, aftertouch), `lockMacros`,
    `monitor`/`modulation` (live knob rings), `settled()`
- `renderPatch` renders a patch offline (used by tests).
- The worklet is loaded per context with `import url from "./worklet.ts?worker&url"`.

**Automation** (D226–D231): a lane on `track:<id>:synth:<path>` (any knob in `patchParams`,
any switch in `patchSwitches`, `osc.<n>.shape~steps`) or `sound.macroN` goes to the worklet as one
`automate` message per path and step (`engine.automateTarget` → `WorkletSynth.automate`, values in
the path's units, `synthValue`). `SynthCore.resolve` ramps between points on every control block
and writes into a working copy of the patch in place: macros first, then knobs and switches (a
lane wins over a macro, D227); `automateEnd` and `panic` hand back. A filter that switches model
starts from silence.

**Bends** (D220–D225): `on` messages carry a `NoteBend`; each `Voice` adds `bendAt(…)` to its
pitch; a Fall or Doit defers the release (`holdUntil`). `noteBend(id, value)` is the pitch strip
on one voice (`WorkletSynth.bendNewest`). Sampled instruments ignore bends.

**Macros** (D85):

- Each macro has up to 4 targets `{ path, min, max }`. They are absolute: frequencies and times
  interpolate geometrically, the rest linearly.
- `autoMacros(patch)` gives every patch 8 default macros (Brightness, Bite, Character,
  Thickness, Attack, Release, Movement, Drive). Their ranges are placed so that the patch at
  rest sounds unchanged; a unit test checks this for every factory synth.
- Movement is an LFO 2 matrix slot that uses the macro as "via". Some factory synths have their
  own macros using the same "via" pattern.
- A macro's value is a track param (`sound.macroN`), so p-locks, MIDI learn and saving work as
  for any knob. The patch's `macro.value` is only where it rests.
- Editing a knob that a macro moves goes through `setThroughMacros`, which shifts the target's
  range so the edit isn't overruled.

**Editing a synth**: `library/synthTrack.ts`:

- `editPatch(track, fn, fork = true)` and `setSynthParam(track, path, value)` work inside a
  store recipe.
- Factory synths never change (D90). The first patch edit forks the track's sound into
  "<preset> copy" (then "copy 2"…) and links it to a new Your sounds entry with
  `copyOf: <presetId>`. Later edits keep that entry up to date (`userInstruments.ts:
onPatchEdit` hook, debounced `saveSoundSoon`).
- The conversion of old projects passes `fork = false`.

**Synth editor** (`panels/synth-editor/`):

- One tab per track: `synth-editor:<trackId>` (`openSynthEditor`). The plain `synth-editor`
  panel follows the selected track.
- Library synths get `synth-editor:lib:<key>` (D91). These edit the library sound itself:
  - a track that isn't in the project (`libraryEdit.ts`, registered in `detachedTracks`)
  - plays through the preview output and has its own undo
  - a factory synth forks into a copy on the first change
- **Basic** view: macros, Poly/Mono + Glide, scope, keyboard.
- **Advanced** view: foldable sections in signal order, shape pictures, envelope pictures you can
  drag (`pictures.tsx`, sharing `envCurve` with the DSP), LFO pictures, the matrix and the macro
  editor.
- Workflow: A/B (per session), randomize (`model/randomize.ts`), init patch, copy/paste of
  blocks, `.rbsynth` export/import.
- Wheels, on-screen keyboard, modulation rings with a live dot, MIDI learn on every knob
  (target `track:<id>:synth:<path>`).
- The knob table (paths, ranges, curves, help text) is `model/patchParams.ts`. It also generates
  the explain-mode hints.

**Factory synths** (`library/synths.ts`):

- 91 synths written as specs through `voiced()`, with a house style: global LFOs (a few override it with drift), glide
  always, no note spread. The wavetable ones are "Wavetable · …", the physical ones "Physical · …"
  (written with `phys()`), five of them drums in the Percussion group.
- Ids are stable because projects store them.
- Loudness is balanced to about −21 dB RMS (`synthLevels.test.ts`, seeded random;
  `SYNTH_LEVELS=1` prints the levels).

### 6.3 Instruments, library and storage

- **Instrument voices** (`engine/instruments.ts`): what plays notes, and hits of a synth or
  sampled instrument. Synth (worklet), a sample or multi-sample across the keyboard (Tone
  Sampler), smplr (streamed sampled instruments, cached by the service worker), sf2 (SoundFonts
  via smplr). `createInstrument(track, dest)` builds one from `voiceSound(track)`.
- **Catalog** (`library/instruments.ts`): built-in synths, about 300 sampled instruments in
  families, and Your sounds (`userInstruments.ts`: synth copies, saved track sounds (samples
  too), SoundFont imports, multi-samples from folders). Dropping a sound on a track applies it,
  its SOUND knobs and effects, keeping the track's mode where the sound can play it
  (`trackActions.applyEntry` / `putSound`).
- **Library panel** locations (D95): All, Favorites, Used in project, Your sounds, Recordings;
  Instruments (by family); Samples; Kits. Mixed lists get Samples / Synths / Sampled instruments
  headings (`items.ts: bySection`).
- **Samples** (`library/library.ts`):
  - content-addressed (SHA-256), deduplicated on import; built-ins have ids `kit:*` and `demo:*`
  - edits are non-destructive settings on the sample, or new versions (`saveVersion`)
  - the sample editor edits library samples; built-ins are copied into the library first
  - the online kits (tidal-drum-machines) preview from memory and import only on an explicit
    action
- **Library panel**:
  - a click previews after 250 ms, so a double-click (open in its editor) stays silent
  - Z and X change the preview octave; it resets when you select another sound
  - previews go to their own output, not the master
- **IndexedDB** (Dexie, `storage/db.ts`, DB version 4; v4 adds `beatboxVoices`,
  `beatboxRecordings`, `beatboxHits`): `projects`, `samples`, `blobs` (audio
  files, `.sf2` files), `meta`, `instruments`. Projects autosave (debounced) and the last one
  reopens after a crash. `.rebeat` files are zips (fflate) with the project, its samples and its
  SoundFonts.

### 6.4 UI shell, commands, help

- Panels are registered in `app/panels.tsx` (lazy). Layouts are Dockview JSON with presets.
  Panels support full screen, pop-out and floating.
- **Commands** (`app/commands.ts`, `defaultCommands.ts`): every shortcut and palette entry is a
  command `{ id, title, category, keys, run }`. Shortcuts can be rebound in Settings. Panels get
  `panel.<id>` commands.
- **Settings** (`state/settings.ts`): persisted under `localStorage["rebeat.settings"]`; theme,
  scale, audio devices, MIDI, synth editor view, folds and randomize amount…
- **Explain mode** (D71): any element with `data-hint="<id>"` shows a hover card from
  `help/hints/*`. `Encoder` takes a `hint` prop.
  - `hints.test.ts` fails if a literal `data-hint`/`hint` id has no entry, if a knob parameter
    has none, or if a hint's `guide` anchor doesn't exist.
  - The e2e `explain.spec.ts` checks every hint rendered on screen (also in the synth editor's
    Basic and Advanced views).
- **User guide** (`help/chapters/*.md`): Markdown with extensions:
  - `{#id}` sets a heading's anchor (default anchor: `<chapter>-<slug of heading>`, e.g.
    `instruments-macros`)
  - `{{key:command.id}}` shows a command's current shortcut
  - links can be `panel:<id>` or `command:<id>`
- **Every user-facing change comes with**: explain-mode hints for new controls, updated guide
  chapters, and a decision in PLAN.md §6 when it settles a design question.

### 6.5 MIDI, controllers, performance, export

- `audio-io/midi.ts` (logic without the browser in `midi/mapping.ts`, D119–D125):
  - notes on the pads channel (10 by default) play tracks by position from note 36 (recorded
    as pad hits; in the pads' Chord and Key modes, pads 1–8 are the chord pads instead, D137,
    and in Key mode the MiniLab's encoder and its click are the Key dial, D138); other channels play the keys (`state/keys.ts`, D126: the selected or locked
    Notes track, or a library sound), or tracks by position when the keys have no Notes track
  - mappings: this project's first (`project.midiMappings`, track ids), then global ones
    (`settings.midiMappings`, roles: `selected:sound:<n>`, `selected:volume`, `track#<n>:…`),
    resolved by `resolveTarget`; each has a `mode` (absolute or relative, schema 8)
  - Mackie Control inputs run the transport; MIDI Start/Stop play and stop
  - controller maps (`midi/controllers.ts`) write global mappings with a `slot`; the Monitor
    (`useMidi.monitor`) says what each message did
  - CC1 = mod wheel, CC64 = sustain, pitch bend and aftertouch go to the keys' voice
  - every message also becomes a controller event (`midi/controllerEvents.ts`: which control,
    its value, the target and its new value), which the Keys panel and the display feed
    use; `browse:sound`/`browse:section` targets step through the Playable list
  - MIDI learn maps CCs and notes to targets: `track:<id>:sound.x`, `track:<id>:volume`,
    `track:<id>:fx:<fxId>:<param>`, `track:<id>:synth:<path>`, `bus:<id>`, `master:volume`,
    `perf:<control>`, `command:<id>`
  - `applyTarget` sets them
- `audio-io/controllers/`: Launchpad (Mini MK3, X, Pro MK3) and Push 2/3 as step sequencers
  (sysex for the pad colors).
- **Device displays** (`midi/display.ts`): `showOnDisplay` keeps the text (the Keys panel
  mirrors it) and hands it to drivers; `audio-io/controllers/minilab3.ts` writes the MiniLab 3's
  screen over SysEx (format from community research, unconfirmed on the device; Arturia's DAW
  handshake only when ticked in Settings → MIDI). `midi/displayFeed.ts` decides what to show.
- `engine/perf.ts`: DJ filter, tape stop, beat repeat, throws, crossfader, mute groups (the
  Performance panel).
- Export (`engine/render.ts`): `renderProject` → `renderOffline` (a native
  OfflineAudioContext), then `library/encode.ts`. Offline synth nodes are created when the
  render starts, with all their messages in `processorOptions` (D92). Stems, MIDI file export
  (`model/midiFile.ts`) and `.rebeat` files are also available.

### 6.6 Beatbox (D105–D118)

- **The pipeline**: audio → 16 kHz mono (`resample.ts`) → hits (`onsets.ts: detectOnsets`, D117;
  a short file is one hit, `firstOnset`) → a 200 ms window per hit, gated at the next hit
  (`hitWindow`) → the model (`model.ts`, in a worker) → class scores and a 64-d embedding →
  calibration per voice (`calibrate.ts`, prototypes, D112) → a guess per hit.
- **The model** is trained in `ml/` (see `ml/README.md`): AVP, Jeroen's one-shots and synthetic
  takes made from them (D118); beatboxset1 is test-only (ShareAlike). Its front end (log-mel) is
  inside the ONNX graph. `MODEL_VERSION` (`modelInfo.ts`) picks `public/models/beatbox/<v>/`.
- **Data** (`store.ts`): voices, recordings (audio in `blobs` as `bbx:<sha>`, or a library
  sample) and hits (`label`, `labeledBy: you | import | model`) in IndexedDB, not in projects.
  Only `you` and `import` labels are examples (`isExample`). Predictions live in memory.
- **Converting** (`convert.ts`, pure): hits on a grid (Snap or Keep feel as nudge), detected or
  constant velocity, repetitions folded by majority; `state/beatboxActions.ts: createTracks`
  makes Hits tracks in one commit (your hit cut into the library under `Beatbox/`, or a kit
  sound) and mutes the take's Clip track.
- **The panel** (`panels/beatbox/`) handles its own keys (1–8, Enter, Delete, Tab, arrows) and
  stops them from reaching the global shortcuts while it has focus.

### 6.7 The timeline (D180–D195)

- **Words** (D180): the interface says pattern and section; the code still says `slot` and
  `Pattern`, and saved fields didn't change. Old command ids (`page.next`) and guide anchors
  resolve through aliases (`commands.ts: commandId`, `guide.ts: guideAnchor`).
- **Where things are**: `model/arrangement.ts: layout(project)` gives every section as a block
  (start, length, span, steps) in quarter notes; `toSong`/`toAnchor`, `positionOf`, `bars`
  (every section starts a bar), `lanePoints`/`curveAt`. Its caches skip immer drafts.
- **The transport** plays a section's settings (`playStep(…, ctx)`: mutes, transpose, fill,
  covered tracks), each step's length through the tempo map (`stepSeconds`, identical to before
  without tempo changes), and every step calls `tempoStep`, `automationStep` and `regionStep`
  (`engine/automation.ts`); `render.ts` does the same offline. `play()` starts at
  `startPosition()` (the start marker `startAt`, in the edited section).
- **Tempo** (D192): the scheduled step has its `bpm`; `transport.tempoNow()` is the tempo now
  (read by the arp, the play styles, Auto, recording). `engine.tempoStep(bpm, time)` moves synced
  delays (`FxNode.tempo`), the synths' synced LFOs (a timed `tempo` message) and warped clips.
- **Automation** (D186, D189, D191): `engine.automateTarget(target, events)` schedules the curve on
  AudioParams (`effects.ts: schedule`), the synth's knobs, switches and macros (D228) or Pump's depth;
  `releaseAutomation()` at stop hands everything back to the knobs. Automation never writes to
  the project, so a change to an automated knob's value in the store is a hand on the knob:
  `state/automationOverride.ts: watchOverrides` overrides the lane (Back to automation).
- **Regions** (D188): `engine.startRegion` keeps them in `S.clips` under `rgn:<id>` (stop, panic
  and tempo changes reach them); one sound per track (the track's own clip stops, and
  `coveredTracks` keeps it from starting).
- **Eases** (D196–D198): `curveAt` and the tempo map ease between points; `curveEvents` samples
  an eased step (8 ramps, 4 for synth macros); eased tempo ramps integrate numerically.
- **The Inspector's table** (D199–D204): `ui.inspect` makes the Inspector show a lane or the
  tempo changes (`panels/inspector/automation/`); `ui.pointSelection` is shared with the lane's
  `CurveLane`. Every edit goes through `state/timelineActions.ts`, so both views follow.
- **The panel** (`panels/timeline/`): `SectionsRow` (blocks, drags), `TrackRows` (miniatures,
  mutes by cell, lanes, folds), `CurveLane` (automation and tempo; stepped lanes; group drags, the
  rectangle via `SelectionBox`), `RegionBox`, `ViewCanvas` (a canvas for the visible part only).
- **Selecting across lanes** (D235–D238): `ui.pointSelection = { lanes: { [laneId | "tempo"]:
indexes } }` (`state/pointSelection.ts`). Moves go through `timelineActions.movePoints(starts,
dq, dv, key)` from the positions at the start (`selectionStarts`, `clampGroupDq`), one commit.
  The rectangle finds points by their DOM handles (`data-point-key`), so folded lanes draw marks.
- **Folds** (D233) are a view: `store.editView(recipe)` saves them without an undo step, applying
  the same change to the history.

## 7. Testing

**Unit (Vitest, Node).** Tests live next to the code.

- Keep modules that tests import free of `window`. Import `platform/`, Dexie-heavy modules or
  the audio engine lazily, or split pure parts out (as `library/synthFile.ts` was split from
  `rbsynth.ts`).
- DSP is tested through `SynthCore` directly (`engine/synth/core.test.ts`).
- The beatbox model's parity tests (`library/beatbox/model.test.ts`, `onsets.test.ts`) run ONNX
  Runtime Web in Node against fixtures written by `ml/rebeat_ml/export.py`.
- `ml/` has its own tests (`just ml-test`); CI doesn't train or need Python.

**End-to-end (Playwright, Chromium, port 5391).**

- `e2e/helpers.ts: openApp(page)`:
  - fresh storage, onboarding skipped, synthetic microphone (`window.__REBEAT_TEST_MIC__`)
  - clicks the audio overlay and waits for the project
- `midiKeyboard(page)`: a fake Web MIDI input; send bytes with `window.__midi([0x90, 60, 100])`.
  `midiDevices(page, names)`: several named inputs ("MiniLab3 MCU"…), `__midiFrom(name, bytes)`.
- The synthetic mic is a tone whose polarity flips twice a second (no real onsets). Set
  `__REBEAT_TEST_MIC__ = "beats"` for decaying noise bursts instead (`beatbox.spec.ts`).
- `fixtures.ts` generates WAVs and SoundFonts (`fixtureFiles`).
- **`window.__rebeat`** (dev builds and tests only):
  - `engine` (`masterLevel()`, `trackSynth(t)`, `instrumentState`, `playOnce`, …), `transport`,
    `store` (zustand: `getState()`, `subscribe`)
  - `hints`, `commands()` (run any command: `commands().find(c => c.id === "panel.synth-editor").run()`)
  - `dock`, `perf`, `library`
  - `renderPatch`, `synths` (factory list), `previews()` (number of library previews started)
  - `renderProject`, `deserializeProject`, `examples`, `templates` (for the golden levels test)
- Conventions:
  - stable `data-testid`s (`synth-editor`, `keyboard`, `library-list`, `display-wave`…)
  - `data-hint` ids double as selectors
  - track rows are `[data-track-row]` with the name in caps (`hasText: "BASS"`)
  - library items are `[data-sample]` and `[data-instrument]`
  - Dockview tabs are `.dv-tab`
- **Golden levels** (`e2e/golden.spec.ts`): every example song and template renders offline (the
  mix and each track alone) and must match the levels in `e2e/golden/*.json` (RMS within
  0.25 dB, peaks within 1 dB). It's the safety net for changes that shouldn't change the sound.
  It runs on the saved v6 projects too (`src/model/fixtures/v6/`), so migrations are covered.
  Renders are nearly deterministic: seeded kits, probabilities (each render seeds Math.random)
  and offline synths (each worklet processor gets a seed, D98). On CI they're skipped (slow,
  and a refactoring net) unless `GOLDEN=1`. Re-record with
  `GOLDEN_UPDATE=1 pnpm playwright test golden` only when a change is meant to sound different,
  and say so in the commit.
- **Flakiness**:
  - Audio tests measure real output: `masterLevel` polled over 0.8–1.5 s.
  - Under heavy parallel load the first sound or a page change can come late. Prefer
    `expect.poll` with generous windows, or record events (see `pages.spec.ts`, which subscribes
    to the store) instead of a single timed check.
  - Run with `--workers=4`. If a test fails only in the full run, rerun it alone before changing
    code, then make the test robust.

## 8. Gotchas (each cost real time)

- **AudioWorklet scope has no `structuredClone`**, and a module that throws while being evaluated
  still resolves `addModule` silently (you'd only see "node name not defined"). Modules the
  worklet imports (`model/synth.ts`, `synthV1.ts`, `core.ts`) clone through JSON.
- **Don't `structuredClone` an immer draft.** Clone with JSON inside recipes, or build the copy
  outside the draft.
- **Messages to an offline worklet can arrive after rendering passed them.** Offline synths get
  everything in their node options instead (`settled()`, D92). Any new offline path that creates
  synth voices must call `scopeSettled(scope)` before rendering.
- **Library previews skip the master's chain** (no master effects, not exported) but end in its
  output stage, so the scope, the meters and `masterLevel` see them; to count previews, use
  `__rebeat.previews()`.
- **Track kinds are gone** (D93). Ask `track.mode` how it plays and `track.sound` what; use
  `model/tracks.ts` (`player`, `sampleOf`, `hitNoteOf`, `canClip`, `stepped`) rather than
  re-deriving. A Clip track's lane still has steps: check the mode (`stepped(project, id)`),
  not whether the lane has steps.
- **SOUND params follow the player.** Never read `SOUND_PARAMS[...]` directly for display; use
  `soundDefs(track)`, because tracks that play a synth show macros.
- **Old saved data is version 6 or older.** Tests that need it load the fixtures
  (`model/fixtures/v6.ts`) instead of relabeling today's projects, which are version 7.
- **A synth's patch** is `trackPatch(track)` / `patchOf(src)` (factory or the track's own,
  upgraded). What it plays is `effectivePatch(track)` (macros at the track's values), and what
  you hear after macros is `applyMacros(effectivePatch(track))`.
- **Patch edits go through `editPatch`/`setSynthParam`** (macro-aware, fork-aware), never
  `track.sound.patch.x = …` directly. Pass `fork = false` only for silent conversions.
- **The encoder strip's knob values are 0..1 "knob" positions.** Patch values are real units;
  convert with `toKnob`/`fromKnob` (patchParams) or `toUnit` (params).
- **Python string edits that miss their target fail silently.** An edit helper that raises on a
  missing match saved a wrong guide table once. Re-read files after scripted edits.
- **Encoders' MIDI learn label** defaults to the knob label ("Cutoff"). Pass `learnLabel` with
  the track and section so mappings are identifiable.
- **The built-in kits are synthesized from noise and normalized to their peak**, so they render
  with a seeded Math.random (`kits.ts: seeded`); unseeded, their levels moved by up to 2.5 dB on
  every reload.
- **Vite's dev server reloads every open page when a watched file changes**, so `e2e/` and
  `test-results/` are ignored (`vite.config.ts`); tests that write files would reload the app. A dependency Vite finds only on first use is optimized then, and that reloads every page too: list such lazy imports in `optimizeDeps.include` (the beatbox model's `onnxruntime-web/wasm` is).
- **Stop is a panic (D99).** `transport.stop()` calls `engine.panic()` unless "Let effects ring
  out after stop" is on. Anything new that makes or holds sound must stop at once: instrument
  voices implement `panic()` (return true if they can only be muted), effects with memory are in
  `HOLDS_SOUND` (`effects.ts`), and nodes outside the engine's chains register `onPanic` (the
  performance filters do).
- **Effects that follow the beat get page steps** from `playStep` (`effectsStep`, D104), the
  same live and offline. A new beat-synced effect implements `onStep`.
- **Training and the app must cut the same windows.** Any change to `onsets.ts` goes into
  `ml/rebeat_ml/onsets.py` too (and the gate into `windows.py`), then retrain and export: the
  export rewrites the parity fixtures, and the onset test fails until it does.
- **The model's runtime isn't precached**: `vite.config.ts` keeps `ort-wasm*.wasm` and the model
  worker out of the precache and caches them (and `models/beatbox/`) on first use. Don't import
  `library/beatbox/model.ts` from code that runs at startup without a reason.
- **Keyboards go through `state/keys.ts`.** Don't call `engine.holdNote` or `padInput` for held
  notes from a new input: `noteOn(pitch, velocity, source)` picks the target, plays the live
  voice, handles sustain and records (`recordNoteOn` on the note-on, `recordNoteOff` with the
  length on the release). The sequencer's voice (`S.synths`) and the keys' (`S.liveVoices`) are
  separate on purpose (D126), and so are their channels: the keys play into `S.liveChannels`
  (unmuted, 0 dB unless recording, D134); samples from the keys go through `playKeysSample`.
  What the keys play is announced as it sounds (`onKeysLight`, at audio times) and pitch bend and
  the mod wheel as they arrive (`onKeysControl`); `keysPlayInto` says whether that's a given synth
  editor's sound: the Keys panel's picture and the synth editor's piano and wheels (D262)
  follow them. A key can play several notes (in-key chord mode, chord pads): `noteOn` starts each through
  `startNote` and keeps them per key, so pads can change a held chord (`revoice`, D137).
  The play styles (D149–D154) sit in that path: a note with a delay (strum, slop) or a rhythm
  (arp, pattern) is started by `state/perform.ts` at its audio time; a note without one still
  starts at once. New ways of starting notes take a start time (`holdNote(…, at)`) and record
  with `recordNoteOn(…, { at, spread })`.
- **Controller-map slots have kinds** (`slotKind`: the slot id's prefix). Only knobs and encoders
  may be sniffed as relative; a fader that switched once stayed jumpy for good (D129). A wrong
  guess is saved, so `detectMode` wants strong evidence and knob slots heal back
  (`walksLikeAbsolute`, D141); every CC mapping reads its mode through `knobMode` in `midi.ts`.
- **A track edit redraws everything that shows the track.** A controller's faders and knobs
  send hundreds of messages a second, so `midi.ts` applies continuous values once a frame
  (`applySoon`), `reconcile` leaves a voice alone when only the channel changed
  (`soundChanged`), and the synth editor is memoized on it. New heavy views of a track should do
  the same.
- **Song positions are quarter notes, not seconds** (D181). Seconds come from the tempo map
  (`model/tempoMap.ts`); never multiply by `60 / project.bpm` for song time: use
  `secondsBetween`, or the step's `bpm` (`transport.tempoNow()`).
- **`reconcile` uses the engine's tempo while playing** (`S.tempo`, set by `tempoStep`), so an edit
  mid-song doesn't snap synced delays back to the start tempo. Offline scopes use `S.builtBpm`.
- **A new effect's knobs go in its `knobs` table** (`engine/effects.ts`), each an AudioParam with
  the knob's unit, or it can't be automated: `missingAutomation()` (the e2e test) lists the ones
  without, and only knobs in `NOT_AUTOMATABLE` (`model/automation.ts`) may be missing. Setting a
  Tone `Param`'s `.value` cancels what's scheduled on it, so an automated knob is skipped when
  another is set; a target that depends on two knobs is listed under both.
- **Channel counts matter before the panner.** A mono track gets an equal-power pan law; an
  insert that makes it stereo (a Split/Merge, an `explicit` 2-channel input) makes it 3 dB louder.
  Tone's stereo effects (Chorus, Phaser, Tremolo) always did; the Utility is a worklet so its
  output has its input's channels.
- **The Keys strip's effects are settings, not project data** (`keysMix`, FxTarget `"keys"`):
  `editEffects` handles them without a commit, and `state/keys.ts` pushes `keysMix` to the engine.
- **Automation doesn't write to the store**, and the override watcher relies on it. Anything new
  that moves a knob over time does it in the engine (`automateTarget`), never with commits.
- **Effects that can be automated need an audio-time path**: a param to schedule
  (`FxNode.automate`). Setting `.value` from JS doesn't reach offline renders (the Filter was
  rebuilt for this: its cutoff is a signal).
- **Agent worktrees start from the pushed `origin/main`,** not from local commits: merge `main`
  into them first. ESLint ignores `.claude/` (worktrees live there); vitest only looks in
  `src/`.
- **A synth's knob or switch moves through the worklet** (D228), never with patch messages: don't
  automate a synth by sending `setPatch`. A new knob in `patchParams` or switch in `patchSwitches`
  is automatable by itself; one the core reads only at a note's start goes in `NEXT_NOTE`
  (`model/automation.ts`) so the picker says so.
- **Stepped is a knob's `steps`** (D229): a new knob with steps gets a stepped lane, no eases, and
  points snapped by `timelineActions` (they read `laneSteps` from the project outside the recipe:
  the knob lists aren't cached for drafts and hold ~1,500 entries with ten synths).
- **Wavetables reach the worklet as messages**, once per context (all processors of a context
  share one global scope). A new path that plays a patch must call `setPatch` (it sends the tables
  the patch needs) and, offline, `settled()` before rendering, or the oscillator plays the analog
  stand-in. Tables are built on the main thread, never in the worklet.
- **A physical voice decays by itself.** Its voice ends on silence, not on the amp envelope
  (`PhysVoice.settle`), so a held pluck frees its voice. A modal model's impulses are normalized by
  their area and continuous exciters by √(2(1 − R)); a new exciter needs the same care, or its
  level follows its length or the decay. `sanitizePatch` caps a patch's volume at +6 dB.
- **The factory synth levels test** used to fail sometimes because of random oscillator phases;
  it now seeds `Math.random`. New level-sensitive tests should do the same.
- **`engine/synth/output.test.ts` is the DSP fingerprint test** (P3.0): it renders a set of
  patches with fixed seeds and checks sum-of-squares, sum-of-abs and four spread samples. Any
  change to `core.ts`, `physical.ts`, `modal.ts` or `wavetable.ts` that changes the audio output
  must update those fingerprints in the same commit and explain why in the commit message.
- **Per-track runtime state dies in one place** (`engine.ts ~line 250`): when `reconcile` removes
  a track it calls `disposeWarper`, disconnects and deletes the scratch node, and removes the
  `activeUntil` and `levelCache` entries — all in one clearly commented block. A new map of
  per-track state (voices, LFOs, etc.) must join that block or it leaks until the engine is reset.
- **The knob-list cache is keyed on `track.effects` identity** (`model/automation.ts:
  cachedTrackKnobs`): it skips a rebuild when `track.effects`, `track.sound`, `track.mode`,
  `track.name` and `track.id` all match. The combined list (`knobLists`) is likewise cached on
  the parts. A new automatable target that lives outside a track's effects or sound (such as a
  per-track boolean flag) must either be added to `trackKnobs` or get its own cache entry; the
  lists aren't cached for immer drafts, and `laneSteps` reads them from the project outside
  recipes for the same reason.
- **`lastCommitTime` is set only by `commit()`**, never by `undo()`, `redo()`, `editView()` or
  `setPlayMode()`. Watchers that need to distinguish a knob turn from a history move (such as the
  automation override and the record-automation subscriber) compare `s.lastCommitTime ===
prev.lastCommitTime` to skip history moves. Comparing `s.past.length < prev.past.length`
  is wrong because redo also grows `past`.
- **Commands can be scoped** (D275): `Command.scope` keys only match while the focus is inside an
  element with that `data-scope` (`scopesOf`), and win over a global command with the same key
  there. The tracker's commands are scoped to `"tracker"`; its note keys, digits and command
  letters are a key hook added with `first = true`, so it runs before the pad view's.
- **Visuals that follow the music use the heard time** (D278): `engine.heardNow()` /
  `transport.heardPosition()` (the audio clock minus the output latency). `Tone.Draw` already
  waits for it (`syncDrawToOutput` at Play); a new playhead drawn from `onFrame` should read
  `heardPosition`, not `position`.
- **The tracker writes its own notes** (D276): its previews call `noteOn(…, "tracker")`, a source
  that writes nothing (no step entry at the drum machine's cursor, no pad input, no recording). A
  new path that previews notes for an editor should use it too, or a stopped transport's step
  entry writes them at `ui.cursor`.
- **Project load resets per-session state in `state/keys.ts`.** On `loadProject` (the store's
  `loads` counter, not `projectId`: forking an example changes the id while you may be holding a
  chord), a subscriber in keys.ts releases every held voice and clears `chordPads`, `dialDown`,
  `dialUsed`, `history` and `auto.armed`. `midi.ts` does the same for `held` and the pad maps with
  its own subscriber (importing keys.ts there would make a cycle).

## 9. Where decisions are recorded

PLAN.md §6 has one entry per decision, with the chosen default and the alternatives. Ones you're
likely to need:

| Topic                                              | Decisions                 |
| -------------------------------------------------- | ------------------------- |
| Pages, clones, song order                          | D8–D13, D73               |
| Samples, library, edits                            | D17–D21, D31, D74         |
| Effects and mixing                                 | D22–D24                   |
| MIDI and controllers                               | D27, D61, D84             |
| Notes (instrument tracks before D93)               | D36–D42, D75              |
| UI (panels, themes, encoders, explain mode)        | D29–D30, D49–D58, D71–D72 |
| Desktop and platform                               | D64–D65                   |
| Synth: patches, factory, editor, your instruments  | D79–D82                   |
| Synth: AudioWorklet engine                         | D83, D92                  |
| Synth: macros, Advanced editor, workflow           | D85–D87                   |
| Synth: factory voicing, demo songs, slides         | D88–D89                   |
| Presets vs. copies, library editing                | D90–D91                   |
| Step tracks: modes, sounds, library, icons, edit   | D93–D98                   |
| Stop, removing kits, tab icons, themes, Pump, song | D99–D104                  |
| Beatbox: model, data, panel, calibration, convert  | D105–D118                 |
| MIDI controllers: maps, roles, relative, buttons   | D119–D125                 |
| The keys, recording notes, faders, CPU, zoom       | D126–D136                 |
| Chord pads (the Orchid's buttons on pads 1–8)      | D137                      |
| Key mode, the Key dial (black knob), transpose     | D138                      |
| Bass voicing (the chord's root octaves down)       | D139                      |
| Chord voicing (knob 1) and the bass knob (knob 5)  | D140                      |
| Telling absolute knobs from relative ones          | D141                      |
| Stepped knobs (voicing, bass) as equal zones       | D142                      |
| GM instruments that sustain loop their samples     | D143                      |
| MiniLab 3: pad colors, Shift + pads, the picture   | D144–D145                 |
| Relative knobs: a step per notch                   | D146                      |
| Pads that send CCs (MiniLab 3: 56–63)              | D147                      |
| Knob 2 the transpose, the bass a stepper           | D148                      |
| Play styles: strum, slop, arp, latch, patterns…    | D149–D157                 |
| Suggestions: the next chord, Next pad mode         | D158–D161                 |
| Auto, recording takes, room for a take             | D162–D164                 |
| Pads after a press, keys default, library menu     | D165–D167                 |
| 27 new synths, the synth wizard                    | D168–D170                 |
| Auto: queued pads, Sync to song; Edit sound        | D171–D173                 |
| Patterns: notation, triplets, picked notes, groups | D174–D179                 |
| The timeline: pattern and section, settings, tempo | D180–D195                 |
| Automation as a table, eases                       | D196–D205                 |
| Effects automatable, knob picker, effect clipboard | D206–D211, D216–D217      |
| Keys strip, Controller cards, top bar, Auto, Edit  | D212–D215, D218–D219      |
| Bends per note, the Bend card, the strip           | D220–D225                 |
| Synth automation, stepped lanes, switches          | D226–D232                 |
| Folding lanes, selecting and moving many points    | D233–D238                 |
| Wavetables: oscillators, tables, warps, slots      | D241–D248                 |
| Physical models: exciters, resonators, bodies, CPU | D249–D256                 |
| Patch v3, new factory synths, demo song, wizard    | D257–D261                 |
| The synth editor's piano follows the device        | D262                      |
| Scopes in the top bar (master, keys, every track)  | D263–D264                 |
| The tracker: look, columns, commands, keys, rows   | D265–D277                 |

Feature batches and their acceptance criteria are in PLAN.md §0.6b–§0.6h. Known limitations are
in §0.7.

## 10. Working conventions

- **Style**: TypeScript strict, Prettier (width 100), ESLint (unused vars must start with `_`).
  Small focused modules. Match the surrounding code's naming and comment density; comments
  explain _why_, in plain sentences.
- **UI text**: plain, friendly sentences; they're also hints and guide material.
- **State changes**: through `commit`, with a merge key for continuous gestures. Transport-like
  state goes through `setUi`.
- **Each change ends** with the full verification passing (§2). Visual changes get a screenshot
  check.
- **Commit early and often**, one logical change per commit, and push. **No AI co-author lines.**
- **Keep PLAN.md §0 current** (status, code map, next steps) and add decisions to §6. When the
  structure changes, update this file too.
