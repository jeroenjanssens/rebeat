# Cleanup: bugs, hot paths, lifetimes, dead code, duplication (§0.6t)

The plan for every finding in `REVIEW-2026-10-15.md` (references like R§1#3 point there). Nothing
here is meant to change what Rebeat does or how it sounds, except the bug fixes. Proposed
2026-10-15, not yet agreed: the open questions are at the end, each with a default.

## Ground rules

- **Branch**: work on `cleanup`, and merge into `main` only when asked (a push to `main` is a
  release).
- **One logical change per commit**, so any one can be reverted. Commit early and push the branch.
- **Verify** each commit with `pnpm prettier --write src e2e && pnpm tsc --noEmit && pnpm eslint .
&& pnpm vitest run`. Run the full Playwright suite (`--workers=4`) once at the end of each phase,
  not per commit.
- **The sound mustn't move.** The golden levels stay as recorded. A golden that moves in phases
  2–8 is a bug in the change, not a reason to re-record. The only exceptions are listed (P1.13,
  P7.12, if accepted), and their commits say so.
- **Tests**: existing tests aren't edited. Bugs whose logic is pure get a new unit test next to the
  code. Tests may have to follow a removed export (phase 5); if so, the commit says so.
- **Measure** the performance phases before and after (P0) and write the numbers in the commit
  messages.
- **Docs**: AGENTS.md (§8 gotchas, the repository map) and PLAN.md §0 follow along. Decisions that
  settle a question get D263 and onward.

---

## Phase 0: Baselines (no code changes)

| ID   | Task                                                                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0.1 | **Audio thread.** Render a dense synth patch for 10 s through `renderPatch` (16 voices, unison 8, drift on, output drive on, automation on 4 paths) in a throwaway Node script, and record the time. Also note the CPU meter's audio render load while playing Wood, Wire and Glass and Sweeps and Bends in the browser. |
| P0.2 | **React.** Profile with React DevTools. Record the renders per second while dragging a track knob in the drum machine, while toggling steps, and while playing Long Way Home with the Timeline, drum machine and Controller panels open.                                                                                 |
| P0.3 | **Startup.** Run `pnpm build` and record the size of the startup chunk, plus time to first render (the Performance tab, throttled 4× CPU). Add `rollup-plugin-visualizer` behind an env var (`ANALYZE=1`) to find the heavy imports.                                                                                     |
| P0.4 | **MIDI.** In a throwaway e2e spec, send 1,000 CC messages through `__midi` and time it with Settings closed and with Settings open.                                                                                                                                                                                      |

Keep the scripts out of the repo. Put the numbers in a `## Measurements` section at the end of
this file.

---

## Phase 1: Bugs

Each is its own commit, with a unit test where the logic is pure.

| ID    | Fix                                                                                                                                                                                                                                                                                                                                                  | Ref     | Test                                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| P1.1  | **Undo and redo aren't hands on knobs.** In `automationOverride.ts` and `recordAutomation.ts`, replace `s.past.length < prev.past.length` with `s.lastCommitTime === prev.lastCommitTime` (undo and redo don't set it; `editView` and `setPlayMode` don't either, and they move no knobs). Document the invariant at `lastCommitTime` in `store.ts`. | R§1#1   | Unit: commit a knob change on an automated target, undo, redo; the lane isn't overridden.                                 |
| P1.2  | **Redo keeps the 200 cap**: `past: [...past.slice(-199), project]` in `redo`.                                                                                                                                                                                                                                                                        | R§1#2   | Unit: 200 commits, undo, redo; `past.length` stays 200.                                                                   |
| P1.3  | **`lanePoints` caches follow patterns.** Store `patterns` in the `resolved` and `resolvedStepped` entries and compare it on a hit (`arrangement.ts:191–211`).                                                                                                                                                                                        | R§1#3   | Unit: change the first section's pattern step count; a point in the second section moves.                                 |
| P1.4  | **Tape stop doesn't stop the next play.** Keep the timer id in `perf.ts`. On `transport.play()` (an `onPlay` hook or a play-session counter checked in the timer), clear it and restore the delay and gain at once.                                                                                                                                  | R§1#4   | e2e (in phase 1's run): tape stop, Play within 0.5 s, still playing after 2 s.                                            |
| P1.5  | **Mic monitoring disconnects the old source**: `node.disconnect(…)` in `liveInput.ts:17`.                                                                                                                                                                                                                                                            | R§1#5   | None (needs a mic); checked by reading the code.                                                                          |
| P1.6  | **Mackie note-offs.** Swallow a note-off only when `MACKIE[m.number]` exists (`midi.ts:428`).                                                                                                                                                                                                                                                        | R§1#6   | e2e with `midiDevices(["MiniLab3 MCU"])`: note 60 on and off on the MCU port; nothing hangs (no live voice left).         |
| P1.7  | **`loadSample` retries.** Delete a `null` result from `loading`. Clear `loading` and `originals` in `deleteSample`.                                                                                                                                                                                                                                  | R§1#7   | Unit isn't practical (Dexie, decode); checked by reading.                                                                 |
| P1.8  | **Held keys end on stop and project loads.** In `keys.ts` `onPerformPanic`, end every entry in `down` (before `endLatched`). Add one `useStore.subscribe` on `projectId` that calls `releaseAllKeys()` and resets suggestion `history`, `chordPads`, `dialDown`/`dialUsed` and `auto.armed`. Clear `midi.ts`'s `held` on the same signal.            | R§1#13  | Unit where `keys.ts` can run in Node; otherwise e2e: hold a MIDI note, open another project, release; no error, no voice. |
| P1.9  | **Grid controllers forget unplugged devices** (`controllers.ts:123–135`): prune `connected` on `MIDIAccess.onstatechange` by output id. Guard `send` with a try/catch that drops the device.                                                                                                                                                         | R§4     | None (hardware); reading.                                                                                                 |
| P1.10 | **SysEx upgrade doesn't drop messages** (`midi.ts:211–246`): attach the new access's handlers first, then detach the old ones.                                                                                                                                                                                                                       | R§4     | None; reading.                                                                                                            |
| P1.11 | **Queued mute-group timers** clear on stop (`perf.ts:150–175`).                                                                                                                                                                                                                                                                                      | R§4     | e2e in the phase run.                                                                                                     |
| P1.12 | **Offline step conditions match playback** (`render.ts:54`, `cycle: r`). First write a unit test comparing the live cycle counting with the offline one for a song with repeats and clones and conditions `1:2`, `2:4`, `3:4`. Fix only if they differ: track the cumulative count per slot (or per pattern, whichever live does) in `render.ts`.    | R§4     | The test above.                                                                                                           |
| P1.13 | **Physical models are seeded offline**: call `seedPhysical` from the worklet's seed path (`worklet.ts`, next to the `Math.random` seed). This may move the goldens of songs with noise exciters (Wood, Wire and Glass; Gravel Road). If so, re-record those and say so in the commit (Q1).                                                           | R§4     | Golden levels.                                                                                                            |
| P1.14 | **Physical bodies sized from the data** (`physical.ts:167`): `Math.max(...Object.values(BODY_MODES).map(m => m.length))` biquads.                                                                                                                                                                                                                    | R§4     | Unit: the existing core tests still pass; a check that no body has more modes than biquads.                               |
| P1.15 | **Small crash guards**: `PianoRollPanel.tsx:373` (optional chaining, end the gesture); `store.ts:172–173` (`[0]?.id ?? ""`); `Keyboard.tsx:73–79` (release held notes when `low` changes).                                                                                                                                                           | R§4, §3 | None.                                                                                                                     |

