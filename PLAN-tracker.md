# Plan: a Tracker panel, fully keyboard driven, in the look of Fast Tracker 2

Status: agreed and built 2026-10-16 on the `tracker` branch (PLAN.md §0.6u lists what changed
from this plan). Jeroen: the colors come from the current theme
instead of FT2's steel blue (D267), and every other default stands (§11).
How we'd work: a `tracker` branch, commit early and often, e2e once at the end of the batch.

The idea in one line: **the edited pattern as rows of text, top to bottom**, one column group
per track (note, volume, effects, locks), edited from the keyboard alone, over the same step
data the drum machine and the piano roll edit. No new data model: the tracker is another view,
like the piano roll, and every edit goes through `commit`, so undo, autosave and the other
panels follow.

## 0. Where it starts

- A pattern is `Pattern { stepCount, stepSize, lanes: Record<trackId, Lane> }`; a lane has
  `steps: Step[128]` and may have its own `stepCountOverride`, `stepSizeOverride`,
  `swingOverride` (polyrhythms) and `clip` settings.
- A step is `{ on, velocity, probability, nudge, ratchet, pitch, gate, accent, condition?,
locks?, notes? }`. Hits read `on`, `pitch`, `gate`; Notes read `notes: Note[]`, each
  `{ pitch, length (steps), velocity, slide?, bend?, offset? }`. Notes can overlap freely
  and a step can hold a chord.
- Conditions are `"1:2" | "2:2" | "1:3" | "1:4" | "FILL" | "!FILL"` (`model/params.ts`).
- Keys: `app/commands.ts` has a command registry (rebindable, in the palette) and `addKeyHook`
  for raw keys before shortcuts (the pad view uses it). The beatbox panel takes its own keys
  while it has focus. Previews and recording of held notes go through `state/keys.ts`
  (`noteOn`, `recordNoteOn`/`recordNoteOff`); the keys follow the selected track by default.
- The edited section (`ui` state) is what the drum machine and the piano roll show; the tracker
  shows the same one.
- Canvases that draw only the visible part exist (`panels/timeline/ViewCanvas`), and
  `onStep` events mark the step being heard without React.

## 1. What it looks like (D265)

The panel is skinned after Fast Tracker 2's main screen: bevelled chrome (light
top-left edges, dark bottom-right) in a color from the current theme, a dark pattern area, pale monospaced text in a pixel font,
hex row numbers, every 4th row lighter and every 16th lighter still, and the **cursor row
fixed in the middle** as a bar across all tracks while the pattern scrolls past it. It's the
spirit of FT2, drawn by us: no assets, fonts or palettes are copied.

