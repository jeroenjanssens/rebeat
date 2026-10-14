# Plan: bends per note, every synth knob and switch automatable, stepped lanes, folding lanes, selecting and moving many points

Status: agreed 2026-10-14 (Jeroen: the default answers, plus stepped lanes for every discrete
setting, a rectangle across lanes, two more bend shapes, a demo song), not built. Decisions
D220–D240.
How we work: on `main`, commit early and often, e2e once at the end of the batch.

Six parts:

1. **Bends per note** (§1): a Bend card in the Controller panel, seven shapes, recorded with the
   notes; synths only for now.
2. **Every synth knob on the timeline** (§2).
3. **Stepped lanes** (§3): on/off, choices and whole numbers (effect On, filter type, LFO shape,
   voice mode, the mod matrix's routing…) as staircases without eases.
4. **Folding lanes** (§4).
5. **Selecting and moving many points** (§5): a rectangle across lanes, dragging a selection.
6. **A demo song** (§6) for synth automation, stepped lanes and bends.

The build order (§9) starts with the synth's automation path (§2.3), which parts 1–3 build on.

---

## 0. Where it starts (the code today)

- **Bend** is one value per synth: `Controls.pitchbend` (−1..1) × `voice.bend` semitones, added to
  every voice's pitch on each control block of 16 samples (`engine/synth/core.ts: control`,
  `base = v.pitch + mod("pitch") + pitchbend * bend + tune`). The MiniLab 3's pitch strip sends it
  (`midi/controllers.ts`), `state/keys.ts: keysControl` hands it to the keys' synth. It isn't
  recorded (D84). Sampled instruments ignore it.
- **Play styles** (D149–D154) are settings (`playStyle` in `state/settings.ts`, the model in
  `model/perform.ts`), run by `state/perform.ts`, shown as cards in the Controller panel
  (`panels/controller/PlayStyles.tsx`, `Card.tsx`). They're recorded as their result (D155: the
  notes as played).
- **Notes** are `Note { pitch, length, velocity, slide?, offset? }` (schema 9). The transport plays
  them through `InstrumentVoice.play(notes, time, stepDur)` → `WorkletSynth.play` → an `on` and
  an `off` message per note. Held keys go through `engine.holdNote(track, pitch, vel, at)` →
  `WorkletSynth.hold`.
- **Automatable knobs** are `model/automation.ts: trackKnobs`: Level, the mix knobs, the effects'
  knobs and their On (D207), and for a synth track its 8 macros (`sound.macroN`). The synth
  editor's own knobs have MIDI-learn targets `track:<id>:synth:<path>` (`patchParams.ts`,
  `ALL_PARAMS`, about 97 knobs) but can't be automated. Its switches and menus (filter type, LFO
  shape, voice mode, the matrix) have no target at all.
- **Discrete knobs are drawn as curves.** A `ParamDef` with `steps` (an effect's On, Bitcrusher
  Bits, Delay Time, Pump Rate, Utility Phase…) gets the same lane as any knob: points anywhere
  between the steps, eases, a sloped line from Off to On. The engine rounds (On flips where the
  line crosses the middle), so what you see isn't what you hear.
- **Macro automation** goes as `automate` messages with all eight values
  (`engine.automateTarget`). Each one makes the worklet run `setPatch`, which clones the patch
  through JSON twice (`withMacroValues`, `applyMacros`). That's why macros get 4 samples per step
  and one per straight stretch (`automationStep`), and why it wouldn't scale to dozens of lanes.
- **The timeline** draws a track row, then its lanes (`TrackRows.tsx: Lanes`, `LANE_H = 44`),
  always open. The tracks shown are `timelineTracks: "all" | "used" | "none"`.
- **Points**: `ui.pointSelection = { lane, indexes }`, one lane. Shift+click adds to it, a drag on
  empty space draws a rectangle that selects the points in it (within that one lane; a plain click
  adds a point instead), Delete deletes all of them, the menu acts on all of them, but a drag
  moves only the point grabbed (`CurveLane.startDrag` → `movePoint`). `movePointsBy` (time only)
  exists for the table.

---

## 1. Bends per note (D220–D225)

### 1.1 What a bend is (D220)

A bend is a short pitch movement that belongs to one note: it starts with the note (or its
release), runs its course, and ends with it. Seven shapes:

