import { ALL_PARAMS } from "../../model/patchParams";
import type { Hints } from "./types";

const guide = "instruments-the-synth-editor";

/** The editor's hint id of a knob: one per kind (every oscillator shares "synth.osc.shape"). */
const hintId = (path: string) => `synth.${path.replace(/\.\d+\./, ".")}`;

/** The synth editor's knobs come from one table (patchParams.ts), with their help text. */
const knobs: Hints = Object.fromEntries(
  ALL_PARAMS.map((d) => [
    hintId(d.path),
    {
      title: d.label,
      text: d.help,
      keys: "Drag or scroll · Shift = fine · Double-click: the factory value · Right-click: MIDI learn",
      guide,
    },
  ]),
);

const hint = (title: string, text: string) => ({ title, text, guide });

const hints: Hints = {
  ...knobs,
  "synth.keyboard": {
    title: "Keyboard",
    text: "Play the synth: hold a key and the note sounds until you let go, so you hear its sustain and release. Click higher on a key to play softer. The computer keys A–L play it too (Z and X change the octave).",
    keys: "Drag across keys: glissando · + / −: octave",
    guide,
  },
  "synth.wheel.bend": {
    title: "Pitch bend",
    text: "Bend the pitch up or down while you play (by the Bend range in Voice); it springs back to the middle when you let go. A MIDI keyboard's bend wheel does the same.",
    guide,
  },
  "synth.wheel.mod": {
    title: "Mod wheel",
    text: "A control you can use in the mod matrix (as a source, or “via” to bring in vibrato or a filter sweep). It stays where you leave it. A MIDI keyboard's mod wheel does the same.",
    guide,
  },
  "synth.flow": hint(
    "Signal flow",
    "The path the sound takes: the oscillators (with sub, noise and ring) are mixed, filtered, shaped by the amp, then driven to the output. Envelopes, LFOs and the mod matrix steer it. The blocks below follow this order.",
  ),
  "synth.start": hint(
    "Start from",
    "Load a factory synth onto this track as the starting point. Your edits apply to the track only; the factory synth stays as it is.",
  ),
  "synth.revert": hint(
    "Back to the factory sound",
    "Undo every edit and play the factory synth again.",
  ),
  "synth.save": hint(
    "Save to library",
    "Store this synth, with the track's SOUND knobs and effects, under Your instruments. Drop it on any track, in any project, to get exactly this sound.",
  ),
  "synth.wave.view": hint(
    "Waveform",
    "One cycle of what the oscillators make together. Click it to hear a note.",
  ),
  "synth.fold": hint("Fold", "Fold this section away (or open it again) to keep the editor tidy."),
  "synth.osc.on": hint(
    "Oscillator on/off",
    "Switch this oscillator on or off. Off oscillators cost nothing.",
  ),
  "synth.osc.retrigger": hint(
    "Retrigger",
    "Start the waveform at the same point (Phase) on every note, for tight, consistent attacks. Off, it runs freely, like an analog synth.",
  ),
  "synth.osc.sync": hint(
    "Hard sync",
    "Restart this oscillator every time oscillator 1 starts a cycle: tuning it up then gives the screaming, tearing “sync lead” sound (sweep its pitch for the classic effect).",
  ),
  "synth.sub.octave": hint(
    "Sub octave",
    "The sub oscillator one or two octaves below oscillator 1.",
  ),
  "synth.sub.shape": hint("Sub shape", "A sine (deep and clean) or a square (more present)."),
  "synth.noise.color": hint(
    "Noise color",
    "White noise is bright hiss; pink is softer, with more low end.",
  ),
  "synth.fm.route": hint(
    "FM routing",
    "Which oscillator bends which: 2→1, 3→1, 3→2, or oscillator 1 bending itself (feedback, for buzz). The modulator can be silent (level 0) and still modulate.",
  ),
  "synth.filter.on": hint("Filter on/off", "Switch this filter on or off."),
  "synth.filter.model": hint(
    "Filter model",
    "Ladder: the warm 24 dB low-pass of classic analog synths (Moog, TB-303), which sings on its own at high resonance. SVF: a clean 12 dB filter with low-pass, high-pass, band-pass and notch.",
  ),
  "synth.filter.type": hint(
    "Filter type",
    "Low-pass keeps the lows (darker), high-pass the highs (thinner), band-pass a band around the cutoff, notch cuts one out.",
  ),
  "synth.filter.routing": hint(
    "Filter routing",
    "After 1: filter 2 shapes what filter 1 lets through (series). Beside 1: both filter the oscillators and are mixed (parallel), e.g. a low-pass with a band-pass for formant-like sounds.",
  ),
  "synth.env.view": hint(
    "Envelope",
    "How this envelope moves over a note: rise (attack), hold, fall (decay) to the sustain level while held, and fall away (release) after. Drag the big points to change the times and the sustain; drag the small ones in the middle of the attack and the decay up or down to bend their curves (double-click one to straighten it).",
  ),
  "synth.env.loop": hint(
    "Loop",
    "While the note is held, repeat attack → decay over and over: a rhythmic, LFO-like envelope.",
  ),
  "synth.lfo.shape": hint(
    "LFO shape",
    "Sine and triangle sweep smoothly, ramps rise or fall and jump back, square switches between two values, sample & hold jumps to random steps, smooth random wanders.",
  ),
  "synth.lfo.sync": hint(
    "LFO sync",
    "Free runs at its own rate; a note length syncs one cycle to the song's tempo (1/8 for a classic wobble; dotted and triplet values too).",
  ),
  "synth.lfo.mode": hint(
    "Per note or global",
    "Per note: each note gets its own LFO, restarting when it starts. Global: one LFO for all notes, running freely.",
  ),
  "synth.lfo.unipolar": hint(
    "0..1",
    "Move only up from the starting value (0..1) instead of up and down around it (-1..1).",
  ),
  "synth.matrix.source": hint(
    "Mod source",
    "What moves the destination: an LFO, an envelope, velocity, the note, the mod wheel, aftertouch, pitch bend, a random value per note, or a macro.",
  ),
  "synth.matrix.dest": hint(
    "Mod destination",
    "What gets moved: pitch, oscillator shape, pulse width or level, sub, noise, ring, FM, filter cutoff or resonance, volume, pan, or an LFO's rate.",
  ),
  "synth.matrix.amount": hint(
    "Mod amount",
    "How much, and which way (negative inverts). Double-click for 0.",
  ),
  "synth.matrix.via": hint(
    "Via",
    "Scales the amount by a second source: e.g. LFO → pitch via the mod wheel gives vibrato only when you push the wheel up.",
  ),
  "synth.voice.mode": hint(
    "Voice mode",
    "Poly plays chords. Mono plays one note at a time (new notes restart the envelopes). Legato is mono where overlapping notes slide on without a new attack.",
  ),
  "synth.voice.glideMode": hint(
    "Glide mode",
    "Glide always slides from the previous note; Overlapping only when you play legato.",
  ),
  "synth.voice.steal": hint(
    "Voice stealing",
    "When all voices are busy, a new note takes the oldest one or the quietest one.",
  ),
  "synth.view": hint(
    "Basic or Advanced",
    "Basic shows the 8 macros: a few knobs that each move several settings, so you shape the sound quickly. Advanced shows everything: oscillators, filters, envelopes, LFOs, the mod matrix and what the macros do. The editor remembers which one you used last.",
  ),
  "synth.scope": hint(
    "Scope",
    "The synth's output as you play it, on the keyboard below or in the song.",
  ),
  "synth.spectrum": hint(
    "Spectrum",
    "Which frequencies the synth makes as you play: low on the left, high on the right. Watch the filter and the oscillators change it.",
  ),
  "synth.group": hint(
    "Section",
    "Fold or unfold this part of the synth. The sections follow the sound: oscillators, filters, envelopes, LFOs, then the matrix and macros, voice and output. The editor remembers what you folded.",
  ),
  "synth.lfo.view": hint(
    "LFO picture",
    "How the LFO moves over about two seconds: its shape, where it starts (Phase), how it fades in (Delay, the dashed line), and whether it swings both ways or only up (0..1).",
  ),
  "synth.macro.name": hint(
    "Macro name",
    "What the macro is called: the name on the track's SOUND knob, in the drum machine and the Inspector.",
  ),
  "synth.macro.target": hint("Macro target", "A setting the macro moves. Pick another one here."),
  "synth.macro.add": hint(
    "Add a target",
    "Let the macro move another setting (up to 4). Its range starts around the value you hear now, so adding it doesn't change the sound.",
  ),
  "synth.macro.min": hint("Macro at 0", "The target's value with the macro all the way down."),
  "synth.macro.max": hint(
    "Macro at 1",
    "The target's value with the macro all the way up. Set it below “At 0” to move the other way.",
  ),
  "synth.macro.remove": hint("Remove target", "The macro stops moving this setting."),
  "synth.ab": hint(
    "A/B compare",
    "Two versions of the sound to switch between while you shape it. B starts as a copy of A: switch to B, change things, then flip back and forth to hear which you like. The track keeps the side you leave it on.",
  ),
  "synth.more": hint(
    "More",
    "Init patch (a plain saw to start from scratch), Randomize (with how far and which sections), and export or import the synth as a .rbsynth file to share it.",
  ),
  "synth.copy": hint(
    "Copy",
    "Copy this block's settings, to paste them on another oscillator, filter, envelope or LFO.",
  ),
  "synth.paste": hint("Paste", "Give this block the settings you copied from another one."),
  "synth.random.amount": hint(
    "Randomize amount",
    "How far each knob may move from where it is: a little for variations, all the way for a new sound.",
  ),
  "synth.random.lock": hint(
    "Sections to randomize",
    "Turn a section off to keep it as it is. The output level and tuning never change.",
  ),
  "synth.random.go": hint(
    "Randomize",
    "Throw the dice. Undo (Ctrl/Cmd+Z) if you don't like it, or use A/B to keep the old sound at hand.",
  ),
};

export default hints;
