/**
 * Offline rendering (faster than real time): the song or one page, the whole mix or one track.
 * Runs the same engine code as live playback against a fresh scope in an offline context.
 */
import * as Tone from "tone";
import type { Project } from "../model/project";
import type { PageSlot, Pattern } from "../model/types";
import { newScope, reconcile, scopeReady, withScope } from "./engine";
import { pageDuration, playPageStep, stepDuration } from "./transport";

export interface RenderOptions {
  range: "song" | "page";
  /** The page for range "page". */
  slotId?: string;
  /** Only this track (for stems and resampling one track). */
  soloTrackId?: string;
  /** Seconds after the end, for reverb and delay tails. */
  tail?: number;
  sampleRate?: number;
}

export interface TimelineEntry {
  slot: PageSlot;
  pattern: Pattern;
  start: number;
  /** How many times this slot has played before (for 1:2 conditions). */
  cycle: number;
}

export function timeline(project: Project, opts: Pick<RenderOptions, "range" | "slotId">) {
  const entries: TimelineEntry[] = [];
  let t = 0;
  const cycles = new Map<string, number>();
  const slots =
    opts.range === "page"
      ? [project.slots.find((s) => s.id === opts.slotId) ?? project.slots[0]]
      : project.slots;
  for (const slot of slots) {
    const pattern = project.patterns[slot.patternId];
    const times = opts.range === "page" ? 1 : slot.repeats;
    for (let r = 0; r < times; r++) {
      const cycle = cycles.get(slot.id) ?? 0;
      cycles.set(slot.id, cycle + 1);
      entries.push({ slot, pattern, start: t, cycle });
      t += pageDuration(pattern, project.bpm, project.swing);
    }
  }
  return { entries, duration: t };
}

export async function renderProject(project: Project, opts: RenderOptions): Promise<AudioBuffer> {
  const proj: Project = opts.soloTrackId
    ? {
        ...project,
        tracks: project.tracks.map((t) => ({ ...t, mute: t.id !== opts.soloTrackId, solo: false })),
      }
    : project;
  const { entries, duration } = timeline(proj, opts);
  const tail = opts.tail ?? 2;
  const sr = opts.sampleRate ?? 44100;
  const rendered = await Tone.Offline(
    async () => {
      const scope = newScope();
      withScope(scope, () => reconcile(proj));
      await scopeReady(scope);
      withScope(scope, () => {
        for (const e of entries) {
          let t = e.start;
          for (let step = 0; step < e.pattern.stepCount; step++) {
            const d = stepDuration(e.pattern, proj.bpm, step, proj.swing);
            playPageStep(proj, e.pattern, step, t, d, e.cycle, false);
            t += d;
          }
        }
      });
    },
    duration + tail,
    2,
    sr,
  );
  return rendered.get()!;
}
