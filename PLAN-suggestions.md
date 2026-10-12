# Plan: suggesting the next chord (and the key to press for it)

Status: agreed 2026-10-12 (Jeroen: "write up a detailed plan and then implement it"); steps 1–2
built (PLAN.md §0.6l), step 3 later. Decisions D158–D160.

How we work: on `main`, commit early and often, end-to-end tests once at the end of the batch.

## 0. The idea

After every chord you play in Chord or Key mode, Rebeat suggests what could come next, the way
Scaler, Cubase's Chord Assistant or Hooktheory do, and shows **which key to press** (and in Chord
mode which pad to hold) for it. On the MiniLab 3 the keys have no lights, so the device shows the
suggestions on its **display** and, in a new pad mode **Next**, on its **pads**: the eight best next
chords, colored by what they do, one press each.

Why it fits: in Key mode one key is one chord, so a chord suggestion _is_ a key suggestion; in
Chord mode a chord is a key plus a chord type pad. Every note name is on the MiniLab's 25 keys at
least twice, so each suggestion can be marked on the key closest to the one you just played.

## 1. What a suggestion is (`model/suggest.ts`, pure)

```ts
interface Suggestion {
  root: number; // pitch class, 0 = C (in the space of the keys you press)
  pads: number[]; // the chord type (and extension) pads: Maj = [2], Min = [1], m7 = [1, 5]…
  name: string; // "F", "Am", "G7", "B♭"
  roman: string; // "IV", "vi", "V7", "♭VII", "V/V"
  role: "home" | "away" | "tension" | "color"; // tonic, subdominant, dominant, borrowed/secondary
  why: string; // "IV: lifts away from home", "the four-chord pop progression"
  score: number;
}
```

- **The key**: Key mode (and Next mode) use Key mode's own key (D138); Chord mode uses the
  project's key for the page (`pageKey`). Modes and pentatonic/blues scales use their parent:
  a major third over the root → the major table, else the minor table.
- **What you played**: every chord the keys play (a key in Chord/Key mode, a suggestion pad) goes
  into a short history (the last 4 chords, forgotten after 30 s with nothing played), as its root
  and quality; its **roman numeral** in the key comes from the root's degree (or a flat degree)
  and the quality (`analyze(rootPc, pcs, key)`).
- **Where suggestions come from**, each a score that adds up:
  1. **Moves** (`MOVES`): a weighted table of what follows each degree, from common-practice and
     pop harmony (written for Rebeat, not copied from any data set). In major: I → IV, V, vi, ii;
     ii → V (strong), vii°; iii → vi, IV; IV → V, I, ii; V → I (strong), vi (deceptive), IV;
     vi → IV, ii, V, iii; vii° → I. Minor alike (i, ii°, III, iv, v/V, VI, VII).
  2. **Known progressions** (`PROGRESSIONS`): when the last chords match the start (or any
     rotation) of a famous progression, its next chord gets a bonus and the name as the reason:
     I–V–vi–IV (four chords), I–vi–IV–V (fifties), vi–IV–I–V, ii–V–I, I–IV–V, I–♭VII–IV
     (mixolydian rock), i–♭VII–♭VI–V (Andalusian), i–iv–v, i–VI–III–VII, the 12-bar blues
     (I–IV–I–V–IV–I by chord change).
  3. **Adventure** (`settings.suggestAdventure`: 0 Safe, 1 Common, 2 Adventurous): Safe keeps to
     the key's own chords; Common adds the usual borrowed and secondary chords (♭VII, iv in major,
     V/V, V7, the major V in minor); Adventurous adds ♭VI, ♭III, V/vi, V/ii, ii°, and sevenths.
- **The result**: the chords ranked by score, the chord you're on left out, the best eight
  (pads) and three (markers). Without anything played yet, the key's home chords (I, IV, V, vi).

## 2. Showing them

### 2.1 The Controller panel (Chord, Key and Next mode; `settings.suggest`)

- A **Suggest** toggle and an **Adventure** switch (Safe / Common / Bold) in the chord row.
- **Markers on the keys** of the picture: the three best, a dot on the key to press (biggest for
  the best one) in the color of its role, with the chord's name above it ("F", "Am"); in Chord
  mode the chord type pad's label gets the same color. The key is the one with the suggestion's
  root **closest to the last key you played** (so the hand moves least); if that's off the
  keyboard, the other octave.
- Hovering a marker (explain mode or its tooltip) gives the roman numeral and the reason.

### 2.2 The device

- **The display** shows "Next: F · Am · G" for a moment after each chord (with Suggest on).
- **Next pad mode** (a fourth pad mode next to Drum, Chord, Key): the keys play as in Key mode
  (Key mode's key, the Key dial); **pads 1–8 are the eight best next chords**: a press plays that
  chord (with Voicing, Smooth, Bass, Transpose and the play styles, as a key would), and the pads
  refill after each chord. Each pad lights in its role's color, on the device and in the picture,
  with the chord's name on it.
- **Role colors** (`ROLE_COLORS`): home green, away blue, tension red, color (borrowed and
  secondary) purple.

## 3. Playing a suggestion (`state/keys.ts`)

- `playSuggestion(i, velocity)`: the chord is the suggestion's chord type on its root
  (`padChord(root, pads)`), its root in the register of the last chord (the octave nearest it,
  around C4 at first). It goes through the same pipeline as a key (transpose, voicing, Smooth,
  bass, play styles, latch, recording, the lights) as a key down whose chord is given, and
  returns its release.
- Playing it puts it in the history, so the next suggestions follow from it.

## 3b. Pad 1: a progression you pick (D161, added 2026-10-12)

In Next mode a menu picks one of the famous progressions that fit the key; pad 1 then always
holds its next chord (following where you are), the other pads the usual suggestions. The
menu shows each one's roman numerals, its chords in the key and what it is.

## 4. Step 3 (later): play-along

Suggestions from the song: the chords of a Notes track (or a chord track) at the playhead, the
next one shown a beat ahead. Needs a chord track or chord detection on tracks first (PLAN.md §0.7).

## 5. Settings

`suggest: boolean` (off), `suggestAdventure: 0 | 1 | 2` (1), `padMode: … | "next"`.

## 6. Tests

- Unit (`model/suggest.test.ts`): analysis (roman numerals of diatonic, borrowed and secondary
  chords in major and minor); after C in C major the top includes F, G, Am; after G, C first;
  after Dm, G first; after C–G–Am the four-chord progression suggests F with its name; Safe never
  suggests a non-diatonic chord, Common may suggest B♭ (♭VII); minor keys; nothing played.
- Unit (keys): a suggestion pad plays its chord through the pipeline; the history.
- E2E: Suggest on: markers on the picture's keys after a chord, their names; Next mode: the pads'
  names and colors, a pad press plays the chord (the equation), the device gets the pad colors.

## 7. Build order

| Step | What                                                                     | Decisions |
| ---- | ------------------------------------------------------------------------ | --------- |
| 1    | `model/suggest.ts` (analysis, moves, progressions, adventure) + tests    | D158      |
| 2    | History and suggestions in the keys; markers; Suggest/Adventure; display | D158      |
| 3    | Next pad mode: pads = suggestions (playing, colors, labels, device)      | D159      |
| 4    | Guide, hints, PLAN.md §0 and §6, AGENTS.md                               | D160      |
