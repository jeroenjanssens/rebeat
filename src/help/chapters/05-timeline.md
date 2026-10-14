# The timeline {#timeline}

The **Timeline** panel shows your song in time: every section as a block as long as it plays, with your tracks under it. It's the same song as the [song strip](#drum-machine-the-song-strip), only drawn to scale, and both edit the same sections. Open it from the panel menu, or pick the **Arrange** layout (the timeline on top, the drum machine below).

The timeline adds what only makes sense in song time:

- **Section settings**: a section can mute tracks, transpose its notes, fill or play shorter, without unlinking its clones.
- **Tempo changes**: jumps and ramps.
- **Automation**: a knob that moves over the song.
- **Audio on the timeline**: a sample that plays across sections, like a vocal over a section change.

Everything on the timeline belongs to a section. Move the chorus and its automation, its audio and its tempo changes move with it. Copy a section and they're copied too.

## Sections in song time

- **Click** a block to edit that section in the drum machine. While the song plays, the click also queues it.
- **Drag** a block to move it. **Alt+drag** copies it, **Alt+Shift+drag** makes a clone (linked).
- **Drag the right edge** to set its repeats. The block shows its pattern once per repeat.
- **Shift+click** selects a range of sections. Then **⌘D** duplicates them as copies, **⇧⌘D** as clones, and **Delete** deletes them.
- **Right-click** for the section menu: the same as in the song strip, plus the section settings.
- **Double-click** a block to go to the drum machine.

Deleting a section also deletes what belongs to it: its automation points, its tempo changes and its audio. The message says so, and ⌘Z brings it all back.

## Section settings

A section plays its pattern, but it can change four things for itself only. Its clones keep the link: edit the steps and every clone changes, but these settings stay with the section.

| Setting                         | What it does                                                                                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mute tracks here**            | Those tracks are silent in this section. Click a track's cell on the timeline, use the section menu, or right-click the track in the drum machine: **Mute in this section only**. |
| **Transpose**                   | Notes play up or down here (a key change on a clone). Hits and audio don't move.                                                                                                  |
| **Fill**                        | FILL steps play on the last repeat (or on every repeat), as if you held Fill.                                                                                                     |
| **Play only the first … steps** | The section stops early: a two-beat stop, a pickup. **Alt+drag** the right edge to set it.                                                                                        |

Badges show them everywhere: on the block, in the song strip and in the drum machine. A muted track is hatched in the section's cells. Notes you record into a transposed section are written so they sound as you played them.

## The ruler and where Play starts

The ruler shows bars and, under them, the time. **Every section starts a bar**, so a short section is a short bar and the bars after it stay on their downbeats.

- **Click the ruler** to put the start marker (▼) there: Play starts at that bar, in the middle of a section if you like. Its tempo, its automation and audio that started earlier are all where they'd be.
- **Double-click** the ruler to play from there.
- Choosing a section anywhere else moves the start back to that section's start.

**Snap** sets what drags snap to (bar, beat, 16th or off); hold **Shift** while dragging to move freely. Zoom with − and +, **⌘+scroll**, or **Fit**. **Follow** keeps the playhead in view.

## Tempo changes

Open the **Tempo** lane under the ruler. Its header shows the start tempo, the song's tempo before any change.

- **Click** the lane to add a tempo change, then drag it up or down (whole BPM; Shift: tenths) or sideways.
- **Right-click** a change: **Jump** (the new tempo from there) or **Ramp** (it speeds up or slows down from the change before).
- **Double-click** a change to delete it.

While the song plays, the tempo field in the transport bar shows the tempo now. Synced delays, the synths' synced LFOs, the arpeggiator and the play styles follow the tempo, and so do warped clips. Typing a tempo while the song has tempo changes overrides them with one tempo, until **Back to automation**. In **Loop** mode a section plays its own part of the tempo map each time round. MIDI files get the tempo changes too.

Exports change a warped clip's pitch along with its speed instead of stretching it, so a clip that plays during a tempo change bends in pitch there. On the timeline such clips get a ⚠.

