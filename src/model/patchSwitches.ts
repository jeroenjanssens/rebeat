/**
 * The synth's switches and menus (D231): every setting of a patch that has a fixed list of
 * values (on/off, a filter's type, an LFO's shape, the matrix's routing, the voice mode), as one
 * table. Automation lanes on them are stepped (D229), and MIDI learn can switch them. A lane's
 * value is the option's index, saved 0..1 like every lane: index / (count − 1).
 */
import type { ParamDef } from "./params";
import { KNOB_SECTIONS } from "./patchParams";
import {
  BODIES,
  EXCITERS,
  LFO_SHAPES,
  MOD_DESTS,
  RESONATORS,
  TABLE_SLOTS,
  WARPS,
  type Warp,
  MOD_SOURCES,
  NOTE_LENGTHS,
  type LfoShape,
  type ModDest,
  type ModSource,
  type SynthPatch,
} from "./synth";

export type SwitchValue = string | number | boolean | null;

export interface PatchSwitch {
  /** "filters.0.type" */
  path: string;
  label: string;
  /** The part of the synth it's in (a KNOB_SECTIONS id: "filter0", "lfo2", "matrix"). */
  section: string;
  options: { value: SwitchValue; label: string }[];
  help: string;
  /** It changes the next notes, not the ones that sound. */
  nextNote?: boolean;
}

/** The matrix's sources, as the editor names them. */
export const SOURCE_LABEL: Record<ModSource, string> = {
  lfo1: "LFO 1",
  lfo2: "LFO 2",
  lfo3: "LFO 3",
  env1: "Amp env",
  env2: "Filter env",
  env3: "Mod env",
  velocity: "Velocity",
  note: "Note",
  modwheel: "Mod wheel",
  aftertouch: "Aftertouch",
  pitchbend: "Pitch bend",
  random: "Random",
  macro1: "Macro 1",
  macro2: "Macro 2",
  macro3: "Macro 3",
  macro4: "Macro 4",
  macro5: "Macro 5",
  macro6: "Macro 6",
  macro7: "Macro 7",
  macro8: "Macro 8",
};

/**
 * A matrix source as this patch names it: a macro by its own name ("Brightness"), or "Macro 3"
 * when it has none; the others as SOURCE_LABEL says.
 */
export function sourceName(s: ModSource | null, patch: SynthPatch | undefined, none = "—"): string {
  if (!s) return none;
  const m = /^macro(\d)$/.exec(s);
  if (!m || !patch) return SOURCE_LABEL[s];
  return patch.macros[Number(m[1]) - 1]?.name.trim() || SOURCE_LABEL[s];
}

/** A matrix source or via switch's option labels with this patch's macro names, if it is one. */
export function optionLabels(
  path: string,
  patch: SynthPatch | undefined,
): ((value: SwitchValue, label: string) => string) | undefined {
  if (!/^matrix\.\d\.(source|via)$/.test(path)) return undefined;
  return (value, label) =>
    typeof value === "string" && value.startsWith("macro")
      ? sourceName(value as ModSource, patch)
      : label;
}

/** The LFO shapes, as the editor names them. */
export const LFO_SHAPE_LABEL: Record<LfoShape, string> = {
  sine: "Sine",
  triangle: "Triangle",
  rampUp: "Ramp up",
  rampDown: "Ramp down",
  square: "Square",
  sh: "Sample & hold",
  smooth: "Smooth random",
};

const onOff = [
  { value: false, label: "Off" },
  { value: true, label: "On" },
];
const opts = (list: [SwitchValue, string][]) => list.map(([value, label]) => ({ value, label }));

const sources = (none: string) => [
  { value: null, label: none },
  ...MOD_SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] })),
];

/** The warps, as the editor names them (D245). */
export const WARP_LABEL: Record<Warp, string> = {
  none: "No warp",
  bend: "Bend",
  sync: "Sync",
  formant: "Formant",
  mirror: "Mirror",
  asym: "Asym",
  squeeze: "Squeeze",
  quantize: "Quantize",
  fm: "FM",
};

