/** Editing effect chains on tracks, buses and the master. */
import type { Draft } from "immer";
import { create } from "zustand";
import { makeEffect } from "../model/effects";
import { uid } from "../model/id";
import type { Project } from "../model/project";
import type { Effect } from "../model/types";
import { useSettings } from "./settings";
import { useStore } from "./store";

/** Where an effect chain is: a track, a bus, the master, or the Keys strip (D212, in settings). */
export type FxTarget = { track: string } | { bus: string } | "master" | "keys";

function list(p: Draft<Project>, target: FxTarget): Effect[] | undefined {
  if (target === "keys") return undefined;
  if (target === "master") return p.master.effects;
  if ("track" in target) return p.tracks.find((t) => t.id === target.track)?.effects;
  return p.buses.find((b) => b.id === target.bus)?.effects;
}

/** The Keys strip's effects are settings: edited as a copy, no undo. */
function editKeysEffects(fn: (fx: Effect[]) => void) {
  const settings = useSettings.getState();
  const fx: Effect[] = JSON.parse(JSON.stringify(settings.keysMix.effects ?? []));
  fn(fx);
  settings.set({ keysMix: { ...settings.keysMix, effects: fx } });
}

export function editEffects(target: FxTarget, fn: (fx: Effect[]) => void, key?: string) {
  if (target === "keys") return editKeysEffects(fn);
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

// ── Copying effects (D210, D211) ─────────────────────────────────────────

/** The effect clipboard: the app's, not the project's (it survives opening another one). */
export const useFxClipboard = create<{ effects: Effect[] | null }>(() => ({ effects: null }));

const clone = (fx: Effect[]): Effect[] => JSON.parse(JSON.stringify(fx));
/** Copies get ids of their own: lanes and mappings stay with the originals. */
const fresh = (fx: Effect[]): Effect[] => clone(fx).map((e) => ({ ...e, id: uid("fx") }));

/** Tracks don't take the Limiter (it's the master's last stage). */
export const accepts = (target: FxTarget, name: string) =>
  !(typeof target === "object" && "track" in target && name === "Limiter");

export function copyEffects(effects: Effect[]) {
  useFxClipboard.setState({ effects: clone(effects) });
}

/** Paste the clipboard: as the whole chain, or after `after` (the end without it). */
export function pasteEffects(target: FxTarget, mode: "replace" | { after?: number }) {
  const clip = useFxClipboard.getState().effects;
  if (!clip?.length) return;
  editEffects(target, (l) => {
    const add = fresh(clip).filter((e) => accepts(target, e.name));
    if (mode === "replace") l.splice(0, l.length, ...add);
    else l.splice(mode.after === undefined ? l.length : mode.after + 1, 0, ...add);
  });
}

/** The clipboard's effect of the same type, if there is one (its settings can be pasted). */
export function settingsFor(name: string): Effect | undefined {
  return useFxClipboard.getState().effects?.find((e) => e.name === name);
}

/** Paste the settings of a copied effect of the same type: the effect keeps its id, so its
 * lanes and MIDI mappings keep working (D211). */
export function pasteSettings(target: FxTarget, i: number) {
  editEffects(target, (l) => {
    const from = l[i] && settingsFor(l[i].name);
    if (!from) return;
    l[i].params = clone([from])[0].params;
    l[i].bypass = from.bypass;
  });
}

export const duplicateEffect = (target: FxTarget, i: number) =>
  editEffects(target, (l) => void (l[i] && l.splice(i + 1, 0, fresh([l[i]])[0])));

export const removeAllEffects = (target: FxTarget) =>
  editEffects(target, (l) => void l.splice(0, l.length));

/** Copy effects to the end of other chains, in one undo step. */
export function copyEffectsTo(targets: FxTarget[], effects: Effect[]) {
  if (targets.includes("keys")) editKeysEffects((l) => void l.push(...fresh(effects)));
  const others = targets.filter((t) => t !== "keys");
  if (!others.length) return;
  useStore.getState().commit((p) => {
    for (const target of others) {
      const l = list(p, target);
      if (l) l.push(...fresh(effects).filter((e) => accepts(target, e.name)));
    }
  });
}