## Automation

An automation lane moves a knob over the song: a filter that opens over the build, a send that throws the last word into the reverb, a fade-out.

- Right-click a knob and choose **Automate**, or use **+ Automation** in the toolbar, or the **+** in a track's row.
- **Click** the line to add a point on it, or anywhere else in the lane to add one at that height; **drag** points (Shift: free), **double-click** or **Delete** to remove them, drag a box (or Shift+click) to select several. Right-click a point for its [eases](#timeline-eases), to turn it off, or to edit it in the Inspector.
- **On / Off** in the lane's header: off, the knob's own value plays. Its menu clears the lane, deletes it, or moves it to another knob (**Pick another knob…**; the points stay).

**+ Automation**, a track's **+** and **Pick another knob…** open the knob picker: a track's **Sound**, **Mix** and **Effects**, with one item per effect (a second Tremolo is "Tremolo 2") that opens to its knobs, then the buses and the master. Type to search ("cow trem rate"), use ↑ ↓ and Enter, → and ← to open and close. The lane's knob in the Inspector's table opens the same picker.

**Turning an automated knob overrides its lane**, as in Ableton: the lane dims and the knob's own value plays. **Back to automation** (in the timeline and the transport bar) brings back every overridden lane.

With **Auto** on (Record automation, next to Rec), knob turns while recording in Song mode become points. They're thinned so the lane stays easy to edit.

Knobs that can be automated: track levels, pan, width, sends and EQ, a sample's filter, the master's and the buses' levels, **every effect knob** (on tracks, buses and the master) and every effect's **On**, and on a synth track its macros and **every knob and switch of its synth** (see below). A few knobs build their effect again when they change, so they can't move over time: the Reverb's size, decay and pre-delay, the Delay's ping-pong and the Filter's type (the picker greys them). If you remove an effect, its lanes stay, named **Effect removed**: undo, or pick another knob for them.

### A synth's knobs and switches {#timeline-synth-automation}

On a synth track the picker has a **Synth** group with every part of the synth (Osc 1 to Output, and the mod matrix), each folding open to its knobs and switches; right-click a knob or a switch in the [synth editor](#instruments-the-synth-editor) and choose **Automate** to get its lane straight away. A lane moves the synth smoothly, at audio time, live and in exports. What to know:

- **Smooth**: almost every knob: shapes, levels, tuning, filters, envelopes, LFO rates, sub, noise, ring, FM, glide, the output, and the matrix's amounts. An oscillator's Shape morphs; its menu also has **Automate as steps**, for a lane that jumps between the four pure shapes.
- **From the next note**: an oscillator's Phase, the envelopes' Vel, a per-note LFO's Phase, Vel curve, Voices, Retrigger, and the voice mode, glide mode and steal. The notes that already sound go on as they started; the picker says "From the next note".
- **Not automatable**: a global LFO's Phase (it's set once, when the synth starts).
- **A macro and a lane on the same knob**: the lane decides while it plays; the macro still moves its other knobs. The mod matrix moves an automated knob as it would any other (an LFO still wobbles an automated cutoff).
- **Switching the filter model** starts the new filter from silence, so it doesn't click.

Automating never changes the synth itself: a factory synth isn't copied, and stopping puts every knob back where it was.

### Stepped lanes {#timeline-stepped-lanes}

A lane on a knob with a fixed set of values is **stepped**: an on/off (an effect's On, an oscillator's On), a choice (a filter's type, an LFO's shape, the voice mode, the mod matrix's sources and destinations) or a whole number (an octave, the Bitcrusher's bits, a Delay's time). It holds each point's value until the next point, then changes at once: drawn as a staircase, with its values' names on bands at the left (an on/off lane draws its On stretches as bars). Points land on a band when you add or drag them, the Inspector's table takes a value by name (`HP`, `on`), and the scroll wheel moves a point one value. Stepped lanes have **no eases**: the menu and the table don't offer them. A lane from before this (an effect's On that sloped from Off to On) keeps what it played: it switches where its old line crossed the middle.

## Editing points in the Inspector

Every automation lane, and the Tempo lane, can be edited as a table: choose **Edit points in the Inspector** in the lane's ⋯ menu (or double-click the lane's name, or right-click a point). The Inspector shows one row per point, in time order; **← Back to the track** returns to the track.

