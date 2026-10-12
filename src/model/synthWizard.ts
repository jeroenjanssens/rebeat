/**
 * The synth wizard (D169): a question tree that builds a SynthPatch from plain-English answers.
 * Pure — no React, no audio, no platform. Called by the wizard dialog (D170).
 */
import {
  makePatch,
  sanitizePatch,
  type PatchSpec,
  type SynthPatch,
  type Osc,
  type Filter,
} from "./synth";

// ---- Types ----

/** IDs of the wizard's questions, in the order they appear. */
export type QuestionId =
  "role" | "start" | "then" | "tone" | "grit" | "move" | "width" | "sub" | "voice" | "extra";

/** A partial set of the user's answers, keyed by QuestionId. */
export type WizardAnswers = Partial<Record<QuestionId, string>>;

/** One selectable answer. */
export interface WizardAnswer {
  id: string;
  label: string;
  /** One short sentence a beginner can understand. */
  help: string;
}

/** One step in the wizard's question tree. */
export interface Question {
  id: QuestionId;
  /** The question shown to the user. */
  title: string;
  /** All possible answers for this question (may differ by earlier answers). */
  answers(a: WizardAnswers): WizardAnswer[];
  /** Whether this question should appear given the answers so far. */
  applies(a: WizardAnswers): boolean;
  /** The answer to use if the user skipped or hasn't reached this question. */
  defaultAnswer(a: WizardAnswers): string;
}

// ---- Question definitions ----

