import type { MenuItem } from "../../components/Menu";
import { CONDITIONS } from "../../model/params";
import { slotPattern } from "../../model/project";
import { editSteps, toggleSelected } from "../../state/actions";
import { stepKey, useStore } from "../../state/store";

/** The context menu of one step pad. */
export function stepMenu(trackId: string, index: number): MenuItem[] {
  const s = useStore.getState();
  const lane = slotPattern(s.project, s.editSlotId).lanes[trackId];
  if (lane?.kind !== "steps") return [];
  const step = lane.steps[index];
  const edit = (fn: Parameters<typeof editSteps>[1]) =>
    editSteps([stepKey(trackId, index)], fn, `menu-${performance.now()}`);
  const row = (
    label: string,
    values: { label: string; active: boolean; set: () => void }[],
  ): MenuItem => ({
    render: (close) => (
      <div className="px-2 py-1">
        <div className="label mb-1">{label}</div>
        <div className="flex flex-wrap gap-1">
          {values.map((v) => (
            <button
              key={v.label}
              className="tool-btn !h-6 border border-line"
              data-active={v.active}
              onClick={() => {
                v.set();
                close();
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
    ),
  });
  return [
    { label: step.on ? "Turn off" : "Turn on", onSelect: () => edit((x) => void (x.on = !x.on)) },
    {
      label: "Accent",
      checked: step.accent,
      onSelect: () => edit((x) => void (x.accent = !x.accent)),
    },
    {
      label: "Select (edit with the STEP encoders)",
      onSelect: () => toggleSelected(trackId, index, false),
    },
    { separator: true },
    row(
      "Probability",
      [1, 0.75, 0.5, 0.25].map((p) => ({
        label: `${p * 100}%`,
        active: step.probability === p,
        set: () => edit((x) => void (x.probability = p)),
      })),
    ),
    row(
      "Ratchet",
      [1, 2, 3, 4, 6, 8].map((r) => ({
        label: `${r}×`,
        active: step.ratchet === r,
        set: () => edit((x) => void (x.ratchet = r)),
      })),
    ),
    row(
      "Condition",
      CONDITIONS.map((c) => ({
        label: c,
        active: (step.condition ?? "—") === c,
        set: () => edit((x) => void (x.condition = c === "—" ? undefined : c)),
      })),
    ),
    {
      label: "Clear parameter locks",
      disabled: !step.locks,
      onSelect: () =>
        edit((x) => {
          delete x.locks;
          delete x.locked;
        }),
    },
  ];
}
