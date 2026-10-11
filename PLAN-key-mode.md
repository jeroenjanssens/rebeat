# Plan: Key mode for the pads (the Orchid's Key Mode), and a bigger equation

Status: built (2026-10-11), D138. Jeroen's answers are marked **(agreed)**, the remaining
defaults **(default)**; see §6. Decision number when built: D138.

## 1. What the Orchid does

From Telepathic Instruments' help center and manual (sources at the end):

- **Turn the Key dial** to choose a key (C major, A minor…), **push** it to lock it in; the key shows
  in the display's top-left corner. Push again to turn Key Mode off.
- **One finger, one chord**: every key plays the diatonic chord of the scale on that note (in C
  major: C → C, D → Dm, B → Bdim). No chord type button is needed.
- **Harmonic quantization**: a note outside the key is moved into it.
- **Chord type buttons** override Key Mode while held ("play chords as usual").
- **Extensions** (6, m7, M7, 9: the *bottom* row, which is pads 5–8 here) work in Key Mode on their own,
  with no chord type button. *How* they're voiced in Key Mode isn't documented; firmware 3.32
  "improved note selection … when adding 7th extensions within Key mode" suggests they follow the key.
- **Press and turn** the Key dial: transpose the whole output by semitones (shown top-right).
- **Quick key select** (3.84): long-press the Key dial, then press a key (with Min held for minor).
- Only **major and minor** keys (FutureMusic's review).

## 2. What Rebeat has already

- A **key per page**: `project.key`, overridden per page by `pattern.keyOverride`, read with
  `pageKey(project, pattern)`; the drum machine's **Key menu** (`panels/drum-machine/KeyMenu.tsx`)
  edits it. 12 scales in `model/notes.ts: SCALES` (7 of them have 7 notes).
- `snapToKey` (nearest note in the key, ties go down) and `chordInKey` (a diatonic triad or 7th),
  used by the Pad view's **scale lock** and **chord mode** (Notes / Triads / 7ths) through
  `state/input.ts: playedNotes`.
- **Chord pads** (D137): `model/padChords.ts`, played by `state/keys.ts` (one chord at a time,
  pads change a held chord, `sounding` for the panel).
- The MiniLab 3's **main encoder**: CC 28 relative (`browse:sound`, Shift = by section), its
  **click** CC 118 (127 on press, 0 on release, now runs `keys.add-track`), **Shift** CC 27. So
  press-and-turn can be detected.

## 3. Design (defaults)

### 3.1 A third pad mode

The Controller panel's **Pads** switch gets three choices: **Drum | Chord | Key** (setting
`padMode: "drum" | "chord" | "key"`). The command `pads.mode` cycles them, and there's one command
per mode so each can get a shortcut.

### 3.2 Which key

**(agreed)** Key mode has **its own key**, as on the Orchid: `keyModeKey: { root, scale }` in the
settings (C major to start), independent of the project. Turning the Key dial never edits or forks a
song and isn't an undo step. The page's key (the drum machine's Key menu, scale lock, the piano
roll) is untouched. The Key mode chip in the Controller panel can offer **Use the page's key** as a
one-off copy.

### 3.3 What a key plays in Key mode

- The key you press is moved into the key (`snapToKey`, as scale lock: the nearest note, ties go
  down; C♯ in C major plays C).
- It plays the **diatonic triad** on that degree, root first and lowest (`chordInKey(…, 3)`).
- **(agreed)** Key mode's scales are the 7-note ones Rebeat knows: Major, Minor, Dorian, Phrygian,
  Lydian, Mixolydian, Harmonic minor. "Use the page's key" with a pentatonic or blues page takes its
  parent scale (pentatonic major → major, pentatonic minor and blues → minor).
- In Key mode, the Pad view's scale lock and chord mode don't apply to the keys (Key mode already
  does both).
- The equation and the keys' colors work as in Chord mode: the pressed key in the accent color, the
  added notes in the paler accent. An out-of-key key is lit as pressed, but the equation shows what
  sounds.

### 3.4 The pads in Key mode

- **Pads 5–8 (extensions) (agreed: diatonic)**: 6 adds the key's sixth above the root, 9 the key's
  ninth, and **m7 or M7** add the key's seventh on that degree (G in C major: F, so G7; C: B, so
  Cmaj7). Everything stays in the key. Several at once stack (6 + 9, 7 + 9…).
