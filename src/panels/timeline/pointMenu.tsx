/** A point's menu on a lane (D203): its eases, on/off, the Inspector, delete. */
import type { MenuItem } from "../../components/Menu";
import { EASE_LABEL, type Ease, type EaseType } from "../../model/ease";
import { chips } from "../drum-machine/sectionMenu";
import { useStore } from "../../state/store";

export interface PointMenuOptions {
  /** The points the menu acts on (the selection). */
  count: number;
  easeIn?: Ease;
  easeOut?: Ease;
  inTypes: EaseType[];
  outTypes: EaseType[];
  on: boolean;
  setEase: (side: "in" | "out", ease: Ease) => void;
  setOn: (on: boolean) => void;
  remove: () => void;
  /** What the Inspector should show. */
  inspect: { kind: "lane"; id: string } | { kind: "tempo" };
  /** Tempo changes: jump or ramp. */
  ramp?: { on: boolean; set: (ramp: boolean) => void };
}

export function pointMenu(o: PointMenuOptions): MenuItem[] {
  const many = o.count > 1 ? ` (${o.count} points)` : "";
  const easeChips = (side: "in" | "out", types: EaseType[], current?: Ease) =>
    chips(
      side === "in" ? `Ease in: arriving${many}` : `Ease out: leaving${many}`,
      types.map((type) => ({
        label: EASE_LABEL[type],
        active: (current?.type ?? "linear") === type,
        onClick: () => o.setEase(side, { type, strength: current?.strength }),
      })),
    );
  return [
    ...(o.ramp
      ? [
          {
            label: "Jump to this tempo",
            checked: !o.ramp.on,
            onSelect: () => o.ramp!.set(false),
          },
          {
            label: "Ramp to it from the change before",
            checked: o.ramp.on,
            onSelect: () => o.ramp!.set(true),
          },
          { separator: true },
        ]
      : []),
    easeChips("in", o.inTypes, o.easeIn),
    easeChips("out", o.outTypes, o.easeOut),
    { separator: true },
    {
      label: o.on ? `Turn off${many}` : `Turn on${many}`,
      onSelect: () => o.setOn(!o.on),
    },
    {
      label: "Edit in the Inspector",
      onSelect: () => openInInspector(o.inspect),
    },
    { label: `Delete${many}`, onSelect: o.remove },
  ];
}

/** Show a lane (or the tempo changes) in the Inspector (D199). */
export function openInInspector(what: { kind: "lane"; id: string } | { kind: "tempo" }) {
  useStore.getState().setUi({ inspect: what });
  void import("../../app/openers").then((m) => m.focusPanel("inspector"));
}