| Shape     | What you hear                                                                 | Defaults        | Typical use            |
| --------- | ----------------------------------------------------------------------------- | --------------- | ---------------------- |
| **Scoop** | starts `amount` below (or above) the note and slides into it                  | −2 st, 120 ms   | vocal, sax, synth lead |
| **Fall**  | at the release, drops `amount` away while it fades                            | −5 st, 300 ms   | brass, guitar fall-off |
| **Doit**  | at the release, a quick flick up                                              | +3 st, 80 ms    | brass, funk stabs      |
| **Dip**   | after the delay, down by `amount` and back                                    | −1 st, 200 ms   | a "wah" in a lead      |
| **Rise**  | after the delay, climbs `amount` and stays there                              | +12 st, 1 bar   | builds, risers         |
| **Next**  | after the delay, bends to the next note **in the key** (up or down) and stays | +1 note, 150 ms | guitar bends, blues    |
| **Shake** | after the delay, a vibrato that grows to `amount` (the build-up)              | ±0.3 st, 5.5 Hz | held notes, strings    |

- **Next** counts in notes of the key (`project.key`, the pattern's `keyOverride`, the section's
  transpose): +1 from E in C major is F (a half step), from F is G (a whole step); +2 is two notes
  of the key. A note outside the key goes to the nearest note of the key in that direction. With
  no key set, it counts in semitones.
- **The 303 slide** (`Note.slide`, D89) stays what it is: gliding into the next note on a mono
  synth. It isn't a bend shape.

Saved on the note as

```ts
interface NoteBend {
  shape: "scoop" | "fall" | "doit" | "dip" | "rise" | "next" | "shake";
  /** Semitones, −24..24 (the sign is the direction). Next is saved resolved, in semitones, so a
   *  later key change doesn't change a recorded bend. */
  amount: number;
  /** How long the movement takes; and how long the note waits before it starts. */
  time: number;
  delay: number;
  /** "s": seconds; "q": quarter notes (follows the tempo). */
  unit: "s" | "q";
  /** The movement's ease (model/ease.ts), Linear when absent. */
  ease?: Ease;
  /** Shake: vibrato rate, Hz (unit "s") or cycles per quarter (unit "q"). */
  rate?: number;
}
// Note.bend?: NoteBend
```

The card's other settings (which notes, chance, velocity) decide **whether and how much** a note
bends when it's played; the note keeps only the result. So a recorded note sounds the same every
time, like slop's recorded timing (D155).

**Fall and Doit extend the note** (D221, agreed): when a note with one is released, it keeps its
gate for the bend's delay + time, then releases. Otherwise a short amp release would swallow it.
Its length in the piano roll doesn't change; the piano roll draws the bend as a tail after it.

### 1.2 The Bend card (D222)

A card in the Controller panel, after Play, with an On switch like the others:

```
┌ Bend ─────────────────────────────────────── [On] ┐
│ Shape   [Scoop][Fall][Doit][Dip][Rise][Next][Shake]│
│ Amount  ◯ −2.0 st      Time  ◯ 120 ms  [♩]        │
│ Delay   ◯ 0 ms         Curve [Smooth ▾]           │
│ Rate    ◯ 5.5 Hz   (Shake only)                   │
│ Notes   [All][Top][Bass][Newest]                  │
│ Chance  ◯ 100%         Velocity ◯ 0               │
│ Strip   [Whole synth][Newest note]  (MiniLab)     │
│ (synths only: the keys play Grand Piano)          │
└───────────────────────────────────────────────────┘
```

- **Each shape keeps its own values**: switching from Scoop to Fall shows Fall's amount and time
  (the defaults above until you change them), so trying shapes doesn't wreck the one you set up.
- **Amount** is in semitones (0.1 steps), for Next in notes of the key (whole numbers).
- **Time and Delay** show ms, or beat values (1/32 … 1 bar) when ♩ (sync) is on.
- **Curve** is the ease picker from the automation table (D196): Linear, Smooth, Exponential…
- **Notes**: which notes of what you play bend. All; the top note of a chord; the bass; or only
  the newest note (the others keep their pitch). Single notes always count as top and bass.
- **Chance**: how many notes bend (random per note; 100% = all).
- **Velocity** (−1..1): harder notes bend more (positive) or less (negative). At 0, every note
  bends by Amount.
