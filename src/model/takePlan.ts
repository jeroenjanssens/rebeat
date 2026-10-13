/**
 * Room for a take (D163, D164): how long a progression played by Auto takes, whether the page
 * (loop mode) or the song from this page on (song mode) has room for it, and the fixes: make the
 * page longer, add pages (copies of the first, the keys' lanes emptied), make clones copies,
 * unroll repeats. The fixes mutate a project inside an immer recipe.
 */
import { blockOf, splitAnchored } from "./arrangement";
import { copySlot, slotPattern, unlinkSlot } from "./project";
import type { Project } from "./project";
import { MAX_STEPS, STEP_SIZE_QUARTERS, type Pattern } from "./types";

/** A page's length in 16ths. */
export const pageSixteenths = (p: Pattern) =>
  Math.round(p.stepCount * STEP_SIZE_QUARTERS[p.stepSize] * 4);

/** How long a take is, in 16ths: chords × every × the unit (a pattern's or a bar's 16ths). */
export const takeSixteenths = (chords: number, every: number, unit: number) =>
  chords * every * unit;

export interface TakeCheck {
  /** 16ths the take needs, and what there is (the page, or the song from this page on). */
  needs: number;
  has: number;
  /** Song mode: the slots the take reaches that share their pattern with another slot. */
  clones: string[];
  /** Song mode: the slots the take reaches that play more than once. */
  repeats: string[];
}

/** What the take needs and finds, from `slotId` on (loop mode: that page alone). */
export function checkTake(project: Project, slotId: string, needs: number): TakeCheck {
  if (project.playMode !== "song")
    return { needs, has: pageSixteenths(slotPattern(project, slotId)), clones: [], repeats: [] };
  const start = Math.max(
    0,
    project.slots.findIndex((s) => s.id === slotId),
  );
  const uses = new Map<string, number>();
  for (const s of project.slots) uses.set(s.patternId, (uses.get(s.patternId) ?? 0) + 1);
  let has = 0;
  const clones: string[] = [];
  const repeats: string[] = [];
  for (const s of project.slots.slice(start)) {
    if (has >= needs) break;
    if ((uses.get(s.patternId) ?? 0) > 1) clones.push(s.id);
    if (s.repeats > 1) repeats.push(s.id);
    has += pageSixteenths(project.patterns[s.patternId]) * Math.max(1, s.repeats);
  }
  return { needs, has, clones, repeats };
}

/** Loop mode: the page long enough for the take (at most 128 steps). */
export function fitPage(project: Project, slotId: string, needs: number) {
  const p = slotPattern(project, slotId);
  const per = STEP_SIZE_QUARTERS[p.stepSize] * 4;
  p.stepCount = Math.min(MAX_STEPS, Math.max(p.stepCount, Math.ceil(needs / per)));
}

/**
 * Add the pages the take still needs after the last one it reaches: copies of `slotId`'s page
 * (its drums and other tracks go on), with the lanes of `empty` (the keys' track, the bass's)
 * emptied. Returns how many it added.
 */
export function addPages(project: Project, slotId: string, needs: number, empty: string[]): number {
  const check = checkTake({ ...project, playMode: "song" }, slotId, needs);
  const page = pageSixteenths(slotPattern(project, slotId));
  const missing = Math.max(0, Math.ceil((needs - check.has) / page));
  const start = project.slots.findIndex((s) => s.id === slotId);
  // after the last slot the take reaches (or the last one)
  let reach = start;
  let has = 0;
  for (let i = start; i < project.slots.length && has < needs; i++) {
    has += pageSixteenths(project.patterns[project.slots[i].patternId]) * project.slots[i].repeats;
    reach = i;
  }
  let after = project.slots[reach].id;
  for (let n = 0; n < missing; n++) {
    // copySlot copies the page after itself: copy the first, then move it into place
    const id = copySlot(project, slotId);
    const at = project.slots.findIndex((s) => s.id === id);
    const [slot] = project.slots.splice(at, 1);
    project.slots.splice(project.slots.findIndex((s) => s.id === after) + 1, 0, slot);
    slot.repeats = 1;
    const pattern = project.patterns[slot.patternId];
    for (const t of empty) {
      const lane = pattern.lanes[t];
      if (lane) for (const st of lane.steps) Object.assign(st, { on: false, notes: undefined });
    }
    after = slot.id;
  }
  return missing;
}

/** Song mode: the clones the take reaches become copies (their own patterns). */
export function makeCopies(project: Project, slotIds: string[]) {
  for (const id of slotIds) unlinkSlot(project, id);
}

/** Song mode: a slot that plays several times becomes that many copies, each played once. */
export function unroll(project: Project, slotId: string) {
  const slot = project.slots.find((s) => s.id === slotId);
  if (!slot || slot.repeats <= 1) return;
  const times = slot.repeats;
  const length = blockOf(project, slotId)!.length;
  slot.repeats = 1;
  const parts = [slot.id];
  for (let n = 1; n < times; n++) {
    const id = copySlot(project, slotId, false);
    const at = project.slots.findIndex((s) => s.id === id);
    const [copy] = project.slots.splice(at, 1);
    project.slots.splice(
      project.slots.findIndex((s) => s.id === parts[parts.length - 1]) + 1,
      0,
      copy,
    );
    parts.push(copy.id);
  }
  // fill on the last repeat: only the last part is a last repeat now
  if (slot.fill === "last")
    for (const id of parts.slice(0, -1)) delete project.slots.find((s) => s.id === id)!.fill;
  // what was anchored to repeat k is now on part k (D187)
  splitAnchored(project, slotId, parts, length);
}
