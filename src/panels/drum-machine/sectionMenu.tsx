/** The section menu (D183): the same in the song strip and on the timeline. */
import type { MenuItem } from "../../components/Menu";
import { LINK_COLORS, TRACK_PALETTE } from "../../model/colors";
import {
  cloneSlot,
  copySlot,
  linkCount,
  newSlot,
  unlinkSlot,
  type Project,
} from "../../model/project";
import {
  STEP_COUNT_PRESETS,
  STEP_SIZES,
  STEP_SIZE_QUARTERS,
  type Section,
} from "../../model/types";
import { useStore } from "../../state/store";
import {
  clearSectionSettings,
  deleteSections,
  sectionSummary,
  setSectionFill,
  setSectionSteps,
  setSectionTranspose,
  toggleMuteHere,
} from "../../state/timelineActions";

/** A row of chips (or color swatches) in a menu. */
export function chips(
  label: string,
  options: { label: string; active: boolean; onClick: () => void; color?: string }[],
  keepOpen = false,
): MenuItem {
  return {
    render: (close) => (
      <div className="px-2 py-1.5">
        <div className="label mb-1.5">{label}</div>
        <div className="flex max-w-[260px] flex-wrap gap-1">
          {options.map((o) =>
            o.color ? (
              <button
                key={o.label}
                className="h-4 w-4 rounded-sm"
                style={{
                  background: o.color,
                  outline: o.active ? "2px solid var(--select)" : undefined,
                }}
                onClick={() => {
                  o.onClick();
                  close();
                }}
              />
            ) : (
              <button
                key={o.label}
                className="tool-btn !h-6 border border-line"
                data-active={o.active}
                onClick={() => {
                  o.onClick();
                  if (!keepOpen) close();
                }}
              >
                {o.label}
              </button>
            ),
          )}
        </div>
      </div>
    ),
  };
}

const TRANSPOSES = [-12, -7, -5, -3, -2, -1, 0, 1, 2, 3, 5, 7, 12];

/** The menu of one section (`index` in the song order). */
export function sectionMenu(project: Project, slot: Section, index: number): MenuItem[] {
  const { commit, setUi, editSlotId } = useStore.getState();
  const pattern = project.patterns[slot.patternId];
  const links = linkCount(project, slot.patternId);
  const linked = links > 1;
  const edit = (id: string) => setUi({ editSlotId: id, selectedSteps: {} });
  const perBeat = Math.max(1, Math.round(1 / STEP_SIZE_QUARTERS[pattern.stepSize]));
  const lengths = Array.from(
    { length: Math.floor(pattern.stepCount / perBeat) },
    (_, i) => (i + 1) * perBeat,
  ).filter((n) => n < pattern.stepCount);
  const summary = sectionSummary(project, slot);
  return [
    {
      label: "New section",
      onSelect: () => {
        let id = "";
        commit((p) => void (id = newSlot(p, slot.id)));
        edit(id);
      },
    },
    {
      label: "Copy section",
      shortcut: "⇧COPY",
      onSelect: () => {
        let id = "";
        commit((p) => void (id = copySlot(p, slot.id)));
        edit(id);
      },
    },
    {
      label: "Clone section (linked)",
      shortcut: "⇧DUPL",
      onSelect: () => {
        let id = "";
        commit((p) => void (id = cloneSlot(p, slot.id)));
        edit(id);
      },
    },
    { label: "Unlink", disabled: !linked, onSelect: () => commit((p) => unlinkSlot(p, slot.id)) },
    {
      label: "Delete",
      disabled: project.slots.length < 2,
      onSelect: () => deleteSections([slot.id]),
    },
    { separator: true },
    chips(
      "Repeat",
      [1, 2, 3, 4, 6, 8, 12, 16].map((n) => ({
        label: `×${n}`,
        active: slot.repeats === n,
        onClick: () => commit((p) => void (p.slots.find((s) => s.id === slot.id)!.repeats = n)),
      })),
    ),
    chips(
      linked ? `Steps (the pattern: all ${links} sections)` : "Steps",
      STEP_COUNT_PRESETS.map((n) => ({
        label: String(n),
        active: pattern.stepCount === n,
        onClick: () => commit((p) => void (p.patterns[pattern.id].stepCount = n)),
      })),
    ),
    chips(
      "Step size",
      STEP_SIZES.map((sz) => ({
        label: sz,
        active: pattern.stepSize === sz,
        onClick: () => commit((p) => void (p.patterns[pattern.id].stepSize = sz)),
      })),
    ),
    chips(
      "Color",
      [...LINK_COLORS, ...TRACK_PALETTE.filter((_, i) => i % 3 === 0)].map((c) => ({
        label: c,
        color: c,
        active: pattern.linkColor === c,
        onClick: () => commit((p) => void (p.patterns[pattern.id].linkColor = c)),
      })),
    ),
    { separator: true },
    {
      render: () => (
        <div className="label px-2 pt-1">This section only (its clones keep the link)</div>
      ),
    },
    chips(
      "Mute tracks here",
      project.tracks.map((t) => ({
        label: t.name,
        active: !!slot.mutes?.includes(t.id),
        onClick: () => toggleMuteHere(slot.id, t.id),
      })),
      true,
    ),
    chips(
      "Transpose the notes here",
      TRANSPOSES.map((n) => ({
        label: n > 0 ? `+${n}` : String(n),
        active: (slot.transpose ?? 0) === n,
        onClick: () => setSectionTranspose(slot.id, n),
      })),
    ),
    chips("Fill", [
      { label: "Off", active: !slot.fill, onClick: () => setSectionFill(slot.id, undefined) },
      {
        label: "On the last repeat",
        active: slot.fill === "last",
        onClick: () => setSectionFill(slot.id, "last"),
      },
      {
        label: "On every repeat",
        active: slot.fill === "all",
        onClick: () => setSectionFill(slot.id, "all"),
      },
    ]),
    chips("Play only the first … steps", [
      { label: "All", active: !slot.steps, onClick: () => setSectionSteps(slot.id, undefined) },
      ...lengths.map((n) => ({
        label: String(n),
        active: slot.steps === n,
        onClick: () => setSectionSteps(slot.id, n),
      })),
    ]),
    {
      label: summary.length
        ? `Clear this section's settings (${summary.join(" · ")})`
        : "Clear this section's settings",
      disabled: !summary.length,
      onSelect: () => clearSectionSettings(slot.id),
    },
    ...(index >= 0 && slot.id !== editSlotId
      ? [{ separator: true }, { label: "Edit this section", onSelect: () => edit(slot.id) }]
      : []),
  ];
}
