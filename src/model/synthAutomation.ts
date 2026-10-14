/**
 * A synth's automation (D228): which patch path a lane's target moves, and a lane's value (a
 * knob position, 0..1) in the path's own units, as the worklet writes it into the patch.
 */
import { fromKnob, paramOf } from "./patchParams";
import { switchOf, switchValue } from "./patchSwitches";

/** The patch path a track target's key moves ("sound.macro2" → "macros.1.value"), if any. */
export function synthPath(key: string): string | null {
  const macro = /^sound\.macro(\d)$/.exec(key);
  if (macro) return `macros.${Number(macro[1]) - 1}.value`;
  if (key.startsWith("synth:")) return key.slice(6);
  return null;
}

/** A lane's value (0..1) at a patch path, in the path's units: a macro's own 0..1, a knob's
 * value, a switch's option (D231). */
export function synthValue(path: string, v: number): number | string | boolean | null {
  if (path.startsWith("macros.")) return v;
  const sw = switchOf(path);
  if (sw) return switchValue(sw, v);
  const knob = paramOf(path);
  return knob ? fromKnob(knob, Math.min(1, Math.max(0, v))) : v;
}
