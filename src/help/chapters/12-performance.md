# Performance, MIDI and controllers {#performance}

## The Performance panel

The [Performance](panel:performance) panel puts everything for playing live in one place (try the **Perform** layout, {{key:layout.perform}}).

| Section               | Controls                                                                                                                                                                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pads**              | Big pads for the step tracks that play hits or notes. Higher on a pad is louder. They record into the pattern while recording.                                                                                                                                                                           |
| **Sections**          | One button per section: click to queue it (or start from it when stopped). The playing section is lit; the queued section pulses.                                                                                                                                                                        |
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

**Buttons** run commands: in the **Shortcuts** dialog ({{key:app.shortcuts}}), click **MIDI** next to a command and press a button or pad on your controller (Play / stop, Record, Metronome, Next section, Select the next track, Fill…). Right-clicking the transport bar's Play, Rec, Tap, Click and Loop/Song buttons does the same. Held commands (Fill) last while you hold the button.

Settings → MIDI lists both kinds of mappings, where you can change a control's mode or remove it. Mappings in this project win over the ones in every project.

## Your controller {#performance-your-controller}

**Settings → MIDI → Controller** has maps for some controllers: what their knobs, faders and pads do, in every project. Rebeat recognizes them when they're connected and offers their map.

- The **knobs** turn the selected track's **SOUND knobs 1–8** (the encoder strip's knobs, whatever the track plays: a sample's Tune and Decay, a synth's macros). Select another track and the knobs follow; **Select the next / previous track** are commands you can put on buttons.
- The **faders** (if it has them) are the selected track's level, its Reverb and Delay sends, and the master level.
- The **pads** play tracks 1–16 on channel 10.
- **Learn** next to a slot teaches it another control; **Learn every control** walks through all of them ("move knob 1… now knob 2…"). Use it when your controller is set up differently, or has no factory assignment.
- **Pick up** (off by default) makes absolute knobs and faders take over only when they reach the value on screen, so nothing jumps when you select another track. **Relative knobs** sets how far one step of an endless encoder turns a knob.
- **Mackie Control**: inputs named MCU (or ones you tick) run the transport: Play, Stop, Record, Cycle (loop or song), rewind and forward (sections), the jog wheel.
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

### The Keys panel

The [Keys](panel:controller) panel shows a live top-down picture of your controller. Open it from the **Panels** menu or by applying the **Perform** layout ({{key:layout.perform}}).

- **The header** is one row: the map in use (click it for another map or the MIDI settings), the **Pads** switch, the **Key** in Key and Next mode, and the same **Keys** drop-down as the top bar (what the keys play, and **Edit sound**), so you can change it with the panel maximized.
- **The settings** are cards next to the picture (under it when the panel is narrow): **Chords**, **Bass** and **Suggest** in Chord, Key and Next mode, and **Play** in every mode. Click a card's title to fold it; folds are remembered.
- **The picture's knobs** in Chord, Key and Next mode are those settings: click one to bring its card into view (it flashes), and drag it up or down or scroll on it to turn it. In Drum mode they turn the selected track's SOUND knobs.