export const QUESTIONS: Question[] = [
  {
    id: "role",
    title: "What is it for?",
    answers: () => [
      { id: "bass", label: "Bass", help: "Low notes that anchor the rhythm and harmony." },
      { id: "lead", label: "Lead (a melody)", help: "A single voice that carries the main tune." },
      {
        id: "pad",
        label: "Pad (background)",
        help: "A long, sustained texture that sits behind everything else.",
      },
      { id: "keys", label: "Keys", help: "Piano-style chords and stabs that you play live." },
      { id: "pluck", label: "Pluck", help: "Short, snappy notes — great for arpeggios and hooks." },
      { id: "fx", label: "Sound effect", help: "A noise, sweep, or textural one-shot." },
    ],
    applies: () => true,
    defaultAnswer: () => "lead",
  },
  {
    id: "start",
    title: "How does a note start?",
    answers: (a) =>
      a.role === "fx"
        ? [
            { id: "rising", label: "Rising", help: "It swells up from silence." },
            { id: "falling", label: "Falling", help: "It hits at full volume and fades quickly." },
            {
              id: "steady",
              label: "Steady",
              help: "It starts immediately and holds at a constant level.",
            },
          ]
        : [
            {
              id: "punch",
              label: "At once (punchy)",
              help: "The sound hits instantly, with no fade-in at all.",
            },
            {
              id: "soft",
              label: "Softly (a quick fade in)",
              help: "It starts quiet and opens up in a fraction of a second.",
            },
            {
              id: "slow",
              label: "Slowly (it swells in)",
              help: "Takes half a second or more to fully come in.",
            },
          ],
    applies: () => true,
    defaultAnswer: (a) => {
      if (a.role === "fx") return "rising";
      if (a.role === "pad") return "slow";
      if (a.role === "pluck") return "punch";
      return "punch";
    },
  },
  {
    id: "then",
    title: "And then?",
    answers: () => [
      {
        id: "holds",
        label: "It holds while the key is down",
        help: "The note sustains for as long as you hold the key.",
      },
      {
        id: "fades",
        label: "It fades out by itself (like a piano)",
        help: "The sound dies away even while the key is held.",
      },
      {
        id: "short",
        label: "Short and percussive (like a pluck)",
        help: "It snaps off quickly, no matter how long you hold.",
      },
    ],
    // Pads always hold; plucks are always short; FX shape depends only on start
    applies: (a) => a.role !== "pad" && a.role !== "pluck" && a.role !== "fx",
    defaultAnswer: (a) => {
      if (a.role === "pad") return "holds";
      if (a.role === "pluck") return "short";
      if (a.role === "keys") return "fades";
      if (a.role === "fx") return "holds";
      return "holds";
    },
  },
  {
    id: "tone",
    title: "The tone?",
    answers: () => [
      {
        id: "warm",
        label: "Warm and round",
        help: "Soft and full-bodied, like a vintage analog synth.",
      },
      {
        id: "bright",
        label: "Bright and buzzy",
        help: "Rich in harmonics, like a classic sawtooth lead.",
      },
      {
        id: "hollow",
        label: "Hollow (like a clarinet)",
        help: "Reedy and hollow, with a distinctly woody character.",
      },
      {
        id: "glassy",
        label: "Glassy and bell-like (FM)",
        help: "Metallic, pure overtones from frequency modulation.",
      },
      {
        id: "nasal",
        label: "Thin and nasal (a pulse)",
        help: "A thin, buzzy sound with a distinctive nasal edge.",
      },
    ],
    applies: () => true,
    defaultAnswer: (a) => {
      if (a.role === "bass" || a.role === "pad") return "warm";
      if (a.role === "pluck") return "bright";
      return "bright";
    },
  },
  {
    id: "grit",
    title: "Clean or dirty?",
    answers: () => [
      {
        id: "clean",
        label: "Clean",
        help: "Pure and uncolored — exactly as the oscillators make it.",
      },
      { id: "grit", label: "A little grit", help: "Subtle warmth and edge from mild saturation." },
      {
        id: "distorted",
        label: "Distorted",
        help: "Heavy drive that transforms the sound into something raw and gritty.",
      },
    ],
    applies: () => true,
    defaultAnswer: () => "clean",
  },
  {
    id: "move",
    title: "Should it move?",
    answers: () => [
      { id: "still", label: "Still", help: "The tone stays constant — solid and focused." },
      {
        id: "wobble",
        label: "A slow wobble in its tone",
        help: "A gentle LFO on the filter gives it a lazy, breathing feel.",
      },
      {
        id: "pulse",
        label: "Pulsing with the beat",
        help: "The filter opens and closes in sync with the tempo.",
      },
      {
        id: "vibrato",
        label: "Vibrato (the pitch wavers)",
        help: "A subtle pitch wobble that adds expression, like a singer.",
      },
      {
        id: "wah",
        label: "A wah when you play",
        help: "A filter sweep at the start of each note, like a wah pedal.",
      },
    ],
    applies: () => true,
    defaultAnswer: (a) => (a.role === "pad" ? "wobble" : "still"),
  },
  {
    id: "width",
    title: "How wide?",
    answers: () => [
      {
        id: "focused",
        label: "One voice (focused)",
        help: "A single oscillator — tight, punchy and clear.",
      },
      {
        id: "chorus",
        label: "A few voices, slightly detuned",
        help: "Three stacked voices spread across the stereo field.",
      },
      {
        id: "super",
        label: "A big wall of detuned voices (supersaw)",
        help: "Seven voices give the huge, dense sound of a supersaw.",
      },
    ],
    applies: () => true,
    defaultAnswer: (a) => {
      if (a.role === "pad" || a.role === "keys") return "chorus";
      return "focused";
    },
  },
  {
    id: "sub",
    title: "Add a sub an octave down?",
    answers: () => [
      {
        id: "yes",
        label: "Yes — add a sub",
        help: "A sine wave an octave below adds deep low-end weight.",
      },
      { id: "no", label: "No sub", help: "Keep the bass focused on the main oscillator only." },
    ],
    // Only bass gets the sub question
    applies: (a) => a.role === "bass",
    defaultAnswer: () => "yes",
  },
  {
    id: "voice",
    title: "One note or chords?",
    answers: () => [
      {
        id: "chords",
        label: "Chords (several notes at once)",
        help: "Multiple notes play simultaneously, like a piano.",
      },
      {
        id: "mono",
        label: "One note at a time",
        help: "Starting a new note immediately stops the previous one.",
      },
      {
        id: "legato",
        label: "One at a time, gliding between notes",
        help: "Notes slide smoothly from one to the next.",
      },
    ],
    applies: () => true,
    defaultAnswer: (a) => {
      if (a.role === "bass" || a.role === "lead" || a.role === "pluck") return "mono";
      return "chords";
    },
  },
  {
    id: "extra",
    title: "Anything extra?",
    answers: () => [
      { id: "none", label: "None", help: "Keep it exactly as it is." },
      {
        id: "air",
        label: "Air (some noise)",
        help: "A little noise mixed in adds an airy, breathy quality.",
      },
      {
        id: "octave",
        label: "An octave on top",
        help: "A second oscillator an octave up adds shimmer and brightness.",
      },
      {
        id: "fifth",
        label: "A fifth on top",
        help: "A second oscillator a fifth up gives a full, organ-like quality.",
      },
    ],
    applies: () => true,
    defaultAnswer: () => "none",
  },
];

// ---- Helpers ----

/** The questions that apply given the current answers, in order. */
export function wizardSteps(answers: WizardAnswers): Question[] {
  return QUESTIONS.filter((q) => q.applies(answers));
}

