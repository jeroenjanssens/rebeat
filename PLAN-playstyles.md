# Plan: play styles for the keys (strum, slop, arpeggiator, latch, balance, patterns), smooth voicing, the bass on its own track

Status: agreed and built 2026-10-12 (PLAN.md §0.6k, decisions D149–D154). Decisions (Jeroen, 2026-10-12):

- **Record the result**: what the styles play (each strummed note at its own time, each arpeggiated
  note, each pattern hit) is what's recorded, as the Orchid sends it over MIDI.
- **Combinable**: the styles aren't exclusive modes (the Orchid's PlayStyles are); they're stages
  that stack (§1).
- **Global**: the settings belong to the device and the player, not to a track or a project:
  `useSettings` (persisted), like the voicing and the bass (D139, D140).

Source on the Orchid (its manual isn't public; support site 403): the product page, "How to
Orchid", and the firmware release notes 3.04–3.92 at firmware.telepathicinstruments.com. Its
PlayStyles are Strum, Slop, Arpeggiator, Pattern and Harp (one at a time, on the Perform knob), it
has hold/latch, a bass engine with Auto and Solo modes, and it sends each strummed or arpeggiated
note over MIDI. Speeds, patterns and arp modes aren't published.

How we work: on `main`, commit early and often, end-to-end tests once at the end of the batch;
while building: prettier, tsc, eslint, vitest.

---

## 0. Where it starts (the code today)

| What                        | Where                                                                                                                                                                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A key down                  | `state/keys.ts: noteOn(pitch, velocity, source)` resolves the output, computes the notes (`notesOf`: chord pads or Key mode, transpose, `voiceChord`, bass) and starts **all of them at once, now** (`startNote` per note). Release: `end(p)` stops them all (or at the pedal's release). |
| Chord changes while held    | `revoice()`: notes that stay keep sounding, others stop, new ones start now.                                                                                                                                                                                                              |
| Starting a note             | `startNote(out, pitch, velocity)`: `holdNote(track, …)` (engine: `audioNow()`), the Keys channel's `voice.hold(pitch, vel, time)`, or `playKeysSample` (a one-shot, now). None takes a start time from the keys yet, though the voices underneath do (`hold(pitch, vel, t)`).             |
| Recording                   | `recordNoteOn(track, pitch, velocity)` / `recordNoteOff(id)` (`state/input.ts`) take the position **now** (audio clock minus latency). While stopped, `recordNoteOn` is step entry (a 60 ms chord window).                                                                                |
| A clock                     | `engine/ticker.ts: startTicker` (a worker tick, shared), the transport's lookahead scheduler (`transport.ts`, 120 ms, `position()`, `nextBeatTime()`, `playStartTime()`). Nothing runs on a beat grid while the transport is stopped.                                                     |
| Stop is a panic (D99)       | `transport.stop()` → `engine.panic()`; anything that holds sound registers `onPanic`.                                                                                                                                                                                                     |
| The track arpeggiator       | `Track.arp` (`model/types.ts`: up, down, updown, random, played; rate, octaves, gate), played by the sequencer only (`playPageStep`). Its modes and rate names are reused for the live arp.                                                                                               |
| Controller knobs, Chord/Key | `midi.ts: STEPPED` (knob 1 voicing, 2 transpose, 5 bass; D148). Knobs 3, 4, 6, 7, 8 are still SOUND knobs in Chord and Key mode.                                                                                                                                                          |
| The MiniLab's Hold button   | Not in the map yet (its CC is unknown: check the Monitor).                                                                                                                                                                                                                                |

## 1. The shape of the solution: a pipeline

Every key down (and every chord change while held) goes through the same stages. Each stage is
off by default and can be turned on with any other:

```
key ─▶ 1 CHORD ──────▶ 2 RHYTHM ────────▶ 3 SPREAD ──▶ 4 FEEL ─────────▶ 5 OUT
       which notes      when they sound     strum         slop, balance     voices + recording
       (pads, Key       (at once / Arp /    (offsets      (random timing,   (live voice, the
       mode, voicing,   Pattern / Arp on    within a hit) velocity shape)   bass track, Rec)
       Smooth, bass)    a Pattern; Latch)
```

- **1 Chord** (today's `notesOf`, plus Smooth voicing §6): the set of notes a key means, split
  into **chord notes** and **bass notes**.
- **2 Rhythm** decides the **hits**: moments at which some of those notes start, with a length.
  - nothing on: one hit, now, every note, until the key goes up (as today);
  - **Arpeggiator** (§4): one note per hit, on the arp's grid;
  - **Pattern** (§8): hits on the pattern's rhythm, all chord notes per hit (or bass-only /
    chord-only steps);
  - **Arp + Pattern**: the pattern's rhythm, the arp's order (each hit plays the next arp note);
  - **Latch** (§4.3): hits go on after the keys are up, until the next chord or Latch off.
- **3 Spread: Strum** (§2) turns a hit of several notes into notes a few ms apart; on a Pattern,
  directions alternate like a guitar (down on the beat, up on the "and").
- **4 Feel: Slop** (§3) moves each note a little later at random and varies its velocity;
  **Balance** (§5) shapes the velocities within a hit (bass and top a bit louder).
- **5 Out**: each resulting note is started at its exact audio time and stopped at its end, on the
  keys' target; bass notes go to the bass track when there is one (§7). With Rec on, each one is
  recorded at its own time and length (record the result).

The pure part (given the chord, the settings, the time and the grid → the list of timed notes) is
a new module **`model/perform.ts`**, unit-tested in Node. The runtime part, a small lookahead
scheduler on the audio clock that plays and records those notes, is **`state/perform.ts`**, used
by `state/keys.ts` instead of calling `startNote` directly.

### 1.1 Timed notes (the foundation, step A)

- `startNote(out, pitch, velocity, at?)` and its release `(at?)`: the engine paths get a start
  time: `holdNote(track, pitch, vel, at = audioNow())` → `release(at?)`; `keysChannelNote` passes it
  to `voice.hold`; `playKeysSample(…, at?)` starts the source at `at`.
- `recordNoteOn(track, pitch, velocity, at?)` / `recordNoteOff(id, at?)`: the position is computed
  from `at` (audio time) instead of now. While stopped, step entry ignores the styles and writes
  the plain chord (§9.3).
- **Scheduler** (`state/perform.ts`): a queue of `{ time, kind: start | stop, note }`, fed 120 ms
  ahead from a `startTicker` tick (the same worker), so the timing never depends on React or on
  the main thread being free. Notes inside the window are handed to the voices with their audio
  times; the rest wait. Registers `onPanic`: Stop silences and clears everything, Latch included.

### 1.2 Time and tempo

- The **grid** (arp steps, pattern steps, a strum's quantize) is the project's tempo
  (`project.bpm`).
- **While the transport plays**, the grid is the transport's: hits fall on its steps
  (`playStartTime()`, the step durations, swing included), so what you play locks to the song and
  records on the grid.
- **While stopped**, the grid starts at the first key down (free-running at the tempo), as
  hardware arps do; the first hit is immediate.

### 1.3 What applies where

- The styles apply to **everything the keys play**: MIDI keys, the picture's keys, the computer
  keyboard, in every pad mode. An arpeggiator over held plain keys is the classic use, and Latch
  and Slop make sense there too. Strum and Balance only change hits of several notes.
- **Pads in Drum mode** aren't affected (they play tracks, as now).

## 2. Strum

- **What**: the notes of a hit start one after another instead of together.
- **Settings**: `strum: { on, time, direction }`
  - `time`: the whole spread, 0–250 ms (default 40 ms) from the first note to the last; with few
    notes the gap is wider, as a real strum's is. A curve (`gap_i ∝ (i/n)^0.8`) makes it speed up
    slightly, like a hand.
  - `direction`: **Up** (low to high, the default), **Down** (high to low), **Alternate** (up,
    then down, then up… per new hit; on a Pattern: down on the beat and up on the off-beat, like a
    guitar).
- **Release**: all of a hit's notes stop together when the key goes up (a strum spreads the
  starts, not the ends).
- **Changing the chord while held** (`revoice`): notes that stay keep sounding; new notes are
  strummed in the strum's order from the change, so a chord change on a held key sounds strummed
  too.
- **Bass**: in the strum like any note (it's the lowest, so it's first going up).

## 3. Slop

- **What**: humanize: every note starts a little later at random, and its velocity varies, so
  chords and arps don't sound machine-tight.
- **Settings**: `slop: { on, timing, velocity }`: timing 0–40 ms (default 12), velocity 0–30%
  (default 10%).
- **Only later, never earlier**: a key can't play before it's pressed. To keep the feel on the
  grid, an arp or pattern hit's notes are spread around a point 1/2 `timing` late, so on average
  they're just behind the beat (a laid-back feel).
- **Per note**, independent of Strum (they add up: a strummed chord with slop sounds like a real
  hand). Seeded per key down, so the same chord doesn't sound identical twice but tests can seed
  it (`Math.random` seeded in tests, as the golden renders do).

## 4. Live arpeggiator

### 4.1 What it does

- With the Arp on, held notes (a chord from the pads, Key mode, or plain keys held together) play
  one at a time on a grid, at the tempo.
- **Settings**: `arp: { on, mode, rate, octaves, gate }`, the track arp's vocabulary
  (`Arpeggiator` in `model/types.ts`):
  - `mode`: Up, Down, Up-down (no repeated top and bottom), Random (no repeats in a row), As
    played (the chord's own order: root, third, fifth…, or the order the keys went down).
  - `rate`: 1/4, 1/8, 1/8T, 1/16 (default), 1/16T, 1/32.
  - `octaves`: 1–4 (default 1): the pattern repeats an octave up each time round.
  - `gate`: 10–100% of a step (default 80%).
- **The bass** isn't arpeggiated: it plays on the first step and is held while the chord is (with
  the bass on its own track, §7, it plays there).
- **A new chord while the arp runs** (another key, a pad change): the arp keeps its place in the
  pattern (its step counter) and continues with the new notes, so changes land on the grid
  instead of restarting.

### 4.2 Timing

- As in §1.2: on the transport's grid while it plays (the first note waits for the next arp step,
  at most one step), free-running from the first key down while stopped (the first note at once).

### 4.3 Latch (the Hold button)

- **Latch**: `latch: boolean`. With it on, letting go of the keys doesn't stop what they play: the
  chord (or the arp, or the pattern) goes on until a new chord replaces it, or Latch goes off.
  - With chord pads or Key mode: the next key down is the next chord (one chord at a time, as now).
  - Plain keys: keys pressed while others are still down **add to** the latched set; a key pressed
    after all were up **starts a new set** (how hardware arps latch).
  - Turning Latch off releases what's latched (at the next arp step's end).
