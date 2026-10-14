/** A point's menu on a lane (D203): its eases, on/off, the Inspector, delete. */
import type { MenuItem } from "../../components/Menu";
import { EASE_LABEL, type Ease, type EaseType } from "../../model/ease";
import { chips } from "../drum-machine/sectionMenu";
import { useStore } from "../../state/store";
import {
  NO_POINTS,
  countOf,
  countText,
  onlyIn,
  pointSelection,
  selectedIn,
  setPointSelection,
} from "../../state/pointSelection";
import {
  deleteSelection,
  easeSelection,
  easeableCount,
  setSelectionOn,
} from "../../state/timelineActions";

export interface PointMenuOptions {
  /** The points the menu acts on (the selection). */
  count: number;
  /** How the selection reads when it spans lanes ("7 points in 3 lanes", D238). */
  label?: string;
  /** Why some points can't be eased ("5 of 7 points: 2 are in stepped lanes"). */
  easeNote?: string;
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
  /** A stepped lane (D230): no eases. */
  stepped?: boolean;
}

export function pointMenu(o: PointMenuOptions): MenuItem[] {
  const many = o.label ? ` (${o.label})` : o.count > 1 ? ` (${o.count} points)` : "";
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
    ...(o.stepped
      ? []
      : [
          ...(o.easeNote ? [{ heading: o.easeNote }] : []),
          easeChips("in", o.inTypes, o.easeIn),
          easeChips("out", o.outTypes, o.easeOut),
        ]),
    ...(o.stepped ? [] : [{ separator: true }]),
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

/**
 * A point's menu that acts on the whole selection when the point is in it, across lanes (D238);
 * else on the point alone.
 */
export function selectionMenu(
  key: string,
  index: number,
  o: Omit<PointMenuOptions, "count" | "label" | "easeNote" | "setEase" | "setOn" | "remove">,
): MenuItem[] {
  const sel = pointSelection();
  const target = selectedIn(sel, key).includes(index) ? sel : onlyIn(key, [index]);
  const n = countOf(target).points;
  const easeable = easeableCount(target);
  return pointMenu({
    ...o,
    count: n,
    label: countText(target),
    // only stepped lanes in it: no eases at all
    stepped: easeable === 0,
    easeNote:
      easeable < n ? `${easeable} of ${n} points: ${n - easeable} in stepped lanes` : undefined,
    setEase: (side, ease) => easeSelection(target, side, ease),
    setOn: (on) => setSelectionOn(target, on),
    remove: () => {
      deleteSelection(target);
      setPointSelection(NO_POINTS);
    },
  });
}
