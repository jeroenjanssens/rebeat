# Rebeat: overview for coding agents

This file is the fast way in. It explains what Rebeat is, how the code is organized, how the
pieces talk to each other, how to verify a change, and the gotchas that cost time before.
`PLAN.md` is the long-form record: the product spec (§1–§3), the original architecture (§4),
and every design decision (§6, D1–D125). When this file and the code disagree, the code wins.
Please fix this file in the same change.

Status (2026-10-09): every phase of the original roadmap is built, plus several feature batches
(PLAN.md §0.6b–§0.6g). The biggest recent batch is **step tracks** (§0.6f, D93–D98, built on
the `step-tracks` branch and merged): the drum / instrument / audio track kinds became one kind
of track with a **sound** (sample, synth, sampled instrument) and a **mode** (Hits, Notes,
Clip), schema 7, a library ordered by what you pick, one set of icons, and an Inspector Sound
section. The latest batch is **beatbox to step tracks** (§0.6h, D105–D118, on the `beatbox`
branch): a Beatbox panel and a small deep learning model (trained in `ml/`) that turn your
beatboxing into step tracks. Left: tests
with real hardware (mic, MIDI, Launchpad/Push), signing the desktop release, the license (D6),
and the "later" items in PLAN.md §0.7. The repository is public and `main` deploys to GitHub
Pages.

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
- **A full subtractive/FM synth with an editor.**
- **A mixer** with insert effects (Pump among them: a beat-synced duck), send buses and a master
  chain.
- **Performance tools**: DJ filter, tape stop, beat repeat, crossfader, mute groups, page queueing.
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
- **Step track** (in code: `Track`): a row in the drum machine; tracks exist on every page. It has
  a **sound** and a **mode**: `hits`, `notes` or `clip` (D93).
- **Sound**: what makes a track's sound, in three families: a **sample**, a **synth**, or a
  **sampled instrument** (streamed, SoundFont, multi-sample) (D94).
- **Your sounds**: sounds saved to the library (synth copies, saved track sounds, SoundFonts…).
- **Page**: a pattern, i.e. the step data for every track.
- **Slot**: an entry in the song order that points at a pattern.
  - A **clone** is a slot that shares its pattern with another.
  - A **copy** is a new pattern.
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

**Verify every change** with the full sequence. Use `--workers=4`: more parallel browsers make
audio-timing tests flaky on a laptop.

```sh
pnpm prettier --write src e2e && pnpm tsc --noEmit && pnpm eslint . && pnpm vitest run \
  && pnpm playwright test --workers=4
```

