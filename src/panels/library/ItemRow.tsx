import { Heart } from "lucide-react";
import { openSampleEditor } from "../../app/openers";
import { useShell } from "../../app/shell";
import { contextMenu, type MenuItem } from "../../components/Menu";
import { PeaksCanvas } from "../../components/PeaksCanvas";
import { deleteSample, updateSample, usageOf } from "../../library/library";
import type { Track } from "../../model/types";
import { useStore } from "../../state/store";
import { SAMPLE_MIME, addSampleTracks, replaceSound } from "../../state/trackActions";
import type { Item } from "./items";

function fmtDur(s: number) {
  return s >= 60
    ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`
    : `${s.toFixed(s < 10 ? 2 : 1)}s`;
}

/** The right-click menu of a sample. */
function sampleMenu(
  item: Item,
  track: Track | undefined,
  play: () => void,
  rename: () => void,
): MenuItem[] {
  const usage = usageOf(item.id);
  return [
    { label: "Audition", onSelect: play },
    { label: "Add as new track", shortcut: "↩", onSelect: () => addSampleTracks([item.id]) },
    {
      label: track ? `Use on ${track.name}` : "Use on selected track",
      disabled: !track,
      onSelect: () => track && replaceSound(track.id, item.id),
    },
    {
      label: "Open in sample editor",
      disabled: item.builtIn,
      onSelect: () => openSampleEditor(item.id),
    },
    { label: "Export…", onSelect: () => useShell.getState().set({ sampleExport: item.id }) },
    { separator: true },
    ...(item.builtIn
      ? []
      : [
          {
            label: item.favorite ? "Remove from favorites" : "Add to favorites",
            onSelect: () => updateSample(item.id, { favorite: item.favorite ? 0 : 1 }),
          },
          { label: "Rename", onSelect: rename },
          {
            render: (close: () => void) => (
              <FieldRow
                label="Tags"
                value={item.tags.join(", ")}
                onCommit={(v) => {
                  updateSample(item.id, {
                    tags: v
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  });
                  close();
                }}
              />
            ),
          },
          {
            render: (close: () => void) => (
              <FieldRow
                label="Folder"
                value={item.folder}
                onCommit={(v) => {
                  updateSample(item.id, { folder: v.replace(/^\/+|\/+$/g, "") });
                  close();
                }}
              />
            ),
          },
          { separator: true },
          {
            label: usage.length
              ? `Used by ${usage.map((t) => t.name).join(", ")}`
              : "Not used in this project",
            disabled: !usage.length,
            onSelect: () => usage[0] && useStore.getState().setUi({ selectedTrackId: usage[0].id }),
          },
          {
            label: usage.length ? "Delete (still used by tracks!)" : "Delete",
            onSelect: () => deleteSample(item.id),
          },
        ]),
  ];
}

/** One sample in the library list (a row, or a tile in a wide library). */
export function ItemRow({
  item,
  active,
  used,
  tiles,
  renaming,
  track,
  onSelect,
  onPlay,
  setRenaming,
}: {
  item: Item;
  active: boolean;
  used: boolean;
  tiles: boolean;
  renaming: boolean;
  track: Track | undefined;
  onSelect: () => void;
  onPlay: () => void;
  setRenaming: (on: boolean) => void;
}) {
  return (
    <div
      data-sample={item.id}
      data-hint="library.sample"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(SAMPLE_MIME, item.id);
        e.dataTransfer.setData("text/plain", item.name);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => {
        onSelect();
        onPlay();
      }}
      onDoubleClick={() => !item.builtIn && openSampleEditor(item.id)}
      onContextMenu={(e) => {
        onSelect();
        contextMenu(
          e,
          sampleMenu(item, track, onPlay, () => setRenaming(true)),
        );
      }}
      className={`group flex cursor-pointer gap-2 rounded-md px-1.5 ${tiles ? "flex-col border border-line p-2" : "h-9 items-center"}`}
      style={{
        background: active ? "color-mix(in oklab, var(--accent) 16%, transparent)" : undefined,
      }}
    >
      <PeaksCanvas
        peaks={item.peaks}
        color={active ? "var(--accent)" : undefined}
        className={tiles ? "h-10 w-full" : "h-6 w-12 shrink-0"}
      />
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {renaming ? (
          <input
            autoFocus
            defaultValue={item.name}
            className="input !h-6 min-w-0 flex-1"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setRenaming(false);
            }}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              if (v && v !== item.name) updateSample(item.id, { name: v });
              setRenaming(false);
            }}
          />
        ) : (
          <span
            className="min-w-0 flex-1 truncate text-[11.5px]"
            title={item.folder ? `${item.folder}/${item.name}` : item.name}
          >
            {item.name}
          </span>
        )}
        {used && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
            title="Used in this project"
          />
        )}
        {item.bpm && (
          <span className="num shrink-0 rounded bg-surface px-1 text-[9.5px] text-dim">
            {Math.round(item.bpm)}
          </span>
        )}
        <span className="num shrink-0 text-[9.5px] text-faint">{fmtDur(item.duration)}</span>
        {!item.builtIn && (
          <button
            className={`shrink-0 ${item.favorite ? "text-lit" : "text-faint opacity-0 group-hover:opacity-100"}`}
            title="Favorite"
            data-hint="library.sample.favorite"
            onClick={(e) => {
              e.stopPropagation();
              updateSample(item.id, { favorite: item.favorite ? 0 : 1 });
            }}
          >
            <Heart size={11} fill={item.favorite ? "currentColor" : "none"} />
          </button>
        )}
      </div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 px-2 py-1">
      <span className="label w-12">{label}</span>
      <input
        className="input !h-6 flex-1"
        defaultValue={value}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") onCommit(e.currentTarget.value);
        }}
      />
    </label>
  );
}
