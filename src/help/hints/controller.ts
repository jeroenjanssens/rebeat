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
    text: "The MiniLab 3's main encoder browses the Playable sound list. Turn to move through sounds, click to add the current sound as a track.",
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
};

export default hints;
