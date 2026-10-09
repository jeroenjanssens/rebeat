import { Cloud, Heart, Loader2 } from "lucide-react";
import { SoundIcon, soundKind } from "../../components/soundIcons";
import { toast } from "../../components/Toast";
import { prefetchInstrument } from "../../engine/instruments";
import { useDownloads } from "../../library/downloads";
import type { CatalogInstrument } from "../../library/instruments";
import { deleteInstrument, makeMultiSample, renameInstrument } from "../../library/userInstruments";
import { useSettings } from "../../state/settings";
import { editorLabel, openInstrument, openSample } from "./open";
import { useShell } from "../../app/shell";
import { openInBeatbox } from "../../app/openers";
import { contextMenu, type MenuItem } from "../../components/Menu";
import { PeaksCanvas } from "../../components/PeaksCanvas";
import { deleteSample, updateSample, usageOf, useLibrary } from "../../library/library";
import type { Track } from "../../model/types";
import { useStore } from "../../state/store";
import {
  INSTRUMENT_MIME,
  SAMPLE_MIME,
  addInstrumentTrack,
  addSampleTracks,
  playInstrumentOn,
  replaceSound,
} from "../../state/trackActions";
import type { Item } from "./items";

/**
 * A click previews the sound, but only once it's clear it wasn't the first half of a
 * double-click (which opens the editor instead, silently).
 */
let pending: ReturnType<typeof setTimeout> | null = null;
const cancelPlay = () => {
  if (pending) clearTimeout(pending);
  pending = null;
};
const DOUBLE_CLICK_MS = 250;

function fmtDur(s: number) {
  return s >= 60
    ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`
    : `${s.toFixed(s < 10 ? 2 : 1)}s`;
}

/** The samples of a folder as one multi-sample instrument (notes from their names, D82). */
async function instrumentFromFolder(folder: string) {
  const samples = useLibrary.getState().samples.filter((s) => s.folder === folder);
  const name = folder.split("/").pop()!;
  try {
    await makeMultiSample(name, samples.slice(0, 128));
    toast(`Made “${name}” from ${Math.min(128, samples.length)} samples (in Your sounds)`);
  } catch (e) {
    toast(`Couldn't make an instrument: ${e instanceof Error ? e.message : e}`, "error");
  }
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
    { label: "Open in sample editor", onSelect: () => void openSample(item.id, item.name) },
    { label: "Open in Beatbox", onSelect: () => openInBeatbox(item.id, item.name) },
    { label: "Export…", onSelect: () => useShell.getState().set({ sampleExport: item.id }) },
    ...(item.builtIn || !item.folder
      ? []
      : [
          {
            label: `Make instrument from “${item.folder.split("/").pop()}”`,
            onSelect: () => void instrumentFromFolder(item.folder),
          },
        ]),
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

export const toggleInstrumentFavorite = (id: string) => {
  const favs = useSettings.getState().instrumentFavorites;
  useSettings
    .getState()
    .set({ instrumentFavorites: favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id] });
};

export const makeOffline = (c: CatalogInstrument) =>
  prefetchInstrument(c.source.preset ?? "").then(
    () => toast(`${c.name} is available offline`),
    () => toast(`Couldn't download ${c.name}`, "error"),
  );

/** The right-click menu of an instrument. */
function instrumentMenu(
  item: Item,
  c: CatalogInstrument,
  track: Track | undefined,
  play: () => void,
  downloaded: boolean,
): MenuItem[] {
  return [
    { label: "Preview", onSelect: play },
    { label: "Add as new track", shortcut: "↩", onSelect: () => addInstrumentTrack(c) },
    {
      label: track ? `Use on ${track.name}` : "Use on selected track",
      disabled: !track,
      onSelect: () => track && playInstrumentOn(track.id, c),
    },
    { label: editorLabel(c), onSelect: () => openInstrument(c) },
    { separator: true },
    {
      label: item.favorite ? "Remove from favorites" : "Add to favorites",
      onSelect: () => toggleInstrumentFavorite(item.id),
    },
    ...(c.streamed
      ? [
          {
            label: downloaded ? "Available offline" : "Make available offline",
            disabled: downloaded,
            onSelect: () => void makeOffline(c),
          },
        ]
      : []),
    ...(c.id.startsWith("user:")
      ? [
          { separator: true },
          {
            render: (close: () => void) => (
              <FieldRow
                label="Name"
                value={c.name}
                onCommit={(v) => {
                  if (v.trim()) void renameInstrument(c.id.slice(5), v.trim());
                  close();
                }}
              />
            ),
          },
          { label: "Delete", onSelect: () => void deleteInstrument(c.id.slice(5)) },
        ]
      : []),
    { separator: true },
    {
      label: `${c.collection.name} · ${c.collection.license}`,
      disabled: !c.collection.url,
      onSelect: () => c.collection.url && window.open(c.collection.url, "_blank", "noopener"),
    },
  ];
}