- **Strip** (shown when a MiniLab 3 map is on): the pitch strip bends the whole synth (as now) or
  only the newest note that's still held. See §1.6.
- A note under the card says when the keys don't play a synth: the card's settings stay, nothing
  bends.

Settings, not project data: `playStyle.bend` in `model/perform.ts` (`{ on, shape, shapes:
Record<shape, values>, notes, chance, velocity, strip }`, with `sanitizePlayStyle`), so the card is
the same in every project, like strum and slop. The card's knobs get explain-mode hints and
MIDI-learn targets (`perf:bend.amount`, `perf:bend.shape`…), so a controller knob can move Amount
live and a pad can switch the shape.

### 1.3 Playing a bend (D223)

- **In the worklet** (`core.ts`): each `Voice` gets a `bend` state (shape, amount, start frame,
  time, delay, ease, rate, released-at). `control()` adds `bendAt(v, frame)` semitones to `base`.
  That's a few multiplications per voice per 16 samples: no measurable cost. Beat units are turned
  into seconds with the synth's tempo (`this.bpm`, which tempo changes already keep current, D192).
- **Messages**: `on` gets an optional `bend`; `off` for a voice with a Fall or Doit starts the bend
  and schedules the real release after it (in the core, so offline renders do the same).
- **Mono and legato**: a voice that glides to a new note (legato, a 303 slide) takes the new
  note's bend from the moment it starts; no new attack.
- **The mod matrix's `pitchbend` source** stays the wheel/strip value; per-note bends aren't a
  matrix source (later, if wanted).
- **Plumbing**: `holdNote(track, pitch, vel, at, bend?)`, `InstrumentVoice.hold(…, bend?)`,
  `WorkletSynth.hold/play` pass it on. Sampled instruments ignore it (for now, §1.7).
- **Where the keys decide**: `state/keys.ts: startNote` asks `model/perform.ts: bendFor(style,
note, chord, velocity, key, random)` for the note's bend (or none; Next resolved to semitones
  here), passes it to `holdNote`, and to `recordNoteOn`. Notes started by `state/perform.ts`
  (strum, slop, the arp, patterns) go through the same function, so an arpeggio's notes can each
  scoop.
- **The sequencer**: notes with `bend` play it (`transport` → `voice.play`). The card doesn't
  touch notes that are already in a pattern.

### 1.4 Recording (D224)

- `recordNoteOn(track, pitch, vel, { at, spread, bend })` writes the bend into the note it adds
  (both Snap on and Snap off, and in step entry while stopped).
- A Fall or Doit is recorded on the note too; the note's length is how long you held it (the
  bend plays after it, §1.1).
- **Schema 12**: `Note.bend?` (optional; no migration of old notes, only the version bump and a
  test that a v11 project loads unchanged; `normalizeProject` drops a malformed bend).
- `.rebeat` files carry it as part of the project. **MIDI file export** can't say "this note
  bends" without MPE: bends are left out, and the export dialog says so when a track has any
  (later: MPE export, or pitch-bend events on monophonic tracks).

### 1.5 Seeing and editing bends

- **Piano roll**: a note with a bend draws its shape as a thin line over the note (Scoop
  bottom-left into the note, Fall and Doit as a tail after it, Next as a step up, Shake as a
  wave). Its right-click menu gets **Bend ▸** (the seven shapes with the card's current values,
  Edit…, None), acting on the selected notes. Edit… opens a small popover with the same knobs as
  the card.
- **Step entry and the Inspector**: the selected step's notes show "Bend: Scoop −2 st, 120 ms" with
  a clear button.
- Copy/paste, transpose, quantize and the note operations in `model/noteOps.ts` keep `bend`.

### 1.6 The strip on one note (D225)

With **Strip: Newest note**, the MiniLab's pitch strip (pitch-bend messages from it) bends only
the newest held note: a `voiceControl` message (voice id, pitchbend) instead of `control`. The
other held notes stay put, which is the guitar-like "bend one string of a chord".

- Live only in this batch (agreed): the strip's movement isn't recorded. Recording it needs bend
  points on the note (a small curve per note), later.
- When the newest note is released, the strip goes back to bending nothing until the next note.

