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
    text: "Mirrors the text Rebeat sends to the device's screen. The MiniLab 3's display shows the current track name, sound name, or a knob value while it turns.",
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
    text: "Hold Shift to access secondary functions: the octave buttons change the keyboard octave, pads switch banks (A/B).",
    guide: "performance-your-controller",
  },
  "controller.btn.1": {
    title: "Hold button",
    text: "Hold keeps the current notes or pads sounding so your hands are free.",
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
    text: "Turns the selected track's first SOUND knob (Tune, Macro 1, or whatever the track plays). The name and value are shown below the knob. Until you move it, it's drawn faint where its value is: MIDI can't ask the device where its controls are.",
    guide: "performance-your-controller",
  },
  "controller.knob.1": {
    title: "Knob 2",
    text: "Turns the selected track's second SOUND knob. Until you move it, it's drawn faint where its value is: MIDI can't ask the device where its controls are.",
    guide: "performance-your-controller",
  },
  "controller.knob.2": {
    title: "Knob 3",
    text: "Turns the selected track's third SOUND knob. Until you move it, it's drawn faint where its value is: MIDI can't ask the device where its controls are.",
    guide: "performance-your-controller",
  },
  "controller.knob.3": {
    title: "Knob 4",
    text: "Turns the selected track's fourth SOUND knob. Until you move it, it's drawn faint where its value is: MIDI can't ask the device where its controls are.",
    guide: "performance-your-controller",
  },
  "controller.knob.4": {
    title: "Knob 5",
    text: "Turns the selected track's fifth SOUND knob. Until you move it, it's drawn faint where its value is: MIDI can't ask the device where its controls are.",
    guide: "performance-your-controller",
  },
  "controller.knob.5": {
    title: "Knob 6",
    text: "Turns the selected track's sixth SOUND knob. Until you move it, it's drawn faint where its value is: MIDI can't ask the device where its controls are.",
    guide: "performance-your-controller",
  },
  "controller.knob.6": {
    title: "Knob 7",
    text: "Turns the selected track's seventh SOUND knob. Until you move it, it's drawn faint where its value is: MIDI can't ask the device where its controls are.",
    guide: "performance-your-controller",
  },
  "controller.knob.7": {
    title: "Knob 8",
    text: "Turns the selected track's eighth SOUND knob. Until you move it, it's drawn faint where its value is: MIDI can't ask the device where its controls are.",
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
  "controller.bass": {
    title: "Bass",
    text: "When the pads make a chord (Chord and Key mode), its root also plays 1, 2 or 3 octaves below it, on the same sound, like the Orchid's bass. It never goes below C1. Off: just the chord.",
    guide: "performance-chord-pads",
  },
  "controller.transpose": {
    title: "Transpose",
    text: "Moves everything the keys play up or down by semitones, chords included, in every pad mode (−12 to +12; shown in Chord and Key mode). Click the number to go back to 0. On a MiniLab 3 in Key mode: press and turn the black knob. It starts at 0 in every session.",
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
    text: "Plays track 1 (bank A). Click to trigger it now. Shift + pad switches to bank B (tracks 9–16). On the MiniLab 3: Shift + Pad 3 switches ARTURIA/DAW mode.",
    guide: "performance-your-controller",
  },
  "controller.pad.1": {
    title: "Pad 2",
    text: "Plays track 2 (bank A). Click to trigger it.",
    guide: "performance-your-controller",
  },
  "controller.pad.2": {
    title: "Pad 3",
    text: "Plays track 3 (bank A). Click to trigger it.",
    guide: "performance-your-controller",
  },
  "controller.pad.3": {
    title: "Pad 4",
    text: "Plays track 4 (bank A). Click to trigger it.",
    guide: "performance-your-controller",
  },
  "controller.pad.4": {
    title: "Pad 5",
    text: "Plays track 5 (bank A). Click to trigger it.",
    guide: "performance-your-controller",
  },
  "controller.pad.5": {
    title: "Pad 6",
    text: "Plays track 6 (bank A). Click to trigger it.",
    guide: "performance-your-controller",
  },
  "controller.pad.6": {
    title: "Pad 7",
    text: "Plays track 7 (bank A). Click to trigger it.",
    guide: "performance-your-controller",
  },
  "controller.pad.7": {
    title: "Pad 8",
    text: "Plays track 8 (bank A). Click to trigger it.",
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
