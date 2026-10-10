/**
 * Generic controller view for non-MiniLab-3 maps: shows the map's slots as labeled rows.
 */
import type { ControllerMap } from "../../midi/controllers";
import { readTarget, resolveTarget } from "../../midi/mapping";
import { useStore } from "../../state/store";
import { targetContext } from "../../audio-io/midi";

interface GenericControllerViewProps {
  map: ControllerMap;
}

function formatTarget(_target: string, value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

function SlotRow({ slot }: { slot: ControllerMap["slots"][0] }) {
  const project = useStore((s) => s.project);
  const ctx = targetContext();
  const resolved = resolveTarget(slot.target, ctx);
  const value = resolved ? readTarget(resolved, project) : null;

  return (
    <div className="flex items-center gap-3 rounded border border-line bg-surface/30 px-2 py-1">
      <span className="label w-20 shrink-0">{slot.label}</span>
      {slot.number !== null ? (
        <span className="text-dim text-[11px]">
          {slot.type.toUpperCase()} {slot.number} · ch {slot.channel + 1}
        </span>
      ) : (
        <span className="text-faint text-[11px] italic">not learned</span>
      )}
      <span className="flex-1" />
      <span className="text-[11px] tabular-nums text-dim">
        {resolved ? formatTarget(resolved, value) : "—"}
      </span>
    </div>
  );
}

export function GenericControllerView({ map }: GenericControllerViewProps) {
  return (
    <div className="flex flex-col gap-1 overflow-y-auto p-2" data-hint="controller.generic">
      <div className="mb-1 flex items-center gap-2">
        <span className="label">{map.name}</span>
      </div>
      {map.slots.map((slot) => (
        <SlotRow key={slot.slot} slot={slot} />
      ))}
    </div>
  );
}