/** Fill in defaults for every unanswered question (including skipped ones). */
function withDefaults(answers: WizardAnswers): Record<QuestionId, string> {
  // First pass: answer in order so each defaultAnswer sees earlier answers.
  const out: Partial<Record<QuestionId, string>> = { ...answers };
  for (const q of QUESTIONS) {
    if (!out[q.id]) out[q.id] = q.defaultAnswer(out);
  }
  return out as Record<QuestionId, string>;
}

/** A suggested name built from the answers (e.g. "Bright Gritty Lead"). */
export function wizardName(answers: WizardAnswers): string {
  const a = withDefaults(answers);
  const toneWord: Record<string, string> = {
    warm: "Warm",
    bright: "Bright",
    hollow: "Hollow",
    glassy: "Glassy",
    nasal: "Thin",
  };
  const gritWord: Record<string, string> = { grit: "Gritty", distorted: "Distorted" };
  const moveWord: Record<string, string> = {
    wobble: "Wobbling",
    pulse: "Pulsing",
    vibrato: "Vibrato",
    wah: "Wah",
  };
  const roleWord: Record<string, string> = {
    bass: "Bass",
    lead: "Lead",
    pad: "Pad",
    keys: "Keys",
    pluck: "Pluck",
    fx: "FX",
  };
  const parts = [
    toneWord[a.tone] ?? "",
    gritWord[a.grit] ?? "",
    moveWord[a.move] ?? "",
    roleWord[a.role] ?? "Synth",
  ].filter(Boolean);
  return parts.join(" ");
}

// ---- Volume calibration ----

/**
 * Output volume (dB) so the wizard patch lands near −21 dB RMS, in line with the factory synths.
 *
 * Derivation of corrections:
 * - Baseline: one saw oscillator, no drive, no unison → output.volume = −12 dB → ≈ −21 dB RMS.
 * - Unison: core.ts sums voices and divides by n (line 782: `sum / osc.unison`), so random phases
 *   give RMS / √n; net loudness change is small and well within tolerance — no correction needed.
 * - Drive: `output.drive` applies `tanh(l × k) / tanh(k)` (core.ts lines 817–820) with
 *   k = 1 + drive × 6. For small signals the net gain is k / tanh(k): ≈ +8.5 dB at drive 0.22
 *   and ≈ +13 dB at drive 0.55. Filter drive (fDrive × 8) adds further gain. Measured: grit
 *   lands ≈ 9 dB hot and distorted ≈ 16 dB hot relative to the clean baseline.
 * - Second oscillator (octave/fifth): adds roughly +2–3 dB.
 * - Pluck/FX: notes are very short relative to the 1.6 s RMS window → boost by ≈ +5 dB.
 * - Slow/rising attack: less energy accumulates in the measurement window → boost.
 */
function wizardVolume(a: Record<QuestionId, string>): number {
  let vol = -12;
  // A second oscillator at comparable level adds ~3 dB (no unison correction: engine normalizes)
  if (a.extra === "octave") vol -= 2.5;
  if (a.extra === "fifth") vol -= 1.5;
  if (a.extra === "air") vol -= 0.5;
  // Sub oscillator adds low-end energy
  if (a.sub === "yes") vol -= 1;
  // FM adds some tonal energy
  if (a.tone === "glassy") vol -= 1;
  // Drive raises level significantly (k/tanh(k) amplification in core.ts)
  if (a.grit === "grit") vol -= 9;
  if (a.grit === "distorted") vol -= 16;
  // Short notes fill a small fraction of the 1.6 s RMS window → larger boost
  if (a.role === "pluck" || a.role === "fx") vol += 14;
  // Bass plays at octave -1 with a low cutoff: few harmonics → boost
  if (a.role === "bass") vol += 3;
  // Slow/rising attacks mean less energy in the measurement window → boost
  if (a.start === "slow") vol += 2;
  if (a.start === "rising") vol += 3;
  return vol;
}

// ---- Patch builder ----