export const EXCITER_LABEL = {
  pluck: "Pluck",
  strike: "Strike",
  bow: "Bow",
  blow: "Blow",
  noise: "Noise",
  oscillators: "Oscillators",
} as const;
export const RESONATOR_LABEL = {
  string: "String",
  tube: "Tube",
  bar: "Bar",
  bell: "Bell",
  membrane: "Membrane",
  plate: "Plate",
  glass: "Glass",
} as const;
export const BODY_LABEL = {
  none: "No body",
  guitar: "Guitar",
  violin: "Violin",
  cello: "Cello",
  piano: "Piano",
  box: "Box",
  tube: "Marimba tube",
} as const;

function build(): PatchSwitch[] {
  const out: PatchSwitch[] = [];
  out.push({
    path: "source",
    label: "Source",
    section: "source",
    options: opts([
      ["oscillators", "Oscillators"],
      ["physical", "Physical model"],
    ]),
    help: "What makes the sound: the oscillators (analog or wavetable), or a physical model (an exciter and a resonator). Everything after them is the same.",
  });
  for (let i = 0; i < 3; i++) {
    const section = `osc${i}`;
    out.push({
      path: `osc.${i}.on`,
      label: "On",
      section,
      options: onOff,
      help: "Whether this oscillator sounds.",
    });
    out.push(
      {
        path: `osc.${i}.type`,
        label: "Type",
        section,
        options: opts([
          ["analog", "Analog"],
          ["wavetable", "Wavetable"],
        ]),
        help: "Analog: the four shapes and the morph between them. Wavetable: a table of waveforms to move through.",
      },
      {
        path: `osc.${i}.slot`,
        label: "Table",
        section,
        options: Array.from({ length: TABLE_SLOTS }, (_, k) => ({
          value: k,
          label: `Slot ${k + 1}`,
        })),
        help: "Which of the oscillator's table slots plays: slot 1 is its table, slots 2–8 the tables you added for switching.",
      },
      {
        path: `osc.${i}.warp`,
        label: "Warp mode",
        section,
        options: WARPS.map((w) => ({ value: w, label: WARP_LABEL[w] })),
        help: "How the wavetable's frame is read; the Warp knob says how much.",
      },
      {
        path: `osc.${i}.smooth`,
        label: "Smooth",
        section,
        options: onOff,
        help: "Blend between neighbouring frames (on), or jump from frame to frame (off: a stepped, digital sound).",
      },
    );
    if (i > 0)
      out.push({
        path: `osc.${i}.sync`,
        label: "Sync to 1",
        section,
        options: onOff,
        help: "Hard sync: restart with oscillator 1, for the tearing sync lead.",
      });
    // the shape morphs (a knob), but a lane can also jump between the four pure shapes (D231)
    out.push({
      path: `osc.${i}.shape~steps`,
      label: "Shape (steps)",
      section,
      options: opts([
        [0, "Sine"],
        [1, "Triangle"],
        [2, "Saw"],
        [3, "Pulse"],
      ]),
      help: "The waveform, jumping between the four pure shapes.",
    });
    out.push({
      path: `osc.${i}.retrigger`,
      label: "Retrigger",
      section,
      options: onOff,
      help: "Start the waveform at its phase with every note, or let it run free.",
      nextNote: true,
    });
  }
  out.push(
    {
      path: "sub.octave",
      label: "Sub octave",
      section: "extra",
      options: opts([
        [-1, "−1"],
        [-2, "−2"],
      ]),
      help: "How far below oscillator 1 the sub plays: one or two octaves.",
    },
    {
      path: "sub.shape",
      label: "Sub shape",
      section: "extra",
      options: opts([
        ["sine", "Sine"],
        ["square", "Square"],
      ]),
      help: "The sub's waveform: a round sine or a hollow square.",
    },
    {
      path: "noise.color",
      label: "Noise color",
      section: "extra",
      options: opts([
        ["white", "White"],
        ["pink", "Pink"],
      ]),
      help: "White noise hisses brightly; pink is softer.",
    },
    {
      path: "fm.route",
      label: "FM route",
      section: "extra",
      options: opts([
        ["2>1", "2→1"],
        ["3>1", "3→1"],
        ["3>2", "3→2"],
        ["1>1", "1→1"],
      ]),
      help: "Which oscillator modulates which: 2→1 is the classic; 1→1 is feedback.",
    },
  );
  for (let i = 0; i < 2; i++) {
    const section = `filter${i}`;
    out.push(
      {
        path: `filters.${i}.on`,
        label: "On",
        section,
        options: onOff,
        help: "Whether this filter is in the sound's path.",
      },
      {
        path: `filters.${i}.model`,
        label: "Model",
        section,
        options: opts([
          ["ladder", "Ladder"],
          ["svf", "SVF"],
        ]),
        help: "The ladder (24 dB, warm, self-oscillates) or the state-variable filter (LP, HP, BP, notch). A switch starts the new one from silence.",
      },
      {
        path: `filters.${i}.type`,
        label: "Type",
        section,
        options: opts([
          ["lp", "LP"],
          ["hp", "HP"],
          ["bp", "BP"],
          ["notch", "Notch"],
        ]),
        help: "Low-pass, high-pass, band-pass or notch (the ladder is low-pass only; the other types play through the SVF).",
      },
    );
  }
  out.push(
    {
      path: "physical.exciter.type",
      label: "Exciter",
      section: "exciter",
      options: EXCITERS.map((e) => ({ value: e, label: EXCITER_LABEL[e] })),
      help: "What sets it ringing: a pluck, a strike, a bow, breath, noise, or the oscillators.",
      nextNote: true,
    },
    {
      path: "physical.resonator.model",
      label: "Model",
      section: "resonator",
      options: RESONATORS.map((r) => ({ value: r, label: RESONATOR_LABEL[r] })),
      help: "What rings: a string, a tube, or the partials of a bar, a bell, a drum head, a plate or a glass.",
      nextNote: true,
    },
    {
      path: "physical.resonator.modes",
      label: "Partials",
      section: "resonator",
      options: opts([
        [8, "8"],
        [16, "16"],
        [32, "32"],
      ]),
      help: "How many partials a bar, bell, membrane, plate or glass has: more is richer and costs more.",
    },
    {
      path: "physical.resonator.end",
      label: "Tube end",
      section: "resonator",
      options: opts([
        ["closed", "Closed"],
        ["open", "Open"],
      ]),
      help: "A tube's far end: closed (with a reed, like a clarinet: hollow, odd harmonics) or open (with a jet, like a flute).",
    },
    {
      path: "physical.body.type",
      label: "Body",
      section: "body",
      options: BODIES.map((b) => ({ value: b, label: BODY_LABEL[b] })),
      help: "What colours it: the box of a guitar, a violin, a cello, a piano's soundboard, a wooden box, or a tube under a bar.",
    },
  );
  out.push({
    path: "routing",
    label: "Routing",
    section: "filter1",
    options: opts([
      ["serial", "After 1"],
      ["parallel", "Beside 1"],
    ]),
    help: "Filter 2 after filter 1, or both on the oscillators, side by side.",
  });
  for (let i = 0; i < 3; i++)
    out.push({
      path: `envs.${i}.loop`,
      label: "Loop",
      section: `env${i}`,
      options: onOff,
      help: "Repeat attack and decay while the note is held.",
    });
  for (let i = 0; i < 3; i++) {
    const section = `lfo${i}`;
    out.push(
      {
        path: `lfos.${i}.shape`,
        label: "Shape",
        section,
        options: LFO_SHAPES.map((s) => ({ value: s, label: LFO_SHAPE_LABEL[s] })),
        help: "The LFO's waveform.",
      },
      {
        path: `lfos.${i}.sync`,
        label: "Sync",
        section,
        options: [
          { value: null, label: "Free" },
          ...NOTE_LENGTHS.map((l) => ({ value: l, label: `Sync ${l}` })),
        ],
        help: "Free (its Rate in Hz), or one cycle per note length, following the tempo.",
      },
      {
        path: `lfos.${i}.mode`,
        label: "Mode",
        section,
        options: opts([
          ["voice", "Per note"],
          ["global", "Global"],
        ]),
        help: "Its own LFO for every note (restarting with it), or one for all.",
      },
      {
        path: `lfos.${i}.unipolar`,
        label: "0..1",
        section,
        options: onOff,
        help: "Swing from 0 to 1 instead of −1 to 1.",
      },
    );
  }
  for (let i = 0; i < 8; i++)
    out.push(
      {
        path: `matrix.${i}.source`,
        label: `Slot ${i + 1} source`,
        section: "matrix",
        options: sources("—"),
        help: "What moves this slot's destination.",
      },
      {
        path: `matrix.${i}.dest`,
        label: `Slot ${i + 1} destination`,
        section: "matrix",
        options: [
          { value: null, label: "—" },
          ...(Object.keys(MOD_DESTS) as ModDest[]).map((d) => ({
            value: d,
            label: MOD_DESTS[d].label,
          })),
        ],
        help: "What this slot moves.",
      },
      {
        path: `matrix.${i}.via`,
        label: `Slot ${i + 1} via`,
        section: "matrix",
        options: sources("always"),
        help: "A second source that scales the slot (the mod wheel for vibrato).",
      },
    );
  out.push(
    {
      path: "voice.mode",
      label: "Mode",
      section: "voice",
      options: opts([
        ["poly", "Poly"],
        ["mono", "Mono"],
        ["legato", "Legato"],
      ]),
      help: "Poly plays chords; mono one note at a time; legato glides without a new attack.",
      nextNote: true,
    },
    {
      path: "voice.glideMode",
      label: "Glide mode",
      section: "voice",
      options: opts([
        ["always", "Glide always"],
        ["legato", "Overlapping"],
      ]),
      help: "Glide into every note, or only into notes that overlap the one before.",
      nextNote: true,
    },
    {
      path: "voice.steal",
      label: "Steal",
      section: "voice",
      options: opts([
        ["oldest", "Steal oldest"],
        ["quietest", "Quietest"],
      ]),
      help: "When every voice is busy: the oldest note makes room, or the quietest.",
      nextNote: true,
    },
  );
  return out;
}

