import { ALL_PARAMS } from "../../panels/synth-editor/patchParams";
import type { Hints } from "./types";

const guide = "instruments-the-synth-editor";

/** The synth editor's knobs come from one table (patchParams.ts), with their help text. */
const knobs: Hints = Object.fromEntries(
  ALL_PARAMS.map((d) => [
    `synth.${d.path}`,
    {
      title: d.label,
      text: d.help,
      keys: "Drag or scroll · Shift = fine · Double-click: the factory value",
      guide,
    },
  ]),
);

const hints: Hints = {
  ...knobs,
  "synth.keyboard": {
    title: "Keyboard",
    text: "Play the synth: hold a key and the note sounds until you let go, so you hear its sustain and release. Click higher on a key to play softer. The computer keys A–L play it too (Z and X change the octave).",
    keys: "Drag across keys: glissando · + / −: octave",
    guide,
  },
  "synth.flow": {
    title: "Signal flow",
    text: "The path the sound takes: the oscillators (with sub and noise) are mixed, filtered, shaped by the amp, then driven to the output. The envelopes steer the filter and the amp; the LFO moves its target. The blocks below follow this order.",
    guide,
  },
  "synth.start": {
    title: "Start from",
    text: "Load a factory synth onto this track as the starting point. Your edits apply to the track only; the factory synth stays as it is.",
    guide,
  },
  "synth.revert": {
    title: "Back to the factory sound",
    text: "Undo every edit and play the factory synth again.",
    guide,
  },
  "synth.save": {
    title: "Save to library",
    text: "Store this synth, with the track's SOUND knobs and effects, under Your instruments. Drop it on any track, in any project, to get exactly this sound.",
    guide,
  },
  "synth.wave": {
    title: "Waveform",
    text: "Sine is pure and round, triangle soft, saw bright and buzzy (strings, brass, leads), square hollow, pulse nasal (set its width).",
    guide,
  },
  "synth.wave.view": {
    title: "Waveform picture",
    text: "One cycle of what the oscillators make together.",
    guide,
  },
  "synth.mono": {
    title: "Poly or mono",
    text: "Poly plays chords. Mono plays one note at a time, with glide between notes: basslines and leads.",
    guide,
  },
  "synth.filter.type": {
    title: "Filter type",
    text: "Low-pass keeps the lows (darker), high-pass keeps the highs (thinner), band-pass keeps a band around the cutoff.",
    guide,
  },
  "synth.filter.slope": {
    title: "Filter slope",
    text: "24 dB cuts steeper (the classic Moog and TB-303 sound); 12 dB is gentler.",
    guide,
  },
  "synth.amp.view": {
    title: "Amp envelope",
    text: "The loudness of a note over time. Drag the points: attack, decay and sustain, release.",
    guide,
  },
  "synth.filterEnv.view": {
    title: "Filter envelope",
    text: "How the filter opens and closes over a note (scaled by Env). Drag the points: attack, decay and sustain, release.",
    guide,
  },
  "synth.lfo.target": {
    title: "LFO target",
    text: "What the LFO moves: pitch (vibrato), filter (wah, wobble), volume (tremolo) or pan.",
    guide,
  },
  "synth.lfo.shape": {
    title: "LFO shape",
    text: "Sine and triangle sweep smoothly, square jumps between two values, saw ramps and drops.",
    guide,
  },
  "synth.lfo.sync": {
    title: "LFO sync",
    text: "Free runs at its own rate; a note length syncs one cycle to the song's tempo (1/8 for a classic wobble).",
    guide,
  },
};

export default hints;