Expect about 245 unit tests and about 165 e2e tests (around 7 minutes, most of it the golden
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
                       - TransportBar, commands (registry, shortcuts), defaultCommands, CommandPalette
                       - dialogs: Settings (+ MidiSettings, Calibration), ProjectBrowser, Export,
                         SampleExport, Welcome
                       - openers.ts: open a sample/synth editor tab, the guide, focus a panel
                       - shell.ts (dock API handle), hintLayer.ts (explain mode)
  platform/            the Platform interface; web.ts and electron.ts (files, storage, full screen);
                       nothing else touches those browser APIs directly
  model/               pure data and operations (no React, no audio):
                       - types.ts (Track, Lane, Step, Note, Sound…), project.ts (setMode…)
                       - tracks.ts (modes and sounds: player, sampleOf, hitNoteOf, canClip…)
                       - schema.ts (versions + migrations, now v8), params.ts (knob definitions, toUnit)
                       - fixtures/v6/ (every example and template as schema 6 saved it, gzipped)
                       - synth.ts (patch v2, macros), synthV1.ts (old patches, read only)
                       - patchParams.ts (the synth editor's knob table), randomize.ts
                       - notes, noteOps (piano roll), timing (polyrhythms), tempo, midiFile, effects
  state/               zustand stores:
                       - store.ts: project + undo + UI state
                       - settings.ts: persisted user settings
                       - actions (steps, function buttons), input (pads, step entry, recording)
                       - trackActions, effectActions, clipActions
  engine/              audio (no React):
                       - context.ts (native AudioContext + Tone)
                       - engine.ts (scoped graph: channels, voices, clips, metering, scratch)
                       - channel.ts (track/bus strips), effects.ts, tone.ts (replacements for two
                         Tone nodes)
                       - transport.ts (lookahead scheduler), ticker.ts (timing worker)
                       - instruments.ts (voices: synth, sample/multi-sample, smplr, sf2), synth/ (the
                         AudioWorklet synth: core.ts DSP, worklet.ts, node.ts)
                       - kits.ts (808/909 kits synthesized offline), samples.ts (buffers, peaks)
                       - looper, recorder, liveInput, metronome, stretch (Signalsmith), perf
                       - render.ts + offline.ts (offline export)
  audio-io/            mic.ts (one shared stream), midi.ts (Web MIDI: learn, notes, bend/mod,
                       sustain), controllers/ (Launchpad/Push grid model, profiles, runtime)
  midi/                learn.ts (startMidiLearn(target, label, scope)), mapping.ts (pure: relative
                       encoders, roles such as "selected:sound:3", which mapping wins, pads by
                       channel, pickup), controllers.ts (controller maps: MiniLab 3, MPK Mini MK3,
                       Launchkey Mini MK3/MK4)
  library/             samples and instruments:
                       - beatbox/ (D105–D118): classes, onsets (+ resample to 16 kHz), model.ts +
                         model.worker.ts (ONNX Runtime Web, loaded on first use), calibrate,
                         store (voices, recordings, hits in IndexedDB; predictions), record,
                         convert (grid, timing, velocity, folding), preview, transfer (dataset zips)
                       - library.ts (import, dedupe, decode, versions), analysis (BPM/onsets/key/LUFS)
                       - processing (sample settings), editorOps, renderFx, encode, wav, fft
                       - audition.ts (previews), online kits (onlineKits, onlineImport, sources)
                       - synths.ts (37 factory synths), instruments.ts (catalog), userInstruments.ts
                         (Your sounds, SoundFonts, multi-samples, preset copies)
                       - synthTrack.ts (a track's synth: patch, macros, editPatch, soundDefs), libraryEdit.ts
                         (editing a library synth without a track), synthFile.ts + rbsynth.ts
                         (.rbsynth files), downloads, drop, sort
  storage/             db.ts (Dexie: projects, samples, blobs, meta, instruments), projects.ts
                       (autosave, crash recovery, example forking), rebeatFile.ts (.rebeat zip)
  panels/              one folder per Dockview panel: drum-machine, library, inspector, mixer,
                       master-scope, piano-roll, sample-editor, performance, synth-editor, guide,
                       beatbox (recordings list, HitWaveform, RecordDialog, ConvertView, ModelView)
  components/          Encoder (knob), Fader, MiniFader, DragValue, Keyboard (piano), Scope,
                       PeaksCanvas, Playhead, Menu (contextMenu/dropdown), Dialog, Toast,
                       EffectEditor, glide (smooth resets), soundIcons…
  render/              raf.ts (one shared animation loop), useCanvas, theme (tokens), thumbnail
  help/                chapters/*.md (the user guide, one file per topic), guide.ts (renderer),
                       hints/ (explain-mode texts keyed by data-hint ids)
  templates/           builder.ts (song-writing helpers), examples.ts (example songs), showcase.ts,
                       synthSongs.ts, nightDrive.ts, index.ts (new-project templates)
public/worklets/       recorder.js, scratch.js (plain JS AudioWorklets)
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
   clock, driven by a worker ticker. `playPageStep` decides what each track plays on each step:
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
   `model/params.ts` defines their knobs (`EFFECT_PARAMS`).
8. **Platform layer.** File dialogs, storage persistence and full screen go through
   `platform/` (web or Electron). Load it lazily from modules that unit tests import, because
   it touches `window`.

## 5. Data model essentials (`model/types.ts`, `model/project.ts`)

- `Project`:
  - basics: `{ name, bpm, timeSignature, swing, metronome, countIn, key, playMode: "loop" | "song" }`
  - content: `tracks: Track[]`, `patterns: Record<id, Pattern>`, `slots: PageSlot[]` (the song
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
- **Schema**: `model/schema.ts`, currently `SCHEMA_VERSION = 8` (8: MIDI mappings' `mode`).
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

**Patch v2** (`model/synth.ts`):

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

- 37 synths written as version 2 specs through `voiced()`, with a house style: no drift, global
  LFOs, glide always, no note spread.
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
  - notes on the pads channel (10 by default) play tracks by position from note 36; other
    channels play the selected Notes track (or tracks by position when none is selected); both
    are recorded like pad hits
  - mappings: this project's first (`project.midiMappings`, track ids), then global ones
    (`settings.midiMappings`, roles: `selected:sound:<n>`, `selected:volume`, `track#<n>:…`),
    resolved by `resolveTarget`; each has a `mode` (absolute or relative, schema 8)
  - Mackie Control inputs run the transport; MIDI Start/Stop play and stop
  - controller maps (`midi/controllers.ts`) write global mappings with a `slot`; the Monitor
    (`useMidi.monitor`) says what each message did
  - CC1 = mod wheel, CC64 = sustain, pitch bend and aftertouch go to the selected synth
  - MIDI learn maps CCs and notes to targets: `track:<id>:sound.x`, `track:<id>:volume`,
    `track:<id>:fx:<fxId>:<param>`, `track:<id>:synth:<path>`, `bus:<id>`, `master:volume`,
    `perf:<control>`, `command:<id>`
  - `applyTarget` sets them
- `audio-io/controllers/`: Launchpad (Mini MK3, X, Pro MK3) and Push 2/3 as step sequencers
  (sysex for the pad colors).
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
- **Library previews don't reach the master bus**, so `masterLevel` can't see them; use
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
  `test-results/` are ignored (`vite.config.ts`); tests that write files would reload the app.
- **Stop is a panic (D99).** `transport.stop()` calls `engine.panic()` unless "Let effects ring
  out after stop" is on. Anything new that makes or holds sound must stop at once: instrument
  voices implement `panic()` (return true if they can only be muted), effects with memory are in
  `HOLDS_SOUND` (`effects.ts`), and nodes outside the engine's chains register `onPanic` (the
  performance filters do).
- **Effects that follow the beat get page steps** from `playPageStep` (`effectsStep`, D104), the
  same live and offline. A new beat-synced effect implements `onStep`.
- **Training and the app must cut the same windows.** Any change to `onsets.ts` goes into
  `ml/rebeat_ml/onsets.py` too (and the gate into `windows.py`), then retrain and export: the
  export rewrites the parity fixtures, and the onset test fails until it does.
- **The model's runtime isn't precached**: `vite.config.ts` keeps `ort-wasm*.wasm` and the model
  worker out of the precache and caches them (and `models/beatbox/`) on first use. Don't import
  `library/beatbox/model.ts` from code that runs at startup without a reason.
- **The factory synth levels test** used to fail sometimes because of random oscillator phases;
  it now seeds `Math.random`. New level-sensitive tests should do the same.

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