| Column                 | What you can do                                                                                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **On**                 | Turn a point off: the curve skips it, as if it weren't there (it's drawn hollow on the lane).                                                                                                                                            |
| **Position**           | Drag sideways or scroll to move it by the Snap grid (Shift: finer), or type a position: `17.3.2` is bar 17, beat 3, 16th 2; `17.3.2.5` is half a 16th later; `6:3.2` is beat 3, 16th 2 of section 6. The section it's in shows under it. |
| **Value**              | Drag up or down, scroll (Shift: finer), or type a value in the knob's units (`880`, `1.2k`, `-6`, `L20`) or a percentage (`35%`). Double-click resets it to the knob's default.                                                          |
| **Ease in / Ease out** | How the curve arrives at the point and how it leaves it: the type and its strength.                                                                                                                                                      |

- **Insert a point** with the **+** between two rows: it goes halfway between them, on the curve, so the line keeps its shape until you change it. **+ at ▼** puts one at the start marker, **+ after the last** one bar after the last point.
- Select several rows (Shift+click, ⌘-click) to set their value or ease together, or drag their positions together. ↑ and ↓ move the selection, Delete deletes it. The selection is the lane's too: points you select on the timeline are the rows selected here.
- Everything you change shows on the lane at once, and every change on the lane shows in the table. ⌘Z undoes it either way.

### Eases

Each point has an **ease in** (how the curve arrives at it) and an **ease out** (how it leaves). The stretch between two points takes its shape from the first point's ease out and the second point's ease in:

| Ease            | Leaving a point                                        | Arriving at a point                        |
| --------------- | ------------------------------------------------------ | ------------------------------------------ |
| **None (jump)** | Hold the value, then jump at the next point.           | —                                          |
| **Linear**      | A straight line (the default).                         | A straight line.                           |
| **Smooth**      | Set off slowly.                                        | Settle slowly.                             |
| **Exponential** | Start slowly and speed up: good for filters and fades. | Arrive fast, then settle.                  |
| **Bounce**      | —                                                      | Land on the value and bounce back onto it. |

The **strength** (0–100%) sets how much: 0% is a straight line. Tempo changes ease their ramps the same way (Linear, Smooth or Exponential). On the timeline, a ring around a point means it has an ease; a click right on the line adds a point on the curve, a click elsewhere at that height.

## Selecting and moving points

Points can be selected in several lanes at once, and moved together:

- **Drag a rectangle** from empty space in a lane: every point inside it is selected, in every lane it covers (the Tempo lane and folded lanes too). The timeline scrolls when you reach its edge. **Shift** + rectangle adds to the selection, **Alt** (Option) + rectangle takes points out of it. A plain click still adds a point.
- **Shift+click** a point to add it to the selection, or take it out, in any lane. **⌘A** selects the focused lane's points, **⇧⌘A** every visible lane's, **Esc** clears the selection.
- **Drag** any selected point and they all move by the same amount: the same distance in time (snapped by the point you hold, so the group keeps its spacing), and the same share of each lane's range in value (a stepped lane moves by whole values). Points don't pass a point of their lane that isn't moving. **Shift** turns snapping off; hold **Alt** (Option) to move in one direction only, whichever you moved first.
- **The arrow keys** nudge the selection: ← → by the Snap grid (Shift: finer), ↑ ↓ by 1% of each lane (Shift: 10%), or one value on a stepped lane. **Delete** deletes every selected point.
- The **point menu** acts on the whole selection ("7 points in 3 lanes"): eases (not on stepped lanes), on and off, delete. One ⌘Z undoes a whole move.