- **Arturia MiniLab 3**: the device as it looks from above, in its own colors. Keys light up as you play them (shaded by velocity) and show the note they play (A3, C4…, with the device's octave), pads have the colors of what they play and light up while held, faders move in real time, and the knobs' white caps (the encoder's black one too) turn as you turn them and light up in the accent for a moment. The MiniLab's screen is mirrored in its black panel, centered as the device shows it. Holding Shift shows the pads' second functions. Click a key in the picture to play it, or drag across the keys with the button down to play one after another.
- **Where the faders are**: MIDI has no way to ask a controller where its faders are (they only send when they move), so until you move one, it's drawn faint where the value it controls is; after that it follows the device. The MiniLab's knobs turn without end, so their caps show the turning, not a position. The pitch strip rests in the middle. Turn on **Pickup** in Settings → MIDI so an untouched fader doesn't make its value jump when you first move it.
- **The notes you're playing**: under the picture, the keys held down read like an equation, low to high: **A3 + C4 + E4 = Am**. When they make a chord, its name follows the equals sign. Rebeat knows about 90 chord symbols: triads and power chords, sixths, sevenths, added tones, sus chords, 9ths, 11ths, 13ths and altered dominants (C7♯9, C7♭9♭13…). A seventh chord may leave out its fifth and a 13th its ninth, as players usually do (C E B♭ is still C7). When the same notes can be read two ways, the simpler reading with the lowest note as the root wins (C E G A is C6, A C E G is Am7). A bass that isn't the root comes after a slash (C/E, D7/C). The notes a chord adds for you ([chord pads](#performance-chord-pads), or chord mode in the pad view) are in a paler color, here and on the keys.
- **Other maps**: the slots are shown as a labeled list with the current values.
- **No map selected**: a prompt to plug in a controller and pick its map.

You can click or tap the keys and pads directly in the panel — they play exactly as if you pressed them on the device. Hovering a control shows what it's mapped to and the current value.

### Chord pads {#performance-chord-pads}

The **Pads** switch at the top of the Keys panel sets what your controller's pads 1–8 do:

- **Drum** (the default): they play tracks 1–8 of the drum machine.
- **Key**: [Key mode](#performance-key-mode), below.
- **Chord**: they're chord buttons, after the Telepathic Instruments **Orchid**. Pads 1–4 are the chord types **Dim**, **Min**, **Maj** and **Sus** (sus4); pads 5–8 add **6**, **m7** (minor seventh), **M7** (major seventh) and **9**. Hold a chord type, add any extensions, and play one key: the key is the root and the lowest note, and the chord is built up from it. Maj + m7 on C plays C7, Min + m7 + 9 plays Cm9, Dim + 6 a diminished seventh.

Without a chord type held, a key plays on its own. One chord sounds at a time: a new key takes the chord over. Pressing or letting go of a pad while you hold a key changes the chord at once. Chords record into a Notes track like keys you play yourself, and **scale lock** still moves the root into the key.

**Bass** (in the panel, for Chord and Key mode; **−** goes deeper, **+** back up, click the value for Off): **Off** or **−1** to **−6** adds the chord's root that many octaves below it, on the same sound, like the Orchid's bass. It never goes below C1 (an octave lower is felt more than heard): under a chord around middle C, −3 already reaches C1, so the deeper steps are for chords played higher (Voicing up, a high transpose); it shows in the equation and on the keys like the chord's other notes, and it's recorded with them. **Transpose** is in the Chords card.

**Voicing** (in the Chords card) plays every chord the pads make in an inversion, like the Orchid's Voicing dial: each step up moves the chord's lowest note an octave up (C E G → E G C → G C E → C E G an octave higher), each step down its highest note an octave down, up to 8 steps either way. The chord stays the same, so smooth progressions are easy (C, then F as C F A). With Bass on, the bass stays on the chord's root, below the voiced chord; with Bass off, the equation names the inversion (C/E). Click the number to go back to root position. Voicing and Bass are remembered.

On a controller, in Chord and Key mode **knob 1** turns the voicing, **knob 2** the transpose and **knob 5** the bass (left is deeper: Off, −1 … −6). The knob's turn is split evenly: all the way left is −8 (−12 for the transpose, −6 for the bass), all the way right +8 (+12, Off), and every value in between takes the same turn. Knobs that send relative values move one step per notch instead (a MiniLab 3 knob set to relative sends two messages per notch); the picture labels them, and the MiniLab's display shows the new value. In Drum mode they're sound knobs as usual.

Two chord types held together play a **secret chord**, as on the Orchid (firmware 3.84): Dim + Sus a power chord (C5), Maj + Sus augmented, Min + Sus m(add4), Min + Dim m(♭6), Maj + Dim (♭6), Maj + Min 7♯9. With three or four held, the first two you pressed count. These follow the Orchid manual's table as others have quoted it; they haven't been checked on a device.

On a MiniLab 3 the pads show their chord labels in the picture; other controllers get a row of the eight chord pads under their slots. Pads beyond the eighth (bank B, a second row) still play tracks 9–16. The commands **Pads: Drum mode**, **Pads: Chord mode**, **Pads: Key mode** and **Pads: next mode** do the same as the switch, so you can give them a shortcut or map a button to them.

### Key mode {#performance-key-mode}

In **Key** mode, like the Orchid's Key Mode, every key plays the chord that belongs to it in a key you choose: in C major, C plays C, D plays Dm, B plays Bdim. One finger plays a whole progression. A key outside the key is moved to the nearest note in it first (C♯ plays C in C major). Key mode has its own key, saved in your settings: the song's key isn't touched.

- **Pads 5–8** add the key's own sixth, seventh or ninth: G with m7 (or M7) plays G7 in C major, C plays Cmaj7.
- **Pads 1–4** play their chord on the key exactly as you pressed it, so you can borrow chords from outside the key (B♭ with Maj in C major); two of them make a secret chord, as in Chord mode.
- **The key**: the **Key** chip in the Keys panel picks a root and a scale (major, minor, Dorian, Phrygian, Lydian, Mixolydian, harmonic minor), or copies the pattern's key.
- **Transpose** moves everything the keys play by semitones, in every pad mode. Click its number to go back to 0. It starts at 0 in every session.

On a MiniLab 3, the **black knob** (the main encoder) is the Key dial in Key mode:

- **Turn** it to change the root, a semitone a step; **Shift + turn** for the scale.
- **Press and turn** to transpose; **click** it to go back to 0.
- **Hold it and play a key** to make that note the root (hold Min or Maj too for a minor or major key).
- **The black knob changes the key** (in the Key chip's menu): **at once**, every step changes the key; or **when you press it**: turning picks a key, shown next to the active one ("→ D minor"), and a click on the knob selects it.

In Drum and Chord mode the knob browses sounds, as before.

### Play styles {#performance-play-styles}

The **Play** card in the Keys panel changes how the keys play, in every pad mode: what you play on a MIDI keyboard, on the picture's keys or on the computer keyboard. Each style is a switch, and they work together (a strummed, humanized pattern with an arpeggio on top is fine). They're remembered, like Voicing and Bass, because they belong to how you play, not to a song.

- **Strum** plays a chord's notes one after another, like a guitar: the time from the first note to the last (10 to 250 ms), and **Up** (low to high), **Down** or **Alt** (alternating; on a pattern down on the beat and up in between, as a guitarist strums).
- **Slop** humanizes: every note a little later at random (up to 40 ms) and a little louder or softer. A strummed chord with some slop sounds like a hand.
- **Arp** plays the notes you hold one at a time, at the tempo: **Up**, **Down**, **Up-down**, **Random** or **As played**, a rate (1/4 to 1/32), **octaves** (1–4) and a **gate** (how long each note lasts). While the song plays, the arpeggio is on its grid; while stopped, it starts with your first key. A new chord keeps the arpeggio's place, so changes land on the beat. The bass is held under it, not arpeggiated. On plain keys (no chord pads) it's a classic arpeggiator: hold a few keys.
- **Pattern** plays the chord again and again on a rhythm while you hold it. Its menu has 53 patterns in nine groups, each with a line about it and a little picture of its rhythm (the chord on top, the bass below):
  - **Basics**: Whole notes, Halves, Quarters, Eighths, Dotted (3 + 3 + 2), Pulse (16ths), Rock push (eighths with the chord pushed in on 4-and).
  - **Ballads & keys**: Ballad, Waltz and Jazz waltz (3/4), the **Triplet ballad** (the 50s slow-dance piano in 12/8), **Alberti bass** (classical piano: low, high, middle, high) and **Arpeggio up** (the chord broken up and down).
  - **Rock, pop & soul**: Backbeat, Gallop, Motown stabs, Gospel shout, Stadium eighths (root and fifth).
  - **Jazz & blues**: Charleston, **Shuffle** (true triplets), Swing comp, **Walking bass** (it walks up the chord and, when Auto knows the next chord, leans into it from a half step away), **Boogie-woogie** (the left hand's root–3–5–6–♭7 figure).
  - **Latin**: Tresillo, the son Clave (3-2 and 2-3), the Rumba clave, Habanera, Bossa, Samba, Cha-cha-chá, Montuno, Reggaeton (dembow), Bolero, Tango marcato.
  - **Caribbean & African**: Offbeats, One drop, Ska, Reggae bubble, Afrobeats, Highlife.
  - **Dance & electronic**: House, Funk, Disco stabs (over an octave bass), Trance gate, UK garage.
  - **Hip-hop**: Boom bap, **Trap** (a long chord and 16th-triplet rolls).
  - **Folk & country**: Oom-pah, Polka, Train beat, **Root–fifth bass**, **Travis picking** (an alternating bass under treble pinches).

  Some patterns pick their own notes of the chord (the bass lines and broken chords): bass notes play under the chord (with Bass on, on its octave and its track), the chord's notes as voiced. Patterns in triplets record in triplets, even with Snap on. The key's velocity sets how loud. With the **Arp** on too, each plain chord hit plays the next arp note; with **Strum**, each hit is strummed. The patterns are written in 4/4 (the waltzes in 3/4): in a song in another meter they play as written.

- **Latch** keeps what the keys play going after you let go, until you play the next chord (or, on plain keys, the next set of keys: keys you add while others are down join in) or turn Latch off. **Stop** silences it too. The command **Latch the keys** can get a shortcut, or you can MIDI-learn a button to it (the MiniLab's Hold button doesn't send anything).
- **Balance** makes the notes in the middle of a chord softer than the bass and the top note, as a pianist brings out the melody. 0% plays all notes equally.

With the chord pads (Chord and Key mode) there's more next to **Voicing** and **Bass**:

- **Smooth** voicing gives each chord the inversion closest to the one before, so a progression moves by small steps (C, then F as C F A, then G as D G B) without turning the Voicing knob. Voicing still sets the register Smooth stays near, and the number next to Smooth is the voicing it plays.
- **The bass sound**: the chord's own sound, or a Notes track of its own (its sound, its mix and effects, and its recording), like the Orchid's second engine.
- **Split**: keys below C3 play the bass alone, one note at a time, on the bass sound; keys above play chords without a bass of their own, so your left hand plays the bass line.

On a controller in Chord and Key mode the eight knobs are these settings: **1** Voicing, **2** Transpose, **3** Strum, **4** Arp (its rate), **5** Bass, **6** Slop, **7** Pattern and **8** Balance. Knobs 3, 4, 6 and 7 turn their style off at the far left. The picture labels them and the MiniLab's display shows the value.

The **keys in the picture light up as their notes sound**: a strum's notes one after another, an arpeggio a step at a time, a pattern on its hits. A key you play is lit in the theme's accent, a note the software plays (a chord's other notes, the bass, an arpeggio's or a pattern's notes) in the theme's second accent, both as opaque as the note is loud (velocity 127: fully). A key you hold that isn't sounding right now (its turn in a strum, between arp steps) gets a ring in the accent, so it never looks like a soft note.

**Recording** records what you hear: each strummed note at its own time, each arpeggio note and each pattern hit, the bass on its own track when it has one. With **Snap** on, the hits snap to the grid and a strum keeps its spread. While stopped (step entry), a key writes its chord as it is.

### Bends {#performance-bends}

The **Bend** card gives the notes the keys play a bend of their own: a sax's scoop into a note, a brass fall at its end, a guitarist's bend up to the next note. It works with any keyboard (the MiniLab's strip can only bend everything at once), on **synths**; a sampled instrument doesn't bend yet, and the card says so.

| Shape     | What you hear                                                                     |
| --------- | --------------------------------------------------------------------------------- |
| **Scoop** | The note starts below (or above) and slides into its pitch.                       |
| **Fall**  | When you let go, the note drops away while it fades.                              |
| **Doit**  | When you let go, a quick flick up.                                                |
| **Dip**   | After the delay, down and back.                                                   |
| **Rise**  | After the delay, it climbs and stays there: risers, builds.                       |
| **Next**  | After the delay, it bends to the next note **in the key** (up or down) and stays. |
| **Shake** | After the delay, a vibrato that grows to its depth: the build-up of a held note.  |

- **Amount**: how far, in semitones (Next: in notes of the key, so +1 from E in C major is F, from F it's G). Minus bends down. Click the value for the shape's default.
- **Time**: how long the movement takes; **Delay**: how long the note waits before it starts. The **♩** button syncs both to the tempo (1/32 to 4 bars).
- **Curve**: Linear, Smooth (an S-curve), Exp (slow, then fast) or Bounce.
- **Rate** (Shake only): how fast the vibrato is, in Hz, or per beat when synced.
- **Notes**: which notes bend. **All**, the **Top** note of a chord, the **Bass**, or only the **Newest** (the last note of a strum, the top of a chord, every note of an arpeggio).
- **Chance**: how many notes bend, at random. **Velocity**: harder notes bend more (+) or less (−).
- **Strip** (with a MiniLab 3): the pitch strip bends the whole synth, or only the newest note you hold, so you can bend one note of a chord like a guitar string. The strip's movement isn't recorded.

Each shape keeps its own values: switching from Scoop to Fall and back keeps your Scoop. A **Fall** and a **Doit** keep the note sounding until they're done, so you hear all of them, even on a sound with a short release. The card is remembered, like the Play card. Right-click its controls to MIDI-learn them (On, the shape, Amount, Time, Delay, Chance and Velocity), in every project.

**Recording** keeps each note's bend with the note: a recorded Scoop scoops every time it plays, and a Next keeps the interval it bent by even if you change the key later. In the piano roll a bent note shows its bend, and its menu changes it (**Bend ▸**). MIDI files can't say a note bends, so exports leave bends out.

### Suggestions: the next chord {#performance-suggestions}

**Suggest** (the Keys panel's Suggest card, in Chord, Key and Next mode) suggests what could come next after each chord you play, and marks **the key to press** for the three best on the picture's keys: the bigger the dot, the better, the chord's name next to it. Each key is the one closest to the last key you played, so your hand moves least (every note name is on the MiniLab's 25 keys at least twice). In Chord mode a dot on a pad says which chord type to hold with it. Hover a dot for the chord, its roman numeral, what it does and why it fits ("V: home, the strongest resolution", "IV: continues the four-chord pop progression"); press the dot to play it.

The colors say what a chord does:

- **Green**, home: the key's home chord and its relatives (I, vi, iii).
- **Blue**, away from home: IV and ii, which lead on.
- **Red**, tension: V, V7 and vii°, which want to resolve home.
- **Purple**, color: chords borrowed from the parallel key (♭VII, iv, ♭VI) and secondary dominants (V/V: D in C).

Suggestions come from how chords usually move (V goes home to I, ii goes to V, vi often to IV…) and from famous progressions: when your last chords match the start of one, its next chord comes first and the tooltip names it (the four-chord pop progression, the fifties progression, ii–V–I, the jazz turnaround, the mixolydian rock progression, the royal road, Pachelbel's canon, the 12-bar blues, the Andalusian cadence and a few minor ones). **Adventure** sets how far they stray from the key: **Safe** (only the key's own chords), **Common** (also the usual borrowed chords and sevenths) or **Bold** (more color: ♭VI, ♭III, secondary dominants, the Neapolitan). The key is Key mode's own in Key and Next mode, the pattern's in Chord mode. The MiniLab's display shows "Next: F - Am - G" after each chord.

**Next mode** (the pads' fourth mode) puts the suggestions on the pads, for playing without looking at the screen (the MiniLab's keys have no lights, its pads do): pads 1–8 hold the eight best next chords, in their colors, and pressing one plays it, with Voicing, Bass and the play styles, as a key would. After every chord the pads refill. The keys play as in Key mode, so you can play a chord of your own and the pads follow it.

**Pad 1: a progression.** In Next mode the **Pad 1** menu picks a famous progression, and pad 1 then always holds its next chord: press it again and again to play the progression through, with the other pads as detours. The menu shows each progression's chords as roman numerals and in your key, and what it is: **Four chords** (I–V–vi–IV), **Sad pop** (vi–IV–I–V), **Fifties** (I–vi–IV–V), **Three chords** (I–IV–V), the J-pop **Royal road** (IV–V–iii–vi), **Pachelbel's canon**, the **12-bar blues**, **ii–V–I**, the **Jazz turnaround** (I–vi–ii–V), the **Circle of fifths** (vi–ii–V–I), **Mixolydian rock** (I–♭VII–IV), the **Epic resolution** (♭VI–♭VII–I), **Major to minor iv** (I–III–IV–iv) and, in minor keys, the **Andalusian cadence** (i–VII–VI–V), **Epic minor** (i–VI–III–VII), the **Minor climb** (i–VI–VII), **Minor three chords** (i–iv–v) and the **Dorian vamp** (i–IV). Pad 1 follows where you are: play one of its chords on the keys and it goes on from there. Its chords show next to the menu, the next one lit. **Free** goes back to the best suggestion.

**Auto** plays the progression by itself (Next mode, in the Suggest and Auto card, next to the **Pad 1** menu): press **▶ Auto** and pad 1's chord changes on its own, in time, through Voicing, Bass and the play styles, a full accompaniment with a pattern on. **Every** sets how often: every 1, 2, 3, 4, 6 or 8 **patterns** when a pattern plays (so a change never lands in the middle of its rhythm: the two-bar Bossa changes every two bars, the three-beat Waltz never drifts against the bar), or **bars** when none does. Step below one for faster changes: every **2 beats** (**½ bar** in 4/4), every **beat** or every **½ beat**. A pattern keeps its place in time across them, so a fast change doesn't restart it on its first beat. A bar under the next chord fills up until it comes in. While Auto plays:

- the keys play **single notes**, a melody over the chords;
- a **pad** you press comes in **at the next change**, in time, instead of the progression's next chord (it blinks until then; press it again to take it back), and the progression goes on after it;
- without a progression picked (**Free**), Auto follows the best suggestion every time: a progression that writes itself (as adventurous as Adventure says).

**Loop** goes round again (off: Auto stops after the last chord). Auto plays **on its own**: the song can stay stopped (while it plays, Auto starts on its next bar). **Sync to song** ties it to the song instead (below). **■ Stop** ends it, and so does the transport's Stop. The command **Auto progression: start/stop** can get a shortcut, or a MIDI button by MIDI learn.

**Recording with Auto.** With **Sync to song** on, pressing ▶ Auto while the song is stopped **arms** it (the button blinks "Starts with Play"). Press **Rec** and **Play**: Auto starts exactly on the song's first step, after the count-in, from the progression's first chord, and records into the keys' track (the bass into its own track, if it has one), each chord on its bar. When the song stops, Auto waits again for the next Play: take after take. Before you record, the card says whether the take fits: in loop mode the pattern has to be as long as the progression (**Fit the pattern** makes it so, **Spread over sections** adds sections and switches to song mode); in song mode, the take goes on through the song's sections, each chord in the section playing at that moment, and **Add sections** adds what's missing (copies of the section, the drums going on, the keys' lane empty), **Make copies** gives sections that share a pattern their own, and **Unroll repeats** turns a section that plays twice into two.

## Launchpad and Push

In **Settings → MIDI**, **Connect Launchpad / Push** turns a Novation Launchpad (Mini MK3, X, Pro MK3) or an Ableton Push 2/3 into a step sequencer for the drum machine:

- The 8×8 pads show 8 tracks × 8 steps in the track colors; the playing step is highlighted.
- Press a pad to turn a step on or off.
- The arrow buttons scroll to other tracks and steps; the play button starts and stops.
- On Push, the eight encoders turn the selected track's sound parameters.

Rebeat asks for MIDI access with "system exclusive" messages for this; it's needed to light the pads.
