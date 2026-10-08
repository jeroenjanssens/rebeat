# The drum machine {#drum-machine}

The [drum machine](panel:drum-machine) is where you make patterns. From top to bottom it has a **header bar**, the **page strip**, the **display and encoders**, the **tracks** (or the **pads**), and a row of **function buttons**.

## The header bar

| Control                      | What it does                                                                                                                                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Grid / Pads**              | Switch between the track grid and the [pad view](#pad-view) ({{key:dm.view}}).                                                                                                                                                                                        |
| Page number and name         | The page you're editing. Click the name to rename it.                                                                                                                                                                                                                 |
| **Steps**                    | How many steps the page has: 8, 12, 16, 24, 32, 48, 64, or any number from 1 to 128 (type it under **Custom**). Fewer steps hide the steps at the end without deleting them, so you can grow the page again.                                                          |
| **Size**                     | The length of one step: 1/4, 1/8, 1/8T, 1/16 (default), 1/16T or 1/32. Steps × size is the page length.                                                                                                                                                               |
| **Swing**                    | The page's own swing. It follows the song's swing until you change it (the label then reads **Swing·P**); double-click to follow the song's swing again.                                                                                                              |
| **Key**                      | The key and scale used for note names, the note pads and scale lock: pick the root and scale. **Own key for this page** gives just this page a different key.                                                                                                         |
| Pencil / eraser / dashed box | The **Draw** ({{key:dm.draw}}), **Erase** ({{key:dm.erase}}) and **Select** ({{key:dm.select}}) tools for the pads.                                                                                                                                                   |
| **Q**                        | Quantize for live recording (the same setting as in the transport bar).                                                                                                                                                                                               |
| − 100% +                     | Zoom the pads in and out (or Ctrl/Cmd + scroll over the pads).                                                                                                                                                                                                        |
| **Follow**                   | When on, the drum machine shows the page that's playing. Turn it off to edit another page while the song plays.                                                                                                                                                       |
| Lanes button                 | Show **velocity**, **probability** and **nudge** lanes under the selected track. Drag over their bars to set the values of the steps that are on; double-click a bar to reset it (velocity 80%, probability 100%, nudge 0), Alt+double-click to reset the whole lane. |

In a narrow panel, Size, Swing, Q, Follow and the lanes move into the **…** menu.

## The page strip

The strip shows every page of the song as a small picture of its pattern. A song is made of **pages** (patterns) played in order; see [Pages and songs](#pages).

| On a page                   | What it means or does                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| Number and name             | Its place in the song. Double-click the name to rename it.                                         |
| ↻ 2                         | The page repeats this many times in Song mode.                                                     |
| Chain icon, colored outline | A **clone**: it shares its pattern with other pages of the same color. Editing one edits them all. |
| Line underneath             | The page that's playing, and how far along it is.                                                  |
| Pulsing outline             | The page that plays next (queued).                                                                 |

- **Click** a page to edit it. While playing, clicking a page also queues it: it starts when the current page ends (or on the next bar or beat, see [Settings](#settings)).
- **Drag** pages to reorder them. Hold **Alt** while dragging to copy a page, **Alt+Shift** to clone it.
- **Right-click** a page for: New page, Copy page, Clone page (linked), Unlink, Delete, Repeat (×1 to ×16), Steps, Step size and Color.
- **+** adds an empty page after the current one, with the same steps and size.
- **Loop page / Song** at the right switches the playback mode. In Song mode, the loop button next to it decides whether the song starts over after the last page or stops.

## The display and the eight encoders

The dark **display** shows the selected track: its number, name and type, the waveform of its sample (or the envelope of its synth), and the sound's name. When steps are selected, it says how many.

The tabs above the encoders choose what the eight encoders control:

| Bank      | Drum tracks                                                           | Instrument tracks                                            | Audio tracks                                              |
| --------- | --------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| **Sound** | Tune, Decay, Start, Cutoff, Reso, Drive, Choke, Gain                  | Attack, Decay, Sustain, Release, Cutoff, Reso, Glide, Detune | Gain, Start, Pitch, Warp, Cutoff, Reso, Fade in, Fade out |
| **Step**  | Velocity, Prob, Nudge, Ratchet, Pitch, Gate, Cond, Accent             | Velocity, Prob, Nudge, Ratchet, Note, Length, Cond, Accent   | –                                                         |
| **FX**    | The parameters of the track's effects; ◀ ▶ steps through the effects. |                                                              |                                                           |
| **Mix**   | Level, Pan, Reverb (send A), Delay (send B), Width, Low, Mid, High    |                                                              |                                                           |

Using an encoder:

- **Drag** up or down, or **scroll** over it. Hold **Shift** for fine changes.
- **Double-click** to reset it to its default. It glides back smoothly (at most 300 ms), so you can use it during a performance, for example to open a filter again. Faders and the crossfader do the same.
- **Right-click** for Reset and **MIDI learn** (see [MIDI](#midi)).

Some sound parameters in detail: **Decay** shortens the sound ("Full" plays the whole sample). **Start** skips the beginning of the sample. **Choke** puts tracks in a group (1–8) where a new hit cuts off the others, like an open hi-hat that a closed hi-hat stops. **Drive** saturates the sound. **Warp** (audio tracks) makes loops follow the song tempo.

The **Step** bank edits the selected steps (select them with Alt+click, the Select tool, or by holding SELECT). With several steps selected, each encoder changes all of them by the same amount. **Ratchet** repeats the hit 2–8 times within the step; **Nudge** moves it slightly early or late; **Cond** plays it only on some passes (1:2 = every first of two times, FILL = only while FILL is held, !FILL = only when it isn't).

### Parameter locks

A **parameter lock** gives one step its own sound. Select one or more steps, choose the **Sound** bank, and turn an encoder: the value is stored on those steps only (the display says "Locks on … steps", locked knobs show a white dot, and the pad gets a dot in its corner). **Alt+click** a knob to remove its lock.

## Tracks

Each row is a **track**. Tracks exist on every page; the pages only hold their steps.

| Part of a row     | What it does                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Colored bar       | Drag to reorder tracks. Click the row to select the track.                                  |
| Number and name   | Double-click the name to rename.                                                            |
| ♪ / waveform icon | An instrument track / an audio track (drum tracks have no icon).                            |
| **M**             | Mute.                                                                                       |
| **S**             | Solo: only soloed tracks play.                                                              |
| **●**             | Arm for recording (audio and instrument tracks).                                            |
| Small fader       | Volume. Drag; double-click for 0 dB.                                                        |
| **FX**            | The number of effects on the track. Click to edit them in the [Inspector](panel:inspector). |
| Pads              | The steps (see below).                                                                      |
| Scope and meter   | What the track sounds like right now. Click to enlarge, with a spectrum view.               |

**Right-click the track's name** for more: Duplicate, Delete, Open in piano roll (instrument tracks), Color, **Sound** (the sample the track plays now, with buttons to show it in the library or open it in the sample editor, and a searchable list of your library samples and the built-in sounds to replace it), Copy steps, Paste steps, Clear steps, Shift left, Shift right, Reverse, Randomize, Euclidean…, and these per-page options:

- **Track length on this page**: let the track loop over fewer steps than the page (for example 3 or 5 against 16, for polyrhythms).
- **Track rate on this page**: give the track its own step size.
- **Track swing**: its own swing.
- **Choke group** (drum tracks) and **Convert to** drum, instrument or audio track.

At the bottom, **drop samples** from your computer or the library to add tracks, or use **+ Drum**, **+ Instrument** or **+ Audio**. Drop a sample **on a track** to replace its sound (hold Alt to add it as a new track below instead).

### Audio tracks

An audio track shows its **clip** as a waveform instead of pads, exactly as wide as a row of pads, so it lines up with the other tracks. The buttons in its top-right corner: the power button turns the clip on or off for this page, the disc button opens a **scratch strip**, and the label switches between **Loop** (the clip loops, restarting with each page) and **1-shot** (it plays once). Right-click the clip for: Double length, Halve length, the overdub layers (click one to mute it), Undo last layer, Merge layers, Last layer → new track, and Clear clip. See [The loop station](#loop-station).

## Pads (steps)

| Looks like             | Means                                                   |
| ---------------------- | ------------------------------------------------------- |
| Dim pad                | Off.                                                    |
| Lit pad                | On; the brighter, the louder (velocity).                |
| Bright line at the top | Accent (full velocity).                                 |
| Partly filled          | Probability below 100%.                                 |
| Small ticks inside     | Ratchet (repeats within the step).                      |
| Small mark below       | Nudged early or late.                                   |
| Small label            | A condition (1:2, FILL…).                               |
| Dot in the corner      | A parameter lock.                                       |
| Note name              | The note (instrument tracks); a chord name for chords.  |
| Joined to the next pad | A long note (instrument tracks); a slash means a slide. |
| Outline                | Selected.                                               |
| Dashed outline         | The keyboard cursor.                                    |
| Hatched                | Beyond this track's own length.                         |

Working with pads:

- **Click** to turn a step on or off. **Drag** across pads to paint (or erase, if you started on a lit pad).
- **Right-drag** to erase. **Right-click** a pad (without dragging) for its menu: on/off, Accent, Select, Probability, Ratchet, Condition and Clear parameter locks.
- With the Draw tool, **Shift+drag** up or down on a pad to set its velocity.
- **Alt+click** a pad to select it (and edit it with the Step bank). With the **Select** tool, drag a box to select several; hold Shift to add to the selection.
- **Keyboard**: the arrow keys move a cursor over the steps, {{key:cursor.toggle}} turns the step under it on or off, and the digit keys 1–9 set the velocity (of the selected steps, or the step under the cursor). Esc clears the selection and the cursor.
- {{key:edit.copy}} / {{key:edit.paste}} copy and paste steps; {{key:edit.clear}} clears the selected steps (or the whole track); {{key:edit.undo}} undoes, {{key:edit.redo}} redoes.

## Function buttons

The row at the bottom works like the buttons of a hardware drum machine. Each one does something when you **click** it, and many also work while **held**: hold the button and click a track, a step or a page. The small text under a button is its second function, which you get with **SHIFT**.

| Button     | Click                                                               | With SHIFT                        | Hold + click                                       |
| ---------- | ------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------- |
| **SHIFT**  | Latches SHIFT on for the next button (or hold it, or the Shift key) |                                   |                                                    |
| **SELECT** | The Select tool on/off                                              | Select all steps of the track     | Steps or tracks: select them                       |
| **COPY**   | Copy the track's steps ({{key:edit.copy}})                          | Copy the page                     | A track: copy its steps; a page: copy it           |
| **PASTE**  | Paste at the first selected step ({{key:edit.paste}})               |                                   | A track: paste into it                             |
| **CLEAR**  | Clear the selected steps or the track                               | Clear the page                    | A track or a page: clear it                        |
| **DUPL**   | Duplicate the track                                                 | Clone the page                    | A track: duplicate; a page: copy                   |
| **×2**     | Double the page and its steps                                       | Halve the page                    |                                                    |
| **MUTE**   | Mute the selected track                                             | Unmute all                        | Tracks: mute them ({{key:dm.mute}} held works too) |
| **SOLO**   | Solo the selected track                                             | Unsolo all                        | Tracks: solo them                                  |
| **FILL**   | Held: steps with the FILL condition play ({{key:dm.fill}})          | Latch FILL on                     |                                                    |
| **REPEAT** |                                                                     | Change the rate (1/8, 1/16, 1/32) | Pads in the pad view: repeat while held            |
| **ACCENT** | New steps and pad hits at full velocity                             |                                   |                                                    |
| **RAND**   | Randomize the track                                                 | Randomize only the velocities     | A track: randomize it                              |
| **EUCLID** | Open the Euclidean generator                                        | Rotate the track one step         | A track: open it for that track                    |
| **◀ ▶**    | Shift the track one step left or right                              | Nudge the selected steps          |                                                    |
| **UNDO**   | Undo                                                                | Redo                              |                                                    |

The **Euclidean generator** spreads a number of **Pulses** as evenly as possible over a number of **Steps**, with a **Rotate** offset: a quick way to make classic rhythms (3 over 8, 5 over 16…).

In a narrow panel only SHIFT, MUTE, FILL and UNDO are shown; the others are under **Functions**.

## The pad view {#pad-view}

**Pads** in the header (or {{key:dm.view}}) shows big pads, like on a hardware controller, next to the steps of the selected track.

- **Drum tracks**: one pad per track (pad 1 bottom left). Click a pad to play it and select the track; higher on the pad is louder. Hold **REPEAT** and a pad to repeat it at the repeat rate.
- **Instrument tracks**: the pads become notes of the current key, with the root highlighted. **Scale lock** snaps notes you play to the key; **Notes / Triads / 7ths** plays single notes or chords in the key.
- **Keys** lets the computer keyboard play the pads: **Z X C V**, **A S D F**, **Q W E R** and **1 2 3 4** are the four rows of drum pads (from the bottom). For instrument tracks, **A W S E D F T G Y H U J K** is a piano from C, and **Z / X** shift the octave.
- The step rows on the right work like the grid; the buttons under them set the track's own number of steps.

### Writing with the pads {#recording}

- **Step entry**: while stopped, place the step cursor (arrow keys) and play pads or notes: each hit writes a step at the cursor and moves it on. Notes played together become a chord.
- **Live recording**: while playing, press **Rec**: pads and notes you play are written into the pattern, snapped to the **Q** setting (or with their exact timing when Q is Off).