End of phase 1: full Playwright run. Then update AGENTS.md §8 with the undo/redo invariant (P1.1)
and the project-load reset in `keys.ts` (P1.8).

---

## Phase 2: Lifetimes (things created and never released)

| ID   | Fix                                                                                                                                                                                                                                                                           | Ref    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| P2.1 | **Track removal in `reconcile`** cleans up everything per track: `disposeWarper(id)`, `scratches.get(id)?.node.disconnect()` + delete, `activeUntil`/`levelCache` entries. Make that block the one place where per-track runtime state dies, with a comment listing the maps. | R§1#12 |
| P2.2 | **Reverb's debounce** is disposed with the effect (`effects.ts:276–286`: `extra: [{ dispose: () => clearTimeout(timer) }]`).                                                                                                                                                  | R§1#15 |
| P2.3 | **`onPanic` returns an unsubscribe** (a `Set`, as `onChannel` does).                                                                                                                                                                                                          | R§4    |
| P2.4 | **`ticker.ts`**: post the interval once, when the worker starts.                                                                                                                                                                                                              | R§4    |
| P2.5 | **`node.ts` `panic()`** also drops queued `automate` messages and keeps only the latest `automateEnd`.                                                                                                                                                                        | R§4    |
| P2.6 | **Drags end on `pointercancel` and `lostpointercapture`**: `CurveLane.tsx`, `SectionsRow.tsx`, `RegionBox.tsx`. Write one small `dragListeners(el, move, up)` helper in `panels/timeline/`, used by the three (they're the only copies of this pattern).                      | R§4    |
| P2.7 | **Async frame loops stop on unmount**: `SoundsPrompt` (alive flag), `LibraryPanel.tsx:207–218` (cancel the rAF), `MiniLab3Svg.tsx:355` (clear flash timers on update).                                                                                                        | R§4    |
| P2.8 | **Online downloads have a cap** (`onlineImport.ts:16–29`): an LRU of 64 entries or 64 MB, whichever comes first. **Fetches time out** (`AbortSignal.timeout(15_000)`) in `onlineKits.ts` and `onlineImport.ts`, with a toast on failure.                                      | R§2    |
| P2.9 | **`lastMsgKey`** is keyed by type/channel/number only and stores the value with the time (`midi.ts:149–173`), so its size is bounded.                                                                                                                                         | R§2    |

End of phase 2: full Playwright run.

---

## Phase 3: The audio thread

All in `engine/synth/`. **The output must be identical**: add a unit test first (P3.0) that renders
a few factory patches and physical models through `SynthCore` with a fixed seed, and compares them
to a snapshot taken before the phase (a hash of the samples, per patch, stored in the test). Every
commit in this phase must keep it identical. Floating-point reordering (hoisting `1/tanh(k)`) may
change the last bits; if so, compare within 1e-6 instead of by hash.

| ID   | Change                                                                                                                                                                                                                                                                                                   | Ref    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| P3.0 | The output snapshot test described above.                                                                                                                                                                                                                                                                | —      |
| P3.1 | `EnvState.step`: inline `inc` (no closure).                                                                                                                                                                                                                                                              | R§1#10 |
| P3.2 | `render()`: per-voice scratch for `mono` (reuse `v.lastMono`), `needed`, `preGain`; `ORDER_012` constant; `drive` and `warpFm` as module functions; hoist `invTanhK` out of the sample loop.                                                                                                             | R§1#10 |
| P3.3 | `block()`: `glfo` into a preallocated `Float64Array(3)`.                                                                                                                                                                                                                                                 | R§1#10 |
| P3.4 | `control()`: precomputed destination indexes per oscillator and filter (`OSC_DEST[o].shape` → a `DEST_INDEX` number) instead of template strings.                                                                                                                                                        | R§1#10 |
| P3.5 | The event queue: a read index instead of `shift()`, compacted once per `process()`; insertion by binary search.                                                                                                                                                                                          | R§2    |
| P3.6 | Drift: a per-voice countdown instead of `Math.random()` every block. **This changes the random sequence**, so it changes output with drift on. Factory synths have no drift (house style), so the goldens shouldn't move. P3.0 needs a patch with drift excluded, or re-snapshotted in this commit only. | R§2    |
| P3.7 | Macro target paths: split once when the patch is set (a `keys` array kept beside the patch, not saved). Delete `setAt`'s global map.                                                                                                                                                                     | R§2    |

Measure P0.1 again and write both numbers in the last commit. End of phase 3: full Playwright run
(the goldens are the real check).

---

## Phase 4: The main thread (scheduler, MIDI, store)

| ID   | Change                                                                                                                                                                                                                                                                                                                        | Ref    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| P4.1 | **Knob lists cached by what they depend on** (`model/automation.ts: knobLists`): `trackKnobs` cached per track on `(track.sound, track.effects)` identity, bus and master lists on their `effects`, and the combined list rebuilt only when one part changed (compare the parts' arrays). A knob drag then reuses everything. | R§1#8  |
| P4.2 | **`watchOverrides` and `watchRecordAutomation` exit early** when nothing a lane can read changed (`tracks`, `buses`, `master` all identical, as with step edits).                                                                                                                                                             | R§2    |
| P4.3 | **MIDI per message**: delete `useMidi.last`; `MidiSettings` uses selectors; the monitor updates only while shown (a `monitorWatchers` count that MidiSettings and the Controller panel raise on mount), and at most once a frame.                                                                                             | R§1#11 |
| P4.4 | **Choke groups** built in `reconcile` (track id → group members), read by `playDrum` without the store.                                                                                                                                                                                                                       | R§2    |
| P4.5 | **`trackRegions`** cached on `project.regions` (WeakMap) and computed once per step.                                                                                                                                                                                                                                          | R§2    |
| P4.6 | **`isAudible`**: `anySolo` computed once per `playStep`.                                                                                                                                                                                                                                                                      | R§2    |
| P4.7 | **`S.voices` as a `Set`** (O(1) removal in `onended`).                                                                                                                                                                                                                                                                        | R§2    |
| P4.8 | **`nextBeatTime`/`nextBarTime`** loop backwards instead of copying `history`.                                                                                                                                                                                                                                                 | R§2    |
| P4.9 | **`timelineActions.automate()`**: one `editView` call.                                                                                                                                                                                                                                                                        | R§3    |

Measure P0.4 again. End of phase 4: full Playwright run.

---

## Phase 5: React and canvases

| ID    | Change                                                                                                                                                                                                                                                    | Ref   |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| P5.1  | **The 11 whole-store `useStore()` calls** become selectors (`useShallow` where several fields go together). One commit per panel.                                                                                                                         | R§1#9 |
| P5.2  | **Drum machine rows**: `TrackRow` gets the pattern fields it reads (step count, step size, swing, key) instead of `pattern`, is wrapped in `memo`, and `geo` is memoized in `TrackList`. Check with the profiler that a step toggle renders one row.      | R§2   |
| P5.3  | **Piano roll**: selectors for `bpm`, `timeSignature`, `key`.                                                                                                                                                                                              | R§2   |
| P5.4  | **Synth editor**: `useSwitchValue` resets on a new lane and writes nothing to state while the value holds (or writes a `data-` attribute from the frame callback); stable `live` callbacks per destination; `useMemo` in `ShapePicker` and `WavePreview`. | R§2   |
| P5.5  | **Timeline**: memoize `CurveLane`'s path; pass `resolved` instead of a `curve` closure; group lanes by owner once per render in `TrackRows`.                                                                                                              | R§2   |
| P5.6  | **Controller picture**: cache the elements once at mount in `MiniLab3Svg`.                                                                                                                                                                                | R§2   |
| P5.7  | **Beatbox**: `RecordingStatus` writes its label from `onFrame` into a ref; `RecordingRow` reads `voices` in the menu callback.                                                                                                                            | R§2   |
| P5.8  | **`SoundSection`** polls `instrumentState` only until loaded, and sets state only when the status changes.                                                                                                                                                | R§2   |
| P5.9  | **Frame loops onto `onFrame`**: `PerformancePanel.tsx:300`, `BeatboxPanel.tsx:432`. Leave the sample editor's WaveSurfer loop, with a comment.                                                                                                            | R§2   |
| P5.10 | **`MasterScopePanel`**: draw from `onFrame` only, and fix the misplaced `eslint-disable`.                                                                                                                                                                 | R§5   |

Measure P0.2 again. Do a screenshot check of the drum machine, the timeline, the synth editor
(Basic and Advanced) and the Controller panel. End of phase 5: full Playwright run.

---

## Phase 6: Dead code

One commit, or one per area if the diff gets large. Before deleting each symbol, check with `rg -w`
that `e2e/` and `window.__rebeat` (`main.tsx`) don't use it.

- Delete the unused exports listed in R§5 (`usePanelId`, `frameLoad`, `themeVersion`,
  `catalogEntry`, `modelLoaded`, `replaceInProject`, `setPlayableAllSamples`, `getBrowseIndex`,
  `moveTempoChange`, `deleteTempoChange`, `movePoint`, `setPath`, `patternsInOrder`, `inScale` +
  `KEY_ROOT` + `SCALE_MINOR`, `isHits`/`isNotes`/`isClip`/`familyOf`, `SHOWCASE_PHRASES`,
  `setMetronomeVolume`, `getBus`, `masterInput`, `onChannel`, `scratch`, `onScheduleStep`,
  `isCountingIn`). `disposeWarper` and `seedPhysical` stay: phases 1 and 2 use them.
- `useMidi.last` (if not already gone in P4.3); the orphan comment in `keys.ts:1462`; the
  `export` on `SynthEditorPanel`'s `hintFor` (renamed `pathHint`); the double `lucide-react`
  import in `LibraryPanel.tsx`; the `overrides` memo dependency in `GuidePanel.tsx` (after
  checking that rebinding a shortcut still updates the guide).
- `Step.locked` (Q2): delete the field from `types.ts` and strip it in `normalizeProject`.
- Exports used only in their own file (~150): leave them; drop the `export` when a file is
  touched for another reason.

End of phase 6: full Playwright run.

---

## Phase 7: Duplication

One commit per helper, each changing no behavior. The proposed homes are all existing modules.
Modules the worklet imports stay free of `window` and `structuredClone`.

| ID    | Helper                | Home                                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----- | --------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P7.1  | `clone` (JSON)        | export from `model/synth.ts`              | Replaces `synthV1.ts:9` and the ~20 inline copies; `cloneDraft` inside recipes; `structuredClone` stays where it's already used outside recipes and worklets.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| P7.2  | Patch path get/set    | `model/synth.ts` (`numberAt`/`setNumber`) | Delete `patchParams.ts`' `getPath`/`setPath` and `core.ts`' `setKeys`/`setAt` (after P3.7, which gives the worklet split keys).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| P7.3  | `clamp`               | `model/params.ts`                         | The 8 private definitions only; inline `Math.min(Math.max())` converted only where a file is touched anyway.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| P7.4  | `sha256`, `AUDIO_EXT` | `library/library.ts`                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| P7.5  | Mono mixdown          | `library/beatbox/resample.ts: mono`       | `analysis.ts` and `pitch.ts` call it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P7.6  | `midiToHz`            | `model/notes.ts`                          | `instruments.ts`, `core.ts`, `physical.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| P7.7  | `useElementSize`      | `render/useElementSize.ts`                | Mixer, library, piano roll, drum machine layout.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P7.8  | `formatSeconds`       | `model/tempo.ts`                          | Timeline geometry and library rows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| P7.9  | Hann window cache     | `library/fft.ts`                          | `onsets.ts` keeps its own if sharing it would change the parity fixtures. Check `onsets.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| P7.10 | `uid` for new records | `model/id.ts`                             | Beatbox records and MIDI mappings; existing ids stay.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P7.11 | Small local copies    | in place                                  | `isMackie` in MidiSettings; MiniLab `sendPadColor`; `chips` from `sectionMenu`; `macroDef`; `NoController`; `nextLinkColor`; `swingFactor`; `clampBpm` in `schema.ts`; `FADER_UNITY` + the dB law from `params.ts`; `resizeNotes` → `resizeNotesFree`; `cropRange` deleted; the `synthControl`/`sustainPedal` wrappers inlined; `lastReported` replaced by a return value; `channel.ts` `release` without `bpm`; the `laneLength` re-export; `keysPlaySynth` collapsed; `knobLabels` with its modes passed in; `isDefault` by keys; one `TextEncoder` in `midiFile.ts`; the cast in `displayFeed.ts:195`; `midi/learn.ts` (Q4). |
| P7.12 | Template builders     | `templates/builder.ts`                    | `index.ts` uses `emptyProject`, `drum`, `page`; `NoteList`, `perBar`, `bars` move to the builder. The `o` velocity differs (Q3): keep the old value through an option so the goldens don't move.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P7.13 | Note-name tables      | `model/notes.ts`                          | Q5: either `chords.ts` uses `pitchClassName`, or a comment says why its spellings differ.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

End of phase 7: full Playwright run.

---

## Phase 8: Splitting the big files

| ID   | Split                                                                                                                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P8.1 | `panels/synth-editor/SynthEditorPanel.tsx` → `switches.tsx` (the switch atoms and `useSwitchValue`), `matrix.tsx` (`Matrix`, `Macros`, `TargetSelect`, `newTarget`, `macroDef`), `basic.tsx` (`Basic`). The rest (routing, `EditorView` and its box closures) stays. Moves only; no edits in the same commit. |
| P8.2 | `audio-io/midi.ts`: the stepped keys knobs (`STEPPED` and their dispatch, `:550–645`) → `midi/keysKnobs.ts`, pure where it can be (state in, change out), with a unit test of the zones.                                                                                                                      |
| P8.3 | `state/keys.ts`: only if Q6 says so. Seams: chord pads and Key mode; suggestions and history; Auto. Each new module owns its reset from P1.8.                                                                                                                                                                 |

Update AGENTS.md §3 (the repository map). End of phase 8: full Playwright run.

---

## Phase 9: Startup and library I/O

| ID   | Change                                                                                                                                                                                                                                                                                                                                                                                                                  | Ref    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| P9.1 | **Dialogs lazily**: `ExportDialog`, `WavetableDialog`, `ProjectBrowser` (and the rest if it's free) through `React.lazy`, as `panels.tsx` does.                                                                                                                                                                                                                                                                         | R§2    |
| P9.2 | **Templates lazily** in `defaultCommands.ts` (dynamic imports in the commands that use them).                                                                                                                                                                                                                                                                                                                           | R§2    |
| P9.3 | **Factory synths off the startup path.** Find out with the visualizer what pulls in `library/synths.ts` at startup (`engine/instruments.ts`, the library list, `playable.ts`). Split what's needed early (ids, names, groups) from the specs, or import the specs where a voice is created. This is the biggest and riskiest part of the phase, so it's its own commit, with an e2e run of the library and synth tests. | R§2    |
| P9.4 | **`chunkSizeWarningLimit`** back down to what the split chunks need.                                                                                                                                                                                                                                                                                                                                                    | R§2    |
| P9.5 | **The sample table isn't re-read after every edit** (`library.ts: refresh`): mutations update their records in state; `saveVersion` refreshes once; full reads only for bulk operations.                                                                                                                                                                                                                                | R§2    |
| P9.6 | **`samplesInUse`** reads sample ids from the raw project JSON, without migrating.                                                                                                                                                                                                                                                                                                                                       | R§2    |
| P9.7 | **Batched IndexedDB writes**: `removeFolder` and `removeVoice` use `bulkPut`, then update state once.                                                                                                                                                                                                                                                                                                                   | R§2    |
| P9.8 | **Beatbox resampling off the main thread** (Q7): the same `resample.ts` code in a worker (identical output, so the parity fixtures hold).                                                                                                                                                                                                                                                                               | R§2    |
| P9.9 | **Your sounds flush on unload**: a `flushSounds()` in `userInstruments.ts`, called from the `onBeforeUnload` handler in `projects.ts`.                                                                                                                                                                                                                                                                                  | R§1#14 |

Measure P0.3 again. End of phase 9: full Playwright run.

---

## Phase 10: Errors you can see, and small robustness

| ID    | Change                                                                                                                                                                                                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P10.1 | The beatbox model failing to load shows in the Model view, with the reason, instead of `catch(() => {})`.                                                                                                         |
| P10.2 | The last project failing to reopen shows a toast.                                                                                                                                                                 |
| P10.3 | The service worker's update failure is logged with `console.warn`.                                                                                                                                                |
| P10.4 | Pitch bend parsed once to −1..1 in `parse` (`midi.ts:347`), and used downstream instead of re-reading the bytes. Update the monitor text to match.                                                                |
| P10.5 | `looper.ts:148` uses the tempo the take was recorded at, not `project.bpm`.                                                                                                                                       |
| P10.6 | Electron IPC handlers check `e.senderFrame.url.startsWith("rebeat://")`.                                                                                                                                          |
| P10.7 | `keys.ts`: drop the `?.` on `useStore.subscribe`, or comment why only that one needs it.                                                                                                                          |
| P10.8 | The 22 `exhaustive-deps` suppressions each get a reason. Fix the ones in `ConvertView.tsx`, `BeatboxPanel.tsx` and `CurveLane.tsx` that turn out to be missing a dependency. Remove the one in `Timeline.tsx:65`. |

New hints or guide text are needed only for P10.1 (the Model view's message). End of phase 10:
full Playwright run.

---

## Phase 11: Tooling

| ID    | Change                                                                                                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P11.1 | ESLint: `@typescript-eslint/no-floating-promises` (error; type-aware linting for `src/`). Fix what it finds: a `void` where ignoring is deliberate, a `catch` where it isn't. |
| P11.2 | ESLint: `@typescript-eslint/no-explicit-any` (warn).                                                                                                                          |
| P11.3 | A typed `rawParam` helper in `engine/effects.ts` for the Tone ↔ Web Audio casts (8 there of the 31 `as unknown as`).                                                          |
| P11.4 | `noUncheckedIndexedAccess` (Q8): default is to skip it.                                                                                                                       |
| P11.5 | `package.json`: runtime libraries into `dependencies`; drop the explicit `workbox-window`. Check that `just desktop-build` still packages the same files.                     |
| P11.6 | Keep the visualizer from P0.3 behind `ANALYZE=1`, and add it to the commands table in AGENTS.md §2.                                                                           |

End of phase 11: full Playwright run.

---

## Wrapping up

- PLAN.md §0: a §0.6t entry with what was done, and the measurements before and after.
- AGENTS.md: the repository map (new files from phases 7–8), §8 gotchas (undo/redo invariant,
  per-track cleanup in `reconcile`, the knob-list cache keys, the MIDI monitor only while shown,
  the synth output snapshot test), and the status line.
- Delete `REVIEW-2026-10-15.md`, or keep it beside this plan as the record (Q9).
- Ask before merging `cleanup` into `main`.

## Open questions (with defaults)

| Q   | Question                                                                                                                                                       | Default                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Q1  | Seeding physical models offline (P1.13) may move the goldens of songs with noise exciters. Accept re-recording?                                                | Yes, in that one commit, saying why.                                                                          |
| Q2  | Remove `Step.locked` without a schema bump? Nothing reads it, and stripping it in `normalizeProject` loses nothing.                                            | Yes, no bump (the saved shape only loses an ignored field).                                                   |
| Q3  | `templates/index.ts` plays `o` at a different velocity than `builder.ts`'s `drum`. Keep the old sound?                                                         | Keep it (an option on `drum`), so the goldens don't move.                                                     |
| Q4  | `midi/learn.ts` only forwards to `audio-io/midi.ts`. Delete it, or make `midi/` the one public face?                                                           | Delete it; callers import `startLearn` (renamed `startMidiLearn`) from `audio-io/midi.ts`.                    |
| Q5  | Chord names spell some notes with sharps and others with flats regardless of key. Should they follow the key?                                                  | Follow the key (`pitchClassName`), as note names do. A small visible change, checked in the guide's pictures. |
| Q6  | Split `state/keys.ts`?                                                                                                                                         | No. The resets (P1.8) were the real problem; split only if it keeps growing.                                  |
| Q7  | Beatbox resampling: a worker with the same code, or `OfflineAudioContext` (faster, but different output, so the model would need retraining or parity checks)? | A worker with the same code.                                                                                  |
| Q8  | Turn on `noUncheckedIndexedAccess`?                                                                                                                            | No: hundreds of lines for little gain; the crash guards in P1.15 cover the known cases.                       |
| Q9  | Keep `REVIEW-2026-10-15.md` in the repo after the work?                                                                                                        | Keep it next to this plan, as the other `PLAN-*.md` files are kept.                                           |

## Measurements

(Filled in during phases 0, 3, 4, 5 and 9.)

## Deviations

(Filled in while building.)
