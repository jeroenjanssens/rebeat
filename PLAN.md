# Rebeat — Product & Technical Plan

> **Status (2026-10-07):** All phases of §7 are implemented (M, G, 0–10). Repo: `github.com/jeroenjanssens/rebeat` (private). §0 describes the current code; §0.7 lists known limitations and what is left for later.
> Every open question in §6 has a **default**. All defaults were accepted when Phase M was started, except where §6 records a different choice. To change one, refer to it by number (e.g. "D7: B").

---

## 0. Hand-off (read this first when resuming)

### 0.1 Where we are

- §1–§8 below are the agreed product and technical plan. The decisions are in §6 (D1–D73), and the build order is in §7.
- Every phase in §7 is built, tested (unit + Playwright e2e) and pushed. The mockup (Phase M) became the app: its components, model and store were kept and extended; `src/mock/` was replaced by the real engine.
- The desktop app (Phase 10) runs and packages locally (unsigned); signing/notarization need certificates (see `.github/workflows/desktop.yml`).

### 0.2 Environment & commands

- macOS; Node 25, pnpm 12, `just` 1.45. Use `pnpm` for JS dependencies (`pnpm-workspace.yaml` allows only Electron's install script). For any Python tooling, use `uv` (never `pip`).
- `just dev` (Vite on http://localhost:5173), `just check` (tsc for app + Electron, eslint, vitest), `just e2e` (Playwright, Chromium), `just build`, `just preview`, `just desktop` (Electron against the dev server), `just desktop-build` (package into `release/`), `just e2e-desktop`, `just fmt`, `just clean`.
- CI: `.github/workflows/ci.yml` (check, build, e2e on every push), `.github/workflows/desktop.yml` (manual or `v*` tags: macOS/Windows/Linux builds).
- In dev builds `window.__rebeat` exposes `{ engine, transport, store }` for debugging and e2e tests.

### 0.3 Code map

```
src/
  App.tsx, main.tsx      shell: transport bar + Dockview + dialogs; startup (audio context, library, projects, SW)
  app/                   shell UI: Dock, layouts (presets), PanelFrame (panel full screen), panels registry (lazy),
                         TransportBar, FloatingTransport, commands (registry, shortcuts), defaultCommands,
                         CommandPalette, ShortcutsDialog, SettingsDialog (+ MidiSettings, CalibrationDialog),
                         ProjectBrowser, projectActions, ExportDialog, WelcomeDialog, AudioStartOverlay, openers
  platform/              Platform interface; web.ts; electron.ts (native dialogs via window.rebeatNative)
  model/                 types (Track, Pattern, Step, Note, Effect…), project ops, schema (versions + migrations,
                         now v5), params (+ toUnit), effects (buses, master, perf setup), notes (keys, chords, arp),
                         noteOps (piano roll), timing (polyrhythm), tempo (tap), midiFile (SMF export)
  state/                 store (project + undo + UI), settings (persisted), actions (steps, function buttons),
                         input (pads, step entry, live recording, cursor), trackActions, effectActions, clipActions
  engine/                context (native AudioContext + Tone), engine (scoped graph: channels, voices, clips,
                         metering, scratch), channel (strips, buses), effects (factory + chains), instruments (synth
                         presets, sampler, smplr), transport (lookahead scheduler, playPageStep), ticker (worker),
                         kits (offline-synthesized 808/909 + vox), samples (buffers, peaks), metronome, looper,
                         liveInput (monitoring), recorder (PCM worklet), stretch (Signalsmith warp), perf (DJ filter,
                         tape stop, beat repeat, throws, crossfader, mute groups), render (offline export)
  audio-io/              mic (one shared stream), midi (Web MIDI, learn, note input), controllers/ (grid model,
                         Launchpad/Push profiles, runtime)
  library/               library (import, dedupe, decode, versions, settings), analysis (BPM, onsets, key, LUFS),
                         processing (non-destructive sample settings), editorOps, renderFx, fft, wav, audition,
                         onlineKits (tidal-drum-machines index, sound search) + onlineImport (download cache,
                         import), drop (samples from drags: library, online, files), sort
  storage/               db (Dexie), projects (autosave, crash recovery), rebeatFile (.rebeat zip)
  panels/                drum-machine/, library/, inspector/, mixer/, master-scope/, piano-roll/, sample-editor/,
                         performance/, guide/
  help/                  the user guide: chapters/*.md (one per topic) and guide.ts (marked renderer; {#id}
                         anchors, {{key:command}} and {{shortcuts}} placeholders, panel:/command:/# links);
                         hints/ (explain-mode texts per area, keyed by data-hint ids; params.ts = param.*, fx.*)
  components/            glide (smooth resets), Encoder, Fader, VMeter, LevelMeter, Scope, PeaksCanvas, EffectEditor, Dialog, Menu,
                         Toast, DragValue, MiniFader, InlineEdit, portal, useScratch, useSamplesVersion
  render/                raf (shared loop + load), useCanvas, theme (tokens), thumbnail
  templates/             builder (pattern/chord helpers), templates (Empty, 808 starter, Loop station), examples
                         (Night Drive + 5 classics; read-only, ids "example:…", forked on first edit in storage/projects)
public/worklets/         recorder.js (PCM capture), scratch.js (scratch voice): plain JS for AudioWorklet scopes
electron/                main.cts, preload.cts, build/ (entitlements, icon); compiled to electron/dist
e2e/, e2e-desktop/       Playwright suites (web uses a synthetic mic via window.__REBEAT_TEST_MIC__)
```

Key implementation patterns:
- **Playhead and flashes bypass React**: `onStep` events (via Tone.Draw at the audible time) toggle classes on the DOM; canvases redraw from the shared `onFrame` loop and skip work when idle.
- **Undo**: every project edit goes through `commit(recipe, key)`; edits with the same key within 600 ms merge.
- **The engine reconciles** the audio graph against the store; immer's structural sharing lets it skip unchanged tracks and effects.
- **Engine scope**: `withScope(newScope(), …)` runs the same engine code offline for exports, via `engine/offline.ts` (a native OfflineAudioContext, like the live engine; Tone.Offline's wrapper rejected some node settings).
- **Channel strip** (`engine/channel.ts`): filter → drive → inserts → EQ → pan → width → fader. Pan comes before width so mono sounds get an equal-power pan law (−3 dB per side in the middle) and the widener always sees stereo. `engine/tone.ts` replaces two Tone.js nodes that colored the sound: `EQ3` (−17 dB notches at its crossovers even when flat) and `Distortion` (−9.5 dB at low drive). Built-in kits are normalized to −6 dBFS for headroom.
- **Native AudioContext**: Tone's default wrapper ran graph cycle detection on every `connect`; with a node per drum hit that cost ~90% of the main thread.
- **Samples are immutable** (SHA-256 ids); edits are settings on the library sample (D19) or new versions.

### 0.4 Working conventions

- Commits and GitHub actions are authored by **Jeroen Janssens only**: no Claude author or co-author lines.
- Ask before outward-facing actions (creating repos, publishing releases).
- Each change ends with `just check` + `just e2e` passing; visual changes are checked in a real browser (screenshots).
- Match the existing code style: TypeScript, Prettier (print width 100), small focused modules, comments only where they explain *why*.
- Schema changes bump `SCHEMA_VERSION` in `model/schema.ts` and add a migration plus a test.

### 0.5 Progress

- **M** ✅ mockup · **G** ✅ git + private repo · **0** ✅ shell · **1** ✅ engine · **2** ✅ projects · **3** ✅ library · **4** ✅ pages · **5** ✅ FX/mixer/scopes · **5b** ✅ instrument tracks · **6** ✅ loop station · **7** ✅ sample editor · **8** ✅ performance + MIDI · **8b** ✅ Launchpad/Push · **9** ✅ export, p-locks, PWA, onboarding · **10** ✅ desktop app.

### 0.6 Next steps


1. Try the app with real hardware: a microphone and audio interface (calibration, monitoring), a MIDI keyboard/controller (learn), and a Launchpad or Push (the Push color palette is approximate).
2. Desktop releases: add signing certificates and notarization secrets, then tag `v0.1.0` to produce draft releases.
3. Decide D6 (license) before making the repository public.

### 0.6b Polish batch (agreed and done 2026-10-08) ✅

Order: 4, 5, 10, 1, 2, 9, 3, then 6–8. One commit per item; each adds explain-mode hints for new
controls, updates the guide chapters it touches, and passes `/tmp/verify.sh`-style full checks
(prettier, tsc, eslint, vitest, e2e).

1. **Smooth reset (glide), D72.** `components/glide.ts`: `glide(key, from, to, apply)` with ease-out on
   the shared frame loop; a new glide or grabbing the control cancels the running one. Duration is
   proportional to the distance: 300 ms for the full range, minimum 60 ms. Used by double-click and
   "Reset to default" on Encoder, Fader, MiniFader, DragValue and the crossfader; stepped params
   (`def.steps`) jump. One undo step (commit keys merge within 600 ms). MIDI/controller input never
   glides. Check the engine smooths param changes (no zipper noise). Tests: unit (timing, curve,
   cancel) + e2e (double-click the Performance filter → reaches the center gradually; one undo).
2. **"Used in project" lists kit sounds.** Include built-in kit sounds (and sampler-instrument
   samples) used by tracks next to library samples; synth-only tracks get a note "Synth tracks (n)
   aren't samples". e2e: demo project → Used in project lists its kit sounds.
3. **Sample picker in the track menu.** Replaces `SamplePicker` in `TrackRow.tsx`: the current sound
   at the top (name, "Show in library", "Open in sample editor"), a search box, and one scrollable
   list of library samples + built-in kit sounds (current one highlighted; audio tracks: loops
   only). Click = replace (one undo step) and close. e2e: replace with a library sample, check name
   and undo.
4. **Play mode saved with the project, default Song, D73.** `Project.playMode: "loop" | "song"`
   (schema v5, migration sets "song"; templates and examples use "song"). Moves out of the UI state;
   a store action `setPlayMode` changes it without an undo step (it's transport state, like
   play/stop) but saves it. In an example, switching play mode doesn't fork (only for the session).
   Migration unit test; e2e: switch to Loop, reload, still Loop; update tests that assume looping.
5. **One-column library list.** Remove the 2-column view (360–640 px); list below 640 px, tiles stay
   for wide panels. Keyboard navigation follows.
6. **Online kits: preview without importing.** Previews play from an in-memory cache (fetch + decode);
   the library only changes on an explicit action: "+" per sound (add to library), "Add kit to
   library", "Load as tracks", or dragging a sound onto a track.
7. **Online kits: drag a sound onto a track.** New drag type `application/x-rebeat-online` (machine,
   type, variant); dropping on a track replaces its sound, dropping on the empty area adds a track.
   The sound is imported on drop (a track needs a stored sample).
8. **Online kits: search sounds.** Match machine names, sound types with synonyms (hat/hihat/hh,
   kick/bd, …) and file names from the index. Matching sounds show as one flat list across kits
   ("Cl Hat 2 · Roland TR808 · Closed Hat.wav") with preview, + and drag; at most 200; matching kits
   above. e2e for 6–8 with `page.route` mocking the index and serving generated WAVs.
9. **Sorting.** Sort menu: Name / Duration / Newest plus Ascending / Descending, applied in every view
   including built-in kits; the button shows the active sort ("Name ↑"); remembered for the session.
   Online kits sort by name. e2e: name and duration, both directions, own samples and a kit.
10. **Lane double-click reset.** In the velocity / probability / nudge lanes, double-click resets that
    step to its default (80 %, 100 %, 0); Alt+double-click resets the whole lane. Instant (no glide),
    one undo step together with the click that started it. e2e for both.

### 0.7 Known limitations and later work

- Offline renders (export, resampling) leave out smplr instruments (they stream samples) and repitch instead of time-stretching warped clips.
- Changing the latency mode applies after a reload (the AudioContext is created once).
- MIDI clock in/out, track groups/folding, and more conditional trigs are "later" items from the plan (D27, §3.3).
- Hold-step editing uses step selection (Alt+click, Select tool) for parameter locks rather than physically holding a pad.
- Headless Chromium on macOS can't open capture devices, so e2e tests use a synthetic microphone; the real mic path is covered manually.

---

## 1. Vision

Rebeat is a browser-based music IDE: a **drum machine / step sequencer** at the center, combined with a **loop station** (record and layer audio loops live), a **sample library**, a **sample editor**, and **live performance tools** (scratching, page queueing, mute performance, MIDI control). It should feel like a modern, professional desktop DAW: dockable panels, light/dark themes, keyboard-driven, and projects that save and load reliably.

---

## 2. Core concepts (glossary)

These terms are used consistently throughout the plan and later in the code.

| Term                 | Meaning                                                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Project**          | Everything you save/load: tempo, tracks, pages, song order, mixer, effects, references to samples, and embedded recordings.                                                                                                   |
| **Sample**           | An immutable audio buffer in the library (imported file, kit sound, or mic recording), identified by a content hash.                                                                                                          |
| **Sample settings**  | Non-destructive edits on a sample: trim, fades, gain, envelope, reverse, tune, loop points.                                                                                                                                   |
| **Track**            | A row in the drum machine. Tracks exist across all pages. A track has a sound source, mixer settings (volume, pan, mute, solo), and an effect chain.                                                                          |
| **Drum track**       | A track that triggers a one-shot sample on steps.                                                                                                                                                                             |
| **Instrument track** | A track that plays notes (melodies, basslines, chords) with a synth, a keyboard sampler, or a sampled instrument. Each step shows its note name; a piano roll gives full editing.                                             |
| **Audio track**      | A track that plays one longer sample (a loop, vocal, recording) as a continuous clip, shown as a waveform. It can be scratched.                                                                                               |
| **Page**             | One section of the song: the step data for every track. A page has its own **step count** and **step size** (default 16 × 1/16 = 1 bar), which together set its length. Pages are what you see as thumbnails in the mini-map. |
| **Copy (page)**      | A new, independent page with duplicated content.                                                                                                                                                                              |
| **Clone (page)**     | A new slot in the page order that points to the **same** pattern data. Editing any clone edits all of them. Clones can be "unlinked" into a copy at any time.                                                                 |
| **Song order**       | The ordered list of page slots (with repeat counts). The mini-map shows it.                                                                                                                                                   |
| **Step**             | One cell on a drum track, with per-step parameters (velocity, probability, etc.).                                                                                                                                             |
| **Insert effect**    | An effect in a track's own chain (distortion, filter, …).                                                                                                                                                                     |
| **Send / return**    | A shared effect bus (e.g. one reverb) that several tracks send a portion of their signal to.                                                                                                                                  |

---

## 3. Feature specification

### 3.1 Application shell

- Docking layout with draggable, tabbable, splittable, closable panels; layouts persist and there are layout presets ("Compose", "Perform", "Edit").
- **Full screen**:
  - **App full screen** through the Fullscreen API (transport-bar button, `Ctrl/Cmd+Shift+F`, command palette). Esc leaves full screen (enforced by the browser).
  - **Maximize panel**: the panel fills the app window and the transport bar stays (double-click the tab, a tab button, `Ctrl/Cmd+Shift+M`); the layout is restored exactly afterwards.
  - **Panel full screen**: a single panel fills the whole screen (tab button, `Ctrl/Cmd+Shift+Enter`), e.g. the Master Scope or Performance panel on a projector.
  - In maximize and panel full screen, a slim **floating transport bar** auto-hides; keyboard and MIDI shortcuts keep working; menus, dialogs and tooltips are placed inside the full-screen element so they stay visible.
  - Pop-out windows (Dockview) let a panel go full screen on a second monitor.
- **Responsive panels**: each panel adapts to its _own_ size through CSS container queries, with **compact / regular / large** layouts (e.g. the drum machine hides the mixer columns when compact and shows per-step velocity bars when large; the library switches between a list, columns and a tile grid). Canvases follow their container (ResizeObserver) and stay sharp on high-DPI screens. Each panel has a minimum size. A **UI scale** setting (80–150%) plus compact/comfortable spacing.
- Input: pointer events everywhere (mouse, touch, pen); touch-friendly sizes in the Performance panel. Desktop and tablet are supported; phones are out of scope.
- Fixed **transport bar** on top (not a panel): play / stop / record, BPM with tap tempo, time signature, metronome, count-in, swing, quantize, page/song mode toggle, CPU meter, master level meter, audio-engine status.
- **Command palette** (Ctrl/Cmd+K) and full keyboard shortcuts; a shortcut cheat sheet.
- Global **undo/redo** for all project edits.
- **Themes**: light, dark, and several named themes (e.g. "Studio Dark", "Midnight", "Paper", "High Contrast"); follows the OS preference by default. All colors, including canvas drawings, come from one set of design tokens.
- A built-in **Guide** panel (D70; F1, the **?** button, the welcome dialog, Help menu): a tutorial covering every panel and button, with search and the user's current shortcuts.
- **Explain mode** (D71; Shift+F1 or the speech-bubble button): hovering any button, knob or fader shows a card with an explanation and its shortcut; F1 opens the matching guide section.
- A one-time "Click to start audio" overlay. Browsers only allow audio to start after a user gesture.
- Settings dialog: audio input/output device, latency mode, recording latency compensation, theme, MIDI devices, autosave.

### 3.2 Projects

- Home/project browser: new, open, recent, duplicate, rename, delete, templates ("Empty", "808 starter", "Loop station").
- **Example songs** (D69): Night Drive plus five drum-machine classics (Blue Monday, Billie Jean, Planet Rock, Sweet Dreams, Around the World). Examples are read-only: the first change copies the example into your own project and carries on there.
- **Autosave** to browser storage (debounced) and crash recovery.
- **Export / import** a project as a single `.rebeat` file (a zip with `project.json` plus the audio it uses), so projects can be moved between machines.
- On Chromium browsers, optionally "Save to folder" through the File System Access API.
- Versioned project schema with migrations, so old projects keep loading.

### 3.3 Drum machine (main panel)

#### 3.3.1 Look & feel

**Inspired by the Squarp Hapax and Ableton Push, without imitating them.** The look comes from hardware: a dark matte surface, glowing pads in each track's color, a "display + 8 encoders" strip, and a row of labeled function buttons. But it's a flat, modern UI: no fake screws, metal textures or 3D bevels, and no copied branding or layouts.

- **Surface**: near-black panel background (`Studio Dark` theme); slightly raised areas for the display and pad zones. Light themes use a light-gray surface with the same saturated pad colors.
- **Pads (steps)**: rounded squares (~6px radius) with a small gap. Off = a dim tint of the track color. On = the full track color, with brightness following velocity. Playing = a short bright flash and glow.
- **Rhythm grid**: a slightly larger gap every 4 steps (beat) and a divider line every 16 steps (bar), so long pages stay readable.
- **Playhead**: a soft highlighted column moving across the grid, plus the flash on each triggered pad.
- **Track colors**: a 16-color palette that works in light and dark themes. Colors are assigned automatically by sound category (kick = red, snare = orange, hats = yellow, percussion = green, bass = blue, keys = purple, vocals = pink, FX = cyan), and you can change them. The color appears on the track's color bar, pads, scope, mixer strip and mini-map thumbnail.
- **Typography**: Inter for UI text; small uppercase labels for controls (as printed on hardware); JetBrains Mono, with equal-width digits, for values, BPM, note names and the display.
- **Motion**: short (60–120 ms) transitions; page changes are instant (D68); "reduced motion" is respected.
- **Encoders**: round knobs with an LED-style ring showing the value (filled from zero, or from the center for bipolar values like pan/tune), the label above and the value below.

#### 3.3.2 Layout (regular size)

```
┌ DRUM MACHINE ────────────────────────────────────────────────────────────────────────┐
│ A  [Grid|Pads]  2·VERSE  Steps[16▾] Size[1/16▾] Swing 54%  [✎ ⌫ ⬚]  Q[1/16▾] [Follow] │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ B  [1 INTRO][2 VERSE ▶][3 FILL ×2][1' INTRO 🔗][+]             (Loop page | Song)    │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ C  ┌ 02 SNARE · 909 ──┐  [SOUND] STEP  FX  MIX                                       │
│    │ ▁▃█▆▃▂▁▁         │   (◔)   (◑)   (◔)   (◕)   (◑)   (◔)   (◑)   (◕)              │
│    │ snare-909.wav    │   TUNE  DECAY START CUTOF RESO  DRIVE PAN   LEVEL             │
│    └──────────────────┘   +0.0  320ms 0%    8.2k  12%   0%    C     -3.0              │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ D  ▌01 KICK   M S ● ▮▮▮ │■ □ □ □ │■ □ □ □ │■ □ □ ■ │■ □ □ □ │  ∿∿∿ ▮               │
│    ▌02 SNARE  M S ● ▮▮  │□ □ □ □ │■ □ □ □ │□ □ □ □ │■ □ □ ◪ │  ∿∿∿ ▮               │
│    ▌03 HAT    M S ● ▮▮▮ │■ □ ■ □ │■ □ ■ ▤ │■ □ ■ □ │■ □ ■ □ │  ──── ▯              │
│    ▌04 BASS ♪ M S ● ▮▮  │C2 · C2 · │D#2 · · G1│C2 · C2 · │F2 · G2 · │  ∿∿∿ ▮      │
│    ▌05 VOX  ∿ M S ● ▮▮  │▁▂▅▇▅▃▂▁▂▅▇▆▄▂▁▁▂▅▇▆▄▂▁▁▂▅▇▅▃▂▁ [◎]│  ∿∿∿ ▮             │
│    ┄┄┄ Drop samples here to add tracks · [+ Drum] [+ Instrument] [+ Audio] ┄┄┄        │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ E  [SHIFT][SELECT][COPY][PASTE][CLEAR][DUPL][×2][MUTE][SOLO][FILL][REPEAT][ACCENT]    │
│    [RAND][EUCLID][NUDGE◂▸][UNDO]                                                     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Pad view** (alternative to the grid, like Push's drum layout; for finger drumming and focusing on one track):

```
┌ PADS (one per track) ┐  ┌ STEPS · 02 SNARE ──────────────────────────────┐
│ [13] [14] [15] [16]  │  │ ■ □ □ □  ■ □ □ □  □ □ □ □  ■ □ □ ◪            │
│ [09] [10] [11] [12]  │  │ □ □ □ □  ■ □ □ □  □ □ □ □  ■ □ ■ ■  (17–32)   │
│ [05] [06] [07] [08]  │  ├ LOOP / STEPS ──────────────────────────────────┤
│ [01] [02] [03] [04]  │  │ [8] [12] [16] [24] [32] [48] [64]              │
└──────────────────────┘  └────────────────────────────────────────────────┘
```

Clicking or hitting a pad plays the sound and selects that track. Pads are velocity-sensitive (vertical position on the pad, or MIDI velocity). For instrument tracks the pad area turns into an in-scale note layout (Push-style: notes in the key are lit, the root note highlighted).

#### 3.3.3 Elements, explicitly

**A. Header bar**

| Element                   | Behavior                                                                    |
| ------------------------- | --------------------------------------------------------------------------- |
| View switch `Grid / Pads` | Switch between the track grid and the pad view.                             |
| Page name                 | Current page number + name; click to rename.                                |
| Steps `[16▾]`             | Page step count (presets 8/12/16/24/32/48/64, or type any value 1–128).     |
| Size `[1/16▾]`            | Page step size (1/4, 1/8, 1/8T, 1/16, 1/16T, 1/32).                         |
| Swing                     | Page/global swing amount (drag or scroll).                                  |
| Tools `✎ ⌫ ⬚`             | Draw (default), Erase, Select (marquee). Shortcuts D / E / S.               |
| Quantize `Q[1/16▾]`       | Quantize for live recording (incl. off).                                    |
| Zoom                      | Horizontal zoom for long pages (also Ctrl/Cmd+scroll).                      |
| Follow                    | Grid follows the playing page; turn off to edit another page while playing. |
| Lanes menu                | Show/hide velocity, probability, and nudge lanes under the selected track.  |

**B. Page strip (mini-map)**

| Element              | Behavior                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Thumbnail            | A miniature step grid in track colors; name, number, repeat badge (`×2`), clone badge (`🔗`, plus a shared outline color for linked pages). |
| Playing indicator    | A progress bar underneath the playing page.                                                                                                 |
| Queued indicator     | A pulsing outline on the page that will play next.                                                                                          |
| Click / double-click | Click = select for editing (and, in Song or live mode, queue it); double-click = rename.                                                    |
| Drag                 | Reorder pages; Alt+drag = copy; Alt+Shift+drag = clone.                                                                                     |
| Context menu         | New, Copy, Clone, Unlink, Delete, Rename, Color, Repeat count, Steps/Size.                                                                  |
| `+`                  | New empty page (inherits the current step count/size).                                                                                      |
| `Loop page / Song`   | Playback mode toggle.                                                                                                                       |

**C. Display + encoder strip (Push-style)**

| Element                             | Behavior                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display                             | Shows the context: selected track number/name/type, sample name + mini waveform (drum/audio), or the instrument preset (instrument track); with steps selected: "3 steps selected".                                                                                                                                                                                                                 |
| Bank tabs `SOUND · STEP · FX · MIX` | Choose what the 8 encoders control. **SOUND**: tune, decay, start, filter cutoff/resonance, drive, choke, sample/preset. **STEP** (for the selected steps): velocity, probability, nudge, ratchet, pitch/note, gate, condition, accent. **FX**: the first 8 parameters of the selected effect, with ◂ ▸ to step through the chain. **MIX**: volume, pan, send A, send B, mute, solo, width, output. |
| 8 encoders                          | Drag up/down, scroll wheel, Shift for fine adjustment, double-click to reset, right-click for MIDI learn. Value ring + label + value. When several steps are selected, the encoder changes all of them relatively.                                                                                                                                                                                  |
| Hold-step editing                   | Hold a pad and turn an encoder (or scroll) to set that step's value only (a parameter lock, for later).                                                                                                                                                                                                                                                                                             |

**D. Track rows**

| Element                     | Behavior                                                                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Color bar `▌` + drag handle | Shows the track color; drag to reorder; click to select; Shift/Ctrl+click for multi-select.                                                                                 |
| Number + name               | Double-click to rename.                                                                                                                                                     |
| Type icon                   | Drum (none), instrument `♪`, audio `∿`.                                                                                                                                     |
| `M` `S` `●`                 | Mute, solo, record-arm (audio/instrument tracks). In compact layouts these turn into one menu.                                                                              |
| Volume mini-fader `▮▮▮`     | Drag horizontally; double-click resets to 0 dB.                                                                                                                             |
| FX badge                    | Number of insert effects; click to open them in the Inspector.                                                                                                              |
| Steps area                  | The pads (see the table below). Instrument tracks show note names; audio tracks show the clip waveform with playhead, the loop/one-shot mode, and the scratch button `[◎]`. |
| Scope + meter               | Oscilloscope (active only when sound is present) + level meter; click to enlarge.                                                                                           |
| Context menu                | Duplicate, Delete, Rename, Color, Replace sample…, Clear steps, Shift ◂ ▸, Reverse, Randomize, Euclidean…, Copy/Paste steps, Choke group, Convert type.                     |
| Drop target                 | Drop a sample to replace the sound (Alt = insert as a new track below).                                                                                                     |

**Step pad states**

| State                                        | Look                                               |
| -------------------------------------------- | -------------------------------------------------- |
| Off                                          | Dim tint of the track color.                       |
| On                                           | Full track color; brightness = velocity.           |
| Accent                                       | A bright top edge.                                 |
| Probability < 100%                           | A partially filled pad (fill level = probability). |
| Ratchet                                      | 2–8 small vertical ticks inside the pad.           |
| Nudge                                        | A small offset tick to the left/right edge.        |
| Condition (later)                            | A small label (`1:2`, `FILL`).                     |
| Parameter lock (later)                       | A dot in the corner.                               |
| Tie/slide (instrument)                       | Connected to the next pad / a diagonal mark.       |
| Selected                                     | An outline ring in the accent color.               |
| Playing                                      | A short flash + glow.                              |
| Beyond the track's own step count (override) | Hatched/darkened.                                  |

**Pad interactions**: click = toggle; drag = paint (or erase, if the first pad was on); Shift+vertical drag = velocity; Alt+click = open the step's details; right-click = context menu; Select tool = marquee; Ctrl/Cmd+C/V = copy/paste steps; arrow keys move a keyboard cursor, Enter toggles, 1–9 set velocity.

**E. Function buttons (Hapax/Push-style)**
Each button works as a one-click action on the current selection, **or as a held modifier**: hold it and click a pad, track or page, like on the hardware. Every button also has a keyboard shortcut.

| Button       | Action                                                                                |
| ------------ | ------------------------------------------------------------------------------------- |
| SHIFT        | Shows the secondary function of every button (printed small underneath).              |
| SELECT       | Hold + click steps/tracks to select without toggling.                                 |
| COPY / PASTE | Steps, tracks or pages, depending on what's selected/clicked.                         |
| CLEAR        | Clear the selected steps/track/page (hold + click a track).                           |
| DUPL         | Duplicate a track or page (Shift = clone a page).                                     |
| ×2           | Double the page length and duplicate its contents (Shift = halve).                    |
| MUTE / SOLO  | Hold + click tracks to mute/solo quickly, like on the hardware.                       |
| FILL         | Momentary: while held, steps with the FILL condition play.                            |
| REPEAT       | Note repeat: while held, playing a pad retriggers it at the selected rate (1/8…1/32). |
| ACCENT       | Pads and recording use full velocity.                                                 |
| RAND         | Randomize the selected steps (Shift = randomize velocity only).                       |
| EUCLID       | Euclidean fill for the selected track (pulses/steps/rotation through encoders).       |
| NUDGE ◂ ▸    | Shift the selected steps (or the whole track) by one step.                            |
| UNDO         | Undo (Shift = redo).                                                                  |

**F. Responsive behavior**

- **Compact**: the display + encoder strip collapses into one line (track name + current bank values; clicking opens it as a popover); the function bar becomes an overflow menu; track headers show only the color, name and M.
- **Regular**: as in the mockup.
- **Large / full screen**: bigger pads, velocity bars inside the pads, all lanes visible, encoder strip with larger knobs (well suited to a touch screen or projector).

#### 3.3.4 Behavior

**Tracks**

- Add a track with a "+" row, by dropping a sample on the empty drop zone at the bottom, or by dropping files straight from the OS.
- Drop a sample on an existing track to replace its sound.
- Drag to reorder; multi-select; duplicate; delete; rename; color; group/fold (later).
- Mute, solo, volume, pan, and an insert-effects chain per track; sends to shared reverb/delay buses.
- Selecting a track shows its sample in the library and in the Inspector (see 3.6).

**Drum tracks**

- **Step count per page**: 1–128 (preset buttons 8 / 12 / 16 / 24 / 32 / 48 / 64), and **step size per page**: 1/4, 1/8, 1/8T, 1/16, 1/16T, 1/32 (default 1/16). Page length = step count × step size. Different pages can have different counts; clones share them.
- By default every drum track follows its page's step count. Optional per-track override (advanced): a track gets its own step count and loops inside the page, which gives you polymeters (e.g. a 3-step hi-hat on a 16-step page).
- Changing the step count: growing adds empty steps; a separate **×2** button duplicates the existing steps instead; shrinking hides steps rather than deleting them, so growing again brings them back.
- Per-step parameters: on/off, **velocity**, **probability**, **micro-timing (nudge)**, **ratchet/retrigger** (2–8), **pitch**, **gate/decay**. Later: conditional triggers (1:2, 3:4, Fill, Not-Fill) and parameter locks (per-step effect values).
- Per-track sound parameters: tune, start offset, decay, filter cutoff/resonance, choke group (e.g. an open hi-hat choked by a closed one).
- Editing: click/drag to paint, right-drag to erase, shift-drag to set velocity, row tools (shift left/right, reverse, randomize, Euclidean fill, clear, double length).
- Swing: global, with a per-track override.

**Instrument tracks**

- Each active step shows its note name (e.g. `C2`, `D#2`); chords show a chord name (`Cm`) or a stacked label; long notes stretch across steps.
- Expand the row, or open the **Piano Roll** panel, for full editing of that track on the current page: vertical keyboard, drawing notes with their length, velocity per note, chords, and multi-select/move/copy.
- Polyphonic: several notes per step, each with its own length and velocity. Ties and 303-style slide/glide.
- Sound sources: Tone.js synths (poly, mono/bass, FM, AM) with presets; a **keyboard sampler** that plays any library sample across the keyboard (drag a sample onto the track); sampled instruments (piano, electric piano, strings…) through **smplr**.
- Note entry: click/draw, the computer keyboard as a piano (A W S E D… = C C# D D# E…), a live MIDI keyboard (quantized), and step entry.
- Musical helpers: project key and scale (with an optional per-page override); in-scale highlighting; optional scale lock; chord mode; arpeggiator; transpose per track or per page; octave shortcuts.
- Notes are stored on the page, so copy, clone and reorder work exactly as for drum tracks. Mixer, effects, oscilloscope, mute/solo and dragging are the same as other tracks.

**Audio tracks (loop-station side)**

- Show the clip as a waveform with a playhead.
- Per-page clip settings: active/inactive, start offset, launch mode (**loop synced to page** or **one-shot from page start**).
- **Live loop recording from the microphone while the other tracks keep playing:**
  1. Arm an audio track (or use the Performance panel). Record can be triggered by mouse, a keyboard key, or a MIDI footswitch.
  2. Recording starts on the next bar (or the next page), so you can press slightly early. An optional count-in can be used when starting from a stop.
  3. It records for the loop length (default: page length; 1/2/4/8 bars selectable), then plays back immediately as a gapless, click-free loop.
  4. **Overdub**: record again to add a layer while the loop plays. Layers are stored separately (each can be muted, undone/redone live, or merged). Also: double the length, halve it, clear, and turn a layer into its own track.
  5. Optional "free first loop" mode: when nothing is playing yet, the first recording sets the tempo (loop-pedal style).
- **Recording quality:** automatic latency compensation (from a one-time loopback calibration wizard) so loops land exactly on the beat; dry recording (before the track's effects); monitoring through the track's effects while armed, which can be turned off when the audio interface lets you hear the mic directly; headphones recommended, with a "speaker mode" (echo cancellation on) as a fallback against the mic picking up the beat.
- When the tempo changes, clips follow it through time-stretching (warp), with "repitch" as an alternative.
- Every recording is also saved to the library under "Recordings".
- **Scratch control** (see 3.7).

**Recording into the drum machine**

- Live step recording: play pads (keyboard keys, on-screen pads, or MIDI) while the transport runs; hits are quantized into steps (quantize can be turned off, in which case the nudge is kept).
- Step-entry mode: when stopped, pressing a pad writes to the selected step and moves forward.
- Resampling: bounce the drum machine output, or one track, into a new sample.

**Oscilloscope per track**

- Taps the track's signal after effects and after the fader, so a muted track shows nothing.
- Draws only while the signal is above a small threshold. Otherwise it shows a dimmed, still state and costs nothing to render.
- Modes: waveform (scope) or a small spectrum; click to enlarge.

**Pages & mini-map**

- A thumbnail strip at the top of the drum machine. Each thumbnail draws that page's step grid in miniature, colored by track.
- The current page is highlighted. During playback the strip follows the playhead, and the next page can be queued.
- Actions: new, copy, clone (linked), unlink, delete, rename, color, repeat count (×1…×16), drag to reorder.
- Clones share a link badge/color so you can see the relationship.
- Playback modes: **Loop page** (repeat the current page) or **Song** (play the pages in order with their repeats, optionally looping the whole song).
- Live switching: pick a page while playing and it starts at the end of the current page, bar, or beat (configurable).
- Page changes are instant: no transition (D68). The page name has a fixed width (the longest name), so the header controls never move.

### 3.4 Sample library panel

- Import WAV, MP3, OGG, FLAC, AAC/M4A, and anything else the browser can decode. Use the file picker, drag-and-drop from the OS, or drop a folder or a zip.
- Organization: folders, tags, favorites, search, sort, and filters (duration, type, tag, "used in project").
- Each item shows a waveform thumbnail, duration, and detected BPM (for loops).
- **Audition**: click to preview (optionally synced to the tempo); arrow keys browse while preview stays on; preview volume.
- **Usage**: shows which tracks use a sample; "reveal in drum machine".
- **Microphone recording** inside the library: input-device dropdown, input meter, monitor toggle, record/stop, auto-trim silence, and a new sample at the end.
- **Drum kits**: a "Kits" section with 808, 909, 707, 606, LinnDrum, DMX, SP-1200-style kits, and more (see D17). One click loads a whole kit as tracks, or you can drag single sounds.
- Double-click a sample to open it in the **Sample Editor**. Drag a sample to a track to replace its sound, or below the last track to create a new track.

### 3.5 Sample editor panel

Opens as a tab per sample. Edits are non-destructive unless you bounce (render) them.

- Zoomable, scrollable waveform; optional spectrogram view; stereo/mono display.
- **Trim** (start/end handles that snap to zero crossings), **fade in/out** with curve shapes, **gain** and **normalize**, **reverse**, **DC-offset removal**, **strip silence**.
- **Envelope**: AHDSR amplitude envelope, plus a freely drawn volume envelope.
- **Tune**: pitch in semitones and cents, with or without changing the length; time-stretch to a target BPM or length.
- **Loop points** with crossfade, for sustained sounds.
- **Slicing / chopping**: by transient detection, an equal grid, or manual markers. "Slices to new drum tracks" puts each slice on its own track and pre-fills a pattern that plays the original rhythm.
- **Effects** (applied by rendering): EQ, filter, compressor, distortion, bitcrusher, reverb, delay, and so on, with a before/after preview. Rendering creates a new version of the sample.
- Selection tools: cut/copy/paste/silence/crop to selection; audition the selection; loop playback.
- Undo/redo inside the editor; "Save as new sample" vs. "Apply" (which changes every track using this sample, with a warning that shows the usage count).
- Analysis: BPM and key detection, peak/RMS/LUFS readout.

### 3.6 Additional panels (suggested)

- **Inspector**: details of the selected track: sound source (sample + its settings), per-track sound parameters, the effect chain (add / reorder / bypass / wet-dry per effect), sends, and MIDI mapping. This is how you see and change "the sample behind this track" without leaving the drum machine.
- **Piano Roll**: full note editor for the selected instrument track on the current page (also available by expanding the track row).
- **Mixer**: channel strips for all tracks, send/return buses, and the master bus (EQ, compressor, limiter), with meters.
- **Performance**: large pads, page launcher, mute groups, scratch platter, master FX (filter sweep, beat-repeat/stutter, tape stop), crossfader.
- **Master Scope**: one large oscilloscope of the total output (after the master chain, without the metronome). Steady trigger-locked display; modes: L/R overlay, combined mono, X-Y (stereo width); zoom the time window, freeze, adjust brightness/trail; theme colors. Spectrum and loudness meter as optional tabs or overlays.

### 3.7 Live performance

- **Scratch**: any audio track can show a **virtual platter / jog strip**. Grabbing it takes over the playhead, and dragging moves forwards or backwards at the speed of your gesture (real vinyl-style scratching, including reverse). Releasing it either returns to synced playback (catches the beat) or keeps the new position. It also has a cut/fader button for transform/crab scratches, and works with a MIDI jog wheel or mouse wheel.
- **Mutes**: instant mute/solo; mute groups; "queued mutes" that apply on the next bar.
- **Page queueing** (see Pages) and **fills** (a held Fill button triggers the conditional "Fill" steps).
- **Master performance FX**: filter sweep, beat repeat/stutter, tape stop, and a reverb/delay throw.
- **Tap tempo** and tempo nudge.
- **MIDI**: Web MIDI input for pads, notes, and controllers; **MIDI learn** for any knob or button; MIDI clock in/out (later).
- **Live loop recording** on audio tracks (see 3.3) with overdub and undo.

### 3.8 Export

- Render the song or the current page to WAV (offline, faster than real time); optionally stems per track.
- Export patterns as a MIDI file.
- Export a project as `.rebeat` (see 3.2).

---

## 4. Technical architecture

### 4.1 Stack recommendation

| Concern                                  | Recommendation                                                                                                       | Notes                                                                                                                                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language                                 | **TypeScript**                                                                                                       | You said JavaScript. TypeScript is still JavaScript, but with types, which pays off a lot in a large project with a complex data model. See D1.                                                |
| Build / dev server                       | **Vite**                                                                                                             | Fast and standard; good support for AudioWorklets and web workers.                                                                                                                             |
| UI framework                             | **React 19**                                                                                                         |                                                                                                                                                                                                |
| Panels / docking                         | **Dockview** (`dockview-react`)                                                                                      | Note that it's _Dockview_, not "Docview". Mature, zero dependencies, supports tabs, groups, floating and pop-out panels, serializable layouts, and theming through CSS variables. Good choice. |
| UI components                            | **Tailwind CSS + shadcn/ui (Radix primitives)** + **lucide** icons                                                   | Accessible, modern, professional look; easy theming with CSS variables.                                                                                                                        |
| Knobs / faders                           | Small custom components                                                                                              | Mature knob libraries are rare; we build our own (pointer drag, fine-adjust with a modifier key, double-click to reset, MIDI-learnable).                                                       |
| Audio engine                             | **Tone.js**                                                                                                          | Good choice. It provides the Transport (sample-accurate scheduling with lookahead), Players/Samplers, a broad set of effects, UserMedia, Offline rendering, and Meter/Analyser.                |
| Custom DSP                               | **AudioWorklets**                                                                                                    | For the scratch voice, PCM recording capture, and the time-stretch engine.                                                                                                                     |
| Time-stretch                             | **Signalsmith Stretch** (MIT, Web Audio/WASM build)                                                                  | High quality and permissively licensed. Avoid Rubber Band (GPL) and SoundTouch (LGPL) for licensing reasons.                                                                                   |
| Waveforms (editor)                       | **wavesurfer.js v7** + Regions/Envelope/Zoom/Spectrogram plugins                                                     | Battle-tested, gives us the base of the sample editor.                                                                                                                                         |
| Waveforms / scopes / mini-maps elsewhere | **Canvas 2D** with one shared `requestAnimationFrame` loop; precomputed peaks                                        | See the note on Phaser below.                                                                                                                                                                  |
| State                                    | **Zustand + Immer** (with Immer patches for undo/redo)                                                               | Small, fast, and works well outside React (the audio engine can subscribe to it).                                                                                                              |
| Drag & drop                              | **dnd-kit** for reordering inside a panel; **native HTML5 drag-and-drop** for library→drum machine and OS file drops | Native DnD also works across Dockview pop-out windows and with files from the desktop.                                                                                                         |
| Storage                                  | **IndexedDB via Dexie** (project data, metadata, audio blobs)                                                        | Optional: Origin Private File System (OPFS) for large audio files later.                                                                                                                       |
| Zip                                      | **fflate**                                                                                                           | For `.rebeat` project files and importing zipped kits.                                                                                                                                         |
| Audio analysis                           | **Meyda** or a small custom module (BPM/onset/key)                                                                   | Transient detection for slicing.                                                                                                                                                               |
| Command palette                          | **cmdk**                                                                                                             |                                                                                                                                                                                                |
| Testing                                  | **Vitest** (unit), **Playwright** (end-to-end, including audio smoke tests with a fake media device)                 |                                                                                                                                                                                                |
| Offline / install                        | **vite-plugin-pwa**                                                                                                  | Installable app; also helps keep the microphone permission (see D15).                                                                                                                          |
| Package manager                          | **pnpm**                                                                                                             | Or npm; see D3.                                                                                                                                                                                |
| Task runner                              | **just**                                                                                                             | `just dev` starts the dev server; `just` lists all recipes.                                                                                                                                    |

**About Phaser.** I recommend _not_ using Phaser (D5). Phaser is a game engine. Every Phaser instance owns its own game loop, input system, and WebGL context, and browsers limit how many WebGL contexts can exist (often ~16). That makes "one Phaser canvas per track oscilloscope" impossible. It also works against React, Dockview, accessibility, and CSS theming. The drum grid is better built from DOM elements (crisp, accessible, easy to theme and drag-and-drop). The oscilloscopes, waveforms, and mini-maps are simple 2D drawings that Canvas 2D handles easily when they are driven by a single shared animation loop. If we ever need GPU rendering (e.g. a fancy visualizer), **PixiJS** is the right tool, not Phaser.

**About Strudel.** Strudel's code is licensed **AGPL-3.0**. Bundling its packages (e.g. `superdough`) would force Rebeat to be AGPL too. We can, however, load the same _sample packs_ it uses (e.g. `tidal-drum-machines`) as data, with care over their licenses (see D17).

### 4.2 Module structure

```
src/
  app/            app shell, routing (home ↔ project), providers, theme
  panels/         one folder per Dockview panel (drum-machine, library, sample-editor, inspector, mixer, performance, analyzer)
  components/     shared UI (knob, fader, meter, scope canvas, waveform canvas, step cell…)
  state/          Zustand stores: project, ui/selection, library, settings; undo/redo; selectors
  model/          TypeScript types + schema versioning/migrations + pure operations (copyPage, clonePage…)
  engine/         audio engine (no React): graph builder, scheduler, track voices, effects factory, sends, master, metering
  engine/worklets/ scratch-voice, recorder-capture, stretch
  platform/       platform interfaces (storage, file access, mic permission, window/full screen, file open) + web implementation; Electron implementation later
  audio-io/       microphone manager (permissions, devices, single shared stream), MIDI manager
  library/        import/decoding, hashing, peaks, kits, analysis (BPM/onsets)
  storage/        Dexie DB, autosave, .rebeat import/export
  render/         shared rAF scheduler, canvas drawing helpers that read theme tokens
```

### 4.3 Key design principles

1. **One source of truth.** The project store holds plain, serializable data. React renders it, and the **audio engine reconciles** the audio graph against it (much like React reconciles the DOM). The engine never owns state that isn't in the store, apart from runtime-only things such as buffers and nodes.
2. **Audio never waits on React.** Scheduling runs on Tone's Transport with lookahead and reads an up-to-date snapshot of the pattern data. Visual sync (playheads, step highlights) uses `Tone.Draw` and the shared rAF loop, not React re-renders.
3. **Clones by reference.** `songOrder: PageSlot[]`, where each `PageSlot` has a `patternId`. A clone is a new slot with the same `patternId`. A copy is a new slot with a deep-copied pattern. Unlink turns a clone into a copy.
4. **Samples are immutable and content-addressed** (SHA-256). Edits are non-destructive settings; a bounce creates a new sample. Duplicate imports are detected automatically.
5. **Efficient metering.** Each track has an `AnalyserNode` after effects and fader. One rAF loop reads only the visible and active ones, computes RMS, and skips drawing when the level is below a threshold.
6. **Panels respond to their container, not the viewport.** Every panel is built with container queries and size classes, and every canvas uses a shared resize helper (ResizeObserver + devicePixelRatio), so maximize, full screen, pop-out and docking all work without special cases.
7. **Effects are data.** An effect is `{ id, type, params, bypass, wet }`. A factory maps the type to Tone nodes, so the same definitions drive live inserts, the editor's render, the UI, and serialization.
8. **Platform-independent core.** Nothing outside `platform/` touches browser-specific APIs for storage, files, permissions, windows or full screen directly. This keeps a later desktop (Electron) build a thin wrapper, with no rewrite.

### 4.4 Draft data model (abridged)

```ts
Project {
  id, name, schemaVersion, createdAt, updatedAt
  bpm, timeSignature, swing, metronome, key: { root, scale }
  tracks: Track[]                 // global, ordered
  patterns: Record<PatternId, Pattern>
  songOrder: PageSlot[]           // { slotId, patternId, repeats }
  buses: Bus[]                    // send/return buses
  master: { volume, effects: Effect[] }
  sampleRefs: SampleId[]          // for export/embedding
}
Track {
  id, name, color, kind: 'drum' | 'instrument' | 'audio'
  instrument?                      // { source: 'synth' | 'sampler' | 'smplr', preset/params }
  sampleId, soundParams            // tune, start, decay, filter, choke group
  volume, pan, mute, solo, sends: Record<BusId, number>
  effects: Effect[]
  scratchEnabled                   // audio tracks
  layers?: { sampleId, gain, mute }[]   // audio tracks: overdub layers
}
Pattern {
  id, name, color, stepCount, stepSize   // length = stepCount × stepSize
  lanes: Record<TrackId, DrumLane | NoteLane | AudioLane>
  keyOverride?                     // { root, scale }
}
NoteLane  { notes: Note[] }          // Note { step, pitch (MIDI), length (steps), velocity, slide? }
DrumLane  { steps: Step[], stepCountOverride?, swingOverride? }   // steps beyond the count are kept, just hidden
Step      { on, velocity, probability, nudge, ratchet, pitch, gate, condition?, locks? }
AudioLane { active, startOffset, launchMode: 'loop' | 'oneshot' }
Sample    { id(hash), name, folder, tags, duration, sampleRate, channels, bpm?, key?, settings: SampleSettings, peaks }
```

---

## 5. Inconsistencies & clarifications in the original brief

1. **"Pages" means two things in the drum machine world.** On Elektron-style machines, a 64-step pattern is shown as four 16-step "pages". In your brief, pages behave like **separate patterns arranged into a song** (copy, clone, reorder, slideshow, mini-map). I've used the second meaning. The 8/16/32/64 step counts are set per page (with an optional per-track override). → D8, D9.
2. **Per-track step counts vs. page length.** If one track has 16 steps and another 64, how long is the page? → D9 (the page sets the step count; a per-track override loops inside the page).
3. **What does an audio track do on a page?** A "single sample" per track doesn't say whether it loops, triggers once, or restarts on every page. → D10.
4. **Tempo changes vs. audio tracks.** Changing the BPM puts recorded loops out of sync unless they are time-stretched. → D11.
5. **Editing a sample that several tracks use.** Should editing in the sample editor change every track, or only one? → D19.
6. **Effects in two places.** "Effects on tracks" (live, adjustable) and "effects in the sample editor" (rendered into the sample) are different things. Both are kept, with clearly different behavior. → D20.
7. **"The drum machine can record"** could mean live pattern recording, audio recording, or bouncing the output. I've included all three (3.3).
8. **"Give microphone permission only once"** is ultimately up to the browser. We can make it almost always a single prompt in Chrome/Edge, but Safari may still ask again in later sessions. → D15.
9. **Library scope.** Is the sample library shared by all projects, or does each project have its own? → D18.
10. **Mutes on the page vs. global mutes.** For live performance, mutes should be global (they survive page changes). → D12.
11. **Phaser.** It's a poor fit for this kind of UI; see §4.1 and D5.
12. **Strudel** is AGPL; we use its sample _packs_ (as data), not its code. → D17.

---

## 6. Open decisions (with defaults)

Format: **Dn — Question.** Default ✅, alternatives.

### Foundations

- **D1 — Language.** ✅ TypeScript. Alt: plain JavaScript with JSDoc.
- **D2 — Target browsers.** ✅ Chromium (Chrome/Edge) first-class, Firefox supported, Safari best-effort. (Web MIDI, File System Access, output-device selection, and permission persistence are best on Chromium.)
- **D3 — Package manager.** ✅ pnpm. Alt: npm, bun.
- **D4 — UI kit.** ✅ Tailwind + shadcn/ui (Radix). Alt: Mantine, Chakra.
- **D5 — Phaser.** ✅ **Confirmed:** don't use it; Canvas 2D with a shared rAF loop, PixiJS only if needed later. Alt: use Phaser for one dedicated visualizer panel.
- **D6 — License of Rebeat.** ✅ Keep the repo private for now, avoid GPL/AGPL dependencies so every option stays open, and decide before publishing. Alt: MIT now.
- **D7 — App name.** ✅ "Rebeat" (from the folder name).

### Sequencer model

- **D8 — Meaning of "page".** ✅ A page = one pattern; pages in order = the song. Alt: Elektron-style 16-step sub-pages of one pattern.
- **D9 — Steps per page.** ✅ Each page has a step count (1–128, default 16) and step size (default 1/16), which together set its length; tracks follow the page. Optional per-track step-count override loops inside the page (polymeter); a track longer than the page gets cut off at the end, with a warning. Growing the count adds empty steps (×2 duplicates); shrinking hides steps without deleting them. Alt: the page length is set in bars, and every track sets its own step count.
- **D10 — Audio track behavior on a page.** ✅ Per page: active/inactive + launch mode, default **loop synced to the page** (restarts at the start of each page). Alt: free-running across pages; one-shot only.
- **D11 — Audio clips when the tempo changes.** ✅ Warp (time-stretch with Signalsmith) for clips that have a known BPM; the original BPM is stored on recording. Alt: repitch (speed changes, like vinyl); none.
- **D12 — Mute/solo scope.** ✅ Global per track (not stored per page); per-page "lane active" is a separate setting. Alt: per page.
- **D13 — Are tracks shared across pages?** ✅ Yes: tracks (sound, mixer, FX) are global; pages only hold steps/clip settings. Alt: per-page tracks (much more complex).
- **D14 — Per-step features in the first version.** ✅ Velocity, probability, nudge, ratchet, pitch. Later: gate, conditional trigs, parameter locks. Alt: everything at once.
- **D14b — Page switch quantization while playing.** ✅ End of the current page. Alt: next bar, next beat, immediately.
- **D14c — Max tracks.** ✅ Soft limit of 32 tracks (CPU warning beyond that). Alt: 16 hard limit, unlimited.
- **D14d — Time signature.** ✅ Global; 4/4 default, others allowed (3/4, 5/4, 6/8, 7/8). Alt: per page.

### Audio input, library, samples

- **D15 — Microphone permission strategy.** ✅ Ask on the first record/monitor action, then keep **one shared stream open** for the rest of the session and reuse it everywhere (library, tracks). After that permission, `enumerateDevices` gives device names for the dropdown, and switching device reuses the grant. Turn off echo cancellation, noise suppression, and auto-gain (they ruin music recordings). Run on localhost/HTTPS and offer PWA install, so Chrome remembers the grant across sessions. Alt: release the mic after each recording (the mic indicator turns off, but a prompt is more likely next time in some browsers).
- **D16 — Recording capture method.** ✅ AudioWorklet PCM capture (lossless, sample-accurate, latency-compensated) stored as WAV. Alt: MediaRecorder (simpler, but lossy and with a timing offset).
- **D17 — Drum kit sources.** ✅ (a) Ship a few **built-in synthesized kits** (808/909-style, generated with Tone.js synths and baked into samples; no license issues), plus (b) an **online kit browser** that fetches from the community `tidal-drum-machines` collection (the one Strudel uses: 808, 909, 707, 606, LinnDrum, DMX, SP-12…) on demand, with a note about licensing; nothing redistributed in our bundle. Plus (c) importing any folder or zip as a kit. Alt: (b) only; (a) only; Freesound API integration.
- **D18 — Library scope.** ✅ One global library shared by all projects. Projects reference samples by hash, and `.rebeat` export embeds the samples used. Alt: per-project library.
- **D19 — Sample edits vs. tracks.** ✅ Sample settings live on the library sample and so affect every track that uses it; the editor shows "Used by N tracks" and offers "Save as new sample" to fork. Tracks also have their own lightweight sound parameters (tune/start/decay/filter) for per-track variation. Alt: every track gets its own private copy of the settings.
- **D19b — Apply in the sample editor.** Applies in place, also for audio edits (cut, crop, rendered FX…): the sample keeps its id and its stored audio is replaced, so every track that uses it changes; "Save as new" makes a separate sample. Samples edited in place record their current `contentHash`, so importing the original file again still adds it.
- **D20 — Effects in the sample editor.** ✅ Applied by rendering into a new sample version (a bounce), with preview. Alt: keep editor effects live (more CPU per voice).
- **D21 — Storage of audio blobs.** ✅ IndexedDB (Dexie) for everything at first; move audio to OPFS if performance requires it. Ask for persistent storage (`navigator.storage.persist()`) so the browser doesn't evict data. Alt: OPFS from the start.

### Effects & mixing

- **D22 — Effects architecture.** ✅ Insert chain per track (unlimited, reorderable) **plus two default send buses (Reverb, Delay)** and a master chain (EQ → compressor → limiter). Reverb is expensive, so sends are the CPU-friendly way to use it on many tracks. Alt: inserts only.
- **D23 — Effect set for the first version.** ✅ EQ3, filter (with LFO), compressor, distortion, bitcrusher, delay (tempo-synced), reverb, chorus, phaser, tremolo/auto-pan. Later: flanger, pitch-shift, gate, sidechain ducking, beat-repeat as an insert.
- **D24 — Oscilloscope tap point.** ✅ After effects and after the fader (so muted = inactive); waveform mode by default. Alt: before the fader.

### Performance & control

- **D25 — Scratch implementation.** ✅ A custom AudioWorklet "scratch voice" that reads the buffer at a variable, signed playback rate driven by pointer/MIDI jog movement, with smoothing; on release it returns to the synced position. Alt: Tone.Player rate changes (no smooth reverse, sounds worse).
- **D26 — Where the scratch control lives.** ✅ A compact jog strip in the audio track row (expandable), plus a full platter in the Performance panel for the selected track. Alt: only in the Performance panel.
- **D27 — MIDI.** ✅ Web MIDI input + MIDI learn in v1; MIDI clock sync and output later.
- **D28 — Pad keyboard mapping.** ✅ Two rows of the QWERTY keyboard map to tracks 1–16 (in pad/record mode), with shortcuts that don't clash with the app's.

### UX

- **D29 — Default panel layout.** ✅ Library on the left, drum machine in the center (mini-map on top), Inspector on the right, sample editor/mixer as tabs on the bottom. Layouts are saved per user (not per project), with presets. Alt: save layouts per project.
- **D30 — Theme set.** ✅ Light, Dark (default follows OS), plus 3 named themes and a High-Contrast theme; an accent-color picker. Alt: only light/dark.
- **D31 — Double-click a sample.** ✅ Opens or focuses the sample editor as a tab for that sample (one tab per sample, reused if already open). Alt: a single editor panel that switches sample.
- **D32 — Track drop behavior.** ✅ Drop on a track = replace its sound (hold Alt to add as a new track below); drop on the bottom zone = new track; dropping several samples = several tracks; dropping a kit = a track per sound.
- **D33 — Undo scope.** ✅ One global undo history for project edits; the sample editor keeps its own local history until you apply. Alt: one history per panel.

### Delivery

- **D34 — Hosting.** ✅ A static site (e.g. GitHub Pages/Netlify/Cloudflare Pages), no backend; everything stays in the browser. Alt: a backend for cloud sync later.
- **D36 — Instrument tracks: name.** ✅ "Instrument track". Alt: "Note track", "Piano track", "Synth track".
- **D37 — Instrument tracks: editing.** ✅ Note names in the drum machine row plus a full piano roll (expanded row or separate panel). Alt: step grid only.
- **D38 — Notes per step.** ✅ Several (chords), each with its own length and velocity. Alt: monophonic, 303-style.
- **D39 — Sound sources in v1.** ✅ Tone.js synths and the keyboard sampler; smplr instruments soon after. Alt: synths only.
- **D40 — Note naming.** ✅ Middle C = C4; sharps or flats follow the key (E♭ in C minor, D♯ in E major). Alt: always sharps.
- **D41 — Key/scale.** ✅ Set for the project, with an optional per-page override; scale lock off by default. Alt: per track.
- **D42 — When to build instrument tracks.** ✅ Phase 5b, right after effects/mixer and before microphone recording. Alt: after the performance features.
- **D43 — Master scope source.** ✅ What you hear (after the master chain), excluding the metronome. Alt: before the master effects.
- **D44 — Recording start.** ✅ Next bar. Alt: next page, immediately.
- **D45 — Loop length.** ✅ Current page length; 1/2/4/8 bars selectable. Alt: free length, rounded to whole bars when you stop.
- **D46 — How overdubs are stored.** ✅ Separate layers on the track (mute/undo/merge). Alt: mixed into one sample straight away.
- **D47 — Monitoring.** ✅ On while armed, headphones recommended. Alt: off by default.
- **D48 — Free first loop (first recording sets the tempo).** ✅ Off (available as an option). Alt: on.
- **D49 — Panel full screen.** ✅ Both "maximize" (within the app) and "panel full screen" (the whole screen). Alt: maximize only.
- **D50 — Full-screen shortcuts.** ✅ App `Ctrl/Cmd+Shift+F`; maximize `Ctrl/Cmd+Shift+M` or double-click the tab; panel full screen `Ctrl/Cmd+Shift+Enter`; all can be changed.
- **D51 — Controls in full screen.** ✅ Floating, auto-hiding transport bar. Alt: none (keyboard only).
- **D52 — Responsiveness.** ✅ Container queries with compact/regular/large layouts per panel. Alt: one layout that only scales.
- **D53 — Devices.** ✅ Desktop/laptop first, tablets (touch) supported, phones out of scope. Alt: desktop only.
- **D54 — UI scale.** ✅ A setting from 80% to 150% plus compact/comfortable spacing. Alt: rely on browser zoom.
- **D55 — Drum machine visual style.** ✅ Hardware-inspired but flat (Push/Hapax look: dark surface, glowing pads in track colors, display + encoder strip, function buttons); no skeuomorphic textures; also works in light themes. Alt: a plain DAW-style grid.
- **D56 — Encoder strip.** ✅ A display + 8 encoders with SOUND/STEP/FX/MIX banks above the grid. Alt: parameters only in the Inspector.
- **D57 — Views.** ✅ Grid view (default) + Pad view (Push-style pads + steps of the selected track). Alt: grid only.
- **D58 — Function buttons.** ✅ A Hapax/Push-style button row that works as one-click actions and held modifiers, each with a keyboard shortcut. Alt: toolbar icons + context menus only.
- **D59 — Track colors.** ✅ Assigned automatically by sound category from a 16-color palette, editable. Alt: cycle through the palette in order.
- **D60 — Velocity display.** ✅ Pad brightness + an optional velocity lane. Alt: lane only.
- **D61 — Hardware controllers.** ✅ Later phase: native support for grid controllers (Novation Launchpad; Ableton Push 2/3 in user mode over Web MIDI) mirroring the pads, pad colors and encoders. Until then: generic MIDI learn. Alt: never.
- **D62 — Mockup technology.** ✅ The real stack (Vite + React + TS + Tailwind) so its components can be reused. Alt: a throwaway single HTML file.
- **D63 — Sound in the mockup.** ✅ None (look and feel only). Alt: a simple click per pad trigger.
- **D64 — Desktop app.** ✅ Not in v1: web app + installable PWA first; Electron as an optional Phase 10. (Electron doesn't make the audio faster, since it uses the same Chromium Web Audio engine. Its value is guaranteed mic permission, real folders/files, no storage eviction, and stage reliability.) Alt: Electron from Phase 0; Tauri (not recommended: it uses the system web engine, which on macOS is Safari's, without Web MIDI and with weaker audio support).
- **D65 — Platform layer.** ✅ From Phase 0, all platform-specific features go through `platform/` interfaces with a web implementation. Alt: call browser APIs directly.
- **D66 — Held function buttons with a mouse.** A mouse has one pointer, so "hold MUTE + click a track" only works with multi-touch or keyboard holds (e.g. hold `M`). ✅ Keyboard holds + multi-touch; mouse users use the direct controls (M/S buttons per row, Select tool, context menus). Alt: double-click a function button to latch it as a mode until clicked again or Esc.
- **D67 — TypeScript version.** ✅ TypeScript 6 for now, because typescript-eslint doesn't support TypeScript 7 yet; move to 7 when it does. Alt: TypeScript 7 for type-checking only, without type-aware linting.
- **D68 — Page change transition.** None: switching pages is instant (decided after trying a horizontal slide, which was distracting). Alt: slide.
- **D69 — Example songs.** Read-only and generated (never stored), so they can't be overwritten; the first edit makes a copy named "… (copy)" and the edit continues in it, undo included. They reproduce the grooves, tempos, keys and chord progressions; basslines and synth parts are written in the style of the originals, not copied note for note. Alt: editable examples.
- **D70 — In-app guide.** Markdown chapters in `src/help/chapters`, bundled with the app (works offline) and shown in a dockable Guide panel. Shortcuts are filled in from the command registry, so rebinding a key updates the guide; links can open panels or run commands. An e2e test checks that every anchor and shortcut reference resolves. Keep the chapters up to date when a panel or button changes. Alt: an external docs site.
- **D71 — Explain mode.** Controls carry `data-hint="<id>"`; the texts live in `src/help/hints/*.ts` (one file per area; knobs share `param.<track.params key>` and `fx.<Effect>.<param>` entries). One plain-DOM layer (`app/hintLayer.ts`, installed in every window including pop-outs) shows the card, parks native `title` tooltips while it does, falls back to the `title` for controls without a hint, and shows the live shortcut from the command registry. A unit test checks literal ids and guide anchors; an e2e test checks every hint rendered in the app. New controls need a hint. Alt: a tooltip component around every button.
- **D72 — Smooth resets.** Double-click (and "Reset to default") glides knobs, faders, drag values and the crossfader back with an ease-out over 300 ms × the distance (minimum 60 ms) via `components/glide.ts` on the shared frame loop. Grabbing the control stops it; stepped params jump; all frames are one undo step (`withUndoKey` in the store groups commits that don't name a key). MIDI and controllers set values directly. Alt: a fixed 300 ms.
- **D73 — Play mode in the project.** `Project.playMode` (schema v5; older projects open in Song, the new default). `setPlayMode` saves it without an undo step and keeps it through undo/redo of other edits; switching it in an example doesn't make a copy. Alt: UI state (reset to the default on every start).
- **D35 — Build order.** ✅ The phases in §7, starting with the mockup (Phase M), each ending with something you can play with.

---

## 7. Phased roadmap

Each phase ends with a working, testable build.

| Phase                          | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Outcome                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| **M. Drum machine mockup** ✅ done, approved | A clickable mockup of only the drum machine panel, built with the real stack (Vite + React + TS + Tailwind) and `just dev`, with fake data and no audio. Contains: header bar, page strip, display + encoder strip with bank switching, track rows (drum, instrument, audio), all step pad states, function buttons (incl. hold behavior), Grid/Pad view switch, an animated fake playhead with pad flashes and scopes, theme switcher (Studio Dark, light, one more), and a size switch (compact/regular/large) to check responsiveness. Interactions: toggle/paint pads, Shift-drag velocity, turn encoders, select/queue pages. Iterate on it together until the look is approved. The pad, encoder, button and theme-token components are designed to be kept for Phase 1. | Look & feel signed off before building the real thing. |
| **G. Version control** ✅ | `git init` with a `.gitignore` (already present), an initial commit of the plan + mockup, and a **private GitHub repository** created with `gh repo create … --private --source . --push`; afterwards, commit at the end of each phase/feature. Commits authored by Jeroen Janssens only. | The project is versioned and backed up on GitHub. |
| **0. Scaffold** ✅ | `justfile` (`just dev`, `check`, `test`, `e2e`, `build`, `preview`, `fmt`, `clean`), Vite + React + TS (dev server pinned to port 5173), `platform/` layer with web implementation, Tailwind/shadcn, Dockview shell, theme tokens + light/dark, app/panel full screen + maximize, container-query + canvas-resize foundations, UI scale, transport bar, audio-start overlay, Zustand store, Dexie, CI (lint/test)                                                                                                                                                                                                                                                                                                                                                              | Empty but polished IDE shell with themes and panels.   |
| **1. Core sequencer** ✅          | Drum machine look & feel (pads, track colors, header bar, track rows, function buttons, encoder strip), drum tracks, step grid, per-track step count/rate, velocity, BPM/tap tempo/swing, metronome, built-in synth kits, mute/solo/volume/pan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | You can make beats.                                    |
| **2. Projects** ✅                | Project home, autosave, undo/redo, `.rebeat` export/import, schema versioning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Work is safe and portable.                             |
| **3. Library** ✅                 | Import files/folders/zips, folders/tags/search, audition, waveform thumbnails, drag to track / new track, Inspector panel, online kit browser                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Your own sounds in the machine.                        |
| **4. Pages** ✅                   | Patterns, copy/clone/unlink, reorder, mini-map thumbnails, loop vs. song mode, queued page switching                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Song structure.                                        |
| **5. FX, mixer & scopes** ✅      | Effect factory, insert chains, sends, master chain, Mixer panel, per-track oscilloscopes + meters, Master Scope panel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Sounds finished; visual feedback.                      |
| **5b. Instrument tracks** ✅      | Instrument tracks, note names in the row, Piano Roll panel, Tone.js synths + keyboard sampler, smplr instruments, keyboard/MIDI note entry, key/scale, chord mode, arpeggiator                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Melodies, basslines and chords.                        |
| **6. Mic & audio tracks** ✅      | Mic manager (single permission, device dropdown), PCM recorder worklet, latency calibration, recording in the library, audio tracks with waveform, live loop recording while playing (quantized start, gapless loop, overdub layers, live undo), monitoring, time-stretch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Loop station.                                          |
| **7. Sample editor** ✅           | wavesurfer-based editor: trim/fades/gain/normalize/reverse/envelope/tune/loop points, slicing to tracks, rendered FX, BPM detection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Sound design.                                          |
| **8. Performance** ✅             | Scratch worklet + jog/platter, Performance panel, mute groups, fills, master perf FX, Web MIDI + MIDI learn, live pad recording                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Ready for the stage.                                   |
| **8b. Hardware controllers** ✅   | Launchpad / Push grid support mirroring pads, colors and encoders                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Play it with real pads.                                |
| **9. Polish & export** ✅         | WAV/stem/MIDI export, resampling, conditional trigs & parameter locks, PWA/offline, performance tuning, onboarding/templates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | v1.0.                                                  |
| **10. Desktop app (optional)** ✅ | Electron shell with an Electron implementation of the platform layer: permanent mic permission, real sample folders and project files, `.rebeat` file association, kiosk/stage mode, native menus, multi-window; code signing/notarization, auto-update, CI builds for macOS/Windows/Linux                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Rebeat as a desktop app.                               |

---

## 8. Risks

- **Audio timing and CPU** with many tracks and effects. Mitigation: send buses, lazily created effect nodes, worklets for heavy DSP, a CPU meter and track limit warning.
- **Recording latency** differs per device. Mitigation: a loopback calibration wizard and a manual offset setting.
- **Browser differences** (Safari: no Web MIDI, stricter permissions, autoplay rules). Mitigation: feature detection, clear messages, Chromium-first.
- **Storage eviction / quota** for large sample libraries. Mitigation: `storage.persist()`, quota display, export reminders.
- **Kit sample licensing.** Mitigation: synthesized built-in kits; online kits fetched by the user, not redistributed.
- **Scope.** This is a big product. Mitigation: the phased plan above, with every phase usable on its own.
