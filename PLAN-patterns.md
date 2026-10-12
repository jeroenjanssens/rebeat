# Plan: 53 patterns, grouped; triplets; patterns that pick notes (bass lines, broken chords)

Status: proposed 2026-10-12. Decisions D174–D179 when built. How we work: on `main`, commit
early and often, e2e once at the end of the batch.

## 0. Where it starts

- Patterns (`model/perform.ts: PATTERNS`, D153, D155): 22, each `{ id, name, length (16ths),
steps: { at, length, vel, part: all | chord | bass }[] }`, played by the rhythm engine
  (`state/perform.ts: step`) on a 16th grid, a hit playing the whole chord, the chord without the
  bass, or the bass (a bass hit without a bass: the chord's lowest note).
- What the rhythm knows of a chord: `Pool { chord: number[] (as voiced), bass: number[],
velocity }`: the notes, not the root (a voiced chord's lowest note isn't always the root).
- Recording (D149, D164): a timed note is recorded at its time; with **Snap** on the _hit_ snaps
  to the Quantize grid (16ths), which would pull a triplet onto a 16th.
- Auto counts in pattern lengths (`autoUnit()`: 16ths) and the room for a take in 16ths (D163).
- The picker is a flat menu (`PlayStylesRow: Choice`); knob 7 steps through `PATTERNS` in order.

## 1. The pattern notation (D174)

Writing 53 patterns as `{ at, length, vel, part }` lists is unreadable. A pattern becomes
**lanes of characters, one per step**, like a drum machine grid, built by `pattern()`:

```ts
pattern("motown", "Motown stabs", "Rock, pop & soul", "Short chords on 2 and 4 with a pickup", {
  division: 4, // steps per beat: 4 = 16ths (default), 3 = 8th triplets, 6 = 16th triplets
  bass: "X.......x.......",
  chord: "....x.....ox....",
});
```

- Characters: **X** accent (vel 1), **x** normal (0.8), **o** soft (0.55), **-** holds the
  note before one step longer, **.** a rest. A lane's length is the pattern's length in steps
  (all lanes the same length; a test checks).
- Lane names say **which notes** a hit plays (§3): `all`, `chord`, `bass` (as today), or chord
  tones (`root`, `3`, `5`, `7`, `8`), the chord's own notes by height (`low`, `mid`, `high`), the
  bass's tones (`bass5`, `bass8`), and `walk` (a walking line).
- Each pattern has an **id** (stable, stored in the settings), a **name**, a **group** (§4), a line
  **about** it, and its **division**.
- The existing 22 are rewritten in this notation with exactly the same hits (a test compares the
  converted hits with the old lists before those are removed).

## 2. Triplets (D175)

- `division` per pattern: **4** (16ths, as now), **3** (8th-note triplets: 12/8 and true shuffle),
  **6** (16th-note triplets: trap rolls). The rhythm engine's step is `beat / division`; a
  pattern's length is `steps / division` beats.
- **On the transport's grid**: steps count from the song's first step (`playStartTime`), so a
  triplet pattern stays on the beat while the song plays; while stopped, from the first key.
- **Auto** counts in beats: `autoUnit()` returns the pattern's length in beats (a 4/4 bar: 4), so
  every N patterns works for any division; the room for a take (D163) converts to 16ths (a 12/8
  bar is still a 4/4 bar of 4 beats).
- **Recording triplets**: notes the rhythm engine plays are already on their musical grid, so
  they're recorded **unsnapped** (their exact place, a step and its offset, `Note.offset`
  −0.5…0.5, schema 9): `recordNoteOn(…, { at, spread, onGrid: true })` skips Snap. A key you play
  yourself snaps as before. (A triplet 8th is 1⅓ sixteenths: step 1, offset +0.33.)
- **The existing Shuffle** becomes a true triplet shuffle (division 3: long-short, 2:1); its id
  stays (`shuffle`), so the old 16th approximation is replaced.

## 3. Patterns that pick notes (D176)