- **Pads 1–4 (chord types) (agreed: override, unquantized)**: while one is held, the key plays that
  chord exactly as in Chord mode, on the key *as pressed* (not moved into the key), so you can
  borrow chords (B♭ + Maj in C major). Secret chords work as in Chord mode.
- One chord at a time, and pads change a held chord, as in Chord mode.

### 3.5 The MiniLab 3's black knob (the main encoder) as the Key dial (Key mode only)

| On the device                   | In Key mode                                                       |
| ------------------------------- | ----------------------------------------------------------------- |
| Turn                            | the key's root, a semitone per step (C, C♯, D…), the scale kept   |
| Shift + turn                    | (agreed) the scale: Major → Minor → Dorian → Phrygian → Lydian → Mixolydian → Harmonic minor |
| Press and turn                  | transpose the keys, a semitone per step (−12…+12)                 |
| Click (press, release, no turn) | "On press": select the key you turned to; otherwise (or with nothing to select) transpose back to 0 |
| Press and play a key            | quick key select: that note becomes the root (with Min held: minor, with Maj: major) |

- **(agreed)** A toggle in the Controller panel, **Knob: At once | On press** (saved, At once to
  start). *At once*: each step changes the key. *On press*: turning picks a key, shown next to the
  active one ("C major → D minor"), and a click on the knob selects it (as on the Orchid); turning
  back to the active key drops the pick. The display shows what you turn to ("Key / D minor").
- In Key mode the click's action fires on **release**, and only if you didn't turn or play a key
  while it was down; in Drum and Chord mode it stays "Add as a track" on press, as now.
- In Drum and Chord mode the encoder browses the Playable list, as now.
- Done in `audio-io/midi.ts` where `browse:sound`/`browse:section` and the encoder click are
  handled, so it follows the MiniLab map's `encoder` and `encoder-click` slots, not fixed CCs.

### 3.6 Transpose

- It shifts **everything the keys play** by semitones, after the chord is made: Key mode's chords,
  Chord mode's, single notes. It applies in **every pad mode**, as the Orchid's transpose applies
  to its whole output.
- It doesn't move the key, the sequencer or the tracks' own transpose.
- Notes record as you hear them.
- It's set by press-and-turn or the panel's stepper. **(default)** It's not saved: it starts at 0
  with each session, so a forgotten transpose doesn't surprise you after a restart.
- It's shown whenever it isn't 0: in the panel's header ("Transpose +2") and on the display.

### 3.7 The Controller panel

