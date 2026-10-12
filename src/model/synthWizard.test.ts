import { describe, expect, it, vi } from "vitest";
import { SynthCore } from "../engine/synth/core";
import { sanitizePatch } from "./synth";
import { QUESTIONS, wizardSteps, wizardName, wizardPatch, type WizardAnswers } from "./synthWizard";

// ---- helpers ----

/** RMS level (dB) of a wizard patch playing a short phrase, like synthLevels.test.ts. */
function wizardLevel(answers: WizardAnswers): { rms: number; peak: number; finite: boolean } {
  const patch = wizardPatch(answers);
  const SR = 44100;
  // Seed Math.random so drift / kits are deterministic.
  let seed = 7;
  const random = vi
    .spyOn(Math, "random")
    .mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
  const core = new SynthCore(SR, patch);
  const mono = patch.voice.mode !== "poly";
  const root = answers.role === "bass" ? 36 : 60;
  const phrase: [number, number, number][] = mono
    ? [
        [root, 0.05, 0.4],
        [root + 7, 0.55, 0.9],
        [root + 12, 1.05, 2.0],
      ]
    : [
        [root, 0.05, 0.5],
        [root + 4, 0.05, 0.5],
        [root + 7, 0.05, 0.5],
        [root + 5, 0.55, 1.6],
        [root + 9, 0.55, 1.6],
      ];
  phrase.forEach(([n, a, b], i) => {
    core.noteOn(i, n, 0.8, Math.round(a * SR));
    core.noteOff(i, Math.round(b * SR));
  });
  const n = SR * 3;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let f = 0; f < n; f += 128) core.process(l.subarray(f, f + 128), r.subarray(f, f + 128), f);
  let peak = 0;
  let sum = 0;
  let finite = true;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(l[i]) || !Number.isFinite(r[i])) finite = false;
    peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
    sum += l[i] * l[i] + r[i] * r[i];
  }
  random.mockRestore();
  const db = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));
  return { rms: db(Math.sqrt(sum / (2 * SR * 1.6))), peak: db(peak), finite };
}

// ---- question tree ----

describe("QUESTIONS", () => {
  it("has 10 questions in order", () => {
    const ids = QUESTIONS.map((q) => q.id);
    expect(ids).toEqual([
      "role",
      "start",
      "then",
      "tone",
      "grit",
      "move",
      "width",
      "sub",
      "voice",
      "extra",
    ]);
  });

  it("all questions always apply for a default lead", () => {
    const steps = wizardSteps({ role: "lead" });
    const ids = steps.map((q) => q.id);
    // sub does not apply for non-bass
    expect(ids).not.toContain("sub");
    // all others apply
    for (const id of ["role", "start", "then", "tone", "grit", "move", "width", "voice", "extra"]) {
      expect(ids).toContain(id);
    }
  });

  it("pads skip the 'then' question", () => {
    const steps = wizardSteps({ role: "pad" });
    expect(steps.map((q) => q.id)).not.toContain("then");
  });

  it("plucks skip the 'then' question", () => {
    const steps = wizardSteps({ role: "pluck" });
    expect(steps.map((q) => q.id)).not.toContain("then");
  });

  it("fx skips 'then'", () => {
    const steps = wizardSteps({ role: "fx" });
    expect(steps.map((q) => q.id)).not.toContain("then");
  });

  it("bass includes the sub question", () => {
    const steps = wizardSteps({ role: "bass" });
    expect(steps.map((q) => q.id)).toContain("sub");
  });

  it("non-bass roles skip the sub question", () => {
    for (const role of ["lead", "pad", "keys", "pluck", "fx"]) {
      const steps = wizardSteps({ role });
      expect(
        steps.map((q) => q.id),
        role,
      ).not.toContain("sub");
    }
  });

  it("fx gets different start answers (Rising/Falling/Steady)", () => {
    const startQ = QUESTIONS.find((q) => q.id === "start")!;
    const fxAnswers = startQ.answers({ role: "fx" }).map((a) => a.id);
    expect(fxAnswers).toEqual(["rising", "falling", "steady"]);
    const normalAnswers = startQ.answers({ role: "lead" }).map((a) => a.id);
    expect(normalAnswers).toEqual(["punch", "soft", "slow"]);
  });

  it("bass defaults to mono voice", () => {
    const voiceQ = QUESTIONS.find((q) => q.id === "voice")!;
    expect(voiceQ.defaultAnswer({ role: "bass" })).toBe("mono");
  });

  it("lead defaults to mono voice", () => {
    const voiceQ = QUESTIONS.find((q) => q.id === "voice")!;
    expect(voiceQ.defaultAnswer({ role: "lead" })).toBe("mono");
  });

  it("pad defaults to chords", () => {
    const voiceQ = QUESTIONS.find((q) => q.id === "voice")!;
    expect(voiceQ.defaultAnswer({ role: "pad" })).toBe("chords");
  });

  it("keys defaults to chords", () => {
    const voiceQ = QUESTIONS.find((q) => q.id === "voice")!;
    expect(voiceQ.defaultAnswer({ role: "keys" })).toBe("chords");
  });

  it("plucks default to short (skipped then question)", () => {
    const thenQ = QUESTIONS.find((q) => q.id === "then")!;
    expect(thenQ.defaultAnswer({ role: "pluck" })).toBe("short");
  });

  it("pads default to holds (skipped then question)", () => {
    const thenQ = QUESTIONS.find((q) => q.id === "then")!;
    expect(thenQ.defaultAnswer({ role: "pad" })).toBe("holds");
  });

  it("pad defaults to slow start", () => {
    const startQ = QUESTIONS.find((q) => q.id === "start")!;
    expect(startQ.defaultAnswer({ role: "pad" })).toBe("slow");
  });

  it("pad defaults to wobble movement", () => {
    const moveQ = QUESTIONS.find((q) => q.id === "move")!;
    expect(moveQ.defaultAnswer({ role: "pad" })).toBe("wobble");
  });

  it("sub defaults to yes for bass", () => {
    const subQ = QUESTIONS.find((q) => q.id === "sub")!;
    expect(subQ.defaultAnswer({ role: "bass" })).toBe("yes");
  });

  it("each question has ≥2 answers with unique ids", () => {
    for (const q of QUESTIONS) {
      const answers = q.answers({});
      expect(answers.length, q.id).toBeGreaterThanOrEqual(2);
      const ids = new Set(answers.map((a) => a.id));
      expect(ids.size, `${q.id} duplicate answer ids`).toBe(answers.length);
    }
  });

  it("every answer has a non-empty label and help", () => {
    for (const q of QUESTIONS) {
      for (const ans of q.answers({})) {
        expect(ans.label.length, `${q.id}.${ans.id} label`).toBeGreaterThan(0);
        expect(ans.help.length, `${q.id}.${ans.id} help`).toBeGreaterThan(0);
      }
    }
  });
});

