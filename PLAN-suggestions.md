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

## 3c. Auto: the progression plays itself (agreed 2026-10-12, D162–D164)

In Next mode, with a progression picked, **▶ Auto** plays it by itself: the chord changes on its
own, in time, and **■ Stop** ends it. You play over it (or record it: a quick way to write a
song's chords).

### How often the chord changes ("harmonic rhythm")

- **Change every 1, 2, 3, 4, 6 or 8 patterns** when a pattern is on, **bars** when none is
  (`settings.autoEvery`, default 1). Counting the pattern's own length keeps every change on the
  pattern's first hit: one-bar patterns change per bar, Bossa, Clave and Montuno (two bars) never
  in their middle, the Waltz (three beats) never drifts against a 4/4 bar.
- Without a pattern, a bar is the song's time signature (4/4: 16 sixteenths, 3/4: 12, 6/8: 12).

### When it starts, and on which clock

- One clock with the patterns and the arp (`state/perform.ts`'s grid, D151–D153): the change
  happens at the step where the pattern starts over, just before that step's hits, so the new
  chord comes in on the hit, never between hits.
- While the song plays, Auto starts on the song's next bar and stays on its grid; while stopped,
  at once, at the song's tempo.
- It starts at the progression's next chord (pad 1's), so you can play a few chords by hand and
  then let it carry on.

### What sounds

- The progression's chord is held for you (as Latch would): it plays through Voicing, Smooth,
  Bass, Transpose and all the play styles (a pattern, the arp, a strum), and records with Rec on.
- Without a pattern or arp the chord is simply held until the next one (a pad).
- **Loop** (default on) goes round again; off, it stops after the last chord.
- **While Auto plays, the keys play single notes over it** (a melody, on the same sound), not
  chords (Jeroen, 2026-10-12). **Pads 2–8 are passing chords**: held, one replaces the
  progression's chord until it's let go, then Auto goes on where it was (Jeroen).

### Starting and stopping

- **▶ Auto / ■ Stop** in the Pad 1 row; the command **Auto progression: start/stop** (a shortcut,
  or MIDI-learn any button); the transport's Stop stops it too (D99). On the MiniLab: the display
  shows the chord and the next one ("Am → F"), and pad 1 blinks in the bar before a change.
- The progression strip shows the chord playing and, under it, how far it is to the next change.

### Free + Auto

Without a progression picked, Auto follows the best suggestion every time (Jeroen): a progression
that writes itself, different every run, as adventurous as Adventure says.

### Recording with Auto (D163)

How recording works today: with Rec on and the song playing, what the keys play records into the
keys' track (the selected or locked Notes track; the bass into its own track, D154). Arming is
for Clip tracks (the looper's audio). Auto records the same way: what it plays goes through the
keys, so it lands in the keys' track, on the grid (each chord at its exact hit time, D149).

- **Start with the song** (`settings.autoWithPlay`, on): pressing ▶ Auto while the song is
  stopped **arms** it (the button says "Armed: starts with Play" and blinks). Play (with Rec on to
  record) starts Auto **exactly on the song's first step, after the count-in** (the transport's
  `playStartTime`), from the progression's **first chord**, so every take starts the same.
- **Stays armed**: when the song stops, Auto stops and waits again; the next Play starts it from
  the top (take after take). ■ Stop disarms it.
- While the song plays, ▶ Auto starts on the next bar (as before).
- **The page must be long enough** (loop mode): a progression takes chords × every × the
  pattern's (or a bar's) length; on a shorter page, the recording would wrap onto itself. The row
  then says "takes 4 bars, the page has 2" with **Fit the page** (sets the page's step count, at
  most 128 steps) or **Spread over pages** (song mode, below).
- The count-in shows on the MiniLab's display ("Auto in 3…"); the first chord lands on bar 1.
- Overdub/Replace and Snap work as for anything recorded.

### Recording across pages in song mode (D164)

In song mode the song plays its pages in order (the slots, with their repeats). Auto's clock runs
on through page changes, so a progression longer than a page goes on into the next ones, and
what it records lands in the page playing at that moment.

- **The right page for every note**: a note is recorded into the page the song plays **at the
  note's own time**, not the one playing when it was scheduled (`recordNoteOn` asks the
  transport's scheduled steps, `positionAt(time)`: slot, page step, progress). Today a note
  scheduled just before a page change would land in the old page; this fixes it for everything
  recorded with a time (Auto, the arp, patterns, strums).
- **Before a take, Auto checks the song from the page it starts on** and says what it finds, in
  the Pad 1 row, each with a button:
  - **Not enough pages**: "the progression takes 8 bars, the song has 4 from here: **Add 2
    pages**". New pages are **copies of the page Auto starts on** (its drums and other tracks go on),
    with the keys' track's lane emptied (and the bass track's), added after the last page the take
    reaches, each its own pattern (a copy, not a clone). The amount covers one round of the
    progression; press again for another round. Undo takes them all back (one step).
  - **Clones**: two slots playing the same pattern would get each other's chords ("pages 2 and 4
    share a pattern: what's recorded on one shows on both"): **Make copies** gives the cloned
    slots their own patterns (D8–D13).
  - **Repeats**: a page that plays twice would get two chords written over each other ("page 3
    plays 2 times"): **Unroll** turns its repeats into copies.
- **Mixed page lengths** are fine: chords follow the clock in bars (or patterns), whatever the
  pages' lengths; a chord that starts near a page's end and goes on is recorded with its length
  (cut at the page's end, as for any note, D131).
- **The end of the song** stops the take (and Auto) as it stops the song.
- **Loop mode** (the page repeats): as before, **Fit the page**, or **Spread over pages**: adds
  the pages the progression needs (as above) and switches the song to song mode, from this page.

### Settings

`autoEvery: 1 | 2 | 3 | 4 | 6 | 8`, `autoLoop: boolean`, `autoWithPlay: boolean`; running or
armed isn't saved.

### Tests

Unit: the change points for patterns of 12, 16 and 32 sixteenths and every N; the start on the
next bar while playing; Loop off stops after the last chord; Stop clears; Free follows the best
suggestion; a passing chord and back; the keys as single notes while Auto plays. E2E: Auto on the
Royal road at a fast tempo walks F G Em Am (the equation), Stop silences; armed, Play with Rec on
and a count-in records F G Em Am on bars 1–4 of the keys' track; the page warning and Fit the page;
song mode: a progression over two one-bar pages records each chord in its page (the first
chord of page 2 not in page 1), Add pages adds copies with the keys' lane empty, Make copies and
Unroll; unit: `positionAt` across a page change, the pages a take needs.

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
