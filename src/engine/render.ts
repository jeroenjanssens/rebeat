/**
 * Offline rendering (faster than real time): the song or one page, the whole mix or one track.
 * Runs the same engine code as live playback against a fresh scope in an offline context.
 */
import { renderOffline } from "./offline";
import type { Project } from "../model/project";
import { blockOf, layout, stepPosition, type Block } from "../model/arrangement";
import { tempoAt } from "../model/tempoMap";
import type { Section, Pattern } from "../model/types";
import { newScope, reconcile, scopeReady, scopeSettled, tempoStep, withScope } from "./engine";
import { playStep, repeatSeconds, sectionFill, stepSeconds } from "./transport";

export interface RenderOptions {
  range: "song" | "section";
  /** The section for range "section". */
  slotId?: string;
  /** Only this track (for stems and resampling one track). */
  soloTrackId?: string;
  /** Seconds after the end, for reverb and delay tails. */
  tail?: number;
  sampleRate?: number;
}

export interface TimelineEntry {
  slot: Section;
  pattern: Pattern;
  block: Block;
  /** Which repeat of the section. */
  repeat: number;
  /** Seconds from the render's start. */
  start: number;
  /** How many times this slot has played before (for 1:2 conditions). */
  cycle: number;
}

/** The repeats to render, in order, with their start times through the tempo map (D192). */
export function timeline(project: Project, opts: Pick<RenderOptions, "range" | "slotId">) {
  const entries: TimelineEntry[] = [];
  let t = 0;
  const blocks =
    opts.range === "section"
      ? [blockOf(project, opts.slotId ?? "") ?? layout(project)[0]]
      : layout(project);
  for (const block of blocks) {
    const times = opts.range === "section" ? 1 : block.repeats;
    for (let r = 0; r < times; r++) {
      entries.push({
        slot: block.section,
        pattern: block.pattern,
        block,
        repeat: r,
        start: t,
        cycle: r,
      });
      t += repeatSeconds(project, block, r);
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
  const rendered = await renderOffline(
    async () => {
      const scope = newScope();
      withScope(scope, () => reconcile(proj));
      await scopeReady(scope);
      withScope(scope, () => {
        for (const e of entries) {
          let t = e.start;
          const { block } = e;
          const fill = sectionFill(e.slot, e.repeat, block.repeats);
          const repeatDur = repeatSeconds(proj, block, e.repeat);
          for (let step = 0; step < block.steps; step++) {
            const q = stepPosition(block, e.repeat, step);
            const d = stepSeconds(proj, e.pattern, q, step);
            const bpm = tempoAt(proj, q + block.stepQ / 2);
            tempoStep(bpm, t);
            playStep(proj, e.pattern, step, t, d, e.cycle, fill, undefined, undefined, {
              section: e.slot,
              bpm,
              repeatDur,
            });
            t += d;
          }
        }
      });
      // the synths' notes travel as messages: render once they've all arrived
      await scopeSettled(scope);
    },
    duration + tail,
    2,
    sr,
  );
  return rendered;
}