// ---- wizardName ----

describe("wizardName", () => {
  it("produces 'Bright Lead' for lead + bright + clean + still", () => {
    expect(wizardName({ role: "lead", tone: "bright", grit: "clean", move: "still" })).toBe(
      "Bright Lead",
    );
  });

  it("includes the grit word for non-clean", () => {
    expect(wizardName({ role: "lead", tone: "bright", grit: "grit" })).toContain("Gritty");
    expect(wizardName({ role: "lead", tone: "bright", grit: "distorted" })).toContain("Distorted");
  });

  it("includes the movement word for moving sounds", () => {
    expect(wizardName({ role: "pad", move: "wobble" })).toContain("Wobbling");
    expect(wizardName({ role: "pad", move: "pulse" })).toContain("Pulsing");
    expect(wizardName({ role: "lead", move: "vibrato" })).toContain("Vibrato");
  });

  it("includes the role", () => {
    const roleWords: Record<string, string> = {
      bass: "Bass",
      lead: "Lead",
      pad: "Pad",
      keys: "Keys",
      pluck: "Pluck",
      fx: "FX",
    };
    for (const role of Object.keys(roleWords)) {
      const name = wizardName({ role });
      expect(name, role).toContain(roleWords[role]);
    }
  });
});

// ---- wizardPatch: validity ----

describe("wizardPatch validity", () => {
  it("every answer combination produces a sanitize-stable patch", () => {
    // For each question, pick every answer, keeping others at defaults
    for (const q of QUESTIONS) {
      for (const ans of q.answers({})) {
        const input: WizardAnswers = { [q.id]: ans.id };
        const patch = wizardPatch(input);
        const again = sanitizePatch(patch);
        // All numbers must be finite and within range (sanitizePatch should leave them unchanged)
        expect(Number.isFinite(patch.output.volume), `${q.id}=${ans.id} volume`).toBe(true);
        expect(patch.osc[0].shape, `${q.id}=${ans.id} shape`).toBeGreaterThanOrEqual(0);
        expect(patch.osc[0].shape, `${q.id}=${ans.id} shape`).toBeLessThanOrEqual(3);
        // Check a few key values are unchanged after re-sanitize
        expect(again.output.volume).toBeCloseTo(patch.output.volume, 6);
        expect(again.osc[0].unison).toBe(patch.osc[0].unison);
        expect(again.filters[0].cutoff).toBeCloseTo(patch.filters[0].cutoff, 6);
      }
    }
  });

  it("all numbers in every patch are finite", () => {
    const sample: WizardAnswers[] = [
      { role: "bass", tone: "warm", grit: "clean", width: "focused", sub: "yes", voice: "mono" },
      { role: "lead", tone: "bright", grit: "grit", move: "vibrato", width: "focused" },
      { role: "pad", tone: "warm", move: "wobble", width: "chorus", voice: "chords" },
      { role: "keys", tone: "glassy", grit: "clean", extra: "octave" },
      { role: "pluck", tone: "bright", grit: "clean", extra: "fifth" },
      { role: "fx", start: "rising", tone: "bright", extra: "air" },
      { role: "lead", tone: "glassy", move: "still", width: "super", voice: "legato" },
    ];
    for (const answers of sample) {
      const patch = wizardPatch(answers);
      const key = JSON.stringify(answers);
      expect(Number.isFinite(patch.output.volume), key).toBe(true);
      expect(Number.isFinite(patch.envs[0].attack), key).toBe(true);
      expect(patch.envs[0].attack, key).toBeGreaterThan(0);
      expect(patch.filters[0].cutoff, key).toBeGreaterThanOrEqual(20);
      expect(patch.filters[0].cutoff, key).toBeLessThanOrEqual(20000);
    }
  });
});