- Works without the Arp too: a latched chord is simply held (an Orchid hold).
- **The MiniLab 3's Hold button sends nothing** (Jeroen, 2026-10-12), so Latch is a toggle in
  the panel and the command `keys.latch` (give it a shortcut, or MIDI-learn any button to it).
- **Stop** (a panic) releases a latch too, so Stop always means silence (D99).

## 5. Balance

- **What**: the velocities within a hit. Today every note gets the key's velocity (all equal).
- **Settings**: `balance: 0–100%` (default 0 = even, as now): the inner notes play
  `(1 − 0.35 × balance)` × the key's velocity, the top note and the bass (or the lowest chord note)
  at the full velocity. At 50% a C major with a bass at velocity 100 plays bass 100, C 100, E 82,
  G 100 (top). It brings out the melody (top) and the foundation (bass), as a pianist voices.
- Applies to every hit (pattern hits too), after Slop's velocity variation.

## 6. Smooth voicing (voice leading)

- **What**: a **Smooth** switch next to Voicing. Each new chord takes the inversion (and octave)
  closest to the chord before it, so a progression moves by small steps without turning the
  Voicing knob by hand. The Orchid does this by hand with its dial; Scaler and Cubase's chord
  pads do it automatically.
- **How** (pure, `model/perform.ts: smoothVoicing(prev, chord, home)`):
  - candidates: the chord in every voicing `voiceChord(chord, v)` for v in −8..8;
  - cost: the notes' total movement from the previous chord (sorted notes paired lowest to
    lowest; a different note count: each note to its nearest previous note), plus a small pull
    back to **home**;
  - **home** is the chord at the Voicing setting, so the Voicing knob still sets the register
    and Smooth keeps the chords around it (no drifting off the keyboard over a long progression);
  - candidates more than 7 semitones (average) away from home are out;
  - the first chord (or after 4 s with nothing played) plays at home.
