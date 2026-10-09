import type { MenuItem } from "../../components/Menu";
import { stepped } from "../../model/tracks";
import { CONDITIONS } from "../../model/params";
import { slotPattern } from "../../model/project";
import type { Step } from "../../model/types";
import { editSteps, menuTargets, switchStep, toggleSelected } from "../../state/actions";
import { useStore } from "../../state/store";

/** The context menu of a step pad; on a selected step it acts on the whole selection. */
export function stepMenu(trackId: string, index: number): MenuItem[] {
  const s = useStore.getState();
  const pattern = slotPattern(s.project, s.editSlotId);
  const lane = pattern.lanes[trackId];
  if (!lane || !stepped(s.project, trackId)) return [];
  const keys = menuTargets(trackId, index);
  const steps = keys.flatMap((k): Step[] => {
    const [t, i] = k.split(":");
    const l = pattern.lanes[t];
    return l && stepped(s.project, t) ? [l.steps[Number(i)]] : [];
  });
  const all = (fn: (x: Step) => boolean) => steps.every(fn);
  const many = keys.length > 1;
  const edit = (fn: Parameters<typeof editSteps>[1]) =>
    editSteps(keys, fn, `menu-${performance.now()}`);
  const allOn = all((x) => x.on);
  const allAccent = all((x) => x.accent);
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
    ...(many
      ? [{ render: () => <div className="label px-2 pt-1">{keys.length} selected steps</div> }]
      : []),
    {
      label: `${allOn ? "Turn off" : "Turn on"}${many ? ` ${keys.length} steps` : ""}`,
      onSelect: () => edit((x, track) => switchStep(x, track, !allOn)),
    },
    {
      label: "Accent",
      checked: allAccent,
      onSelect: () => edit((x) => void (x.accent = !allAccent)),
    },
    ...(many
      ? []
      : [
          {
            label: "Select (edit with the STEP encoders)",
            onSelect: () => toggleSelected(trackId, index, false),
          },
        ]),
    { separator: true },
    row(
      "Probability",
      [1, 0.75, 0.5, 0.25].map((p) => ({
        label: `${p * 100}%`,
        active: all((x) => x.probability === p),
        set: () => edit((x) => void (x.probability = p)),
      })),
    ),
    row(
      "Ratchet",
      [1, 2, 3, 4, 6, 8].map((r) => ({
        label: `${r}×`,
        active: all((x) => x.ratchet === r),
        set: () => edit((x) => void (x.ratchet = r)),
      })),
    ),
    row(
      "Condition",
      CONDITIONS.map((c) => ({
        label: c,
        active: all((x) => (x.condition ?? "—") === c),
        set: () => edit((x) => void (x.condition = c === "—" ? undefined : c)),
      })),
    ),
    {
      label: "Clear parameter locks",
      disabled: all((x) => !x.locks),
      onSelect: () =>
        edit((x) => {
          delete x.locks;
          delete x.locked;
        }),
    },
  ];
}
