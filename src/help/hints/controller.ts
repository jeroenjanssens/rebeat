import type { Hints } from "./types";

const hints: Hints = {
  "controller.none": {
    title: "No controller",
    text: "Plug in a MIDI controller, then go to Settings → MIDI → Controller to pick its map. Rebeat will recognize a MiniLab 3, MPK Mini MK3 or Launchkey Mini automatically.",
    guide: "performance-your-controller",
  },
  "controller.picture": {
    title: "Controller picture",
    text: "A top-down picture of your controller. Keys and pads are clickable — they play the same notes or tracks they would on the real device. Knobs and faders show their current values and what they control.",
    guide: "performance-your-controller",
  },
  "controller.generic": {
    title: "Controller slots",
    text: "Each row is a slot on your controller: its MIDI number, channel and current value. The MiniLab 3 gets a full picture; other controllers show this list.",
    guide: "performance-your-controller",
  },
  "controller.screen": {
    title: "Display",
    text: "Mirrors the text Rebeat sends to the device's screen, two lines centered as the MiniLab shows them: the current track and its sound, or a knob's name and value while it turns.",
    guide: "performance-your-controller",
  },
  "controller.encoder": {
    title: "Main encoder",
    text: "The MiniLab 3's main encoder (the black knob) browses the Playable sound list: turn to move through sounds, click to add the current sound as a track. In the pads' Key mode it's the Key dial: turn for the root, Shift + turn for the scale, press and turn to transpose.",
    guide: "performance-your-controller",
  },
  "controller.strip.0": {
    title: "Pitch strip",
    text: "The pitch touch strip. Slide your finger up or down to bend the pitch. The position is shown here live.",
    guide: "performance-your-controller",
  },
  "controller.strip.1": {
    title: "Mod strip",
    text: "The mod touch strip. Slide to send mod wheel (CC 1), which is wired to filter cutoff, vibrato or another modulation on most synths.",
    guide: "performance-your-controller",
  },
  "controller.btn.0": {
    title: "Shift button",
    text: "Hold Shift for the second functions printed on the pads: Shift + pad 4 switches loop and song mode, 5 stops, 6 plays, 7 records and 8 taps the tempo. While it's held, the pads show those functions in the MiniLab's own colors, here and on the device. With Shift the octave buttons change the keyboard octave.",
    guide: "performance-your-controller",
  },
  "controller.btn.1": {
    title: "Hold button",
    text: "The MiniLab's Hold button sends nothing to Rebeat; it's lit while Latch (in the Play row) keeps what the keys play going.",
    guide: "performance-your-controller",
  },
  "controller.btn.2": {
    title: "Octave −",
    text: "Shifts the keyboard down an octave. Shift + this button changes the active pad bank to A.",
    guide: "performance-your-controller",
  },
  "controller.btn.3": {
    title: "Octave +",
    text: "Shifts the keyboard up an octave. Shift + this button changes the active pad bank to B.",
    guide: "performance-your-controller",
  },
  "controller.knob.0": {
    title: "Knob 1",
    text: "Turns the selected track's first SOUND knob (Tune, Macro 1, or whatever the track plays); in Chord and Key mode, the chord voicing. The name and value are shown below the knob. Its white cap turns as you turn the knob and lights up for a moment.",
    guide: "performance-your-controller",
  },
  "controller.knob.1": {
    title: "Knob 2",
    text: "Turns the selected track's second SOUND knob; in Chord and Key mode, the transpose. Its white cap turns as you turn the knob and lights up for a moment.",
    guide: "performance-your-controller",
  },
  "controller.knob.2": {
    title: "Knob 3",
    text: "Turns the selected track's third SOUND knob; in Chord and Key mode, the strum. Its white cap turns as you turn the knob and lights up for a moment.",
    guide: "performance-your-controller",
  },
  "controller.knob.3": {
    title: "Knob 4",
    text: "Turns the selected track's fourth SOUND knob; in Chord and Key mode, the arpeggiator's rate. Its white cap turns as you turn the knob and lights up for a moment.",
    guide: "performance-your-controller",
  },
  "controller.knob.4": {
    title: "Knob 5",
    text: "Turns the selected track's fifth SOUND knob; in Chord and Key mode, the bass. Its white cap turns as you turn the knob and lights up for a moment.",
    guide: "performance-your-controller",
  },
  "controller.knob.5": {
    title: "Knob 6",
    text: "Turns the selected track's sixth SOUND knob; in Chord and Key mode, the slop. Its white cap turns as you turn the knob and lights up for a moment.",
    guide: "performance-your-controller",
  },
  "controller.knob.6": {
    title: "Knob 7",
    text: "Turns the selected track's seventh SOUND knob; in Chord and Key mode, the pattern. Its white cap turns as you turn the knob and lights up for a moment.",
    guide: "performance-your-controller",
  },
  "controller.knob.7": {
    title: "Knob 8",
    text: "Turns the selected track's eighth SOUND knob; in Chord and Key mode, the balance. Its white cap turns as you turn the knob and lights up for a moment.",
    guide: "performance-your-controller",
  },
  "controller.padMode.drum": {
    title: "Drum pads",
    text: "Pads 1–8 play tracks 1–8 of the drum machine (the usual way).",
    guide: "performance-chord-pads",
  },
  "controller.padMode.chord": {
    title: "Chord pads",
    text: "Pads 1–4 pick a chord type (Dim, Min, Maj, Sus) and pads 5–8 add 6, m7, M7 or 9, like the Orchid's chord buttons. Hold them and play one key: it plays the chord with that key as its root. Two chord types together make a secret chord.",
    guide: "performance-chord-pads",
  },
  "controller.padMode.key": {
    title: "Key mode",
    text: "Every key plays the chord that belongs to it in Key mode's key (in C major: D plays Dm, B plays Bdim), like the Orchid's Key Mode. Pads 5–8 add the key's own sixth, seventh or ninth; pads 1–4 play their chord on the key as pressed, to borrow chords.",
    guide: "performance-key-mode",
  },
  "controller.keyMode.key": {
    title: "Key mode's key",
    text: "The key Key mode plays in, its own (the song's key isn't touched). Pick a root and a scale, or copy the page's key. On a MiniLab 3, turn the black knob to change the root, Shift + turn to change the scale.",
    guide: "performance-key-mode",
  },
  "controller.keyMode.pending": {
    title: "The key a press selects",
    text: "The key you turned the knob to. Press the knob (or click here) to select it; turn back to the active key to drop it.",
    guide: "performance-key-mode",
  },
  "controller.keyDial.instant": {
    title: "Knob: at once",
    text: "Turning the black knob changes Key mode's key with every step.",
    guide: "performance-key-mode",
  },
  "controller.keyDial.press": {
    title: "Knob: on press",
    text: "Turning the black knob picks a key, shown next to the active one; pressing the knob selects it, as on the Orchid.",
    guide: "performance-key-mode",
  },
  "controller.voicing": {
    title: "Chord voicing",
    text: "Inversions of every chord the pads make, like the Orchid's Voicing dial: each step up moves the chord's lowest note an octave up (C E G → E G C), each step down its highest note an octave down. The chord stays the same; the bass stays on its root. Click the number for root position. On a controller: knob 1 in Chord and Key mode.",
    guide: "performance-chord-pads",
  },
  // the knobs in Chord and Key mode (D140, D148, D150–D153): what each setting is and does
  "controller.keysknob.0": {
    title: "Knob 1: Voicing",
    text: "Which inversion of the chord you hear: the same notes, stacked differently. Turning right moves the chord's lowest note up an octave, step by step (C E G → E G C → G C E…), so the chord gets higher and brighter; turning left moves its top note down an octave, so it gets lower and darker. The middle is root position. With Smooth on, it sets the register the chords stay near.",
    guide: "performance-chord-pads",
  },
  "controller.keysknob.1": {
    title: "Knob 2: Transpose",
    text: "Moves everything the keys play up or down, a semitone per step (−12 to +12): the same chords and the same fingers, in another key. Turning right raises the pitch, turning left lowers it; the middle is 0, as you play it. Twelve steps is a whole octave.",
    guide: "performance-chord-pads",
  },
  "controller.keysknob.2": {
    title: "Knob 3: Strum",
    text: "Plays a chord's notes one after another instead of all at once, like a pick across guitar strings. Far left is off: all notes together. Turning right makes the strum slower, from 10 ms (a quick, tight roll that just softens the attack) to 250 ms (a slow, harp-like spread). Up, Down or Alt is in the Play row.",
    guide: "performance-play-styles",
  },
  "controller.keysknob.3": {
    title: "Knob 4: Arpeggiator",
    text: "Plays the notes you hold one at a time, over and over, at the song's tempo, instead of together. Far left is off. Turning right makes it faster: quarter notes, eighths, eighth triplets, sixteenths, sixteenth triplets, thirty-seconds. The order (up, down…), the octaves and how long each note lasts are in the Play row.",
    guide: "performance-play-styles",
  },
  "controller.keysknob.4": {
    title: "Knob 5: Bass",
    text: "Adds the chord's root below it, as a bass player would: on the chord's sound, or on the bass's own track. Far right is off; each step to the left plays the bass an octave deeper (−1 to −6), for a fuller, heavier bottom. It never goes below C1, where you'd feel it more than hear it: under a chord around middle C, −3 already reaches it, so the deeper steps are for chords played high.",
    guide: "performance-chord-pads",
  },
  "controller.keysknob.5": {
    title: "Knob 6: Slop",
    text: "Makes what you play less perfect, on purpose: each note starts a little later at random and comes out a little louder or softer, so chords and arpeggios sound played by hands rather than by a machine. Far left is off; turning right adds more, up to 40 ms of looseness and ±30% in loudness at 100%.",
    guide: "performance-play-styles",
  },
  "controller.keysknob.6": {
    title: "Knob 7: Pattern",
    text: "Plays the chord again and again on a rhythm while you hold it, like a pianist or a guitarist accompanying a song. Far left is off: the chord just sounds while held. Turning right steps through 22 rhythms from calm to busy: Whole notes, Halves, Ballad, Waltz, Quarters, Backbeat, Dotted, Charleston, Eighths, Offbeats, One drop, Ska, Tresillo, Oom-pah, Clave, Bossa, Shuffle, House, Funk, Montuno, Gallop and Pulse.",
    guide: "performance-play-styles",
  },
  "controller.keysknob.7": {
    title: "Knob 8: Balance",
    text: "How evenly a chord's notes are played. At the far left all notes are equally loud; turning right makes the notes in the middle softer, so the bass and the top note (the melody) stand out, as a pianist voices a chord: up to about a third softer at 100%.",
    guide: "performance-play-styles",
  },
  "controller.padMode.next": {
    title: "Next mode",
    text: "The pads are the next chords to play: after each chord, pads 1–8 hold the eight best next chords, each in the color of what it does (green home, blue away, red tension, purple color). A press plays one, with Voicing, Bass and the play styles. The keys play as in Key mode, in its key.",
    guide: "performance-suggestions",
  },
  "controller.progression": {
    title: "Pad 1: a progression",
    text: "In Next mode, pick a famous progression (four chords, the fifties, the J-pop royal road, the jazz turnaround, mixolydian rock, the 12-bar blues…) and pad 1 always holds its next chord: press pad 1 again and again to play it through. It follows where you are: play a chord of it on the keys and pad 1 goes on from there. The chords show next to it, the next one lit. Free: pad 1 is the best suggestion.",
    guide: "performance-suggestions",
  },
  "controller.auto": {
    title: "Auto",
    text: "Plays the progression by itself: pad 1's chord changes on its own, in time, through Voicing, Bass and the play styles, while you play a melody on the keys (and passing chords on pads 2–8: held, they replace the chord until you let go). With the song stopped and With Play on, it waits (armed) and starts with Play, after the count-in, from the progression's first chord: press Rec too to record it, take after take. ■ Stop ends it, and so does the transport's Stop. Without a progression it follows the best suggestion, a progression that writes itself.",
    guide: "performance-suggestions",
  },
  "controller.auto.every": {
    title: "Change every",
    text: "How often Auto moves to the next chord: every 1, 2, 3, 4, 6 or 8 patterns when a pattern plays (so a change never lands in the middle of its rhythm: a two-bar Bossa changes every two bars, a three-beat Waltz never drifts), or bars when none does.",
    guide: "performance-suggestions",
  },
  "controller.auto.options": {
    title: "Loop, With Play",
    text: "Loop: after the last chord, round again (off: Auto stops there). With Play: pressing Auto while the song is stopped arms it, and it starts with the song (after the count-in), from the top, every time you press Play; off: it starts at once.",
    guide: "performance-suggestions",
  },
  "controller.auto.room": {
    title: "Room for the take",
    text: "Whether what Auto plays fits before the recording wraps around. Loop mode: the page has to be as long as the progression (chords × every); Fit the page makes it so (up to 128 steps), Spread over pages adds pages and switches to song mode. Song mode: Add pages adds copies of this page (the drums go on, the keys' lane empty); Make copies gives pages that share a pattern their own (they'd get each other's chords); Unroll repeats turns a page that plays twice into two.",
    guide: "performance-suggestions",
  },
  "controller.suggest": {
    title: "Suggest",
    text: "After each chord you play, Rebeat suggests what could come next, and marks the key to press for the three best (in Chord mode, the pad to hold too): the bigger the dot, the better. The colors say what a chord does: green home, blue away from home, red tension (it wants to resolve), purple color (borrowed or secondary chords). The MiniLab's display shows them too.",
    guide: "performance-suggestions",
  },
  "controller.suggest.adventure": {
    title: "Adventure",
    text: "How far the suggestions stray from the key. Safe: only the key's own chords. Common: also the usual borrowed and secondary chords (♭VII, iv in a major key, V/V, sevenths on V). Bold: more color (♭VI, ♭III, secondary dominants, the Neapolitan, sevenths).",
    guide: "performance-suggestions",
  },
  "controller.suggestion": {
    title: "A suggested next chord",
    text: "Press this key (in Chord mode with the pads its tooltip names) to play the suggested chord: the tooltip says which chord, its roman numeral, what it does and why it fits. The biggest dot is the best one.",
    guide: "performance-suggestions",
  },
  "controller.nextpad.0": {
    title: "Next pad 1",
    text: "The best suggested next chord: its name is on the pad, its color says what it does (green home, blue away, red tension, purple color). Press it to play it; the pads refill after every chord.",
    guide: "performance-suggestions",
  },
  "controller.nextpad.1": {
    title: "Next pad 2",
    text: "The second best suggested next chord: its name is on the pad, its color says what it does (green home, blue away, red tension, purple color). Press it to play it; the pads refill after every chord.",
    guide: "performance-suggestions",
  },
  "controller.nextpad.2": {
    title: "Next pad 3",
    text: "The third suggested next chord: its name is on the pad, its color says what it does (green home, blue away, red tension, purple color). Press it to play it; the pads refill after every chord.",
    guide: "performance-suggestions",
  },
  "controller.nextpad.3": {
    title: "Next pad 4",
    text: "The fourth suggested next chord: its name is on the pad, its color says what it does (green home, blue away, red tension, purple color). Press it to play it; the pads refill after every chord.",
    guide: "performance-suggestions",
  },
  "controller.nextpad.4": {
    title: "Next pad 5",
    text: "The fifth suggested next chord: its name is on the pad, its color says what it does (green home, blue away, red tension, purple color). Press it to play it; the pads refill after every chord.",
    guide: "performance-suggestions",
  },
  "controller.nextpad.5": {
    title: "Next pad 6",
    text: "The sixth suggested next chord: its name is on the pad, its color says what it does (green home, blue away, red tension, purple color). Press it to play it; the pads refill after every chord.",
    guide: "performance-suggestions",
  },
  "controller.nextpad.6": {
    title: "Next pad 7",
    text: "The seventh suggested next chord: its name is on the pad, its color says what it does (green home, blue away, red tension, purple color). Press it to play it; the pads refill after every chord.",
    guide: "performance-suggestions",
  },
  "controller.nextpad.7": {
    title: "Next pad 8",
    text: "The eighth suggested next chord: its name is on the pad, its color says what it does (green home, blue away, red tension, purple color). Press it to play it; the pads refill after every chord.",
    guide: "performance-suggestions",
  },
  "controller.voicing.smooth": {
    title: "Smooth voicing",
    text: "Each chord takes the inversion closest to the chord before it, so a progression moves by small steps (C, then F as C F A) without turning the Voicing knob. Voicing still sets the register it stays near. The number is the voicing it's playing.",
    guide: "performance-play-styles",
  },
  "controller.bass.sound": {
    title: "Bass sound",
    text: "What the bass plays on: the chord's own sound, or a Notes track of its own (its sound, mix and effects; recording goes there too), like the Orchid's bass engine.",
    guide: "performance-play-styles",
  },
  "controller.bass.split": {
    title: "Split",
    text: "Keys below the split (C3) play the bass alone, one note at a time, on the bass sound; keys above play chords without a bass of their own. Your left hand plays the bass line.",
    guide: "performance-play-styles",
  },
  "controller.play.strum": {
    title: "Strum",
    text: "Plays a chord's notes one after another, like a guitar: the time from the first note to the last (10 to 250 ms), Up (low to high), Down, or Alt (alternating; on a pattern down on the beat, up between). On a controller: knob 3 in Chord and Key mode.",
    guide: "performance-play-styles",
  },
  "controller.play.slop": {
    title: "Slop",
    text: "Humanizes what the keys play: each note a little later at random (up to 40 ms) and a little louder or softer, so chords and arpeggios don't sound machine-tight. On a controller: knob 6 in Chord and Key mode.",
    guide: "performance-play-styles",
  },
  "controller.play.arp": {
    title: "Arpeggiator",
    text: "Plays the notes you hold one at a time, at the tempo (on the song's grid while it plays): Up, Down, Up-down, Random or As played, a rate, octaves and a gate. The bass is held, not arpeggiated. On a controller: knob 4 in Chord and Key mode sets the rate (far left: off).",
    guide: "performance-play-styles",
  },
  "controller.play.pattern": {
    title: "Pattern",
    text: "Plays the chord again and again on a rhythm while you hold it: 22 rhythms, from whole notes and a ballad to reggae's one drop, ska, a clave, bossa, house, funk, a salsa montuno and a gallop. With the Arp on, each hit plays the next arp note; with Strum on, each hit is strummed. On a controller: knob 7 in Chord and Key mode.",
    guide: "performance-play-styles",
  },
  "controller.play.latch": {
    title: "Latch",
    text: "What the keys play goes on after you let go: a chord, an arpeggio or a pattern, until you play the next one or turn Latch off (the dot: something is latched). Stop silences it too. Give the command Latch the keys a shortcut, or MIDI-learn a button to it.",
    guide: "performance-play-styles",
  },
  "controller.play.balance": {
    title: "Balance",
    text: "Makes the notes in the middle of a chord softer than the bass and the top note, as a pianist brings out the melody: 0% is all notes equal. On a controller: knob 8 in Chord and Key mode.",
    guide: "performance-play-styles",
  },
  "controller.bass": {
    title: "Bass",
    text: "When the pads make a chord (Chord and Key mode), its root also plays 1 to 6 octaves below it (and below the voiced chord), on the same sound, like the Orchid's bass. It never goes below C1. Off: just the chord. − goes deeper, + back up, click the value for Off. On a controller: knob 5 in Chord and Key mode (left is deeper).",
    guide: "performance-chord-pads",
  },
  "controller.transpose": {
    title: "Transpose",
    text: "Moves everything the keys play up or down by semitones, chords included, in every pad mode (−12 to +12; shown in Chord and Key mode). Click the number to go back to 0. On a controller: knob 2 in Chord and Key mode; on a MiniLab 3 in Key mode also: press and turn the black knob. It starts at 0 in every session.",
    guide: "performance-key-mode",
  },
  "controller.keypad.0": {
    title: "Dim (Key mode)",
    text: "Hold and play a key: a diminished chord on the key as you pressed it, outside the key if you like. With another chord type: a secret chord, as in Chord mode.",
    guide: "performance-key-mode",
  },
  "controller.keypad.1": {
    title: "Min (Key mode)",
    text: "Hold and play a key: a minor chord on the key as you pressed it, to borrow a chord from outside the key. While holding the black knob, a key with Min held selects that minor key.",
    guide: "performance-key-mode",
  },
  "controller.keypad.2": {
    title: "Maj (Key mode)",
    text: "Hold and play a key: a major chord on the key as you pressed it (B♭ in C major). While holding the black knob, a key with Maj held selects that major key.",
    guide: "performance-key-mode",
  },
  "controller.keypad.3": {
    title: "Sus (Key mode)",
    text: "Hold and play a key: a sus4 chord on the key as you pressed it.",
    guide: "performance-key-mode",
  },
  "controller.keypad.4": {
    title: "6 (Key mode)",
    text: "Adds the key's own sixth above the chord's root.",
    guide: "performance-key-mode",
  },
  "controller.keypad.5": {
    title: "m7 (Key mode)",
    text: "Adds the key's own seventh: G7 on G in C major, Cmaj7 on C. Same as M7 in Key mode.",
    guide: "performance-key-mode",
  },
  "controller.keypad.6": {
    title: "M7 (Key mode)",
    text: "Adds the key's own seventh: Cmaj7 on C in C major, G7 on G. Same as m7 in Key mode.",
    guide: "performance-key-mode",
  },
  "controller.keypad.7": {
    title: "9 (Key mode)",
    text: "Adds the key's own ninth, an octave above the root.",
    guide: "performance-key-mode",
  },
  "controller.chordpad.0": {
    title: "Dim",
    text: "Hold and play a key: a diminished chord on it (C E♭ G♭). With 6 it's a diminished seventh, with m7 half-diminished. With Sus: a power chord; with Min or Maj: a minor or major chord with a ♭6.",
    guide: "performance-chord-pads",
  },
  "controller.chordpad.1": {
    title: "Min",
    text: "Hold and play a key: a minor chord on it (C E♭ G). With Sus: m(add4); with Maj: 7♯9; with Dim: m(♭6).",
    guide: "performance-chord-pads",
  },
  "controller.chordpad.2": {
    title: "Maj",
    text: "Hold and play a key: a major chord on it (C E G). With Sus: augmented; with Min: 7♯9; with Dim: (♭6).",
    guide: "performance-chord-pads",
  },
  "controller.chordpad.3": {
    title: "Sus",
    text: "Hold and play a key: a suspended chord on it (sus4: C F G). With Dim: a power chord; with Maj: augmented; with Min: m(add4).",
    guide: "performance-chord-pads",
  },
  "controller.chordpad.4": {
    title: "6",
    text: "Adds the sixth to the chord you hold (A on C). With a chord type pad only.",
    guide: "performance-chord-pads",
  },
  "controller.chordpad.5": {
    title: "m7",
    text: "Adds the minor seventh (B♭ on C): Maj + m7 is a dominant 7, Min + m7 a minor 7. With a chord type pad only.",
    guide: "performance-chord-pads",
  },
  "controller.chordpad.6": {
    title: "M7",
    text: "Adds the major seventh (B on C): Maj + M7 is a major 7. With a chord type pad only.",
    guide: "performance-chord-pads",
  },
  "controller.chordpad.7": {
    title: "9",
    text: "Adds the ninth, an octave above the root (D on C). With m7 it makes a 9 chord. With a chord type pad only.",
    guide: "performance-chord-pads",
  },
  "controller.pad.0": {
    title: "Pad 1",
    text: "Plays track 1 (bank A), and lights in its color (on the MiniLab 3 too). Click to trigger it now. Shift + pad switches to bank B (tracks 9–16). On the MiniLab 3: Shift + Pad 3 switches ARTURIA/DAW mode.",
    guide: "performance-your-controller",
  },
  "controller.pad.1": {
    title: "Pad 2",
    text: "Plays track 2 (bank A), lit in its color. Click to trigger it.",
    guide: "performance-your-controller",
  },
  "controller.pad.2": {
    title: "Pad 3",
    text: "Plays track 3 (bank A), lit in its color. Click to trigger it.",
    guide: "performance-your-controller",
  },
  "controller.pad.3": {
    title: "Pad 4",
    text: "Plays track 4 (bank A), lit in its color. Click to trigger it. Shift + pad 4: loop or song mode.",
    guide: "performance-your-controller",
  },
  "controller.pad.4": {
    title: "Pad 5",
    text: "Plays track 5 (bank A), lit in its color. Click to trigger it. Shift + pad 5: stop.",
    guide: "performance-your-controller",
  },
  "controller.pad.5": {
    title: "Pad 6",
    text: "Plays track 6 (bank A), lit in its color. Click to trigger it. Shift + pad 6: play.",
    guide: "performance-your-controller",
  },
  "controller.pad.6": {
    title: "Pad 7",
    text: "Plays track 7 (bank A), lit in its color. Click to trigger it. Shift + pad 7: record.",
    guide: "performance-your-controller",
  },
  "controller.pad.7": {
    title: "Pad 8",
    text: "Plays track 8 (bank A), lit in its color. Click to trigger it. Shift + pad 8: tap the tempo.",
    guide: "performance-your-controller",
  },
  "controller.fader.0": {
    title: "Fader 1 — Level",
    text: "Sets the selected track's volume. Move the fader to adjust the level; the current value is shown below. Until you move it, it's drawn faint where its value is: MIDI can't ask the device where its controls are.",
    guide: "performance-your-controller",
  },
  "controller.fader.1": {
    title: "Fader 2 — Reverb",
    text: "Sets the selected track's Reverb send amount. Until you move it, it's drawn faint where its value is: MIDI can't ask the device where its controls are.",
    guide: "performance-your-controller",
  },
  "controller.fader.2": {
    title: "Fader 3 — Delay",
    text: "Sets the selected track's Delay send amount. Until you move it, it's drawn faint where its value is: MIDI can't ask the device where its controls are.",
    guide: "performance-your-controller",
  },
  "controller.fader.3": {
    title: "Fader 4 — Master",
    text: "Sets the master output level. Until you move it, it's drawn faint where its value is: MIDI can't ask the device where its controls are.",
    guide: "performance-your-controller",
  },
  "controller.notes": {
    title: "The notes you're playing",
    text: "The keys held down, low to high, as an equation: A3 + C4 + E4 = Am. When they make a chord (from triads to 13ths and altered dominants), its name comes after the equals sign; a bass that isn't the root comes after a slash (C/E).",
    guide: "performance-your-controller",
  },
};

export default hints;