The Inspector's table shows one lane; when points of other lanes are selected too, a line above it says how many, and a click keeps only the table's lane's points.

## Folding lanes

Lanes take room. Fold the ones you aren't working on:

- The **▾** in a lane's header folds it to a slim row with its curve drawn small; **▸** opens it again. A folded lane still plays.
- The **▾** in a track's row (or a bus's, the master's) hides all its lanes at once; folded, it shows how many there are. Opened again, each lane is folded or open as you left it.
- **Lanes ▾** in the toolbar folds or unfolds every lane. **Follow the selected track** keeps only the selected track's lanes open: choose another track (in the drum machine, the mixer or here) and its lanes open instead. Folding by hand turns it off, so your clicks are never undone.

Folds are saved with the project, but they aren't undo steps: ⌘Z doesn't unfold anything. The commands are in the palette (**Fold all automation lanes**, **Unfold all automation lanes**, **Automation lanes follow the selected track**), and you can give them keys in Settings.

## Audio on the timeline

A sample on the timeline plays in song time, across sections: a vocal line over a section change, a long take, a riser into the drop.

- **Drop a sample** below the tracks for a new audio track, or onto a Clip track's row. A Clip track's own clip can go there too: right-click it in the drum machine, **Place on the timeline**.
- **Record to the timeline** (in the same menu): a take you record in Song mode goes on the timeline where you recorded it, instead of into the section's clip.
- **Drag** to move it (Alt: a copy), drag its **edges** to trim it, the small handles at the top corners to **fade** it. Right-click for its gain, **Split at the playhead** (S) and **Delete**.
- It plays through its track: the track's effects, fader, mute and warp apply.

**One sound per track**: while timeline audio plays, the track's own clip is silent there, and the drum machine says so. A section's mutes don't silence timeline audio (it belongs to song time); the track's own mute does. In **Loop** mode, audio that starts inside the looped section plays each time round.

## Sweeps and Bends {#timeline-sweeps-and-bends}

The example song **Sweeps and Bends** (100 BPM, A minor) shows a synth's automation and [bends](#performance-bends). Every note of its lead bends (Scoops into the phrases, Falls at their ends, a Doit, Dips, a Rise into the drop, a Next and a Shake). Its lanes: the lead's Filter 1 cutoff opens over the build, the pad's LFO 1 rate speeds up into the drop and its LFO shape steps to Sample & hold in the break, the bass's oscillator 2 detunes through the drop and its voice mode goes legato, the lead's filter turns band-pass in the break, and its delay comes on in the break and the last bar. Open the synth editors while it plays: the automated knobs and switches follow their lanes.

## Long Way Home, a walk-through {#timeline-long-way-home}

The example song **Long Way Home** (112 BPM, C minor) shows everything on this page. Open it, pick the **Arrange** layout and press Play.

| Section      | What to look at                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Intro**    | The Pad's Brightness lane rises from the Intro into the Verse: one lane over two sections.                                 |
| **Verse 1**  | The same pattern as Verse 2, with Op Hat and Keys muted here (hatched cells).                                              |
| **Pre**      | Fill on the last repeat: the snare roll only the second time. The master's high-pass sweeps up.                            |
| **Chorus 1** | The four-bar vocal starts in the Pre's last two bars and runs into the Chorus. The high-pass drops at once (a held point). |
| **Verse 2**  | The hook vocal, and the Vox send thrown into the reverb on its last word.                                                  |
| **Break**    | A clone of the chorus with the drums and bass muted, and a tempo jump down to 100.                                         |
| **Stop**     | The chorus again, playing only its first 8 steps: a two-beat stab, a short bar on the ruler.                               |
| **Pre 2**    | A tempo ramp back up to 112 under the high-pass sweep, copied with the section.                                            |
| **Final**    | A clone of the chorus transposed +2: the key change. The drums don't move.                                                 |
| **Outro**    | Slows down to 88 while the master fades out.                                                                               |

The vocals stay out of the tempo changes and the key change: audio doesn't follow a section's transpose, and exports would bend it in a tempo change.