A hit can play particular notes of the chord, which makes bass lines and broken chords possible.

### 3.1 What the rhythm knows of the chord

- `Pool` gets the chord's **root** (a MIDI note near the chord) and its **tones** by interval:
  the keys pass the chord as built (from the pads, Key mode, a suggestion or Auto: `raw[0]` is the
  root before voicing, D140) along with the voiced notes. Plain keys (no chord): the lowest held
  note is the root.
- The **next chord**, when it's known (Auto knows it: `autoNext()`), for approach notes.

### 3.2 The selectors (lane names)

| Lane               | Plays                                                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `all`              | the whole chord and its bass (as today)                                                                                                                                                                              |
| `chord`            | the chord without its bass (as today)                                                                                                                                                                                |
| `bass`             | the bass (Bass on, D139/D154), else the chord's lowest note (as today)                                                                                                                                               |
| `root` `3` `5` `7` | that chord tone (the third of the quality: minor or major; `7` falls back to the octave on a triad), in the bass's register (below the chord)                                                                        |
| `8`                | the root an octave above the bass's root                                                                                                                                                                             |
| `bass5` `bass8`    | the fifth and the octave above the bass note (country and rock bass)                                                                                                                                                 |
| `low` `mid` `high` | the voiced chord's lowest, middle and highest note (broken chords, fingerpicking)                                                                                                                                    |
| `walk`             | a walking bass: per beat the root, then up through 3, 5, 6 of the chord; on the last beat before a chord change (when the next chord is known) a chromatic approach to the next root from a half step below or above |

- Which register: bass selectors (`root` … `bass8`, `walk`) play where the bass would (the Bass
  octaves, D139, or an octave below the chord without Bass), on the bass's track when it has one
  (D154); chord selectors (`low` `mid` `high`) play the voiced chord's notes on the chord's sound.
- **With the Arp on**, plain `chord` hits play the next arp note (as now); hits that pick their
  notes play what they pick.
- **Strum, Slop, Balance** apply to every hit (a `chord` hit is strummed; one picked note isn't).

## 4. The patterns and their groups (D177)

53 in all: the 22 (§0) and 31 new ones (marked +). In the picker they're grouped; the order
within a group is calm to busy. Knob 7 steps through all of them, group by group.

| Group                   | Patterns                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Basics**              | Whole notes, Halves, Quarters, Eighths, Dotted, Pulse, + Rock push (8ths, the chord anticipated on 4-and)                                                                                              |
| **Ballads & keys**      | Ballad, Waltz, + Jazz waltz (chord on 1 and 2-and), + Triplet ballad (12/8 piano: bass, then chord triplets), + Alberti bass (low–high–mid–high), + Arpeggio up (low–mid–high–mid, the broken chord)   |
| **Rock, pop & soul**    | Backbeat, Gallop, + Motown stabs (2 and 4 with a pickup), + Gospel shout (fast 16th stabs), + Stadium eighths (palm-muted 8ths, root and fifth bass)                                                   |
| **Jazz & blues**        | Charleston, Shuffle (now true triplets), + Swing comp (Freddie Green quarters, short), + Walking bass (`walk`), + Boogie-woogie (the left hand's 8th-note root–3–5–6 figure)                           |
| **Latin**               | Tresillo, Clave (son 3-2), + Son clave 2-3, + Rumba clave, + Habanera, Bossa, + Samba (partido alto, two bars), + Cha-cha-chá, Montuno, + Reggaeton (dembow), + Bolero (two bars), + Tango marcato     |
| **Caribbean & African** | Offbeats, One drop, Ska, + Reggae bubble (the organ's offbeats with ghost notes), + Afrobeats (two bars), + Highlife (offbeat guitar)                                                                  |
| **Dance & electronic**  | House, Funk, + Disco stabs (offbeats with pickups, octave bass), + Trance gate (gated 16ths), + UK garage (skippy 2-step stabs)                                                                        |
| **Hip-hop**             | + Boom bap (sparse stabs: 1, 2-a, 4), + Trap (long chord, 16th-triplet rolls on the hat beat: division 6)                                                                                              |
| **Folk & country**      | Oom-pah, + Polka (fast oom-pah with a pickup), + Train beat (boom-chicka), + Root–fifth bass (country: root on 1, fifth on 3, chords between), + Travis picking (alternating bass with treble pinches) |

Each one's lanes are written out in `model/patterns.ts` (the patterns move there from
`perform.ts`), with its `about` line; the hits of the new ones follow their usual comping (e.g.
Habanera: `chord: "X..xX.x.X..xX.x."`; Son clave 2-3 over two bars: `"....X.X.........X..X..X........."`;
Reggaeton: `"X..x..x.X..x..x."` on the chord with `bass: "X.......X......."`; Walking bass:
`walk: "X...x...x...x..."` with `chord: "....o.......o..."`).

## 5. The picker with groups (D178)

- The Play row's **Pattern** choice opens a menu of **groups** (with the count), each opening its
  patterns (← Back), the way the Keys menu opens the library (D167). Each pattern shows its name,
  its **group's tag** (12/8, 2 bars), a line about it, and a **tiny rhythm preview** (its lanes as
  dots, the accents bigger).
- Hovering a pattern in the menu doesn't play it; picking it does (it plays from the next step).
- The picked pattern's name shows in the row with its group ("Habanera · Latin").
- Knob 7 (D153) steps through all 53 in group order; the display shows "Pattern / Habanera".
- Patterns' ids never change: the setting keeps working (the old `shuffle` id plays the new
  triplet shuffle).