/** Build a full SynthPatch from a (possibly partial) set of wizard answers. */
export function wizardPatch(answers: WizardAnswers): SynthPatch {
  const a = withDefaults(answers);

  // ---- Oscillator 1: shape and octave from role + tone ----
  const isGlassy = a.tone === "glassy";

  // Shape: 0=sine, 1=triangle, 2=saw, 3=pulse
  const oscShape: Record<string, number> = {
    warm: 0.7, // between sine and triangle — soft and round
    bright: 2, // sawtooth — bright and buzzy
    hollow: 3, // square pulse (pw=0.5) — hollow odd harmonics like a clarinet
    glassy: 0, // sine carrier for FM
    nasal: 3, // narrow pulse — thin and nasal
  };
  const shape = oscShape[a.tone] ?? 2;
  const pw = a.tone === "nasal" ? 0.2 : 0.5;

  const roleOctave: Record<string, number> = {
    bass: -1,
    lead: 0,
    pad: 0,
    keys: 0,
    pluck: 0,
    fx: 0,
  };
  const octave = roleOctave[a.role] ?? 0;

  // Unison from width
  const unisonMap: Record<string, { unison: number; detune: number; width: number }> = {
    focused: { unison: 1, detune: 20, width: 0.5 },
    chorus: { unison: 3, detune: 15, width: 0.6 },
    super: { unison: 7, detune: 35, width: 0.8 },
  };
  const uni = unisonMap[a.width] ?? unisonMap.focused;

  const osc1: Partial<Osc> = {
    shape,
    pw,
    octave,
    unison: uni.unison,
    detune: uni.detune,
    width: uni.width,
    drift: 0,
  };

  // ---- Oscillator 2: extras or FM modulator side-chain ----
  // For glassy tone we use osc3 as the FM modulator (route "3>1") so osc2 is free for extras.
  // For non-glassy, osc2 carries any "octave" or "fifth" extra.

  let osc2: Partial<Osc> | undefined;
  let osc3: Partial<Osc> | undefined;

  if (a.extra === "octave") {
    osc2 = { shape, pw, octave: octave + 1, level: 0.45, drift: 0, unison: 1 };
  } else if (a.extra === "fifth") {
    osc2 = { shape, pw, octave, semi: 7, level: 0.35, drift: 0, unison: 1 };
  }

  // FM: use osc3 as silent modulator so osc2 stays free for extras
  const fmAmount = isGlassy ? 10 : 0;
  const fmSpec: PatchSpec["fm"] = isGlassy
    ? { amount: fmAmount, route: "3>1" }
    : { amount: 0, route: "2>1" };

  if (isGlassy) {
    // osc3 = sine modulator at octave 1 (2×), shapes the FM spectrum
    osc3 = { shape: 0, level: 0, octave: 1, drift: 0, retrigger: true, unison: 1 };
  }

  // ---- Noise for "air" extra ----
  const noiseLevel = a.extra === "air" ? 0.18 : 0;

  // ---- Sub oscillator ----
  const subLevel = a.sub === "yes" ? 0.45 : 0;

  // ---- Filter ----
  const roleBaseCutoff: Record<string, number> = {
    bass: 350,
    lead: 1200,
    pad: 2000,
    keys: 4000,
    pluck: 900,
    fx: 6000,
  };
  let baseCutoff = roleBaseCutoff[a.role] ?? 2000;

  // Tone multiplier on cutoff
  const toneCutoffMul: Record<string, number> = {
    warm: 0.6,
    bright: 1.8,
    hollow: 1.0,
    glassy: 3.0,
    nasal: 1.3,
  };
  baseCutoff = Math.min(16000, baseCutoff * (toneCutoffMul[a.tone] ?? 1));
  // Bass: enforce a minimum of 400 Hz so enough harmonics pass through for audibility
  if (a.role === "bass") baseCutoff = Math.max(400, baseCutoff);

  // Wah: start at a lower cutoff so the sweep opens dramatically
  if (a.move === "wah") baseCutoff = Math.max(200, baseCutoff * 0.25);

  // Grit → slight resonance boost
  const resoBonus: Record<string, number> = { clean: 0, grit: 0.1, distorted: 0.18 };
  const reso = 0.1 + (resoBonus[a.grit] ?? 0);

  // Drive into filter
  const filterDrive: Record<string, number> = { clean: 0, grit: 0.1, distorted: 0.3 };
  const fDrive = filterDrive[a.grit] ?? 0;

  // Bass gets the ladder (Moog-style) filter for warmth
  const filterModel: Partial<Filter> =
    a.role === "bass"
      ? { model: "ladder" as const, cutoff: baseCutoff, reso, drive: fDrive, keytrack: 0.15 }
      : { model: "svf" as const, cutoff: baseCutoff, reso, drive: fDrive, keytrack: 0.4 };

  // ---- Amp envelope (envs[0]) from start + then ----
  const attackMap: Record<string, number> = {
    punch: 0.003,
    soft: 0.05,
    slow: 0.5,
    rising: 1.0,
    falling: 0.002,
    steady: 0.003,
  };
  const attack = attackMap[a.start] ?? 0.003;

  // Effective "then" (pads=holds, plucks=short, fx=based on start)
  let then = a.then;
  if (a.role === "pad") then = "holds";
  if (a.role === "pluck") then = "short";
  if (a.role === "fx") {
    then = a.start === "falling" ? "short" : "holds";
  }

  const thenEnv: Record<string, { decay: number; sustain: number; release: number }> = {
    holds: { decay: 0.3, sustain: 0.8, release: 0.5 },
    fades: { decay: 1.8, sustain: 0.0, release: 0.9 },
    short: { decay: 0.12, sustain: 0.0, release: 0.1 },
  };
  const te = thenEnv[then] ?? thenEnv.holds;

  const ampEnv: NonNullable<NonNullable<PatchSpec["envs"]>[0]> = {
    attack,
    decay: te.decay,
    sustain: te.sustain,
    release: te.release,
    velocity: 0.5,
  };

  // ---- Filter envelope (envs[1]) ----
  // Used for "wah" and a mild touch of brightness on plucks
  let filterEnv: NonNullable<NonNullable<PatchSpec["envs"]>[1]> = {};
  let filterEnvAmount = 0;

  if (a.move === "wah") {
    filterEnv = { attack: 0.002, decay: 0.35, sustain: 0, release: 0.25 };
    filterEnvAmount = 3.5; // 3.5 octaves sweep upward
  } else if (a.role === "pluck") {
    filterEnv = { attack: 0.001, decay: 0.18, sustain: 0, release: 0.15 };
    filterEnvAmount = 2.5;
  }

  // ---- LFO 1: movement ----
  type LfoSpec = NonNullable<NonNullable<PatchSpec["lfos"]>[0]>;
  let lfo1: LfoSpec = { mode: "global" };
  const matrixSlots: NonNullable<PatchSpec["matrix"]> = [];

  if (a.move === "wobble") {
    lfo1 = { shape: "sine", rate: 0.4, sync: null, mode: "global", delay: 0 };
    matrixSlots.push({ source: "lfo1", dest: "filter1.cutoff", amount: 0.22, via: null });
  } else if (a.move === "pulse") {
    lfo1 = { shape: "sine", rate: 0, sync: "1/4", mode: "global" };
    matrixSlots.push({ source: "lfo1", dest: "filter1.cutoff", amount: 0.28, via: null });
  } else if (a.move === "vibrato") {
    lfo1 = { shape: "sine", rate: 5.5, sync: null, mode: "voice", delay: 0.1 };
    // amount: small pitch mod — ±0.1 semitones (range=24 st, so 0.1/24 ≈ 0.004)
    matrixSlots.push({ source: "lfo1", dest: "pitch", amount: 0.004, via: null });
  }
  // "wah" uses the filter envelope instead of an LFO; "still" leaves it empty

  // ---- Output drive ----
  const driveMap: Record<string, number> = { clean: 0, grit: 0.22, distorted: 0.55 };
  const outputDrive = driveMap[a.grit] ?? 0;

  // ---- Voice mode ----
  type VoiceSpec = NonNullable<PatchSpec["voice"]>;
  const voiceSpec: VoiceSpec = { glideMode: "always" };
  if (a.voice === "mono") {
    voiceSpec.mode = "mono";
    voiceSpec.glide = 0;
  } else if (a.voice === "legato") {
    voiceSpec.mode = "legato";
    voiceSpec.glide = 0.08;
    voiceSpec.glideMode = "legato";
  } else {
    voiceSpec.mode = "poly";
    voiceSpec.voices = 16;
  }

  // ---- Assemble the PatchSpec ----
  const oscArray: PatchSpec["osc"] = [osc1];
  if (osc2) oscArray[1] = osc2;
  if (osc3) oscArray[2] = osc3;

  // Filter env amount on the filter spec
  const filterSpecFull: Partial<Filter> = { ...filterModel, env: filterEnvAmount };

  const envs: PatchSpec["envs"] = [ampEnv, { ...filterEnv }, {}];

  const lfos: PatchSpec["lfos"] = [lfo1, { mode: "global" as const }, { mode: "global" as const }];

  const spec: PatchSpec = {
    osc: oscArray,
    sub: { level: subLevel, octave: -1, shape: "sine" },
    noise: { level: noiseLevel, color: "white" },
    fm: fmSpec,
    filters: [filterSpecFull],
    envs,
    lfos,
    matrix: matrixSlots,
    voice: voiceSpec,
    output: {
      drive: outputDrive,
      volume: wizardVolume(a),
      spread: 0,
    },
  };

  return sanitizePatch(makePatch(spec));
}
