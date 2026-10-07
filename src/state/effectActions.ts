/** Editing effect chains on tracks, buses and the master. */
import type { Draft } from "immer";
import { makeEffect } from "../model/effects";
import type { Project } from "../model/project";
import type { Effect } from "../model/types";
import { useStore } from "./store";

export type FxTarget = { track: string } | { bus: string } | "master";

function list(p: Draft<Project>, target: FxTarget): Effect[] | undefined {
  if (target === "master") return p.master.effects;
  if ("track" in target) return p.tracks.find((t) => t.id === target.track)?.effects;
  return p.buses.find((b) => b.id === target.bus)?.effects;
}

export function editEffects(target: FxTarget, fn: (fx: Effect[]) => void, key?: string) {
  useStore.getState().commit((p) => {
    const l = list(p, target);
    if (l) fn(l);
  }, key);
}

export const addEffect = (target: FxTarget, name: string) =>
  editEffects(target, (l) => void l.push(makeEffect(name)));
export const removeEffect = (target: FxTarget, i: number) =>
  editEffects(target, (l) => void l.splice(i, 1));
export const moveEffect = (target: FxTarget, i: number, d: number) =>
  editEffects(target, (l) => {
    const j = i + d;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
  });
export const toggleBypass = (target: FxTarget, i: number) =>
  editEffects(target, (l) => void (l[i].bypass = !l[i].bypass));
export const setEffectParam = (target: FxTarget, i: number, id: string, v: number) =>
  editEffects(target, (l) => void (l[i].params[id] = v), `fx-${JSON.stringify(target)}-${i}-${id}`);
