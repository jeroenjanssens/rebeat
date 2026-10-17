# The tracker {#tracker}

The [Tracker](panel:tracker) shows the pattern you're editing as rows of text, top to bottom, in the look of Fast Tracker 2: one row per step, one group of columns per track. It edits the same steps as the drum machine and the piano roll, so you can switch between them at any time, and every edit can be undone. You can do everything in it from the keyboard.

Open it from the **Panels** menu or the **Track** layout, and click it (or Tab into it) to give it the keyboard. Its keys only work while it has focus: Space still plays and stops, and the ⌘/Ctrl shortcuts (undo, save, the command palette) still work.

## The screen

- **The top panel**: **Pos** (the section you're editing, in hex), **Patt** (its pattern's name), **Len** (the pattern's length in steps, in hex: 10 is 16), **Octave**, **Step** (the step size), **BPM**, **Add** (how far the cursor moves after a note), **Rows** (see below), the **Edit** and **Follow** lamps, and a scope per track: click one to mute its track, right-click to solo it. {{key:tracker.compact}} hides the top panel.
- **The pattern**: the row numbers in hex on the left, then each track with its number, name and color. The **cursor row** stays in the middle and the pattern scrolls past it. Rows on a beat are lighter, rows on a bar lighter still. Dots are empty fields.
- **The status line** says what the field under the cursor is, in words, or why an edit didn't happen.
- **Follow** ({{key:tracker.follow}}): while playing, the cursor goes with the playhead, and the tracker shows the section that plays.

Colors come from your theme, so the tracker changes with it. {{key:tracker.zoomIn}} and {{key:tracker.zoomOut}} make the text bigger or smaller.

## The columns

Each track has a group of columns:

| Column     | What it shows                                                                                                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Note**   | `C-4`, `C#4`… On a Notes track a note lasts until its **note-off** (`===`) or until the next note in the same column. On a Hits track, the note a hit plays: C-4 is the hit as it is, D-4 two semitones higher (up to an octave). |
| **Volume** | The note's velocity in hex, `01`–`7F` (MIDI's 1–127). Settings → Tracker can show it in decimal.                                                                                                                                  |
| **Effect** | A command and two digits, such as `R03`: see below.                                                                                                                                                                               |
| **Lock**   | A parameter lock on one of the track's sound knobs, `00`–`FF` over the knob's range. The header says which knob.                                                                                                                  |

A Notes track can have up to eight **note columns**: a chord spreads over them. {{key:tracker.noteColAdd}} adds one and {{key:tracker.noteColRemove}} removes an empty one. {{key:tracker.fxColAdd}} adds an effect column, {{key:tracker.lockAdd}} a lock column (pick the knob), and {{key:tracker.lockRemove}} removes the lock column under the cursor. A Clip track has one field on the first row: **L** loops its clip, **O** plays it once, Delete turns it off.

Commands on a step that's off show dimmed: they're kept, but nothing plays them.

## Effect commands

Where Rebeat does the same thing as Fast Tracker 2, the command has FT2's letter; the rest use letters FT2 didn't. Each command writes a setting the drum machine also has.

