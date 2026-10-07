import { useRef } from "react";
import { Menu as MenuIcon } from "lucide-react";
import { dropdown } from "../components/Menu";
import { fnClick, fnPress, fnRelease } from "../state/actions";
import { useShift, useStore, type FnKey } from "../state/store";
import type { SizeClass } from "./layout";

export interface FnDef {
  key: FnKey;
  label: string;
  secondary?: string;
  shortcut?: string;
  title: string;
}

export const FUNCTIONS: FnDef[] = [
  {
    key: "shift",
    label: "Shift",
    title: "Show second functions. Click to latch, hold for momentary.",
    shortcut: "⇧",
  },
  {
    key: "select",
    label: "Select",
    secondary: "All",
    title: "Hold + click steps to select · click = Select tool",
  },
  {
    key: "copy",
    label: "Copy",
    secondary: "Page",
    title: "Copy steps (Shift = copy page) · hold + click a track or page",
    shortcut: "⌘C",
  },
  { key: "paste", label: "Paste", title: "Paste steps at the first selected step", shortcut: "⌘V" },
  {
    key: "clear",
    label: "Clear",
    secondary: "Page",
    title: "Clear selected steps or track (Shift = page) · hold + click a track",
    shortcut: "⌫",
  },
  {
    key: "dupl",
    label: "Dupl",
    secondary: "Clone",
    title: "Duplicate track (Shift = clone page) · hold + click a page",
  },
  {
    key: "double",
    label: "×2",
    secondary: "÷2",
    title: "Double the page and its contents (Shift = halve)",
  },
  {
    key: "mute",
    label: "Mute",
    secondary: "Unmute",
    title: "Hold + click tracks to mute · click = mute selected (Shift = unmute all)",
    shortcut: "M",
  },
  {
    key: "solo",
    label: "Solo",
    secondary: "Unsolo",
    title: "Hold + click tracks to solo (Shift = unsolo all)",
  },
  {
    key: "fill",
    label: "Fill",
    secondary: "Latch",
    title: "Hold: FILL steps play (Shift = latch)",
  },
  {
    key: "repeat",
    label: "Repeat",
    secondary: "Rate",
    title: "Hold + play pads: note repeat (Shift = change rate)",
  },
  { key: "accent", label: "Accent", title: "New steps and pad hits use full velocity" },
  {
    key: "rand",
    label: "Rand",
    secondary: "Vel",
    title: "Randomize the selected track (Shift = velocity only)",
  },
  {
    key: "euclid",
    label: "Euclid",
    secondary: "Rotate",
    title: "Euclidean fill for the selected track (Shift = rotate)",
  },
  {
    key: "nudgeL",
    label: "◀",
    secondary: "Fine",
    title: "Shift track one step left (Shift = nudge selected steps)",
  },
  {
    key: "nudgeR",
    label: "▶",
    secondary: "Fine",
    title: "Shift track one step right (Shift = nudge selected steps)",
  },
  { key: "undo", label: "Undo", secondary: "Redo", title: "Undo (Shift = redo)", shortcut: "⌘Z" },
];

function useLit(key: FnKey): boolean {
  return useStore((s) => {
    switch (key) {
      case "shift":
        return s.shiftLatched || s.shiftHeld;
      case "accent":
        return s.accentMode;
      case "fill":
        return s.fillHeld || s.fillLatched;
      case "select":
        return s.tool === "select";
      case "mute":
        return s.project.tracks.some((t) => t.mute);
      case "solo":
        return s.project.tracks.some((t) => t.solo);
      case "repeat":
        return false;
      default:
        return false;
    }
  });
}

function FnButton({ def, shift }: { def: FnDef; shift: boolean }) {
  const held = useStore((s) => s.held === def.key);
  const lit = useLit(def.key);
  const repeatRate = useStore((s) => s.repeatRate);
  const secondary = def.key === "repeat" ? repeatRate : def.secondary;
  return (
    <button
      className="hw-btn min-w-[50px]"
      data-held={held}
      data-lit={lit}
      data-shift={shift && !!secondary}
      title={`${def.title}${def.shortcut ? ` (${def.shortcut})` : ""}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        fnPress(def.key);
      }}
      onPointerUp={() => fnRelease(def.key)}
      onPointerCancel={() => fnRelease(def.key)}
    >
      <span className="primary">{def.label}</span>
      <span className="secondary">{secondary ?? " "}</span>
    </button>
  );
}

export function FunctionBar({ sizeClass }: { sizeClass: SizeClass }) {
  const shift = useShift();
  const moreRef = useRef<HTMLButtonElement>(null);

  if (sizeClass === "compact") {
    const main: FnKey[] = ["shift", "mute", "fill", "undo"];
    return (
      <div className="flex shrink-0 items-center gap-1.5 border-t border-line px-3 py-2">
        {FUNCTIONS.filter((f) => main.includes(f.key)).map((def) => (
          <FnButton key={def.key} def={def} shift={shift} />
        ))}
        <div className="flex-1" />
        <button
          ref={moreRef}
          className="hw-btn"
          onClick={() =>
            dropdown(
              moreRef.current!,
              FUNCTIONS.filter((f) => !main.includes(f.key)).map((f) => ({
                label: `${f.label}${f.secondary ? ` · ⇧ ${f.secondary}` : ""}`,
                shortcut: f.shortcut,
                onSelect: () => fnClick(f.key),
              })),
            )
          }
        >
          <span className="primary flex items-center gap-1">
            <MenuIcon size={12} /> Functions
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="scroll-thin flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-line bg-surface/60 px-3 py-2">
      {FUNCTIONS.map((def, i) => (
        <div key={def.key} className="flex items-center gap-1.5">
          {[1, 7, 9, 12, 14, 16].includes(i) && <div className="mx-0.5 h-6 w-px bg-line" />}
          <FnButton def={def} shift={shift} />
        </div>
      ))}
    </div>
  );
}
