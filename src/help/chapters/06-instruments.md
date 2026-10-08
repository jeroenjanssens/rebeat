# Instrument tracks and the piano roll {#instruments}

**Instrument tracks** play notes: basslines, chords, melodies. In the drum machine, each step shows its note (C2, E♭3…) or chord (Cm, A♭…), and long notes join neighboring pads.

## Sound sources

A new instrument track plays a built-in synth: **Mono · Acid Bass** for bass tracks, **Poly · Warm Pad** otherwise. The drum machine's display shows what a track plays. Choose another sound by **right-clicking the track's name** (under **Sound**: Synth, Sampler or Instrument, with a searchable list), or in the [Inspector](panel:inspector) under **Instrument**, which also has the sampler's root note:

| Source         | What it is                                                                                                                                                                                                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Synth**      | 37 built-in synths in the style of well-known songs and synths: basses (303 acid, Moroder, Reese, Moog, 808, wobble…), leads (Axel F, Cars, Oxygène, chiptune, supersaw, hoover, theremin), pads, keys, plucks and stabs, and effects.                                                                                             |
| **Sampler**    | Plays any sample across the keyboard. Drop a sample on it (or on the track) and set the **Root note**: the note the sample was recorded at.                                                                                                                                                                                        |
| **Instrument** | About 300 sampled instruments: a grand piano and electric pianos, all 128 General MIDI instruments, mallets, orchestral and folk instruments from the Versilian Community Sample Library, and a double bass. They download the first time you use them (the status says "Loading samples…" until then) and are kept for next time. |

**Transpose** moves all notes of the track up or down. The **Arpeggiator** plays the notes of a chord one after another: choose the order (Up, Down, Up/down, Random, Played), the rate, the number of octaves and the **Gate** (how long each note sounds).

## Entering notes

- In the grid: click a pad to add a note, then set its pitch with the **Note** encoder (Step bank) and its length with **Length**.
- From the [pad view](#pad-view): note pads in the current key, or the computer keyboard as a piano, with step entry and live recording.
- From a MIDI keyboard: notes play the selected instrument track and are recorded like pad hits.
- **Scale lock** and **chord mode** (in the pad view) keep what you play in the key.

The **key** (header bar) decides which notes are "in key" and whether notes are written with flats or sharps (E♭ in C minor, D♯ in E major).

## The piano roll

The [Piano roll](panel:piano-roll) edits the notes of the selected instrument track on the page you're editing. Pitches run from top (high) to bottom (low), steps from left to right; out-of-key rows are darker and the root row is highlighted.

| Do this                                              | To                                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Click an empty spot (pencil tool)                    | Add a note; drag right while adding to make it longer.                                    |
| Drag a note                                          | Move it in time and pitch (selected notes move together).                                 |
| Drag a note's right edge                             | Change its length.                                                                        |
| Click a note / Shift+click                           | Select it / add it to the selection.                                                      |
| Drag on an empty spot with Shift (or the arrow tool) | Select notes in a box.                                                                    |
| Double-click or Alt+click a note                     | Delete it.                                                                                |
| Right-click a note                                   | Slide into this note, set the length, delete. On a selected note, for all selected notes. |
| Click a key on the left                              | Hear that pitch.                                                                          |
| Drag in the **Vel** strip at the bottom              | Set velocities (of the selected notes, or of the notes under the pointer).                |

Keyboard (click in the piano roll first): Delete removes the selected notes, ↑ ↓ move them by a semitone (with Shift by an octave), ← → by a step, Ctrl/Cmd+A selects all, Ctrl/Cmd+C / V copy and paste (after the selection), Esc deselects.

The toolbar sets the length of new notes, **Scale lock** (notes snap to the key while you draw or move them), and the zoom.