| Command | What it does                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------ |
| `0xy`   | Arpeggio: the note, +x and +y semitones, a step each tick, over the note (an [Arp bend](#performance-bends)) |
| `1xx`   | Rise: the note slides up xx semitones (hex: 0C is an octave) over its length                                 |
| `2xx`   | The same, down                                                                                               |
| `3xx`   | Glide into this note (any digits; Notes tracks)                                                              |
| `4xy`   | Vibrato: speed x, depth y (y sixteenths of a semitone), as FT2's at 6 ticks a row (a Shake)                  |
| `9xx`   | Sample start: `xx` out of `FF` into the sample (hits of a sample)                                            |
| `ECx`   | Cut: the hit ends after `x` sixteenths of the step (Hits tracks)                                             |
| `EDx`   | Delay by `x` sixteenths of the step (shown as `Nxx` afterwards)                                              |
| `Nxx`   | Nudge: `80` on the grid, lower is earlier, higher later (up to half a step)                                  |
| `Rxx`   | Ratchet: `02`–`08` hits in the step                                                                          |
| `Yxx`   | Probability: `FF` always, `80` half the time                                                                 |
| `Ixy`   | Condition: the `x`th of every `y` loops (`I12`, `I22`, `I13`, `I14`), `IF1` on a fill, `IF0` not on a fill   |
| `S01`   | Accent                                                                                                       |
| `Wxy`   | The other bends: x is 1 Scoop, 2 Fall, 3 Doit, 4 Dip or 5 Next, y the semitones                              |

The bend commands (0, 1, 2, 4, W) are a note's [bend](#performance-bends): a note has one, and its piano roll and Inspector show it too. FT2 commands Rebeat doesn't have (volume slides, jumps, the tempo) aren't taken: the status line says what to use instead, such as the timeline's Tempo lane.

## The keys

Turn on **edit mode** with {{key:tracker.edit}} (the Edit lamp and the cursor turn the play-style color). With edit mode off, the note keys only play the sound of the cursor's track.

The note keys are two octaves, as in every tracker (they're the same physical keys on any keyboard layout):

```
 2 3   5 6 7   9 0   =         C# D#   F# G# A#   C# D#   F#
Q W E R T Y U I O P [ ]   →   C D E F G A B C D E F G     (Octave + 1)
 S D   G H J   L ;             C# D#   F# G# A#   C# D#
Z X C V B N M , . /       →   C D E F G A B C D E         (Octave)
```

| Keys                                                             | What they do                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| note keys                                                        | a note (edit mode: written, and the cursor moves down by Add)          |
| `` ` `` or `1`                                                   | a note-off                                                             |
| {{key:tracker.octaveDown}} / {{key:tracker.octaveUp}}            | octave down / up                                                       |
| `Alt+0` … `Alt+9`                                                | Add: 0–9 rows                                                          |
| `0`–`9`, `A`–`F`                                                 | a digit, on a volume, effect or lock field                             |
| a letter, on an effect's first field                             | the command                                                            |
| arrows, {{key:tracker.pageUp}} / {{key:tracker.pageDown}}        | move (16 rows at a time with Page Up and Page Down)                    |
| {{key:tracker.nextTrack}} / {{key:tracker.prevTrack}}            | next / previous track                                                  |
| {{key:tracker.home}} / {{key:tracker.end}}, `F9`–`F12`           | the first / last row; the start, ¼, ½ or ¾ of the pattern              |
| {{key:tracker.prevSection}} / {{key:tracker.nextSection}}        | previous / next section                                                |
| {{key:tracker.delete}}                                           | clear the field                                                        |
| {{key:tracker.deleteCell}}                                       | clear the cell, or the selection                                       |
| {{key:tracker.deleteRow}} / {{key:tracker.insertRow}}            | delete the row above / insert a row, in this track                     |
| {{key:tracker.deleteRowAll}} / {{key:tracker.insertRowAll}}      | the same in every track                                                |
| `Shift` + arrows, Page Up/Down, Home/End                         | select a block                                                         |
| {{key:tracker.selectAll}}                                        | the track's column, then the whole pattern                             |
| {{key:tracker.copy}}, {{key:tracker.cut}}, {{key:tracker.paste}} | copy, cut, paste at the cursor                                         |
| {{key:tracker.mixPaste}}                                         | paste only into empty places                                           |
| {{key:tracker.transposeUp}} / {{key:tracker.transposeDown}}      | transpose the note or the selection a semitone (with Shift: an octave) |
| {{key:tracker.interpolate}}                                      | interpolate the column under the cursor through the selection          |
| {{key:tracker.softer}} / {{key:tracker.louder}}                  | the selection's volumes ×0.9 / ×1.1                                    |
| {{key:tracker.mute}} / {{key:tracker.solo}}                      | mute / solo the cursor's track                                         |
| {{key:tracker.playRow}} / {{key:tracker.playFrom}}               | hear the row / play from it                                            |
| {{key:tracker.rows}}                                             | Rows: Auto, ×1, ×2, ×3, ×4                                             |
| {{key:tracker.longer}} / {{key:tracker.shorter}}                 | the pattern a step longer / shorter (with Shift: twice / half as long) |

Every key here is a command in the [command palette](command:app.palette) and can be changed in Settings → Shortcuts. With **FT2 keys** on (Settings → Tracker), Space turns edit mode on and off and F1–F8 set the octave while the tracker has focus, as in Fast Tracker 2; Shift+Space plays and stops.

Holding a note key and pressing another writes a chord: the second note goes in the next note column, on the same row. A MIDI keyboard does the same in edit mode.

## Recording

Play with edit mode on and the notes you play are written at the playhead's row, on the cursor's track, and end where you let go of the key. With **Rec** on as well, the keys record as they do everywhere else (with Overdub or Replace and Snap) and the tracker leaves it to them.

## Rows and polyrhythms

A row is one step of the pattern. A track with its own step size (in the drum machine's track settings) needs finer rows: **Rows: Auto** picks the fewest rows per step on which every track's steps land, so a 1/16T track next to 1/16 ones gets three rows per step. **×1** to **×4** set it yourself; a track whose steps don't sit on those rows shows `~ROWS` and can't be edited until they do.

On finer rows, the rows between a track's steps are shaded. A note typed on one of them starts between the steps (as a note started off the grid does in the piano roll). A track shorter than the pattern repeats in the drum machine; in the tracker its repeats are dimmed, and editing one edits the step it repeats. The rows after a section's own shorter length are dimmed too.

## Loading Fast Tracker 2 songs

**Import .rebeat or .xm** in the [project browser](command:project.home) (or the command palette) loads a Fast Tracker 2 module (`.xm`) as a new project, and you can drop one on the project browser too. Its samples go into the library, under **FT2** and the song's name.

- **A track per instrument.** In FT2 a channel can play another instrument on every row; in Rebeat a track has one sound. So each instrument becomes a track, and the notes of every channel that play it go there (as a chord where they overlap). A drum (a sample that doesn't loop, played within an octave) becomes a Hits track; the rest become Notes tracks that play the sample, or several samples by the instrument's keymap.
- **The song.** Each entry of the order list becomes a section, so a pattern that plays again is a clone. A pattern break (Dxx) makes its section shorter, and a jump back (Bxx), where a song loops, is where it ends.
- **The tempo.** A row stays a row: the speed and BPM become the tempo (6 ticks at 125 BPM is 125 BPM in sixteenths), and a speed or BPM change (Fxx) becomes a tempo change on the [timeline](#timeline).
- **Notes** last until the next note or key-off in their channel (into the next section too). The volume column and Cxx become the velocity; EDx is a delay, ECx a cut and E9x a ratchet. A sample offset (9xx) on a drum becomes its sample start (Start).
- **The level.** FT2 adds its channels up at its own amplification, so a module can be far too loud or quiet: loading one renders three of its sections and sets the faders so the song sits at the level of the example songs, with its peaks below −1 dB.
- **Pitch effects** become the note's [bend](#performance-bends): an arpeggio (0xy) an **Arp** (the note, +x and +y, a step each tick, while the note keeps sounding), vibrato (4xy, 6xy, the volume column's Sx and Vx, and an instrument's own vibrato) a **Shake**, slides (1xx, 2xx, E1x, E2x, X1x, X2x) a **Rise** by what they add up to, and a tone portamento (3xx, 5xy, the volume column's Mx) a **Scoop** in from the note before. A note has one bend: when it has two effects, the larger one plays (the summary says how often).
- **Samples** are tuned as FT2 plays them (C-4 at 8363 Hz, with each sample's relative note and finetune). A looping sample is played out for as long as its longest note, and a note's length ends it.
- **Envelopes** are played into the samples: the volume envelope up to its sustain point (with its loop), and a panning envelope as stereo. An instrument with an envelope gets a sample per octave it plays, so the envelope keeps its pace. What FT2 does after a key-off (the rest of the envelope, the fadeout) becomes the track's **Release**; without an envelope a key-off ends the note at once, as in FT2.
- **Panning and volume changes** become [automation](#timeline-automation) on the instrument's track: 8xx, E8x and the volume column's Px set the pan, Pxy and the column's slides move it; Axy, 5xy, 6xy, EAx, EBx, the column's slides and a volume set during a note move its level (back to 0 dB at the next note). Two channels playing one instrument share its track, so when they pan or fade it differently at once, the later one wins.

What Rebeat doesn't play yet (tremolo, sample offsets, global volume, multi retriggers, tremor, a few E commands) is listed when the song loads.

## Pixel Pulse

The example song **Pixel Pulse** (140 BPM, C minor) is written with what the FT2 import brought, so you can hear it without a module. Its **Arp** track holds one note a bar, and an **Arp** bend makes it the bar's chord, a step every tick as a tracker's 037 or 047 would (in the break 07C: the fifth and the octave). The **808 Bass** is the 808 kick played as notes, a sample that bends: it scoops into each bar, rises a tone into the next section and falls away at the very end. The square **Lead** in the chorus has vibrato that builds on its long notes, glides in from the note before and slides up an octave out of the chorus. On the timeline, the Arp fades in and swings left and right (a beat at a time in the break), and the song fades out. Open it in the tracker: the bends show as each note's bend in the piano roll and the Inspector.