- **Header**: `Pads: Drum | Chord | Key`. In Key mode a row under it shows:
  - **the active key**, and in On press mode **the key a press would select** ("→ D minor · press
    the knob", clickable to select it);
  - the **Knob: At once | On press** toggle;
  - a **key chip** ("C major"), which opens a root and scale menu (the 12 roots, the 7-note scales,
    and **Use the page's key**);
  - a **transpose stepper** (− +2 +), with a click on the number to reset it.
- **In-key markers (default)**: in Key mode the MiniLab drawing puts a small dot on every key that's
  in the key (the root's dot a little bigger), as the Orchid marks in-key notes.
- **Pads in Key mode**: labeled as in Chord mode (Dim, Min, Maj, Sus, 6, m7, M7, 9), with Key-mode
  hints ("adds the key's seventh").
- **The equation, bigger**: its notes and chord name at the size of the note names on the keys
  (22 units in the drawing, so it scales with the panel). A ResizeObserver on the SVG sets a CSS
  variable `--key-label-px = 22 × rendered width / 1158`, which the equation uses (at least 15 px).
  Controllers without a drawing get a fixed 22 px. Same weight (600) as the key labels.

### 3.8 The display

In Key mode the lasting line 2 is the key ("Key C major", plus "+2" when transposed). Turning
the Key dial or transposing shows a transient "Key / D minor" or "Transpose / +3", as knobs do now.

### 3.9 Other controllers

Key mode works with any map: pads 1–8 as in Chord mode, the key from the page. Without a Key dial,
you choose the key with the panel's key chip or the drum machine's Key menu.

## 4. Implementation steps

1. **Model** (`model/keyMode.ts`, pure, with tests): `keyModeChord(pressed, key, pads)`. It returns
   the notes: the diatonic triad, the diatonic extensions, and the override by chord types (reusing
   `padChordTones`). Also `stepKey(key, ±1)`, `stepScale(key, ±1)`, `KEY_MODE_SCALES` and
   `keyModeKeyFrom(pageKey)` (parent scale for pentatonic and blues keys).
2. **Settings**: `padMode` gains `"key"`, and `keyModeKey` is new (C major). **Keys**
   (`state/keys.ts`): `notesFor` asks `keyModeChord` in Key mode. `transpose` lives in `useKeys`
   (applied in `startNote`, kept in `sounding` so the panel shows what sounds), with `setTranspose`
   and `setKeyModeKey`. A chord that's held re-voices when the key changes.
3. **MIDI** (`audio-io/midi.ts`): in Key mode, `browse:*` turns go to the Key dial (root, scale with
   Shift, transpose while the click is down). The `encoder-click` slot tracks press and release
   (whether a turn or a key came in between). Quick key select: a key while the click is held sets
   the root and isn't played.
4. **Panel**: a three-way switch, a key chip (with `KeyMenu`'s menu extracted into a shared
   component), the transpose stepper, the in-key dots and the generated-key color in
   `MiniLab3Svg`, and the equation's size from the ResizeObserver.
5. **Display feed**: the key line and the transient key and transpose texts.
6. **Commands**: `pads.drum`, `pads.chord`, `pads.key`, `keys.transpose-up/down/reset`.
7. **Docs**: hints (`controller.padMode.key`, the Key-mode pad hints, key chip, transpose, the
   encoder in Key mode), the guide's "Chord pads" section gains "Key mode", and the MiniLab map's
   checklist line about the encoder. Then PLAN.md D138 and AGENTS.md.

## 5. Tests

- **Unit**:
  - `keyModeChord` in C major: C → C E G, D → D F A, B → B D F, C♯ → C E G. A minor: G → G B D.
    Dorian. Extensions: G + m7 → G7, C + M7 → Cmaj7, C + 6 + 9. A type override: B♭ + Maj in C
    major → B♭ D F.
  - `stepKey` wraps (B → C). `stepScale` cycles. `keyModeKeyFrom` maps pentatonic minor → minor.
  - Keys: transpose applies to every note and to `sounding`. In Key mode the Pad view's chord
    mode is ignored.
- **e2e** (`controller-panel.spec.ts`):
  - Key mode in C major: D → "D4 + F4 + A4 = Dm", B → Bdim. With the m7 pad, G → G7.
  - Encoder CC 28 steps the key (the chip reads "D major"). Shift + turn → "D minor".
  - Press (CC 118 = 127) and turn → transpose +1. Click alone → 0.
  - The equation's font size equals a key label's rendered size (within 1 px).
- **Visual**: a screenshot of Key mode with a chord held.

## 6. Open questions (with defaults)

Answered (2026-10-11):

1. **Which key**: Key mode's own key, saved in the settings, independent of the project **(agreed)**.
2. **Extensions in Key mode**: diatonic **(agreed)**.
3. **Chord type pads in Key mode**: override on the key as pressed, for borrowed chords **(agreed)**.
4. **Scales on the dial**: all 7-note scales Rebeat knows **(agreed)**.

Still open (defaults stand unless changed):

5. **Transpose**: not saved, every pad mode **(agreed)**.
6. **Turning the dial**: a panel toggle, At once (to start) or On press **(agreed)**; the panel shows
   the active key and the one a press would select.

## 7. Not in this plan

Voicing (inversions, a voicing dial), strum, arpeggiation from the pads, more Key-mode chord sizes
(7ths by default), a Launchkey or MPK key dial (they have no free encoder in their maps).

Sources: [Key Mode (help center)](https://support.telepathicinstruments.com/hc/en-us/articles/15280829123087-How-to-Use-Key-Mode-for-Easy-Chord-Progressions),
[Chord Extensions Explained](https://support.telepathicinstruments.com/hc/en-us/articles/16576229505167-Chord-Extensions-Explained),
[Bottom row buttons](https://help.telepathicinstruments.com/en-US/bottom-row-buttons-3105760),
[Orchid manual v3.1 §9](https://help.telepathicinstruments.com/en-US/user-manual-%E2%80%93-complete-1348749),
[firmware release notes](https://firmware.telepathicinstruments.com/),
[FutureMusic review](https://futuremusic.com/2026/08/telepathic-instruments-orchid-orc-1-review/).
