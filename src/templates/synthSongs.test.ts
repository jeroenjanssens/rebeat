import { describe, expect, it } from "vitest";
import { SynthCore } from "../engine/synth/core";
import { effectivePatch, trackPatch } from "../library/synthTrack";
import type { Project } from "../model/project";
import { sanitizePatch, type ModSlot, type SynthPatch } from "../model/synth";
import type { Lane, Track } from "../model/types";
import { SYNTH_SONGS } from "./synthSongs";

const SR = 44100;

/** Every step of a track across the song's pages. */
const steps = (p: Project, t: Track) =>
  Object.values(p.patterns).flatMap((pt) => {
    const lane = pt.lanes[t.id] as Lane | undefined;
    return lane ? lane.steps.slice(0, pt.stepCount).filter((s) => s.on) : [];
  });

const slots = (patch: SynthPatch, dest: string) =>
  patch.matrix.filter((m) => m.dest === dest && m.amount !== 0 && m.source);
const from = (s: ModSlot[], src: string) => s.some((m) => m.source === src);

function render(t: Track, pitch: number) {
  const core = new SynthCore(SR, sanitizePatch(effectivePatch(t)));
  core.noteOn(1, pitch, 0.8, 0);
  core.noteOff(1, Math.round(0.3 * SR));
  const n = SR;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let f = 0; f < n; f += 128) core.process(l.subarray(f, f + 128), r.subarray(f, f + 128), f);
  let peak = 0;
  let finite = true;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(l[i])) finite = false;
    peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
  }
  return { peak, finite };
}

describe.each([
  ["Hyperdrive", SYNTH_SONGS.hyperdrive],
  ["Liquid Ladder", SYNTH_SONGS.liquidLadder],
])("%s", (_, make) => {
  const p = make();
  it("plays only synths (and built-in drums), pages of at most 32 steps", () => {
    for (const t of p.tracks) if (t.mode === "notes") expect(t.sound?.source, t.name).toBe("synth");
    for (const pt of Object.values(p.patterns)) expect(pt.stepCount).toBeLessThanOrEqual(32);
  });

  it("every synth sounds, cleanly, at the notes it plays", () => {
    for (const t of p.tracks.filter((x) => x.mode === "notes")) {
      const pitch = steps(p, t).find((s) => s.notes?.length)!.notes![0].pitch;
      const { peak, finite } = render(t, pitch);
      expect(finite, t.name).toBe(true);
      expect(peak, `${t.name} is silent`).toBeGreaterThan(0.01);
      expect(peak, `${t.name} clips`).toBeLessThan(1);
    }
  });
});

describe("the songs use what they show off", () => {
  it("Hyperdrive: sync, PWM, ring, a wide supersaw, pitch envelopes, Brightness locks", () => {
    const p = SYNTH_SONGS.hyperdrive();
    const patches = p.tracks.filter((t) => t.mode === "notes").map((t) => trackPatch(t));
    expect(patches.some((x) => x.osc[1].sync && from(slots(x, "osc2.pitch"), "env3"))).toBe(true);
    expect(patches.some((x) => x.osc[1].shape === 3 && from(slots(x, "osc2.pw"), "lfo2"))).toBe(
      true,
    );
    expect(patches.some((x) => x.ring > 0.5)).toBe(true);
    expect(patches.some((x) => x.osc[0].unison >= 7 && x.osc[0].width >= 0.8)).toBe(true);
    expect(
      patches.filter((x) => slots(x, "pitch").some((m) => m.source!.startsWith("env"))).length,
    ).toBeGreaterThanOrEqual(2);
    // Brightness opens over the build
    const saw = p.tracks.find((t) => t.name === "Supersaw")!;
    const build = Object.values(p.patterns).filter((pt) => pt.name.startsWith("Build"));
    const locks = build.flatMap((pt) =>
      (pt.lanes[saw.id] as Lane).steps.flatMap((s) => s.locks?.["sound.macro1"] ?? []),
    );
    expect(locks.length).toBeGreaterThan(16);
    expect(locks).toEqual([...locks].sort((a, b) => a - b));
    expect(locks.at(-1)! - locks[0]).toBeGreaterThan(0.8);
  });

  it("Liquid Ladder: a singing ladder with slides, S&H on filter 2, velocity, loops, synth drums, Bite and Movement locks", () => {
    const p = SYNTH_SONGS.liquidLadder();
    const acid = p.tracks.find((t) => t.name === "Acid")!;
    const a = trackPatch(acid);
    expect(a.filters[0]).toMatchObject({ model: "ladder", type: "lp" });
    expect(a.filters[0].reso).toBeGreaterThanOrEqual(0.9);
    expect(a.filters[1].on).toBe(true);
    const sh = slots(a, "filter2.cutoff").find((m) => m.source?.startsWith("lfo"))!;
    expect(a.lfos[Number(sh.source!.slice(3)) - 1].shape).toBe("sh");
    expect(from(slots(a, "filter1.cutoff"), "velocity")).toBe(true);
    const line = steps(p, acid);
    expect(line.some((s) => s.notes?.[0].slide)).toBe(true);
    expect(line.some((s) => s.accent)).toBe(true);
    expect(line.some((s) => s.locks?.["sound.macro2"] !== undefined)).toBe(true);
    expect(line.some((s) => s.locks?.["sound.macro7"] !== undefined)).toBe(true);
    // the macros those locks turn are Bite and Movement
    expect(a.macros[1].name).toBe("Bite");
    expect(a.macros[6].name).toBe("Movement");
    const pad = trackPatch(p.tracks.find((t) => t.name === "Pad")!);
    expect(pad.envs.filter((e) => e.loop).length).toBeGreaterThanOrEqual(2);
    expect(pad.osc[0].drift).toBeGreaterThan(0.2);
    for (const name of ["Kick", "Snare", "Perc"]) {
      const t = p.tracks.find((x) => x.name === name)!;
      expect(t.sound?.source, name).toBe("synth");
      expect(from(slots(trackPatch(t), "pitch"), "env3"), name).toBe(true);
    }
  });
});