/** One instrument in the library list. */
function InstrumentRow({
  item,
  c,
  active,
  used,
  tiles,
  track,
  onSelect,
  onPlay,
}: {
  item: Item;
  c: CatalogInstrument;
  active: boolean;
  used: boolean;
  tiles: boolean;
  track: Track | undefined;
  onSelect: () => void;
  onPlay: () => void;
}) {
  const downloaded = useDownloads((s) => s.done.includes(c.source.preset ?? ""));
  const playSoon = (clicks: number) => {
    cancelPlay();
    if (clicks > 1) return;
    pending = setTimeout(() => {
      pending = null;
      onPlay();
    }, DOUBLE_CLICK_MS);
  };
  const busy = useDownloads((s) => s.busy.includes(c.source.preset ?? ""));
  const kind = soundKind(c.source);
  return (
    <div
      data-sample={item.id}
      data-instrument={item.id}
      data-hint="library.instrument"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(INSTRUMENT_MIME, item.id);
        e.dataTransfer.setData("text/plain", item.name);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={(e) => {
        onSelect();
        playSoon(e.detail);
      }}
      onDoubleClick={() => {
        cancelPlay();
        openInstrument(c);
      }}
      onContextMenu={(e) => {
        onSelect();
        contextMenu(e, instrumentMenu(item, c, track, onPlay, downloaded));
      }}
      title={c.note}
      className={`group flex cursor-pointer gap-2 rounded-md px-1.5 ${tiles ? "flex-col border border-line p-2" : "h-9 items-center"}`}
      style={{
        background: active ? "color-mix(in oklab, var(--accent) 16%, transparent)" : undefined,
      }}
    >
      <span
        className={`flex shrink-0 items-center justify-center rounded bg-surface ${tiles ? "h-10 w-full" : "h-6 w-12"} ${active ? "text-accent" : "text-dim"}`}
      >
        <SoundIcon kind={kind} size={14} />
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[11.5px]">{item.name}</span>
        {used && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
            title="Used in this project"
          />
        )}
        {busy ? (
          <Loader2 size={11} className="shrink-0 animate-spin text-dim" />
        ) : (
          c.streamed &&
          !downloaded && (
            <span className="shrink-0 text-faint" title="Downloads the first time you play it">
              <Cloud size={11} />
            </span>
          )
        )}
        <button
          className={`shrink-0 ${item.favorite ? "text-lit" : "text-faint opacity-0 group-hover:opacity-100"}`}
          title="Favorite"
          data-hint="library.sample.favorite"
          onClick={(e) => {
            e.stopPropagation();
            toggleInstrumentFavorite(item.id);
          }}
        >
          <Heart size={11} fill={item.favorite ? "currentColor" : "none"} />
        </button>
      </div>
    </div>
  );
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
  const playSoon = (clicks: number) => {
    cancelPlay();
    if (clicks > 1) return;
    pending = setTimeout(() => {
      pending = null;
      onPlay();
    }, DOUBLE_CLICK_MS);
  };
  if (item.instrument)
    return (
      <InstrumentRow
        item={item}
        c={item.instrument}
        active={active}
        used={used}
        tiles={tiles}
        track={track}
        onSelect={onSelect}
        onPlay={onPlay}
      />
    );
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
      onClick={(e) => {
        onSelect();
        playSoon(e.detail);
      }}
      onDoubleClick={() => {
        cancelPlay();
        void openSample(item.id, item.name);
      }}
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
            className="flex min-w-0 flex-1 items-center gap-1 text-[11.5px]"
            title={item.folder ? `${item.folder}/${item.name}` : item.name}
          >
            <span className="text-faint">
              <SoundIcon kind={item.bpm ? "loop" : "oneshot"} size={11} />
            </span>
            <span className="truncate">{item.name}</span>
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