```
┌─ TRACKER ───────────────────────────────────────────────────────────────────────────┐
│╔═══════════╗╔═══════════╗╔═══════════╗ ╔════════════════════════════════════════════╗│
│║Pos   02 ▲▼║║Octave  4 ▲▼║║Add     1 ▲▼║ ║ ~∿~∿~  │ ───── │ ~~∿~ │ ∿∿∿∿ │ ───── │ ∿~ ║│
│║Patt  B  ▲▼║║Step 1/16 ▲▼║║Rows Auto ▲▼║ ║ KICK   │ SNARE │ HAT  │ BASS │ CHORD │ VOX ║│
│║Len   40 ▲▼║║BPM   112 ▲▼║║EDIT  FOLLOW ║ ╚════════════════════════════════════════════╝│
│╚═══════════╝╚═══════════╝╚═══════════╝                                               │
│┌──┬──────────────┬──────────────┬─────────────────────┬────────────────────────────────┐│
││  │ 01 KICK      │ 02 SNARE     │ 04 BASS             │ 05 CHORDS                      ││
││0C│ ···  ··  ··· │ ···  ··  ··· │ ···  ··  ···        │ ···  ··  ···  ···  ··          ││
││0D│ ···  ··  ··· │ ···  ··  ··· │ ===  ··  ···        │ ···  ··  ···  ···  ··          ││
││0E│ ···  ··  ··· │ ···  ··  ··· │ ···  ··  ···        │ ···  ··  ···  ···  ··          ││
││0F│ ···  ··  ··· │ ···  ··  ··· │ ···  ··  ···        │ ···  ··  ···  ···  ··          ││
│╞10╡ C-4  7F  ··· │ ···  ··  ··· │ A-2  64  300        │ A-3  50  ···  C-4  50 ···      │╡  ← cursor row
││11│ ···  ··  ··· │ ···  ··  ··· │ ···  ··  ···        │ ···  ··  ···  ···  ··          ││
││12│ C-4  40  R03 │ C-4  7F  ··· │ ···  ··  ···        │ ···  ··  ···  ···  ··          ││
││13│ ···  ··  ··· │ ···  ··  Y80 │ ===  ··  ···        │ ===  ··  ···  ===  ··          ││
│└──┴──────────────┴──────────────┴─────────────────────┴────────────────────────────────┘│
│ EDIT · Row 10 · BASS · note A-2 · glide into this note (300)        Esc: edit  Tab: track│
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Top panel**: Position (the section, hex like FT2), Pattern (its name), Length (rows),
  Octave, Step (step size), Add (the edit step), BPM, Rows (the row grid, §4), and the EDIT
  and FOLLOW lamps. The field boxes have the ▲▼ buttons FT2 had, and each field has a key
  (§6). The scopes from the top bar (D263) come back here as FT2's scope strip, one per
  visible track, with mute (click) and solo (right-click) as in FT2.
- **Pattern editor**: row numbers in hex on the left (00–7F), then one group per track:
  its header (number, name in caps, the track's color as a thin bar), then its columns.
  Empty fields are dots, as in FT2. Note-offs are `===`.
- **Status line** (FT2 didn't have one; it's how we keep explain mode and discoverability):
  the mode, the row, the track, what the field under the cursor means in words, and two key
  hints. It doubles as the screen-reader text (§9).
- **Compact**: `Alt+P` hides the top panel; the pattern editor and the status line stay.
- **Pixel font** (D266): our own bitmap glyphs, ~60 of them (0–9, A–Z, `- # · = ▲ ▼ ~`), 8×8 on
  a 9×12 cell, drawn from a glyph atlas per color and scaled by whole numbers (×1, ×2, ×3:
  `Alt+=` / `Alt+-`), so it stays crisp on every screen. Drawing it ourselves avoids a font
  license (the project license is still open, D6).
