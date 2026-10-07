import { ChevronDown, ChevronUp, Power, X } from "lucide-react";
import { EFFECT_PARAMS } from "../model/params";
import type { Effect } from "../model/types";
import {
  moveEffect,
  removeEffect,
  setEffectParam,
  toggleBypass,
  type FxTarget,
} from "../state/effectActions";
import { Encoder } from "./Encoder";

/** One effect in a chain: bypass, reorder, remove, and its parameters as encoders. */
export function EffectEditor({
  target,
  effect,
  index,
  count,
  color,
  midiPrefix,
  removable = true,
}: {
  target: FxTarget;
  effect: Effect;
  index: number;
  count: number;
  color?: string;
  midiPrefix?: string;
  removable?: boolean;
}) {
  const defs = EFFECT_PARAMS[effect.name] ?? [];
  return (
    <div
      className="rounded-md border border-line bg-surface/60"
      style={{ opacity: effect.bypass ? 0.55 : 1 }}
    >
      <div className="flex h-7 items-center gap-1 border-b border-line px-1.5">
        <button
          className="tool-btn !h-5 !min-w-5 !p-0"
          data-active={!effect.bypass}
          title={effect.bypass ? "Bypassed: click to enable" : "On: click to bypass"}
          onClick={() => toggleBypass(target, index)}
        >
          <Power size={11} />
        </button>
        <span className="label flex-1 truncate !text-ink">{effect.name}</span>
        <button
          className="tool-btn !h-5 !min-w-5 !p-0"
          disabled={index === 0}
          title="Move up"
          onClick={() => moveEffect(target, index, -1)}
        >
          <ChevronUp size={11} />
        </button>
        <button
          className="tool-btn !h-5 !min-w-5 !p-0"
          disabled={index === count - 1}
          title="Move down"
          onClick={() => moveEffect(target, index, 1)}
        >
          <ChevronDown size={11} />
        </button>
        {removable && (
          <button
            className="tool-btn !h-5 !min-w-5 !p-0"
            title="Remove"
            onClick={() => removeEffect(target, index)}
          >
            <X size={11} />
          </button>
        )}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(54px,1fr))] gap-y-1.5 px-1 py-2">
        {defs.map((def) => (
          <Encoder
            key={def.id}
            def={def}
            size={30}
            color={color}
            value={effect.params[def.id] ?? def.default}
            onChange={(v) => setEffectParam(target, index, def.id, v)}
            midiTarget={midiPrefix ? `${midiPrefix}:${effect.id}:${def.id}` : undefined}
          />
        ))}
      </div>
    </div>
  );
}
