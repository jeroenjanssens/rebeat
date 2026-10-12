# Performance, MIDI and controllers {#performance}

## The Performance panel

The [Performance](panel:performance) panel puts everything for playing live in one place (try the **Perform** layout, {{key:layout.perform}}).

| Section               | Controls                                                                                                                                                                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pads**              | Big pads for the step tracks that play hits or notes. Higher on a pad is louder. They record into the pattern while recording.                                                                                                                                                                           |
| **Pages**             | One button per page: click to queue it (or start from it when stopped). The playing page is lit; the queued page pulses.                                                                                                                                                                                 |
| **Mutes**             | A big button per track: click to mute, **Shift+click** to solo. **Right-click** to put the track on side A or B of the crossfader.                                                                                                                                                                       |
| Mute groups           | **Group 1–4**: right-click to choose its tracks, click to mute or unmute them all at once. **Queue to bar** makes mute changes wait for the next bar.                                                                                                                                                    |
| **Scratch**           | A platter for a Clip track (choose which one at the top). Drag around it to scratch; **Cut** silences while held; **Sync / Keep pos** decides whether the record snaps back to the beat when you let go or carries on from where you left it. Right-click the platter to map a MIDI jog wheel.           |
| **Master FX**         | **Filter**: turn left for a low-pass, right for a high-pass sweep on the whole mix; the middle is open. **Rpt 1/4 … 1/32**: beat repeat while held. **Throw verb / Throw delay**: send everything into the reverb or the delay while held. **Tape stop**: slow down to a halt like a stopping turntable. |
| Crossfader            | Fades between the tracks on side A and side B (other tracks aren't affected). Double-click to center.                                                                                                                                                                                                    |
| **Tap**, **−**, **+** | Tap tempo and nudge the tempo by 1 BPM.                                                                                                                                                                                                                                                                  |

## MIDI

Rebeat works with MIDI keyboards, pads and controllers (in Chrome and Edge, and in the desktop app; Safari has no Web MIDI).

- Turn it on in **Settings → MIDI → Enable MIDI**, and choose which inputs to use. Controllers that plug in over USB need no driver.
- **Keys** play the selected Notes track, sounding for as long as you hold the key. They record like pad hits.
- **Pads**: notes on the **pads channel** (Settings → MIDI, channel 10 by default, which pad controllers use) always play step tracks by position: note 36 (C1) plays track 1, 37 track 2, up to 51 for track 16. Other channels play the selected Notes track; with no Notes track selected they play tracks by position too.
- **Pitch bend**, the **mod wheel** (CC 1) and **aftertouch** (channel or per-key pressure) reach the synth of the selected track: bend moves the pitch by the synth's **Bend** range, and the mod wheel and aftertouch are sources in its mod matrix (vibrato on the mod wheel, say).
- The **sustain pedal** (CC 64) keeps released notes sounding until the pedal comes up.
- **MIDI Start and Stop** (from a controller's Play button, or another app) play and stop Rebeat, unless you switch **Follow MIDI Start/Stop** off.

### MIDI learn {#midi}

Right-click a knob or a fader → **MIDI learn**, then move a control on your device; Esc cancels. Rebeat notices how the control sends values: **absolute** (a position, most knobs and faders) or **relative** (steps, from endless encoders), and you can change it in Settings → MIDI if a knob jumps or barely moves.

A learned control is saved in one of two places:

- **In this project**: for one track's knob (the Inspector, the synth editor, the Performance panel). These are saved with the project.
- **In every project**: for your controller. The encoder strip's knobs and the mixer's faders offer both: _MIDI learn: Selected track · SOUND knob 3 (every project)_ follows whichever track you select, so the same knob on your controller turns the third SOUND knob of the kick, then of the bass. Faders can be _Track 2 · Level_, a bus or the master.

**Buttons** run commands: in the **Shortcuts** dialog ({{key:app.shortcuts}}), click **MIDI** next to a command and press a button or pad on your controller (Play / stop, Record, Metronome, Next page, Select the next track, Fill…). Right-clicking the transport bar's Play, Rec, Tap, Click and Loop/Song buttons does the same. Held commands (Fill) last while you hold the button.

Settings → MIDI lists both kinds of mappings, where you can change a control's mode or remove it. Mappings in this project win over the ones in every project.

## Your controller {#performance-your-controller}

**Settings → MIDI → Controller** has maps for some controllers: what their knobs, faders and pads do, in every project. Rebeat recognizes them when they're connected and offers their map.

- The **knobs** turn the selected track's **SOUND knobs 1–8** (the encoder strip's knobs, whatever the track plays: a sample's Tune and Decay, a synth's macros). Select another track and the knobs follow; **Select the next / previous track** are commands you can put on buttons.
- The **faders** (if it has them) are the selected track's level, its Reverb and Delay sends, and the master level.
- The **pads** play tracks 1–16 on channel 10.
- **Learn** next to a slot teaches it another control; **Learn every control** walks through all of them ("move knob 1… now knob 2…"). Use it when your controller is set up differently, or has no factory assignment.
- **Pick up** (off by default) makes absolute knobs and faders take over only when they reach the value on screen, so nothing jumps when you select another track. **Relative knobs** sets how far one step of an endless encoder turns a knob.
- **Mackie Control**: inputs named MCU (or ones you tick) run the transport: Play, Stop, Record, Cycle (loop or song), rewind and forward (pages), the jog wheel.
- The **Monitor** at the bottom lists the last messages and what Rebeat did with each: the first place to look when something doesn't respond.

| Controller                      | Knobs                                                                                                                                                       | Pads                                                                                    | Transport                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Arturia MiniLab 3**           | ARTURIA mode (Shift + Pad 3): CC 74–77, 93, 18, 19, 16; faders CC 82, 83, 85, 17; main encoder CC 114 (browse), with Shift CC 112, click CC 115; Shift CC 9 | notes on channel 10 (bank A tracks 1–8, B 9–16), or CC 56–59, 62, 63, 60, 61 (pads 1–8) | Shift + Pads 4–8 (loop, stop, play, record, tap)          |
| **Akai MPK Mini MK3**           | factory program: CC 70–77 (not confirmed: learn them if they don't respond)                                                                                 | channel 10, banks A and B                                                               | none on the device; learn buttons if you map pads to them |
| **Novation Launchkey Mini MK3** | CC 21–28                                                                                                                                                    | Drum mode, channel 10, notes 36–51                                                      | only in DAW mode: learn them                              |
| **Novation Launchkey Mini MK4** | no factory assignment: **Learn every control**                                                                                                              | Drum mode, channel 10, bottom row 1–8, top row 9–16                                     | Play sends MIDI Start, Shift + Play Stop                  |

The **Arturia MiniLab 3** has a few extras:

- The **main encoder** (the large knob on the right) turns the Playable list: each click advances one sound. **Shift + turn** jumps by section. **Click** adds the current sound as a new track.
- The **faders** are always absolute — Rebeat's automatic relative detection only applies to the knobs. If a fader was set to relative in an earlier version, it resets itself when MIDI starts.
- The **OLED display** can show the selected track name and sound. Enable "Show names on the MiniLab display" under the map in Settings → MIDI. **Send test text** sends "Rebeat / Connected!" immediately so you can check whether the display is receiving (the SysEx format is from community research and unconfirmed — the test tells you).
- The **pads light up** in the colors of what they play: in Drum mode each pad the color of its track, in Chord and Key mode the chord types (pads 1–4) blue and the extensions (5–8) purple. Turn it off with "Light the pads in the tracks' colors" in Settings → MIDI.
- **Shift + pads 4–8** do what's printed on them: **4** switches loop and song mode, **5** stops, **6** plays, **7** records, **8** taps the tempo. While you hold Shift the MiniLab shows its own colors for these, and so does the picture.

A keyboard or chord instrument without knobs (such as the Telepathic Instruments **Orchid**) needs no map: its notes play the selected Notes track, chords and all, and its Start/Stop (if it sends them) play and stop Rebeat. Choose **Custom** to build a map for any other controller from scratch.

### The Controller panel

The [Controller](panel:controller) panel shows a live top-down picture of your controller. Its header has the same **Keys** drop-down as the top bar (what the keys play), so you can change it with the panel maximized. Open it from the **Panels** menu or by applying the **Perform** layout ({{key:layout.perform}}).

- **Arturia MiniLab 3**: the device as it looks from above, in its own colors. Keys light up as you play them (shaded by velocity) and show the note they play (A3, C4…, with the device's octave), pads have the colors of what they play and light up while held, faders move in real time, and the knobs' white caps (the encoder's black one too) turn as you turn them and light up in the accent for a moment. The MiniLab's screen is mirrored in its black panel, centered as the device shows it. Holding Shift shows the pads' second functions. Click a key in the picture to play it, or drag across the keys with the button down to play one after another.
- **Where the faders are**: MIDI has no way to ask a controller where its faders are (they only send when they move), so until you move one, it's drawn faint where the value it controls is; after that it follows the device. The MiniLab's knobs turn without end, so their caps show the turning, not a position. The pitch strip rests in the middle. Turn on **Pickup** in Settings → MIDI so an untouched fader doesn't make its value jump when you first move it.
- **The notes you're playing**: under the picture, the keys held down read like an equation, low to high: **A3 + C4 + E4 = Am**. When they make a chord, its name follows the equals sign. Rebeat knows about 90 chord symbols: triads and power chords, sixths, sevenths, added tones, sus chords, 9ths, 11ths, 13ths and altered dominants (C7♯9, C7♭9♭13…). A seventh chord may leave out its fifth and a 13th its ninth, as players usually do (C E B♭ is still C7). When the same notes can be read two ways, the simpler reading with the lowest note as the root wins (C E G A is C6, A C E G is Am7). A bass that isn't the root comes after a slash (C/E, D7/C). The notes a chord adds for you ([chord pads](#performance-chord-pads), or chord mode in the pad view) are in a paler color, here and on the keys.
- **Other maps**: the slots are shown as a labeled list with the current values.
- **No map selected**: a prompt to plug in a controller and pick its map.

You can click or tap the keys and pads directly in the panel — they play exactly as if you pressed them on the device. Hovering a control shows what it's mapped to and the current value.

### Chord pads {#performance-chord-pads}

The **Pads** switch at the top of the Controller panel sets what your controller's pads 1–8 do:

- **Drum** (the default): they play tracks 1–8 of the drum machine.
- **Key**: [Key mode](#performance-key-mode), below.
- **Chord**: they're chord buttons, after the Telepathic Instruments **Orchid**. Pads 1–4 are the chord types **Dim**, **Min**, **Maj** and **Sus** (sus4); pads 5–8 add **6**, **m7** (minor seventh), **M7** (major seventh) and **9**. Hold a chord type, add any extensions, and play one key: the key is the root and the lowest note, and the chord is built up from it. Maj + m7 on C plays C7, Min + m7 + 9 plays Cm9, Dim + 6 a diminished seventh.

Without a chord type held, a key plays on its own. One chord sounds at a time: a new key takes the chord over. Pressing or letting go of a pad while you hold a key changes the chord at once. Chords record into a Notes track like keys you play yourself, and **scale lock** still moves the root into the key.

**Bass** (in the panel, for Chord and Key mode; **−** goes deeper, **+** back up, click the value for Off): **Off** or **−1** to **−6** adds the chord's root that many octaves below it, on the same sound, like the Orchid's bass. It never goes below C1 (an octave lower is felt more than heard): under a chord around middle C, −3 already reaches C1, so the deeper steps are for chords played higher (Voicing up, a high transpose); it shows in the equation and on the keys like the chord's other notes, and it's recorded with them. **Transpose** is in the same row.

**Voicing** (in the same row) plays every chord the pads make in an inversion, like the Orchid's Voicing dial: each step up moves the chord's lowest note an octave up (C E G → E G C → G C E → C E G an octave higher), each step down its highest note an octave down, up to 8 steps either way. The chord stays the same, so smooth progressions are easy (C, then F as C F A). With Bass on, the bass stays on the chord's root, below the voiced chord; with Bass off, the equation names the inversion (C/E). Click the number to go back to root position. Voicing and Bass are remembered.

On a controller, in Chord and Key mode **knob 1** turns the voicing, **knob 2** the transpose and **knob 5** the bass (left is deeper: Off, −1 … −6). The knob's turn is split evenly: all the way left is −8 (−12 for the transpose, −6 for the bass), all the way right +8 (+12, Off), and every value in between takes the same turn. Knobs that send relative values move one step per notch instead (a MiniLab 3 knob set to relative sends two messages per notch); the picture labels them, and the MiniLab's display shows the new value. In Drum mode they're sound knobs as usual.

Two chord types held together play a **secret chord**, as on the Orchid (firmware 3.84): Dim + Sus a power chord (C5), Maj + Sus augmented, Min + Sus m(add4), Min + Dim m(♭6), Maj + Dim (♭6), Maj + Min 7♯9. With three or four held, the first two you pressed count. These follow the Orchid manual's table as others have quoted it; they haven't been checked on a device.

On a MiniLab 3 the pads show their chord labels in the picture; other controllers get a row of the eight chord pads under their slots. Pads beyond the eighth (bank B, a second row) still play tracks 9–16. The commands **Pads: Drum mode**, **Pads: Chord mode**, **Pads: Key mode** and **Pads: next mode** do the same as the switch, so you can give them a shortcut or map a button to them.

### Key mode {#performance-key-mode}

In **Key** mode, like the Orchid's Key Mode, every key plays the chord that belongs to it in a key you choose: in C major, C plays C, D plays Dm, B plays Bdim. One finger plays a whole progression. A key outside the key is moved to the nearest note in it first (C♯ plays C in C major). Key mode has its own key, saved in your settings: the song's key isn't touched.

- **Pads 5–8** add the key's own sixth, seventh or ninth: G with m7 (or M7) plays G7 in C major, C plays Cmaj7.
- **Pads 1–4** play their chord on the key exactly as you pressed it, so you can borrow chords from outside the key (B♭ with Maj in C major); two of them make a secret chord, as in Chord mode.
- **The key**: the **Key** chip in the Controller panel picks a root and a scale (major, minor, Dorian, Phrygian, Lydian, Mixolydian, harmonic minor), or copies the page's key.
- **Transpose** moves everything the keys play by semitones, in every pad mode. Click its number to go back to 0. It starts at 0 in every session.

On a MiniLab 3, the **black knob** (the main encoder) is the Key dial in Key mode:

- **Turn** it to change the root, a semitone a step; **Shift + turn** for the scale.
- **Press and turn** to transpose; **click** it to go back to 0.
- **Hold it and play a key** to make that note the root (hold Min or Maj too for a minor or major key).
- **Knob: At once / On press** (in the panel): at once, every step changes the key; on press, turning picks a key, shown next to the active one ("→ D minor"), and a click on the knob selects it.

In Drum and Chord mode the knob browses sounds, as before.

### Play styles {#performance-play-styles}

The **Play** row in the Controller panel changes how the keys play, in every pad mode: what you play on a MIDI keyboard, on the picture's keys or on the computer keyboard. Each style is a switch, and they work together (a strummed, humanized pattern with an arpeggio on top is fine). They're remembered, like Voicing and Bass, because they belong to how you play, not to a song.

- **Strum** plays a chord's notes one after another, like a guitar: the time from the first note to the last (10 to 250 ms), and **Up** (low to high), **Down** or **Alt** (alternating; on a pattern down on the beat and up in between, as a guitarist strums).
- **Slop** humanizes: every note a little later at random (up to 40 ms) and a little louder or softer. A strummed chord with some slop sounds like a hand.
- **Arp** plays the notes you hold one at a time, at the tempo: **Up**, **Down**, **Up-down**, **Random** or **As played**, a rate (1/4 to 1/32), **octaves** (1–4) and a **gate** (how long each note lasts). While the song plays, the arpeggio is on its grid; while stopped, it starts with your first key. A new chord keeps the arpeggio's place, so changes land on the beat. The bass is held under it, not arpeggiated. On plain keys (no chord pads) it's a classic arpeggiator: hold a few keys.
- **Pattern** plays the chord again and again on a rhythm while you hold it, from calm to busy: **Whole notes**, **Halves**, **Ballad** (the bass and chord on 1, softer chords on 3 and 4), **Waltz** (in three: bass, chord, chord), **Quarters**, **Backbeat** (bass on 1 and 3, chord on 2 and 4), **Dotted** (3 + 3 + 2 eighths), **Charleston**, **Eighths**, **Offbeats** (a reggae skank), **One drop** (reggae: the bass on 3, chords on 2 and 4), **Ska** (a walking bass, upstrokes on every "and"), **Tresillo** (3 + 3 + 2 sixteenths), **Oom-pah**, **Clave** (the son clave, 3-2, over two bars), **Bossa** (two bars), **Shuffle** (long-short on every beat), **House** (syncopated piano stabs), **Funk** (short 16th stabs), **Montuno** (a salsa piano figure over two bars), **Gallop** (an eighth and two 16ths, driving rock) and **Pulse** (16ths). The key's velocity sets how loud. With the **Arp** on too, each hit of the pattern plays the next arp note; with **Strum**, each hit is strummed. The Waltz is three beats long: it fits a song in 3/4.
- **Latch** keeps what the keys play going after you let go, until you play the next chord (or, on plain keys, the next set of keys: keys you add while others are down join in) or turn Latch off. **Stop** silences it too. The command **Latch the keys** can get a shortcut, or you can MIDI-learn a button to it (the MiniLab's Hold button doesn't send anything).
- **Balance** makes the notes in the middle of a chord softer than the bass and the top note, as a pianist brings out the melody. 0% plays all notes equally.

With the chord pads (Chord and Key mode) there's more next to **Voicing** and **Bass**:

- **Smooth** voicing gives each chord the inversion closest to the one before, so a progression moves by small steps (C, then F as C F A, then G as D G B) without turning the Voicing knob. Voicing still sets the register Smooth stays near, and the number next to Smooth is the voicing it plays.
- **The bass sound**: the chord's own sound, or a Notes track of its own (its sound, its mix and effects, and its recording), like the Orchid's second engine.
- **Split**: keys below C3 play the bass alone, one note at a time, on the bass sound; keys above play chords without a bass of their own, so your left hand plays the bass line.

On a controller in Chord and Key mode the eight knobs are these settings: **1** Voicing, **2** Transpose, **3** Strum, **4** Arp (its rate), **5** Bass, **6** Slop, **7** Pattern and **8** Balance. Knobs 3, 4, 6 and 7 turn their style off at the far left. The picture labels them and the MiniLab's display shows the value.

The **keys in the picture light up as their notes sound**: a strum's notes one after another, an arpeggio a step at a time, a pattern on its hits. A key you hold is lit in the accent while it sounds and faintly while it waits for its turn; the notes the keys add are in a paler accent.

**Recording** records what you hear: each strummed note at its own time, each arpeggio note and each pattern hit, the bass on its own track when it has one. With **Snap** on, the hits snap to the grid and a strum keeps its spread. While stopped (step entry), a key writes its chord as it is.

## Launchpad and Push

In **Settings → MIDI**, **Connect Launchpad / Push** turns a Novation Launchpad (Mini MK3, X, Pro MK3) or an Ableton Push 2/3 into a step sequencer for the drum machine:

- The 8×8 pads show 8 tracks × 8 steps in the track colors; the playing step is highlighted.
- Press a pad to turn a step on or off.
- The arrow buttons scroll to other tracks and steps; the play button starts and stops.
- On Push, the eight encoders turn the selected track's sound parameters.

Rebeat asks for MIDI access with "system exclusive" messages for this; it's needed to light the pads.