- **Colors** (D267): FT2's layout and bevels, the **current theme's** colors, so the tracker
  belongs to whichever of the 20 themes is on and changes with it (`onThemeChange`). From the
  theme tokens:

  | Part                      | Color                                                                  |
  | ------------------------- | ---------------------------------------------------------------------- |
  | Chrome (FT2's steel blue) | `--accent` mixed into `--raised` (about 30%), so it's tinted, not loud |
  | Bevel edges               | the chrome lighter (top-left) and darker (bottom-right), in oklab      |
  | Pattern area              | `--display` (each theme's darkest surface; light in light themes)      |
  | Text, dots, row numbers   | `--text`, `--text-faint`, `--text-dim`                                 |
  | Every 4th / 16th row      | `--head`, once and twice                                               |
  | Cursor bar, EDIT lamp     | `--accent` (the bar a translucent band, the field under it solid)      |
  | Playhead bar, FOLLOW lamp | `--lit`                                                                |
  | Track headers             | the track's own color as a thin bar                                    |

  The mixes are computed once per theme in `render/theme.ts` (the canvas needs `#rrggbb`), and
  the screenshot check covers a dark and a light theme. There's no separate FT2 palette.

## 2. Columns: how a step becomes text (D268)

Each track gets a column group. Which columns it has depends on its mode:

| Mode  | Columns                                                                                       |
| ----- | --------------------------------------------------------------------------------------------- |
| Notes | 1–8 **note columns** (note + volume each), then 1–4 **effect columns**, then **lock columns** |
| Hits  | 1 note column (note + volume), effect columns, lock columns                                   |
| Clip  | one **clip column**: `LOOP` / `ONCE` / `OFF` on row 00 (the lane's clip settings)             |

**Note field** (`C-4`, `C#4`, `===`, `···`):

- **Notes mode**: a note starts on its row; its length shows as a note-off `===` on the row
  where it ends, unless another note starts in that column there (as in a tracker, the next
  note ends the one before). A note that runs to the end of the pattern has no note-off.
- **Hits mode**: a hit shows the note it plays: the track's hit note (C-4 for a sample) plus
  the step's `pitch`. Typing C-4 on a sample track is a plain hit; D-4 is a hit two semitones
  up. The gate shows as a note-off when it's shorter than the row (§3, `ECx`).
- **Chords** spread over note columns. Which column a note goes in is worked out in order of
  start, then pitch: the lowest free column. A note can carry a **column hint**
  (`Note.col?`, schema 14, D269): the column you typed it in, kept whenever that column is
  free, so a note doesn't jump to another column after an edit. The piano roll ignores the hint.
- **Columns per track**: as many as the pattern needs (its most overlapping notes) and at
  least the number you set for the track (`Alt+Shift+Right` adds one, `Alt+Shift+Left` removes
  an empty one). That count is view data, saved with the project without an undo step
  (`store.editView`, like the timeline's folds: `Project.tracker?.columns`, schema 14).

**Volume field**: the note's (Notes) or the step's (Hits) velocity in hex, `01`–`7F`, MIDI
velocity, which is also what a MIDI keyboard records (D270). It's shown dim when it's the
default velocity.

**Effect columns**: each is a command letter plus two hex digits (`R03`). A step's fields that
aren't at their default show as commands, in a fixed order, filling the effect columns; typing
a command in any effect column sets that field. A step can't hold the same command twice, so
there's never a conflict. A track shows as many effect columns as its busiest step needs, at
least the number you set (1 by default).

**Lock columns**: one per locked parameter (`CUT`, `RES`, `MAC1`…, the header is the knob's
short name), the value `00`–`FF` over the knob's range. `Alt+L` adds one through the knob
picker (D208), which you can drive from the keyboard. Lock columns show the parameter locks
already in the pattern by themselves.

## 3. Effect commands (D271)

The rule: **an FT2 letter where Rebeat does the same thing; otherwise a letter FT2 left free**,
so an FT2 hand never reads a familiar letter in a different meaning. Everything here is a field
that already exists, so the commands are only a way to write it.

| Cmd   | Meaning in Rebeat                                                                                | Field                       | FT2           |
| ----- | ------------------------------------------------------------------------------------------------ | --------------------------- | ------------- |
| `3xx` | Glide into this note (any `xx`; `300` reads "glide")                                             | `Note.slide` (step's notes) | tone porta    |
| `9xx` | Sample start, `xx`/`FF` of the sample (sample tracks)                                            | lock `sound.start`          | sample offset |
| `ECx` | Cut: the hit ends after `x`/16 of the row (Hits)                                                 | `gate`                      | note cut      |
| `EDx` | Delay by `x`/16 of the row (typed; stored and shown as `Nxx`)                                    | `nudge`                     | note delay    |
| `Nxx` | Nudge, `00`–`FF` = −½ … +½ step, `80` on the grid                                                | `nudge`                     | (free)        |
| `Rxx` | Ratchet: `02`–`08` hits in the step                                                              | `ratchet`                   | multi retrig  |
| `Yxx` | Probability, `00`–`FF` = 0–100% (none: always)                                                   | `probability`               | (free)        |
| `Ixy` | Condition: on the `x`th of every `y` loops (`I12`, `I22`, `I13`, `I14`); `IF1` FILL, `IF0` !FILL | `condition`                 | (free)        |
| `Sxx` | Accent (`S01`; "stress")                                                                         | `accent`                    | (free)        |
| `1xx` | Bend: Rise by `xx` semitones (time from the Bend card)                                           | `Note.bend` rise            | porta up      |
| `2xx` | Bend: Fall by `xx` semitones                                                                     | `Note.bend` fall            | porta down    |
| `4xy` | Bend: Shake, rate `x`, depth `y`                                                                 | `Note.bend` shake           | vibrato       |
| `Wxy` | Bend: the other shapes, `x` the shape (Scoop, Doit, Dip, Next), `y` the amount                   | `Note.bend`                 | (free)        |

- FT2 commands with no counterpart (volume slide `A`, position jump `B`, pattern break `D`,
  speed/tempo `F`, panning…) aren't accepted. Typing one says why in the status line, and what
  to use instead ("Tempo changes live on the timeline's Tempo lane").
- Bends (`1`, `2`, `4`, `W`) come last (phase 5); a bend's time, delay and ease stay in the
  Bend card, and the tracker shows the shape and amount.
- `0xy` (arpeggio) is left out: Rebeat's arpeggiator is per track, not per step. An idea for
  later: `0xy` as a quick chord, writing the note +x and +y as real notes.

## 4. Rows, step sizes and polyrhythms (D272)

A row is one step of the pattern, so the default is exactly what the drum machine shows. Tracks
with their own step size or length don't fit that grid, so:

- **Rows: Auto** (default) picks the coarsest grid on which every visible track's steps land
  (1/16 with a 1/16T track gives rows of 1/48: ×3). **Rows ×1, ×2, ×3, ×4** set it by hand.
- On a finer grid, a track's steps sit on their rows and the rows between are shaded for it
  (not a step for that track). Typing in a shaded row of a Notes track sets the note's
  **offset** (`Note.offset`, ±½ step), so ×2 or ×4 lets you place notes between steps; on a
  Hits track it sets the step's nudge.
- A track **shorter than the pattern** repeats in the drum machine, so its later rows show the
  repetition as **ghost rows** (dim). Editing a ghost row edits the step it repeats, and the
  status line says so.
- The **edited section's** own shorter length (`Section.steps`) dims the rows past its end,
  and its mutes and transpose are shown in the track headers (`M`, `+2`). They're not edited
  here.

## 5. Modes: edit, follow, record (D273)

- **Edit mode** (lamp EDIT) is FT2's record mode: when it's on, note keys write at the cursor
  and the cursor moves down by **Add** rows. When it's off, note keys only play the sound (a
  preview through `state/keys.ts`, on the cursor's track) and the arrows only move.
- The cursor's track **is** the selected track (`selectedTrackId`), so the Inspector, the
  piano roll and the keys follow the tracker as you move between tracks.
- **Follow** (lamp FOLLOW): while playing, the pattern scrolls under the cursor row, as in
  FT2, and the cursor follows the playhead. Follow off: the cursor stays and the playhead row
  is drawn as a second bar.
- **Recording**: playing with edit mode on records what you play, at the playhead row, through
  the same path as Rec (`recordNoteOn`/`recordNoteOff`: Overdub/Replace and Snap apply), into
  the cursor's track, with lengths from how long you held the keys. Effect and volume typing
  goes to the cursor's row, not the playhead's.
- **MIDI**: in edit mode, notes from a MIDI keyboard are entered at the cursor like note keys
  (velocity into the volume field). Notes that arrive within 30 ms of each other are one chord
  and fill the next note columns. The keys' play styles (strum, arp) aren't applied to entry,
  only to the sound.

## 6. The keyboard (D274)

Everything has a key, every key is a command in the palette (category **Tracker**), and every
one can be rebound in Settings → Shortcuts. Keys are physical (`e.code`), so the note keys sit
in the same place on AZERTY or QWERTZ keyboards. The tracker's keys only apply while it has
focus; Space (play/stop) and the Mod-shortcuts (undo, save, the palette) stay global.

**Notes** (the tracker layout, two octaves, from the current octave):

```
 2 3   5 6 7   9 0   =            C# D#   F# G# A#   C# D#   F#
Q W E R T Y U I O P [ ]  →  C D E F G A B C D E F G   (octave + 1)
 S D   G H J   L ;              C# D#   F# G# A#   C# D#
Z X C V B N M , . /         →  C D E F G A B C D E    (octave)
```

| Key                                 | What it does                                                   |
| ----------------------------------- | -------------------------------------------------------------- |
| note keys                           | the note (edit mode: write it, move down by Add; off: play it) |
| `` ` `` or `1`                      | note-off (ends the note above in this column here)             |
| `Alt+[` / `Alt+]`, Numpad `/` / `*` | octave down / up (0–8)                                         |
| `Alt+0` … `Alt+9`                   | Add (edit step): 0–9 rows                                      |
| `Esc`                               | edit mode on / off                                             |
| `Scroll Lock`, `Alt+F`              | follow on / off                                                |

**Moving**

| Key                                    | What it does                                               |
| -------------------------------------- | ---------------------------------------------------------- |
| `↑` `↓`                                | one row (wraps at the ends, as in FT2)                     |
| `←` `→`                                | one field (note, volume digits, effect letter and digits…) |
| `Tab` / `Shift+Tab`, `Alt+→` / `Alt+←` | next / previous track                                      |
| `PgUp` / `PgDn`                        | 16 rows                                                    |
| `Home` / `End`                         | first / last row                                           |
| `F9` `F10` `F11` `F12`                 | row 0, ¼, ½, ¾ of the pattern (as in FT2)                  |
| `Mod+←` / `Mod+→`                      | previous / next section (the `section.*` commands)         |

**Editing**

| Key                                 | What it does                                               |
| ----------------------------------- | ---------------------------------------------------------- |
| `0`–`9`, `A`–`F` (on a value field) | type the hex digit and move to the next digit              |
| a letter (on an effect's letter)    | the command; then its two digits                           |
| `Delete`                            | clear the field under the cursor                           |
| `Shift+Delete`                      | clear the whole cell (note, volume, effects) in this track |
| `Backspace`                         | delete this row in this track, pulling the rows below up   |
| `Insert`, `Shift+Backspace`         | insert an empty row in this track, pushing the rows down   |
| `Mod+Backspace` / `Mod+Insert`      | the same across all tracks                                 |
| `Mod+↑` / `Mod+↓`                   | transpose the note (or the selection) a semitone           |
| `Mod+Shift+↑` / `Mod+Shift+↓`       | an octave                                                  |
| `Alt+Shift+→` / `Alt+Shift+←`       | add / remove a note column                                 |
| `Alt+E` / `Alt+Shift+E`             | add / remove an effect column                              |
| `Alt+L`                             | add a lock column (the knob picker)                        |
| `Alt+M` / `Alt+S`                   | mute / solo the cursor's track                             |
| `Enter`                             | play the cursor row once (hear it)                         |
| `Shift+Enter`                       | play from the cursor row                                   |

**Selecting and the clipboard**

| Key                                    | What it does                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `Shift+` arrows / PgUp/PgDn / Home/End | grow a block selection (fields across tracks)                                    |
| `Mod+A`                                | this track's column; again: the whole pattern                                    |
| `Mod+C` / `Mod+X` / `Mod+V`            | copy / cut / paste at the cursor (the block's shape)                             |
| `Mod+Shift+V`                          | paste into empty fields only (mix paste)                                         |
| `Mod+I`                                | interpolate volume, effect or lock values from the block's first row to its last |
| `Mod+J` / `Mod+Shift+J`                | volume of the block ×0.9 / ×1.1                                                  |

**The view**

| Key               | What it does                                  |
| ----------------- | --------------------------------------------- |
| `Alt+=` / `Alt+-` | the font ×1 / ×2 / ×3                         |
| `Alt+P`           | top panel on / off (compact)                  |
| `Alt+R`           | Rows: Auto, ×1, ×2, ×3, ×4                    |
| `Mod+Alt+↑` / `↓` | pattern length +1 / −1 row (`Shift`: ×2 / ÷2) |

Open: FT2 itself used Space for edit mode and F1–F8 for the octave. Space is Rebeat's play/stop
everywhere, and F1 is the guide, so the defaults above are Renoise-like (Esc for edit mode).
A setting **"FT2 keys"** could switch to Space = edit mode and F1–F8 = octave while the
tracker has focus (§11).

## 7. How it's built (D275–D277)

**Pure model** (`model/tracker.ts`, unit-tested in Node, no React, no audio):

- `rowGrid(project, pattern, rows)`: the row length and, per track, which rows are its steps,
  shaded or ghosts.
- `trackColumns(pattern, track, view)`: the note columns (with each note's column, honoring
  `Note.col`), effect and lock columns.
- `cellAt(…)` / `writeCell(draft, …)`: read and write one field. Writes are immer recipes on
  the project, used inside `commit` with merge keys for runs of typing (`tracker-${trackId}-${row}`).
- `fxEncode(step)` / `fxDecode(cmd, step)`: the commands in §3 both ways, with a round-trip
  test for every field.
- Block operations: insert/delete rows, transpose, interpolate, scale volume, copy/paste
  (`TrackerClip`: a block of fields, kept with the app's clipboard as JSON so it can be pasted
  into another pattern or project), mix paste.

**Scoped commands** (D275): the command registry gets `scope?: "tracker"`. A scoped command's
keys only match while its panel has focus (a `data-scope` on the focused element's ancestors),
and win over global ones there; unscoped commands work as today. This lets the tracker reuse
the Settings → Shortcuts page and the palette instead of a private key handler, and the
beatbox panel could move onto it later. The note keys and hex digits stay a key hook (they
depend on the field under the cursor), registered only while the tracker has focus.

**Drawing** (`panels/tracker/`): one canvas for the pattern, covering only the visible rows
(the `ViewCanvas` approach), redrawn on project changes to the edited pattern and on cursor
moves. The playhead row comes from `onStep` events, without React. The glyph atlas is built
once per color and scale (`render/pixelFont.ts`). The top panel is regular DOM in the FT2 skin
(it needs buttons and hints). The scope strip reuses `Scope`.

**Previews and recording** (D276): note keys call `noteOn(pitch, velocity, "tracker")` (a new
`KeysSource`) and release on key-up. The keys follow the selected track, which is the cursor's
track (§5). Recording while playing goes through `recordNoteOn`/`recordNoteOff`, with the
tracker's edit mode standing in for Rec while it has focus. No new path makes sound, so stop,
panic and the Keys channel behave as they do now (AGENTS.md §8: "Keyboards go through
`state/keys.ts`").

**Schema 14** (D277): `Note.col?` (a column hint, 0–7) and `Project.tracker?: { columns:
Record<trackId, { notes?, fx?, locks?: string[] }>, … }` (view data, saved through
`editView`). Both optional: a migration that only bumps the version, plus tests, and the v6
fixtures still load.

## 8. Panel, layout, settings

- Panel `tracker` (title **Tracker**, an icon in the same set), lazy like the others, with
  pop-out and full screen. A command `panel.tracker`.
- A layout preset **Track**: the tracker large, the Inspector and the Library beside it, the
  mixer below (§11).
- Settings → Tracker: font scale, hex or decimal volume (D270), FT2 keys (§6), the note-off key, the default velocity, the default Add.
- The tracker's state that isn't project data (octave, Add, edit mode, follow, Rows, the
  cursor) lives in `ui` state and the settings, never in the undo history.

## 9. Help, hints, accessibility

- A guide chapter **The tracker**: the screen, the columns, the commands table (§3), the keys
  (§6, with `{{key:…}}` so they show rebindings), recording, rows and polyrhythms. It links from
  the drum machine and piano roll chapters.
- Explain-mode hints for every top-panel field, the lamps, the scope strip and the columns. The
  canvas has hit areas so hovering a field shows its hint (as the timeline's canvases do).
- The status line describes the field under the cursor in words ("BASS, row 10, effect 300:
  glide into this note"); it's an `aria-live="polite"` region, so the tracker can be used with
  a screen reader, which a canvas alone can't.

## 10. Phases and what each one has to show

| Phase | What                                                                                                          | Done when                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| P0    | `model/tracker.ts`, schema 14, the fx codec, block ops                                                        | unit tests: columns, round trips, insert/delete, transpose, interpolate, ghosts, Rows Auto                       |
| P1    | the panel, the pixel font, the FT2 skin, scrolling with the cursor row in the middle, the playhead, Follow    | screenshots in a dark and a light theme, next to FT2's for the layout; the playhead stays on time with the audio |
| P2    | scoped commands; notes, note-offs, moving, edit mode, Add, octave, delete/insert, previews                    | typing a drum pattern and a bass line without the mouse (e2e)                                                    |
| P3    | volume, effect and lock columns, hex typing, selection, clipboard, transpose, interpolate                     | every field in §3 written from the keyboard and read back by the drum machine (e2e)                              |
| P4    | recording while playing, MIDI entry and chords                                                                | a recorded take matches the piano roll's; a MIDI chord fills note columns (e2e, fake MIDI)                       |
| P5    | Rows ×n and Auto, offsets on fine rows, ghost rows, Clip tracks, section settings, bends (`1`, `2`, `4`, `W`) | a 1/16T track next to a 1/16 one, edited on Rows Auto                                                            |
| P6    | settings, the Track layout, the guide chapter, hints, accessibility, FT2 keys option                          | `hints.test.ts` and `explain.spec.ts` pass; full verification; golden levels unchanged                           |

The tracker doesn't change how anything sounds, so the golden levels must stay as they are.

## 11. Decisions (settled 2026-10-16)

Jeroen kept every default except the colors:

1. **Edit mode**: Esc. The "FT2 keys" setting (off by default) makes Space edit mode and
   F1–F8 the octave while the tracker has focus; play/stop is then `Shift+Space` there.
2. **Note-off**: `` ` `` and `1`.
3. **Volume**: `01`–`7F` in hex (MIDI velocity); decimal in Settings.
4. **Accent**: the command `S01`.
5. **Colors**: from the current theme (D267), not FT2's steel blue.
6. **The top panel**: shown by default; `Alt+P` makes the tracker compact.
7. **A Track layout preset**: yes.
8. **The order list**: Position ▲▼ only; the song strip and the timeline keep the song order.

## 12. Not in this batch

- Tempo changes and automation as a master column (FT2's `Fxx`, Renoise's master track): they're
  anchored to sections on the timeline, not to patterns; a later batch could show them.
- Per-note-column delay columns (Renoise style) beyond the offsets on fine rows.
- Instruments by number (FT2's instrument column): in Rebeat the sound belongs to the track.
- Importing `.xm` and `.mod` files. It would fit later: the tracker would show the result.