// ---- wizardPatch: specific mappings ----

describe("wizardPatch mappings", () => {
  it("bass → mono mode + low octave (osc1 octave -1)", () => {
    const patch = wizardPatch({ role: "bass" });
    expect(patch.voice.mode).toBe("mono");
    expect(patch.osc[0].octave).toBe(-1);
  });

  it("bass with sub:yes → sub.level > 0", () => {
    const patch = wizardPatch({ role: "bass", sub: "yes" });
    expect(patch.sub.level).toBeGreaterThan(0);
  });

  it("bass with sub:no → sub.level = 0", () => {
    const patch = wizardPatch({ role: "bass", sub: "no" });
    expect(patch.sub.level).toBe(0);
  });

  it("glassy → FM amount > 0", () => {
    const patch = wizardPatch({ role: "lead", tone: "glassy" });
    expect(patch.fm.amount).toBeGreaterThan(0);
  });

  it("distorted → output.drive ≥ 0.5", () => {
    const patch = wizardPatch({ role: "lead", grit: "distorted" });
    expect(patch.output.drive).toBeGreaterThanOrEqual(0.5);
  });

  it("clean → output.drive = 0", () => {
    const patch = wizardPatch({ role: "lead", grit: "clean" });
    expect(patch.output.drive).toBe(0);
  });

  it("grit → output.drive between 0.1 and 0.4", () => {
    const patch = wizardPatch({ role: "lead", grit: "grit" });
    expect(patch.output.drive).toBeGreaterThan(0.1);
    expect(patch.output.drive).toBeLessThan(0.4);
  });

  it("width:super → osc1.unison ≥ 5", () => {
    const patch = wizardPatch({ role: "lead", width: "super" });
    expect(patch.osc[0].unison).toBeGreaterThanOrEqual(5);
  });

  it("width:chorus → osc1.unison = 3", () => {
    const patch = wizardPatch({ role: "lead", width: "chorus" });
    expect(patch.osc[0].unison).toBe(3);
  });

  it("width:focused → osc1.unison = 1", () => {
    const patch = wizardPatch({ role: "lead", width: "focused" });
    expect(patch.osc[0].unison).toBe(1);
  });

  it("voice:legato → legato/mono mode with glide > 0", () => {
    const patch = wizardPatch({ role: "lead", voice: "legato" });
    expect(patch.voice.mode).toMatch(/^(mono|legato)$/);
    expect(patch.voice.glide).toBeGreaterThan(0);
  });

  it("voice:mono → mono mode with glide = 0", () => {
    const patch = wizardPatch({ role: "lead", voice: "mono" });
    expect(patch.voice.mode).toBe("mono");
    expect(patch.voice.glide).toBe(0);
  });

  it("voice:chords → poly mode", () => {
    const patch = wizardPatch({ role: "pad", voice: "chords" });
    expect(patch.voice.mode).toBe("poly");
  });

  it("start:slow → amp attack ≥ 0.4 s", () => {
    const patch = wizardPatch({ role: "pad", start: "slow" });
    expect(patch.envs[0].attack).toBeGreaterThanOrEqual(0.4);
  });

  it("start:punch → amp attack < 0.01 s", () => {
    const patch = wizardPatch({ role: "lead", start: "punch" });
    expect(patch.envs[0].attack).toBeLessThan(0.01);
  });

  it("then:fades → amp sustain = 0 and decay > 0.5", () => {
    const patch = wizardPatch({ role: "lead", then: "fades" });
    expect(patch.envs[0].sustain).toBe(0);
    expect(patch.envs[0].decay).toBeGreaterThan(0.5);
  });

  it("then:short → amp decay < 0.3 and sustain = 0", () => {
    const patch = wizardPatch({ role: "lead", then: "short" });
    expect(patch.envs[0].decay).toBeLessThan(0.3);
    expect(patch.envs[0].sustain).toBe(0);
  });

  it("extra:air → noise.level > 0", () => {
    const patch = wizardPatch({ role: "lead", extra: "air" });
    expect(patch.noise.level).toBeGreaterThan(0);
  });

  it("extra:octave → osc2 on with octave +1 relative to osc1", () => {
    const patch = wizardPatch({ role: "lead", extra: "octave" });
    expect(patch.osc[1].on).toBe(true);
    expect(patch.osc[1].octave).toBe(patch.osc[0].octave + 1);
  });

  it("extra:fifth → osc2 on with semi=7", () => {
    const patch = wizardPatch({ role: "lead", extra: "fifth" });
    expect(patch.osc[1].on).toBe(true);
    expect(patch.osc[1].semi).toBe(7);
  });

  it("move:wobble → LFO modulating filter cutoff, rate < 2 Hz", () => {
    const patch = wizardPatch({ role: "pad", move: "wobble" });
    const slot = patch.matrix.find((s) => s.source === "lfo1" && s.dest === "filter1.cutoff");
    expect(slot).toBeDefined();
    expect(patch.lfos[0].rate).toBeLessThan(2);
  });

  it("move:pulse → LFO on filter cutoff, tempo-synced", () => {
    const patch = wizardPatch({ role: "pad", move: "pulse" });
    const slot = patch.matrix.find((s) => s.source === "lfo1" && s.dest === "filter1.cutoff");
    expect(slot).toBeDefined();
    expect(patch.lfos[0].sync).not.toBeNull();
  });

  it("move:vibrato → LFO on pitch", () => {
    const patch = wizardPatch({ role: "lead", move: "vibrato" });
    const slot = patch.matrix.find((s) => s.source === "lfo1" && s.dest === "pitch");
    expect(slot).toBeDefined();
  });

  it("move:wah → filter env amount > 0 on filter1", () => {
    const patch = wizardPatch({ role: "lead", move: "wah" });
    expect(patch.filters[0].env).toBeGreaterThan(0);
  });

  it("tone:hollow → osc1.shape near 3 (square), pw near 0.5", () => {
    const patch = wizardPatch({ role: "lead", tone: "hollow" });
    expect(patch.osc[0].shape).toBeCloseTo(3, 0);
    expect(patch.osc[0].pw).toBeCloseTo(0.5, 1);
  });

  it("tone:nasal → narrow pulse width (pw < 0.35)", () => {
    const patch = wizardPatch({ role: "lead", tone: "nasal" });
    expect(patch.osc[0].pw).toBeLessThan(0.35);
  });

  it("tone:warm → shape between 0 and 1.5", () => {
    const patch = wizardPatch({ role: "lead", tone: "warm" });
    expect(patch.osc[0].shape).toBeLessThan(1.5);
  });

  it("bass uses ladder filter model", () => {
    const patch = wizardPatch({ role: "bass" });
    expect(patch.filters[0].model).toBe("ladder");
  });
});