## 6. Tests

- **Unit** (`model/patterns.test.ts`): the notation (lanes, holds, accents; lanes of equal
  length; unknown characters fail); the 22 converted patterns have the same hits as before; every
  pattern's hits are inside it, its group is one of the nine, its id unique; divisions 3 and 6.
- **Unit** (rhythm, `state/keys.test.ts` with the mocked engine): a triplet pattern's hits a
  third of a beat apart; the selectors (Alberti plays low, high, mid, high of a C major chord;
  Root–fifth bass plays C then G below; `3` of a minor chord is its minor third; `walk` approaches
  the next chord when Auto knows it, else plays its 6th); bass selectors go to the bass's track;
  Auto counts a 12/8 pattern as 4 beats.
- **Unit** (recording): an on-grid triplet note keeps its offset with Snap on.
- **E2E**: the grouped menu (a group, a pattern, back), knob 7 across groups; the Triplet ballad
  recorded with its triplet offsets; the Walking bass's notes under Auto.
- **Golden levels**: unaffected (patterns are live only).

## 7. Build order

| Step | What                                                                        | Decisions |
| ---- | --------------------------------------------------------------------------- | --------- |
| 1    | The notation (`model/patterns.ts`), the 22 converted (same hits), tests     | D174      |
| 2    | Divisions (triplets) in the rhythm engine, Auto in beats, on-grid recording | D175      |
| 3    | The pool's root and tones, the selectors, the next chord for `walk`         | D176      |
| 4    | The 31 new patterns, groups and `about` lines                               | D177      |
| 5    | The grouped picker with previews; knob 7 in group order                     | D178      |
| 6    | Guide (the patterns, the groups), hints, PLAN.md, AGENTS.md; e2e            | D179      |

## 8. Open questions

1. **The Shuffle**: replace the 16th approximation with the true triplet shuffle (proposed), or
   keep both ("Shuffle" and "Triplet shuffle")?
2. **Walking bass without Auto**: when the next chord isn't known (you play the chords yourself),
   the last beat plays the 6th (proposed) or a chromatic note below the root?
3. **Patterns in 3/4 and 6/8 songs**: the patterns are written in 4/4 (the Waltz and Jazz waltz in
   3/4). Play a 4/4 pattern in a 3/4 song as it is (it drifts against the bar, as now), or stretch
   it? Proposed: as it is, and the picker marks each pattern's meter ("3/4", "12/8").
