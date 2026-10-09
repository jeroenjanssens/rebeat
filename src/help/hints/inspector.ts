/**
 * Explain-mode hints for the Inspector panel (prefix: "inspector.").
 */
import type { Hints } from "./types";

const hints: Hints = {
  // ─── Track header ─────────────────────────────────────────────────────────

  "inspector.name": {
    title: "Track name",
    text: "Double-click to rename this track. The name appears on the drum machine and mixer strip.",
    keys: "Double-click: rename",
    guide: "mixing-the-inspector",
  },

  // ─── Sample section ──────────────────────────────────────────────────────

  "inspector.sample": {
    title: "Sample",
    text: "Shows the current sample's waveform and details. Click the waveform to hear it once, as the track plays it; drop a new sample here to replace the sound on this track.",
    keys: "Drop: replace sound",
    guide: "mixing-the-inspector",
  },
  "inspector.sample.show": {
    title: "Show in library",
    text: "Switches to the Library panel and selects this sample, so you can browse related sounds.",
    guide: "library-finding-sounds",
  },
  "inspector.sample.edit": {
    title: "Edit in sample editor",
    text: "Opens this sample in the sample editor to trim, chop or adjust it.",
    guide: "sample-editor",
  },

  // ─── Instrument section ──────────────────────────────────────────────────

  "inspector.instrument.synth.edit": {
    title: "Edit synth",
    text: "Open the synth editor to shape this track's synth: oscillators, filter, envelopes, LFO.",
    guide: "instruments-the-synth-editor",
  },
  "inspector.mode": {
    title: "Play as",
    text: "How this step track plays its sound. Hits: one hit per step at the step's pitch (drums, but a synth can play hits too). Notes: notes and chords, with the piano roll and the arpeggiator. Clip: its sample across the page, for loops and recordings (samples only). Switching keeps everything, so you can switch back.",
    guide: "instruments-sound-sources",
  },
  "inspector.sound.family": {
    title: "Sound",
    text: "What makes the sound: a Sample (one audio file), a Synth (shape it in the synth editor) or a Sampled instrument (piano, strings, General MIDI, your SoundFonts and multi-samples). The track keeps its mode where the new sound can play it.",
    guide: "instruments-sound-sources",
  },
  "inspector.sound.hitnote": {
    title: "Hit note",
    text: "In Hits mode a synth or sampled instrument plays this note on every hit, moved by the step's pitch. Set it to where the sound sits best: low for a synth kick, high for a zap.",
    guide: "instruments-sound-sources",
  },
  "inspector.sound.save": {
    title: "Save to Your sounds",
    text: "Keep this sound, with its SOUND knobs and effects, in the library under Your sounds, so you can use it in any project.",
    guide: "instruments-sound-sources",
  },
  "inspector.instrument.synth.preset": {
    title: "Synth preset",
    text: "Chooses a synthesizer sound: polyphonic pads, keys and plucks; monophonic bass and lead; FM electric piano and bell; or the AM organ.",
    guide: "instruments-sound-sources",
  },
  "inspector.instrument.smplr.preset": {
    title: "Instrument preset",
    text: "Chooses a sampled instrument: piano, electric pianos, strings, choir, guitar, bass, flute and more. Samples are downloaded the first time you use each one.",
    guide: "instruments-sound-sources",
  },
  "inspector.instrument.sampler.drop": {
    title: "Sampler",
    text: "Drop a sample here to play it across the full keyboard range. Set the Root note to match the original pitch of the sample; click the waveform to hear it at that note.",
    keys: "Drop: load sample",
    guide: "instruments-sound-sources",
  },
  "inspector.instrument.sampler.rootnote": {
    title: "Root note",
    text: "The pitch the sample was recorded at. Set it correctly so the sampler plays it at the right pitch when you hit the matching key.",
    guide: "instruments-sound-sources",
  },
  "inspector.instrument.transpose": {
    title: "Transpose",
    text: "Shifts all notes of this track up or down by up to 24 semitones. Drag up to transpose higher.",
    keys: "Drag or scroll · Double-click = reset",
    guide: "instruments-sound-sources",
  },

  // ─── Arpeggiator ─────────────────────────────────────────────────────────

  "inspector.arp.toggle": {
    title: "Arpeggiator on/off",
    text: "Turns the arpeggiator on or off. When on, chords are broken into individual notes played in sequence.",
    guide: "instruments-sound-sources",
  },
  "inspector.arp.mode": {
    title: "Arpeggiator mode",
    text: "The order in which the arpeggiator plays notes: Up, Down, Up/down, Random, or Played (the order you pressed them).",
    guide: "instruments-sound-sources",
  },
  "inspector.arp.rate": {
    title: "Arpeggiator rate",
    text: "How fast the arpeggiator steps through the notes, from 1/4 notes down to 1/32.",
    guide: "instruments-sound-sources",
  },
  "inspector.arp.octaves": {
    title: "Arpeggiator octaves",
    text: "How many octaves the arpeggiator spans. 2 octaves plays the chord and then repeats it an octave higher.",
    guide: "instruments-sound-sources",
  },
  "inspector.arp.gate": {
    title: "Arpeggiator gate",
    text: "How long each note sounds as a percentage of the arp rate. Lower values give a more staccato feel.",
    keys: "Drag or scroll · Double-click = reset",
    guide: "instruments-sound-sources",
  },

  // ─── Effects section ─────────────────────────────────────────────────────

  "inspector.effects.add": {
    title: "Add effect",
    text: "Adds a new insert effect at the end of this track's effect chain. Choose from EQ, filter, compressor, distortion, delay, reverb, and more.",
    guide: "mixing-effects",
  },

  // ─── Effect editor controls ──────────────────────────────────────────────

  "inspector.fx.bypass": {
    title: "Bypass",
    text: "Switches the effect on or off without removing it. Bypassed effects are shown at reduced opacity so you can compare the sound with and without.",
    guide: "mixing-effects",
  },
  "inspector.fx.move.up": {
    title: "Move up",
    text: "Moves this effect earlier in the chain. Signal flows top to bottom, so moving an effect up means it runs before more of the chain.",
    guide: "mixing-effects",
  },
  "inspector.fx.move.down": {
    title: "Move down",
    text: "Moves this effect later in the chain.",
    guide: "mixing-effects",
  },
  "inspector.fx.remove": {
    title: "Remove effect",
    text: "Removes this effect from the chain. This can't be undone, but you can press Undo to get it back.",
    guide: "mixing-effects",
  },

  // ─── MIDI section ────────────────────────────────────────────────────────

  "inspector.midi.remove": {
    title: "Remove MIDI mapping",
    text: "Removes this MIDI mapping from the track. Right-click any encoder to add a new one with MIDI learn.",
    guide: "performance-midi",
  },
};

export default hints;
