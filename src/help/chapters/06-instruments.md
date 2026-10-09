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

## The synth editor

The **synth editor** shapes the synth of an instrument track. Open it with **Edit synth…** in the Inspector, right-click the track's name → **Edit synth…**, Each synth track gets its own editor tab (named after the track), so you can have several open side by side or as tabs. Double-clicking a synth in the library opens the library sound itself, without a track: you play it through the preview, a synth of yours is saved as you go, and a factory synth becomes your own copy on the first change. (There, undo is the editor's own, and MIDI learn and the scopes need a track.)

It has two views (switch at the top right; it remembers the one you used last):

- **Basic**: the synth's 8 **macros**, **Poly** / **Mono** with **Glide**, a scope of what it plays, and the keyboard. Enough to make a factory synth your own.
- **Advanced**: everything, in the blocks below.

In Advanced, the blocks come in sections that follow the path the sound takes, shown at the top (Oscillators, Filters, Envelopes, LFOs, Matrix · macros, Voice · output; click a section's title to fold it, and the editor remembers): the oscillators (with sub and noise) are mixed, then filtered, then shaped by the amp, then driven to the output. That order is fixed, as on a classic analog synth: the oscillators play side by side, and the envelopes and the LFO don't carry sound, they steer the filter, the amp or the pitch. (The order of the track's **effects** can be changed in the Inspector.)

| Section                     | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Start from**              | Load a factory synth as the starting point.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Signal flow**             | The path the sound takes, with a picture of the waveform (click it to hear a note), and a live **scope** and **spectrum** of what the synth plays. Each block folds away with its arrow.                                                                                                                                                                                                                                                                                                                             |
| **Oscillators 1–3**         | Each can be on or off. Click a picture for its **shape**: sine, triangle, saw or pulse, or halfway between two of them (macros and the mod matrix can morph anywhere along the row; the nearest pictures light up); **Width** (pulse), **Level**, **Pan**, **Octave**, **Semi**, **Fine**; **Unison** (up to 8 stacked voices) with **Detune** and **Stereo** width; **Retrigger** (start at **Phase** on every note) or free-running; **Drift** (analog wander). Oscillators 2 and 3 can **Sync to 1** (hard sync). |
| **Sub · noise · ring · FM** | A sub oscillator (sine or square, one or two octaves down), white or pink noise, ring modulation (oscillator 1 × 2) and FM (which oscillator bends which, and how much).                                                                                                                                                                                                                                                                                                                                             |
| **Filters 1 and 2**         | **Ladder** (the warm 24 dB low-pass that self-oscillates) or **SVF** (12 dB low-, high-, band-pass or notch); filter 2 runs after filter 1 or beside it. **Cutoff**, **Reso**, **Drive** (into the filter), **Env**, **Key** and **Vel**.                                                                                                                                                                                                                                                                            |
| **Envelopes**               | Amp, filter and a free mod envelope: **Attack**, **Hold**, **Decay**, **Sustain**, **Release**, their curves, **Vel** and **Loop**. Drag the big points in the pictures for the times and the sustain, and the small ones in the middle of the attack and the decay up or down to bend their curves (double-click to straighten); or turn the knobs.                                                                                                                                                                 |
| **LFOs 1–3**                | Sine, triangle, ramps, square, sample & hold or smooth random; free **Rate** or synced to the tempo (dotted and triplet too); per note or global; **Phase**, fade-in **Delay**, and 0..1 instead of −1..1. The picture shows how it moves over about two seconds.                                                                                                                                                                                                                                                    |
| **Mod matrix**              | 8 slots: a **source** (LFOs, envelopes, velocity, note, mod wheel, aftertouch, pitch bend, random, macros) moves a **destination** (pitch, oscillator shape, width and level, sub, noise, ring, FM, filter cutoff and resonance, volume, pan, LFO rates) by an **amount**, optionally scaled **via** a second source.                                                                                                                                                                                                |
| **Voice**                   | **Poly**, **Mono** or **Legato**; glide always or only between overlapping notes; which voice to steal; **Voices**, **Glide**, **Vel curve**, **Bend** range and **Tune**.                                                                                                                                                                                                                                                                                                                                           |
| **Output**                  | **Drive** (saturation), **Volume**, **Pan** and **Spread** (chords spread across stereo).                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Keyboard**                | Play the synth while you shape it: held notes, softer higher up on a key. Beside it, the **pitch wheel** (springs back when you let go) and the **mod wheel** (stays where you leave it) work like a MIDI keyboard's.                                                                                                                                                                                                                                                                                                |

Play it on the **keyboard** at the bottom (the keys show their notes, with the octave on every C: C3, C4…): hold a key and the note sounds until you let go, so you hear the sustain and the release (click higher on a key to play softer; drag across keys for a glissando). The computer keys **A**–**L** play it too while the editor has focus (**Z** / **X** or the + / − buttons change the octave). Changes apply right away, also to a note you're holding.

Knobs that the mod matrix moves show an inner **ring**: how far the modulation can take them. While a note plays, a **dot** on the ring shows where the modulation has them right now.

Right-click any knob → **MIDI learn** to turn it from a controller.

To try things out:

- **A / B** (top right) keeps two versions of the sound: B starts as a copy of A; switch to B, change things, and flip between them to compare. The track plays the side you leave it on.
- **⋯ → Init patch** starts from a plain saw; **⋯ → Randomize** moves every knob a random distance (**Amount**), in the sections you leave on (the output level and tuning never change). Undo takes it back.
- The **copy** button on an oscillator, filter, envelope or LFO copies its settings; **paste** appears on the others of its kind.
- **⋯ → Export .rbsynth…** saves the synth (with its macros and effects) as a file to share; **⋯ → Import .rbsynth…** adds one to Your instruments and puts it on the track. Dropping a `.rbsynth` file on the library imports it too.

Factory synths never change: your first edit turns the track's sound into your own copy, "Reese Bass copy" (copy 2, 3… for more), which also appears in **Your instruments** and keeps up with your edits there. The revert button takes the track back to the factory synth (the copy stays in Your instruments). **Save to library** stores the synth with the track's SOUND knobs and effects under **Your instruments** in the library; drop it on any track, in any project. Right-click any instrument track → **Save sound** does the same for samplers and sampled instruments.

### Macros

A **macro** is one knob that moves several settings at once: **Brightness** opens the filters, **Bite** adds resonance and filter envelope, **Attack** and **Release** lengthen the envelopes, **Movement** brings in an LFO, and so on. Every synth has 8, and on a synth track they are its eight **SOUND knobs**: in the drum machine's encoders, the Inspector, the editor's Basic view and on a controller. Lock them per step (select steps, then turn a SOUND knob) to change the sound from note to note, or map them to MIDI.

Every synth starts with macros that suit it, resting where they leave its sound as it is. Some factory synths have their own: the Acid Bass's **Cutoff**, **Resonance**, **Env mod** and **Decay**, the 808 Boom's **Punch** (its pitch drop), the Numan Lead's **Sync** (the sweep of its synced oscillator), the Juno Strings' **PWM** and the Wobble Bass's **Wobble**. In **Advanced → Macros**, rename them and choose what they move: up to 4 **targets** each, with the value at 0 (**At 0**) and at 1 (**At 1**). Frequencies and times move evenly in octaves. A new target starts around the value you hear now, so adding it doesn't change the sound; and when you turn a knob that a macro moves, the macro's range follows, so the knob still works. The track keeps where its macros are; **Save to library** saves that too.

Projects from before the macros keep their sound: moved SOUND knobs on synth tracks (envelope, glide, detune and the filter) were turned into edits of the track's synth when the project was first opened.

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