### 1.7 Sampled instruments (later)

They don't bend at all today. Per-note bends there mean the `detune` of each note's source node;
cheap, but smplr and Tone's Sampler don't hand out the source per note, so it needs a look into
both. The card says "synths only" until then.

---

## 2. Every synth knob on the timeline (D226–D228)

### 2.1 Feasibility

Yes. The synth core reads almost every value from the patch on every 16-sample control block
(oscillator shape, width, levels, pans, tuning, unison detune and width, filters, envelope times
and levels, LFO rates and delays, sub, noise, ring, FM, glide, tune, drive, volume, pan, spread,
the matrix). Automating a knob means changing that value between blocks, which the core already
does for the mod matrix. The work is in delivering the values cheaply (§2.3) and listing them
(§2.2).

### 2.2 Which knobs, and what each does when automated (D226)

| Kind                        | Knobs                                                                                                                                                                                                                                                                    | Automated                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| **Smooth** (most of them)   | osc Shape (it morphs), Width, Level, Pan, Fine, Detune, Stereo width, Drift; filter Cutoff, Reso, Drive, Env, Key, Vel; envelope times, Sustain, curves; LFO Rate, Delay; Sub, Noise, Ring, FM; Glide, Tune; output Drive, Volume, Pan, Spread; **the matrix's amounts** | glide smoothly, at the control rate (no zipper noise)                                             |
| **Stepped** (§3)            | osc Octave, Semi, Unison; Voices; Bend range; and every switch and menu (§3.3)                                                                                                                                                                                           | a staircase lane, no eases; changes at the point                                                  |
| **Read when a note starts** | osc Phase, envelope Vel, LFO Phase (per-voice LFOs), Vel curve; and a few switches (§3.3)                                                                                                                                                                                | allowed; they change the next notes, not the sounding ones (the picker says "from the next note") |
| **Not automatable**         | LFO Phase of a **global** LFO                                                                                                                                                                                                                                            | greyed in the picker: "A global LFO's phase is only set when the synth starts"                    |

The matrix's amounts get paths `matrix.<n>.amount` (−1..1) with a `PatchParam` each, so they're
also MIDI-learnable, and the editor's amount fields get the knob menu (Automate, MIDI learn).

**Macros and knobs on the same value** (D227, agreed): a macro sets its targets absolutely (D85).
When a knob is automated and a macro moves it too, **automation wins** on that knob while it
plays; the macro still moves its other targets. The mod matrix stays on top of both (an LFO still
wobbles an automated cutoff). The picker marks such knobs: "Brightness (macro 1) moves this too;
its lane decides while it plays."

### 2.3 How the values get to the worklet (D228)

The macro path doesn't scale (two JSON clones per event). New, for macros, knobs and switches:

- `WorkletSynth.automate(path, events)` sends one `automate` message per lane per step:
  `{ path, events: { t, v, ramp }[] }` in real units (the main thread converts knob positions with
  `fromKnob(paramOf(path))`, switches to their option, §3.3; macros stay 0..1). The same
  `curveEvents` as AudioParams, so eases and jumps are identical.
- The core keeps a small segment queue per automated path and, on each control block, writes the
  current value **in place** into its working patch (`setNumber`, or the option for a switch),
  after the macros and before the matrix. No clones while playing; `applyMacros` reruns only when
  a macro value changes, and then on a reused working copy instead of a fresh clone.