// ---- Loudness ----

describe("wizardPatch loudness", () => {
  // ±4 dB from −21 dB RMS (consistent with factory synths; slow attacks excluded — their RMS
  // over the 1.6 s window is lower by design, as synthLevels.test.ts also excludes them).
  const TARGET = -21;
  const TOLERANCE = 4;

  const loudnessCases: WizardAnswers[] = [
    // representative spread of roles, tones, widths
    { role: "bass", tone: "warm", grit: "clean", width: "focused", sub: "yes", voice: "mono" },
    { role: "lead", tone: "bright", grit: "clean", width: "focused", voice: "mono" },
    { role: "lead", tone: "bright", grit: "grit", width: "focused", voice: "mono" },
    { role: "lead", tone: "bright", grit: "distorted", width: "focused", voice: "mono" },
    { role: "lead", tone: "bright", grit: "clean", width: "chorus", voice: "mono" },
    { role: "lead", tone: "bright", grit: "clean", width: "super", voice: "mono" },
    { role: "lead", tone: "glassy", grit: "clean", width: "focused", voice: "mono" },
    { role: "keys", tone: "warm", grit: "clean", width: "chorus", voice: "chords" },
    { role: "pluck", tone: "bright", grit: "clean", width: "focused", voice: "mono" },
  ];

  for (const answers of loudnessCases) {
    const label = Object.entries(answers)
      .map(([k, v]) => `${k}:${v}`)
      .join(", ");
    it(`${label} → rms within ${TOLERANCE} dB of ${TARGET}`, () => {
      const { rms, finite } = wizardLevel(answers);
      expect(finite, `${label} not finite`).toBe(true);
      expect(Math.abs(rms - TARGET), `${label} rms=${rms.toFixed(1)} dB`).toBeLessThanOrEqual(
        TOLERANCE,
      );
    });
  }
});