export const SWITCHES = build();

const BY_PATH = new Map(SWITCHES.map((s) => [s.path, s]));
/** The switch at a patch path, if it is one. */
export const switchOf = (path: string) => BY_PATH.get(path);

/** Where a value is in a switch's list (0 if it isn't there). */
export function switchIndex(sw: PatchSwitch, value: unknown): number {
  return Math.max(
    0,
    sw.options.findIndex((o) => o.value === value),
  );
}

/** A lane's value (0..1) as one of the switch's options. */
export function switchValue(sw: PatchSwitch, k: number): SwitchValue {
  const n = sw.options.length;
  return sw.options[Math.round(Math.min(1, Math.max(0, k)) * (n - 1))].value;
}

/** The switch as a knob definition with steps (a stepped lane, D229). */
export function switchDef(sw: PatchSwitch, current: unknown, patch?: SynthPatch): ParamDef {
  const n = sw.options.length;
  // a matrix source names macros as the patch does
  const name = optionLabels(sw.path, patch) ?? ((_: SwitchValue, label: string) => label);
  return {
    id: sw.path,
    label: sw.label,
    steps: n,
    default: switchIndex(sw, current) / (n - 1),
    format: (k) => {
      const o = sw.options[Math.round(Math.min(1, Math.max(0, k)) * (n - 1))];
      return name(o.value, o.label);
    },
  };
}

/** A switch's value in a patch (a shape in steps: the nearest pure shape). */
export function switchAt(p: SynthPatch, path: string): unknown {
  const v = patchPath(path)
    .split(".")
    .reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], p);
  return path.endsWith(STEPS) && typeof v === "number" ? Math.round(v) : v;
}

const STEPS = "~steps";
/** The patch path a switch writes ("osc.0.shape~steps" moves "osc.0.shape"). */
export const patchPath = (path: string) =>
  path.endsWith(STEPS) ? path.slice(0, -STEPS.length) : path;

/** "Filter 1 · Type": a switch's name with its part (short), for MIDI learn and lanes. */
export function switchName(path: string): string {
  const sw = switchOf(path);
  if (!sw) return path;
  const short = KNOB_SECTIONS.find((s) => s.id === sw.section)?.short;
  return short ? `${short} · ${sw.label}` : sw.label;
}