- Linear ramps are done in the worklet (per block), so macros no longer need extra samples on
  straight stretches (`automationStep`'s `macro ? 4 : 8, macro ? 1 : 0` goes away); eased
  stretches keep 8 samples per step.
- `releaseAutomation()` sends `automate` with no paths: the working patch goes back to the knobs.
  `panic()` clears it too.
- Offline renders get the messages in `processorOptions` as today (D92), so exports match.

### 2.4 Lists, picker, knob menus

- `trackKnobs(track)` adds the synth editor's knobs and switches for synth tracks: section
  **"Synth"**, with a `part` (Osc 1, Osc 2, Osc 3, Sources, Filter 1, Filter 2, Amp env, Filter
  env, Mod env, LFO 1–3, Matrix, Voice, Output) from `patchParams.SECTIONS`. Labels as in MIDI
  learn (`Lead · Osc 1 Shape`, `Lead · Filter 1 Type`, `Lead · Slot 3 Destination`).
- `KnobPicker` shows Synth's parts as folding sub-groups, like effects (D208), closed by default;
  search finds them. Stepped ones show a small ▭ staircase icon.
- `knobValue` reads `track:<id>:synth:<path>` as the knob's own position (`toKnob(def,
getPath(trackPatch(track), path))`, or the switch's option index, §3.3), not the macro-moved
  value, so the override watcher (D191) sees a hand on the knob.
- The synth editor's knobs already carry these targets, so they get **Automate** in their menus,
  the "A" mark and the live dot without new code (`automationKnob.ts`). Its switches and menus get
  the same: a right-click menu (Automate, MIDI learn), the "A" mark, and while the song plays they
  show the automated choice. Library synth tabs (`synth-editor:lib:…`) have no track in the
  project and offer nothing.
- A forked factory synth (D90) keeps its lanes: the target is the track, not the preset.
- **Speed**: `automatableKnobs(project)` is rebuilt on every `knobFor` call; with ten synth
  tracks that's about 1,500 entries per call (knobs and switches), called for every lane on every
  render and in the override watcher on every commit. Cache it per project object (a WeakMap,
  skipping immer drafts like `arrangement.ts` does), and cache `trackPatch` per sound.

---

## 3. Stepped lanes (D229–D232)

### 3.1 What a stepped lane is (D229)

A lane is **stepped** when its knob has a fixed number of values: an on/off, a choice (filter
type, LFO shape, voice mode…) or a whole number (octave, unison, bits). The rule is the knob's own
definition: a `ParamDef` with `steps` (`steps: 2` is an on/off), so it covers the effects, the mix
and the synth alike, today's and future ones.

- **Drawn as a staircase**: each point holds its value until the next point, where the line jumps
  straight up or down. No slopes, ever.
- **Bands and labels**: the lane is cut into one band per value, with the value names at the left
  edge ("Off / On", "LP · HP · BP · Notch", "Sine · Tri · Saw…"). With more than 8 values (the
  matrix's 30 destinations, Bits 1–16) only every few names are written, and the hovered band's
  name shows next to the cursor.
- **Points snap to the bands**: a click adds a point in the band under the cursor, a drag moves a
  point from band to band (time still follows the grid, Shift frees it), typed values in the table
  pick a value by name or number ("HP", "on", "3"). The readout and the point's tooltip say the
  name.
- **On/off lanes** draw the On stretches as filled bars (like a clip on a track) instead of a thin
  line, so a song's on/off pattern reads at a glance.

### 3.2 No eases (D230)

A stepped lane's points can't be eased: the value changes at the point and holds.

- The point menu has no Ease in / Ease out; the Inspector's table hides the Ease columns and its
  picture for a stepped lane. On/off per point (D196) stays: a point that's off is skipped, so the
  value before it carries on.
- Saved eases on a stepped lane's points are ignored when it plays and dropped when one is edited
  (a lane moved to a stepped knob with "Pick another knob…" keeps its points, rounded to the
  bands).
- **The engine**: `curveEvents` for a stepped target gives one event per point, `ramp: false`, at
  the point's time (and the value at a jump into the song). AudioParams get `setValueAtTime`; the
  synth gets the value at that frame. A change that would click (a jump of an AudioParam that
  makes sound: an effect's On) keeps today's 3 ms crossfade (`JUMP`).
- **Old lanes on stepped knobs** (schema 12 migration): today an On lane flips where its line
  crosses the middle. The migration keeps that: it rounds every point to its band and adds a point
  where the old line crossed into another band, so a saved song sounds the same. A unit test plays
  both through `curveEvents` and compares. No example song has such a lane, so the golden levels
  don't move.

### 3.3 The synth's switches and menus (D231)

Every switch and menu of the synth editor becomes automatable as a stepped lane. They're listed in
a new table next to the knobs, `patchParams.ts: SWITCHES` (`{ path, label, options: { value,
label }[], help, when? }`), which also gives them MIDI learn (a pad can toggle Filter 1's type) and
explain-mode hints.

| Part      | Switches (values)                                                                                       | When it applies                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Osc 1–3   | On; Sync (osc 2, 3); Retrigger                                                                          | On and Sync at once; Retrigger from the next note                                   |
| Sources   | Sub octave (−1, −2), Sub shape (sine, square); Noise color (white, pink); FM route (2>1, 3>1, 3>2, 1>1) | at once                                                                             |
| Filters   | On; Model (ladder, SVF); Type (LP, HP, BP, Notch; SVF only); Routing (serial, parallel)                 | at once; a Model switch starts the new filter from silence (a short fade, no click) |
| Envelopes | Loop                                                                                                    | at once (a held note starts or stops looping)                                       |
| LFOs      | Shape (the seven); Sync (free, or one of the note lengths); Mode (per voice, global); Unipolar          | at once; Mode from the next note                                                    |
| Matrix    | each slot's Source, Destination, Via (the lists, plus "none")                                           | at once (the matrix is worked out on every control block)                           |
| Voice     | Mode (poly, mono, legato); Glide mode (always, legato); Steal (oldest, quietest)                        | from the next note (held notes finish as they started)                              |

- **Osc Shape stays smooth**: it morphs (sine → triangle → saw → pulse), and automating the morph
  is the point. Its knob menu gets "Automate as steps", for a lane that jumps between the four pure
  shapes.
- **LFO Sync** as one switch: "Free" plus the note lengths; Rate stays its own smooth lane (it's
  used when Free).
- A lane's value is the option's index, saved 0..1 like every lane (`index / (count − 1)`), so the
  timeline, the table, the override watcher and `retargetLane` need nothing new.
- Switches whose part is off (Filter 2's type with Filter 2 off) can still be automated; the
  picker shows them dimmed with "Filter 2 is off".

### 3.4 Effects and mix knobs that are stepped (D232)

They become stepped lanes by the same rule, with no other change: every effect's **On**,
Bitcrusher **Bits**, Delay **Time** (the note lengths), Pump **Rate**, Utility **Phase**, and any
`steps` knob in the future. `NOT_AUTOMATABLE` stays as it is (Reverb size, Delay Ping-pong, Filter
type still rebuild the effect).

---

## 4. Folding lanes (D233–D234)

### 4.1 What folds (D233)

- **A lane** folds to a slim row (14 px instead of 44): its name, its On button, and the curve
  drawn small without handles (a stepped lane as its bars). Click its ▸ to open it. Folded lanes
  still play.
- **A track's lanes** fold behind the track row's ▸ (with a count, "3 lanes"): one click hides
  them all, one click shows them again with each lane's own fold kept.
- Buses and the master fold the same way.

### 4.2 Buttons and a follow mode (D234)

In the Timeline's toolbar, a **Lanes ▾** menu (the D214 style):

- **Fold all** / **Unfold all**: every lane, and every owner's group.
- **Follow selection** (a tick): only the selected track's lanes are open; the others fold.
  Selecting another track (in the drum machine, the mixer, or by clicking its row) moves the open
  lanes with it. Choosing Automate in a knob's menu opens that lane too. Folding or unfolding by
  hand while it's on turns it off (so your clicks are never undone).
- Commands `timeline.foldLanes`, `timeline.unfoldLanes`, `timeline.followLanes` (rebindable, in the
  palette; no default keys, agreed).

### 4.3 Where it's saved

`AutomationLane.folded?: true` and `Project.timelineFolded?: string[]` (owner ids whose lanes are
hidden), saved in schema 12 with the project, **without an undo step** (as `setPlayMode` does):
folding is a view, so undo doesn't replay it, but the project opens as you left it. Follow
selection is a setting (`timelineFollowLanes`), the same everywhere.

---

## 5. Selecting and moving many points (D235–D238)

### 5.1 The selection spans lanes (D235)

`ui.pointSelection: { lanes: Record<laneKey, number[]> }` (`laneKey` is a lane's id or
`"tempo"`). Helpers `selectedIn(key)`, `selectOnly`, `toggle`, `addAll`.

### 5.2 The rectangle (D236)

- **Drag on empty space** draws a rectangle, as today, but it's drawn **over the whole lane area**
  (one overlay in `Timeline.tsx`, not one per lane), so it can cover several lanes, the tempo lane
  and folded lanes. Every point inside it is selected, in every lane it covers. A plain click (no
  drag, under 5 px) still adds a point (D203).
- **Shift + rectangle** adds the points to the selection; **Alt (Option) + rectangle** takes them
  out of it. A rectangle without a key replaces the selection.
- While dragging, the points inside are highlighted, and a count shows by the cursor ("12 points
  in 3 lanes").
- The rectangle scrolls the timeline when it reaches an edge (the same auto-scroll as dragging a
  section).
- **Cmd/Ctrl+A** with a lane focused selects its points; **Cmd/Ctrl+Shift+A** every visible
  lane's. **Esc** clears the selection.
- **Shift+click** on a point adds it (or takes it out), in any lane.

### 5.3 Dragging a selection (D237)

Dragging any selected point moves **all** selected points by the same amount:

- **Time**: the same distance in quarter notes, snapped by the grabbed point (so the group keeps
  its spacing and the grabbed point lands on the grid). Holding Shift turns snapping off, as now.
- **Value**: the same distance as a fraction of each lane's own range (a tempo lane's change is
  scaled to its BPM range), clamped per point at the lane's ends. On a stepped lane the move is
  rounded to whole bands (§3.1), so a smooth lane's 10% and an On lane's "stays" can move together.
- **Alt (Option) while dragging a point**: lock to one direction, whichever moved first (only
  time, or only value).
- Points don't pass each other within a lane (a group can't move a point past an unselected
  neighbour); the whole move is clamped so none would.
- One undo step per drag (one merge key, as now). The readout shows the grabbed point's value and
  the move ("+1 beat, +12%").
- A new action `movePoints(moves: { lane, indexes }[], dq, dv, key)` in `timelineActions.ts` does
  every lane in one commit (tempo changes included, through the same anchors).

### 5.4 The menu, the keys and the Inspector (D238)

- The point menu (`pointMenu.tsx`) acts on the whole selection, across lanes ("Ease out ▸ for 7
  points in 3 lanes", On/Off, Delete). Ease items skip stepped lanes' points and say so ("5 of 7
  points: 2 are in stepped lanes").
- **Delete** deletes all selected points in every lane. **Arrow keys** nudge the selection: ←/→
  by the snap grid (Shift: finer), ↑/↓ by 1% of each lane's range or one band on a stepped lane
  (Shift: 10%).
- **The Inspector's table** shows one lane. With a selection in several lanes, it shows the lane
  of the point clicked last, with a line above the table: "Also selected: 4 points in 2 other
  lanes", whose click selects only this lane's.

---

## 6. A demo song (D239)

A new example song, **"Sweeps and Bends"** (`templates/`, in `EXAMPLES` after Long Way Home), about
a minute long, to show the batch off and to be its golden-levels test:

- **A lead synth** with recorded-style bends: Scoops into phrases, a Fall at the end of each
  phrase, a Doit on stabs, a Next on a held note, Shake on the long last note.
- **Synth knob lanes**: the lead's Filter 1 cutoff opening over the build (eased), the pad's LFO 1
  rate speeding up, the bass's osc 2 Fine detuning for the drop.
- **Stepped lanes**: the pad's LFO 1 shape switching from sine to S&H for the breakdown, the
  bass's voice mode going from poly to legato in the drop, Filter 1 type LP → BP for a section, a
  delay's On on the lead for the fills.
- Golden levels recorded for it (`GOLDEN_UPDATE=1` for this song only); the other songs' levels
  stay the same, which checks that §2.3 didn't change the macro automation of Long Way Home.

## 7. Guide, hints, decisions

- Guide: **Playing → Bends** (the card, the seven shapes, recording, the strip), **Timeline →
  Automation** (synth knobs and switches, which ones take effect on the next note, macros vs.
  lanes), **Timeline → Stepped lanes**, **Timeline → Folding lanes**, **Timeline → Selecting and
  moving points** (the rectangle, Shift, Alt, the arrows), the demo song in **Examples**.
- Hints for every new control: the card's knobs and buttons, the Lanes ▾ menu, the fold buttons,
  the Strip choice; one per synth knob and switch in the picker (generated from `patchParams.help`
  and `SWITCHES`, as the synth editor's are).
- PLAN.md §0.6r and D220–D240 in §6; AGENTS.md: status, schema 12, the synth's automation path
  (§6.7), stepped lanes, the multi-lane selection.
- D240: the agreed answers (§10).

## 8. Tests

**Unit**

- `core.test.ts`: each bend shape renders the expected pitch over time (zero crossings of a sine
  patch); Fall and Doit keep the voice sounding for their time; legato takes the new note's bend;
  beat units follow `setTempo`; a voice without a bend renders bit-identical to today.
- `core.test.ts`: an automated cutoff/shape/level moves at block rate and ends at the event's
  value; a switch (filter type, LFO shape, voice mode) changes at its frame and not before; a
  filter model switch doesn't click (peak check); release puts the knob's value back; automation
  wins over a macro on the same path; the matrix still adds on top; no allocation per block.
- `perform.test.ts`: `bendFor` (all/top/bass/newest, chance with a seeded random, velocity
  scaling, Next in C major and A minor and outside the key, each shape's own values, sanitizing
  old settings).
- `schema.test.ts`: 11 → 12; a malformed bend is dropped; folds survive a round trip; an old On
  lane plays the same after the migration (`curveEvents` before and after).
- `automation.test.ts`: every `ALL_PARAMS` knob and every `SWITCHES` entry of a synth track is in
  `trackKnobs` (minus the global LFO's phase, with `why`); `knobValue` of a synth path and a
  switch; the cache hands the same list for the same project; `curveEvents` of a stepped lane is
  one jump per point and ignores eases.
- `timelineActions.test.ts`: `movePoints` across lanes and the tempo, stepped lanes moving by
  bands, clamping, no passing.
- Golden levels: every existing song unchanged; the new demo song recorded.

**End-to-end**

- Bend card: Scoop on, play a MIDI note, the synth's pitch rises (the worklet's monitor report);
  recording writes `bend` into the note; the piano roll draws it; playback bends.
- Synth knob automation: Automate from a synth editor knob, the lane appears, playing moves the
  live dot; export renders the sweep (level difference between two halves of a cutoff sweep).
- Stepped lanes: Automate Filter 1's type from its menu, the lane shows bands and labels, a click
  lands on a band, the menu has no eases, the editor's switch follows the lane while playing.
- A `missingAutomation()`-style check: every synth editor knob and switch is automatable or has a
  `why`.
- Folding: fold a lane, fold a track's lanes, Fold all / Unfold all, Follow selection follows a
  track selection; folds survive a reload.
- Points: a rectangle over two lanes and the tempo lane selects in all three; Shift adds, Alt
  takes out; drag moves all by the same amount; Alt locks the direction; Delete across lanes; one
  undo restores all.
- `explain.spec.ts` covers the new controls.

## 9. Build order (each step committed, playable)

1. **The synth's automation path in the worklet** (§2.3): segments per path, in-place writes,
   switches; macros moved onto it; golden levels unchanged.
2. **Synth knobs in the lists and the picker** (§2.2, §2.4), the matrix amounts, the cache,
   `knobValue`, hints.
3. **Stepped lanes** (§3): the rule, drawing, snapping, no eases, the engine's jumps, the
   migration (schema 12); then the synth's `SWITCHES` and their menus in the editor.
4. **Folding lanes** (§4), the Lanes ▾ menu, Follow selection.
5. **The selection across lanes**: the rectangle overlay, Shift/Alt, group drags, keys (§5).
6. **Bends in the core and the plumbing** (§1.3), `Note.bend` in schema 12.
7. **The Bend card** and `bendFor` (§1.2), the keys and the play styles use it.
8. **Recording, the piano roll, the Inspector** (§1.4, §1.5).
9. **The strip on one note** (§1.6).
10. **The demo song** (§6) and its golden levels.
11. Guide, hints, PLAN.md, AGENTS.md; the full verification and e2e once.

## 10. Answers (Jeroen, 2026-10-14)

1. Fall (and Doit) extend the note: yes.
2. Shapes: Scoop, Fall, Dip, Rise, Shake, plus **Next** (to the next note in the key) and **Doit**
   (a flick up at the release).
3. Recording the strip on one note: later.
4. A macro and a lane on the same knob: the lane wins.
5. Switches: **now**, as stepped lanes, and every discrete knob gets a stepped lane without eases
   (§3).
6. Fold all / Unfold all: no default keys.
7. A demo song: yes (§6).
8. Selecting by rectangle: across lanes, Shift adds (§5.2).