- **The bass** stays on the root below the chord (D139, D140); Smooth only moves the chord.
- The panel shows the voicing actually used (e.g. "Smooth · +2").

## 7. The bass on its own track

- **What**: the bass notes (D139) play on a track you pick, with its own sound, as the Orchid's
  second engine; the chord stays on the keys' target.
- **Settings**: `bassTrack: string | null` (null = the chord's sound, as now): a **Bass sound**
  picker next to Bass in the panel: "Same as the chord", or any Notes track. A missing track (other
  project) falls back to the chord's sound.
- **Playing**: bass notes go through `holdNote` on that track's live voice (its own channel), so
  its mix, effects and recording are its own. With Rec on they're recorded into that track.
- **Bass mode**: `bassMode: auto | split` (default auto):
  - **Auto**: the root, Bass octaves down, with every chord (as now).
  - **Split** (the Orchid's Solo): keys below a split point (default the MiniLab's lowest octave,
    C below the first chord key: `bassSplit`, a MIDI note, set by "Set split: press a key") play
    the bass alone (monophonic, last note wins, at the key's pitch, on the bass sound); keys above
    play chords **without** an automatic bass. Lets the left hand play a bass line.
- **Patterns** can mark steps bass-only or chord-only (§8), so the bass track plays its own rhythm.

## 8. Patterns

- **What**: the chord replays on a rhythm while held (or latched), at the tempo: piano and guitar
  comping patterns. With the Arp also on, each hit plays the next arp note instead of the whole
  chord; with Strum on, each hit is strummed (alternating on a guitar pattern).
- **Settings**: `pattern: { on, id }`.
- **A pattern** is data (`model/perform.ts: PATTERNS`), one or two bars of 16ths:
  `{ id, name, steps: [{ at (16th), length (16ths), vel (0..1), part: all | chord | bass, dir? }] }`.
- **The set** (about 10, names in plain words, previewed in the picker):
  1. **Whole notes**: a chord per bar.
  2. **Halves**: on 1 and 3.
  3. **Quarters**: every beat, accents on 1 and 3.
  4. **Eighths**: straight pop 8ths (Strum alternates down/up).
  5. **Offbeats**: on every "and" (reggae and ska skank), short.
  6. **Charleston**: 1 and the "and" of 2.
  7. **Tresillo**: 3 + 3 + 2 sixteenths (the Latin and pop pulse).
  8. **Oom-pah**: bass on 1 and 3, chord on 2 and 4 (stride, polka, country).
  9. **Pulse**: 16ths with an accent every beat (trance, synth pop).
  10. **Bossa**: bass on 1 and 3, chord on a bossa nova comping rhythm (two bars).
- **Length**: a pattern loops for as long as the chord is held; a new chord continues at the same
  place in the pattern (a chord change doesn't restart the rhythm).
- **Velocity**: the key's velocity × the step's `vel` (as the Orchid's "Pattern velocity scales
  with keypress velocity").
- **Swing**: the project's swing applies to the pattern's 16ths (on the transport's grid it's
  there anyway).

## 9. Recording (record the result)

1. **Live (Rec on, playing)**: every note the pipeline plays is recorded at its own start and
   length: `recordNoteOn(track, pitch, vel, at)` at its start, `recordNoteOff(id, at)` at its end.
   Strum and Slop offsets land in `Note.offset` (schema 9), arp and pattern notes on their steps.
   Overdub/Replace and Snap (D126–D131) apply as now: with Snap on, notes are snapped as usual, which
   would also snap the strum away; so **strummed and slopped notes are recorded with their
   offsets even with Snap on** (Snap snaps the hit's first note; the rest keep their distance).
2. **Bass on its own track**: recorded into that track.
3. **Stopped (step entry)**: the styles are a performance; step entry writes the plain chord (the
   chord's notes on the cursor's step), as now. (Alternative: write the arp's notes over the next
   steps. Not now.)
4. **Latch**: a latched chord records as held until it's released.

## 10. The Controller panel and the knobs

### 10.1 The panel

- A second row under the Voicing / Bass / Transpose row, **Play**, shown in every pad mode (the
  styles apply to the keys everywhere):
  - **Strum** toggle + time (ms stepper) + direction (Up / Down / Alt);
  - **Slop** toggle + amount;
  - **Arp** toggle + mode, rate, octaves, gate (a compact popover when it's on);
  - **Pattern** toggle + picker (name, a tiny rhythm preview);
  - **Latch** toggle (lit while something's latched);
  - **Balance** amount.
- Voicing gets a **Smooth** toggle; Bass gets **Sound** (Same / a track) and **Split**.
- The picture: knobs labeled with what they do (as now for 1, 2, 5); the Hold button lit when
  Latch is on.
- The **Keys** drop-down from the top bar (what the keys play) in the panel's header too (done
  right away, separately from this plan).

### 10.2 The knobs in Chord and Key mode (`midi.ts: STEPPED`, D148)

Proposed (all 8 then do keys things in Chord and Key mode; in Drum mode they stay SOUND knobs):

| Knob | Chord / Key mode   | Steps                                         |
| ---- | ------------------ | --------------------------------------------- |
| 1    | Voicing (as now)   | −8 … +8                                       |
| 2    | Transpose (as now) | −12 … +12                                     |
| 3    | Strum time         | Off, 10, 20, 30, 40, 60, 80, 120, 180, 250 ms |
| 4    | Arp rate           | Off, 1/4, 1/8, 1/8T, 1/16, 1/16T, 1/32        |
| 5    | Bass (as now)      | −3 … Off                                      |
| 6    | Slop               | Off, 10%, 20% … 100%                          |
| 7    | Pattern            | Off, then the patterns                        |
| 8    | Balance            | 0 … 100% in 10% steps                         |

Turning knob 3, 4, 6 or 7 off the left end ("Off") turns that style off; turning it on picks a
value. The display shows the name and value (as for the others).

## 11. Settings (`state/settings.ts`, persisted; no project schema change)

```ts
playStyle: {
  strum: {
    on: boolean;
    time: number;
    direction: "up" | "down" | "alternate";
  }
  slop: {
    on: boolean;
    timing: number;
    velocity: number;
  }
  arp: {
    on: boolean;
    mode: ArpMode;
    rate: StepSize;
    octaves: number;
    gate: number;
  }
  pattern: {
    on: boolean;
    id: string;
  }
  latch: boolean;
  balance: number; // 0..1
}
smoothVoicing: boolean;
bassTrack: string | null;
bassMode: "auto" | "split";
bassSplit: number; // MIDI note
```

## 12. Tests

- **Unit (`model/perform.test.ts`)**: strum offsets and directions (and alternate on patterns);
  slop bounds (only later, within the amount; seeded); arp orders for every mode, octaves, gate,
  a chord change keeping the step; latch rules (add while held, new set after all up); patterns'
  hits (each preset's steps, part bass/chord, velocities); balance values; smooth voicing (a
  ii–V–I moves by small steps, stays near home, the first chord at home).
- **Unit (`state/perform.test.ts`, mocked engine)**: notes start and stop at their audio times;
  Stop clears the queue and the latch; recording gets each note's time.
- **E2E (fake MIDI)**: a strummed chord's notes start in order (engine events with times); the
  arp plays notes on the grid while playing and records them (store); Latch via the Hold slot;
  a pattern records hits on its steps; the bass on its own track records there; the panel's Play
  row and knobs 3, 4, 6, 7, 8.
- **Golden levels**: unaffected (only live playing changes); run once at the end anyway.

## 13. Build order (each step ends with something you can play, committed)

| Step | What                                                                                               | Decisions |
| ---- | -------------------------------------------------------------------------------------------------- | --------- |
| A    | Timed notes: `startNote`/`holdNote`/`playKeysSample`/recording with times; the scheduler; panic    | D149      |
| B    | Strum and Slop, Balance; the Play row (first part); knobs 3, 6, 8                                  | D150      |
| C    | Live arp and Latch; the Hold slot; knob 4                                                          | D151      |
| D    | Smooth voicing                                                                                     | D152      |
| E    | Patterns (with Arp and Strum combined); knob 7                                                     | D153      |
| F    | The bass on its own track; Split                                                                   | D154      |
| G    | Guide (a "Play styles" chapter section), hints for every new control, PLAN.md §0 and §6, AGENTS.md | —         |
| H    | On the device: the Hold button's CC; how it feels (strum times, slop, pattern choice)              | —         |

## 14. Answers (Jeroen, 2026-10-12)

1. **Knobs**: all eight do keys things in Chord and Key mode (§10.2); Shift for SOUND knobs later.
2. **Plain keys in Drum mode**: yes, the styles apply to the keys in every pad mode (§1.3).
3. **The MiniLab's Hold button sends nothing.** Latch is a toggle in the panel and a command
   (`keys.latch`, "Latch the keys"), so a shortcut or any learned button can toggle it; no map slot.
4. **Patterns**: the list in §8.
5. **Snap**: strum and slop offsets are kept with Snap on (§9.1).
6. **Arp + Pattern**: the pattern's rhythm with the arp's order (§1).
