import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ChevronDown,
  Disc3,
  Folder,
  FolderInput,
  Globe,
  Heart,
  Mic,
  Music,
  Search,
  Star,
  Upload,
  Volume2,
} from "lucide-react";
import { openSampleEditor } from "../../app/openers";
import { contextMenu, dropdown, type MenuItem } from "../../components/Menu";
import { PeaksCanvas } from "../../components/PeaksCanvas";
import { toast } from "../../components/Toast";
import { KITS, KIT_SOUNDS, kitSounds, type KitSound } from "../../engine/kits";
import { samplePeaks } from "../../engine/samples";
import { audition, setPreviewVolume, stopAudition } from "../../library/audition";
import {
  deleteSample,
  filesFromDrop,
  importFiles,
  updateSample,
  usageOf,
  useLibrary,
} from "../../library/library";
import { platform } from "../../platform";
import { useSettings } from "../../state/settings";
import { useSelectedTrack, useStore } from "../../state/store";
import { KIT_MIME, SAMPLE_MIME, addSampleTracks, replaceSound } from "../../state/trackActions";
import {
  NATURAL_DIR,
  sortLabel,
  sortSamples,
  type SampleSort,
  type SortBy,
} from "../../library/sort";
import { useShell } from "../../app/shell";
import { OnlineKits } from "./OnlineKits";
import { RecorderStrip } from "./RecorderStrip";

type Location =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "used" }
  | { kind: "folder"; path: string }
  | { kind: "kit"; kit: string }
  | { kind: "online" };

type TypeFilter = "all" | "loops" | "oneshots";
type Length = "any" | "short" | "medium" | "long";

/** What the list shows: library samples or built-in kit sounds, normalized. */
interface Item {
  id: string;
  name: string;
  duration: number;
  bpm?: number;
  peaks: ArrayLike<number>;
  favorite: boolean;
  folder: string;
  tags: string[];
  builtIn: boolean;
  createdAt: number;
}

const sameLoc = (a: Location, b: Location) => JSON.stringify(a) === JSON.stringify(b);

function fmtDur(s: number) {
  return s >= 60
    ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`
    : `${s.toFixed(s < 10 ? 2 : 1)}s`;
}

function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [w, setW] = useState(300);
  useEffect(() => {
    let raf = 0;
    const ro = new ResizeObserver(([e]) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setW(e.contentRect.width));
    });
    ro.observe(ref.current!);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [ref]);
  return w;
}

function kitItem(k: KitSound): Item {
  return {
    id: k.id,
    name: k.name,
    duration: k.length,
    peaks: samplePeaks(k.id, 96),
    favorite: false,
    folder: `Kits/${k.kit ?? "Demo"}`,
    tags: k.category ? [k.category] : [],
    builtIn: true,
    createdAt: 0,
  };
}

export function LibraryPanel() {
  const root = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const width = useWidth(root);
  const samples = useLibrary((s) => s.samples);
  const selectedId = useLibrary((s) => s.selectedId);
  const importing = useLibrary((s) => s.importing);
  const project = useStore((s) => s.project);
  const track = useSelectedTrack();
  const previewVolume = useSettings((s) => s.previewVolume);
  const [loc, setLoc] = useState<Location>({ kind: "all" });
  const [query, setQuery] = useState("");
  const sort = useLibrary((s) => s.sort);
  const setSort = (next: SampleSort) => useLibrary.getState().set({ sort: next });
  const [type, setType] = useState<TypeFilter>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [length, setLength] = useState<Length>("any");
  const [sync, setSync] = useState(false);
  const [dropHover, setDropHover] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const sortRef = useRef<HTMLButtonElement>(null);
  const filterRef = useRef<HTMLButtonElement>(null);
  const locRef = useRef<HTMLButtonElement>(null);
  const select = (id: string | null) => useLibrary.getState().set({ selectedId: id });

  // one sample per row; tiles only when the panel is really wide
  const view = width < 640 ? "list" : "tiles";
  const sidebar = width >= 520;

  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const s of samples) {
      const parts = s.folder.split("/").filter(Boolean);
      for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join("/"));
    }
    return [...set].sort();
  }, [samples]);
  const tags = useMemo(() => [...new Set(samples.flatMap((s) => s.tags))].sort(), [samples]);
  const usedIds = useMemo(
    () =>
      new Set(
        project.tracks.flatMap((t) => [
          t.sampleId,
          t.instrument?.sampleId,
          ...(t.layers ?? []).map((l) => l.sampleId),
        ]),
      ),
    [project.tracks],
  );

  const synthTracks = project.tracks.filter(
    (t) => t.kind === "instrument" && !t.instrument?.sampleId,
  ).length;

  const items: Item[] = useMemo(() => {
    let list: Item[];
    if (loc.kind === "kit") {
      list = kitSounds(loc.kit).map(kitItem);
    } else {
      list = samples
        .filter((s) => {
          if (loc.kind === "favorites") return s.favorite === 1;
          if (loc.kind === "used") return usedIds.has(s.id);
          if (loc.kind === "folder")
            return s.folder === loc.path || s.folder.startsWith(`${loc.path}/`);
          return true;
        })
        .map((s): Item => ({
          id: s.id,
          name: s.name,
          duration: s.duration,
          bpm: s.bpm,
          peaks: s.peaks,
          favorite: s.favorite === 1,
          folder: s.folder,
          tags: s.tags,
          builtIn: false,
          createdAt: s.createdAt,
        }));
      // most tracks play built-in kit sounds, which aren't in the library's own list
      if (loc.kind === "used")
        list.push(
          ...KIT_SOUNDS.filter((k) => usedIds.has(k.id)).map((k) => kitItem(k as KitSound)),
        );
    }
    const q = query.trim().toLowerCase();
    if (q)
      list = list.filter((i) =>
        `${i.name} ${i.folder} ${i.tags.join(" ")}`.toLowerCase().includes(q),
      );
    if (type === "loops") list = list.filter((i) => i.bpm);
    if (type === "oneshots") list = list.filter((i) => !i.bpm);
    if (tag) list = list.filter((i) => i.tags.includes(tag));
    if (length === "short") list = list.filter((i) => i.duration < 1);
    if (length === "medium") list = list.filter((i) => i.duration >= 1 && i.duration <= 5);
    if (length === "long") list = list.filter((i) => i.duration > 5);
    return sortSamples(list, sort);
  }, [loc, samples, query, type, tag, length, sort, usedIds]);

  // selecting a track shows its sample in the library
  useEffect(() => {
    const id = track?.sampleId;
    if (!id) return;
    const inLib = samples.some((s) => s.id === id);
    if (!inLib && !id.startsWith("kit:")) return;
    select(id);
    requestAnimationFrame(() =>
      listRef.current
        ?.querySelector(`[data-sample="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: "nearest" }),
    );
  }, [track?.sampleId, samples]);

  const play = (item: Item) => audition(item.id, { sync, bpm: item.bpm });

  const doImport = async (files: File[], folder = loc.kind === "folder" ? loc.path : "") => {
    if (!files.length) return;
    const ids = await importFiles(files, folder);
    toast(
      ids.length
        ? `Imported ${ids.length} sample${ids.length > 1 ? "s" : ""}`
        : "No audio files found",
      ids.length ? "info" : "error",
    );
    if (ids[0]) select(ids[0]);
  };

  const menu = (item: Item): MenuItem[] => {
    const usage = usageOf(item.id);
    return [
      { label: "Audition", onSelect: () => play(item) },
      { label: "Add as new track", shortcut: "↩", onSelect: () => addSampleTracks([item.id]) },
      {
        label: track ? `Use on ${track.name}` : "Use on selected track",
        disabled: !track || track.kind === "audio" ? !track : false,
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
            { label: "Rename", onSelect: () => setRenaming(item.id) },
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
              onSelect: () =>
                usage[0] && useStore.getState().setUi({ selectedTrackId: usage[0].id }),
            },
            {
              label: usage.length ? "Delete (still used by tracks!)" : "Delete",
              onSelect: () => deleteSample(item.id),
            },
          ]),
    ];
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input")) return;
    const i = items.findIndex((x) => x.id === selectedId);
    const cols =
      view === "tiles" ? Math.max(1, Math.floor((listRef.current?.clientWidth ?? 600) / 180)) : 1;
    const move = (d: number) => {
      const next = items[Math.min(items.length - 1, Math.max(0, i < 0 ? 0 : i + d))];
      if (!next) return;
      select(next.id);
      play(next);
      listRef.current
        ?.querySelector(`[data-sample="${CSS.escape(next.id)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    };
    const actions: Record<string, (() => void) | undefined> = {
      ArrowDown: () => move(cols),
      ArrowUp: () => move(-cols),
      ArrowRight: cols > 1 ? () => move(1) : undefined,
      ArrowLeft: cols > 1 ? () => move(-1) : undefined,
      Enter: i >= 0 ? () => addSampleTracks([items[i].id]) : undefined,
      " ": i >= 0 ? () => play(items[i]) : undefined,
      Escape: stopAudition,
    };
    const action = actions[e.key];
    if (!action) return;
    // keep the arrows here instead of moving the step cursor
    e.preventDefault();
    e.stopPropagation();
    action();
  };

  const locLabel = (l: Location) =>
    l.kind === "all"
      ? "All samples"
      : l.kind === "favorites"
        ? "Favorites"
        : l.kind === "used"
          ? "Used in project"
          : l.kind === "folder"
            ? l.path
            : l.kind === "kit"
              ? `${l.kit} kit`
              : "Online kits";

  const locations: { loc: Location; icon: typeof Folder; label: string; depth?: number }[] = [
    { loc: { kind: "all" }, icon: Music, label: "All samples" },
    { loc: { kind: "favorites" }, icon: Heart, label: "Favorites" },
    { loc: { kind: "used" }, icon: Star, label: "Used in project" },
    { loc: { kind: "folder", path: "Recordings" }, icon: Mic, label: "Recordings" },
    ...folders
      .filter((f) => f !== "Recordings")
      .map((f) => ({
        loc: { kind: "folder", path: f } as Location,
        icon: Folder,
        label: f.split("/").pop()!,
        depth: f.split("/").length - 1,
      })),
    ...KITS.map((k) => ({
      loc: { kind: "kit", kit: k } as Location,
      icon: Disc3,
      label: `${k} kit`,
    })),
    { loc: { kind: "online" }, icon: Globe, label: "Online kits" },
  ];

  const kitDrag = (e: React.DragEvent) => {
    if (loc.kind !== "kit") return;
    const sounds = kitSounds(loc.kit);
    e.dataTransfer.setData(
      KIT_MIME,
      JSON.stringify(sounds.map((s) => ({ id: s.id, category: s.category }))),
    );
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      ref={root}
      className="flex h-full min-h-0 flex-col"
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setDropHover(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropHover(false);
      }}
      onDrop={async (e) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setDropHover(false);
        await doImport(await filesFromDrop(e.dataTransfer));
      }}
      style={
        dropHover ? ({ boxShadow: "inset 0 0 0 2px var(--accent)" } as CSSProperties) : undefined
      }
      data-testid="library"
    >
      {/* toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-2 py-1.5">
        {!sidebar && (
          <button
            ref={locRef}
            className="field mr-auto max-w-[60%] shrink-0"
            data-hint="library.location"
            onClick={() =>
              dropdown(
                locRef.current!,
                locations.map((l) => ({
                  label: `${"  ".repeat(l.depth ?? 0)}${l.label}`,
                  checked: sameLoc(l.loc, loc),
                  onSelect: () => setLoc(l.loc),
                })),
              )
            }
          >
            <span className="truncate">{locLabel(loc)}</span>
            <ChevronDown size={12} className="shrink-0 text-dim" />
          </button>
        )}
        {/* online kits have their own search */}
        {loc.kind !== "online" && (
          <>
            <label
              className="field order-first min-w-[140px] flex-1 basis-full @[420px]:order-none @[420px]:basis-0"
              data-hint="library.search"
            >
              <Search size={12} className="shrink-0 text-dim" />
              <input
                className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-faint"
                placeholder="Search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                data-testid="library-search"
              />
            </label>
            <button
              ref={filterRef}
              className="tool-btn shrink-0"
              data-active={type !== "all" || !!tag || length !== "any"}
              title="Filter"
              data-hint="library.filter"
              onClick={() =>
                dropdown(filterRef.current!, [
                  ...(["all", "loops", "oneshots"] as TypeFilter[]).map((t) => ({
                    label:
                      t === "all"
                        ? "All types"
                        : t === "loops"
                          ? "Loops (with tempo)"
                          : "One-shots",
                    checked: type === t,
                    onSelect: () => setType(t),
                  })),
                  { separator: true },
                  ...(["any", "short", "medium", "long"] as Length[]).map((l) => ({
                    label:
                      l === "any"
                        ? "Any length"
                        : l === "short"
                          ? "Short (< 1 s)"
                          : l === "medium"
                            ? "Medium (1–5 s)"
                            : "Long (> 5 s)",
                    checked: length === l,
                    onSelect: () => setLength(l),
                  })),
                  { separator: true },
                  { label: "Any tag", checked: !tag, onSelect: () => setTag(null) },
                  ...tags.map((t) => ({
                    label: `#${t}`,
                    checked: tag === t,
                    onSelect: () => setTag(t),
                  })),
                ])
              }
            >
              <span className="label !text-inherit">Filter</span>
            </button>
            <button
              ref={sortRef}
              className="tool-btn shrink-0"
              title="Sort"
              data-hint="library.sort"
              onClick={() =>
                dropdown(sortRef.current!, [
                  ...(["name", "duration", "recent"] as SortBy[]).map((by) => ({
                    label: by === "recent" ? "Date added" : by === "name" ? "Name" : "Duration",
                    checked: sort.by === by,
                    onSelect: () => setSort({ by, dir: NATURAL_DIR[by] }),
                  })),
                  { separator: true },
                  ...(["asc", "desc"] as const).map((dir) => ({
                    label:
                      sort.by === "recent"
                        ? dir === "asc"
                          ? "Oldest first"
                          : "Newest first"
                        : sort.by === "name"
                          ? dir === "asc"
                            ? "A → Z"
                            : "Z → A"
                          : dir === "asc"
                            ? "Shortest first"
                            : "Longest first",
                    checked: sort.dir === dir,
                    onSelect: () => setSort({ ...sort, dir }),
                  })),
                ])
              }
              data-testid="library-sort"
            >
              <span className="label !text-inherit">{sortLabel(sort)}</span>
            </button>
          </>
        )}
        <button
          className="tool-btn shrink-0"
          title="Import files (or drop files, folders and zips here)"
          data-hint="library.import.files"
          onClick={async () =>
            doImport(await platform.files.open({ accept: ["audio/*", ".zip"], multiple: true }))
          }
          data-testid="library-import"
        >
          <Upload size={13} />
        </button>
        <button
          className="tool-btn shrink-0"
          title="Import a folder"
          data-hint="library.import.folder"
          onClick={async () => doImport(await platform.files.open({ directory: true }))}
        >
          <FolderInput size={13} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {sidebar && (
          <nav className="scroll-thin w-[150px] shrink-0 overflow-auto border-r border-line p-1.5">
            {locations.map((l, i) => {
              const Icon = l.icon;
              const header =
                i === 4 || (l.loc.kind === "kit" && locations[i - 1]?.loc.kind !== "kit");
              return (
                <div key={JSON.stringify(l.loc)}>
                  {header && (
                    <div className="label mx-1.5 mb-0.5 mt-2.5">
                      {l.loc.kind === "kit" ? "Kits" : "Folders"}
                    </div>
                  )}
                  <button
                    className="tool-btn w-full !justify-start !text-[11.5px]"
                    style={{ paddingLeft: 7 + (l.depth ?? 0) * 10 }}
                    data-active={sameLoc(l.loc, loc)}
                    data-hint="library.sidebar"
                    onClick={() => setLoc(l.loc)}
                    onDragOver={(e) =>
                      l.loc.kind === "folder" &&
                      [...e.dataTransfer.types].includes(SAMPLE_MIME) &&
                      e.preventDefault()
                    }
                    onDrop={(e) => {
                      const id = e.dataTransfer.getData(SAMPLE_MIME);
                      if (id && l.loc.kind === "folder") updateSample(id, { folder: l.loc.path });
                    }}
                  >
                    <Icon size={12} className="shrink-0" />
                    <span className="truncate">{l.label}</span>
                  </button>
                </div>
              );
            })}
          </nav>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {loc.kind === "online" ? (
            <OnlineKits />
          ) : (
            <>
              {loc.kind === "kit" && (
                <div
                  className="flex shrink-0 items-center gap-2 border-b border-line px-2.5 py-1.5"
                  draggable
                  onDragStart={kitDrag}
                  title="Drag onto the drum machine to add the whole kit"
                  data-hint="library.kit.header"
                >
                  <span className="label !text-ink">{loc.kit} kit</span>
                  <span className="text-[11px] text-faint">
                    Synthesized · {items.length} sounds
                  </span>
                  <button
                    className="tool-btn ml-auto border border-line"
                    data-hint="library.kit.load"
                    onClick={() => {
                      const sounds = kitSounds(loc.kit);
                      addSampleTracks(
                        sounds.map((s) => s.id),
                        undefined,
                        sounds.map((s) => s.category),
                      );
                      toast(`Added the ${loc.kit} kit as ${sounds.length} tracks`);
                    }}
                  >
                    Load kit as tracks
                  </button>
                </div>
              )}
              {loc.kind === "folder" && loc.path === "Recordings" && <RecorderStrip />}
              <div
                ref={listRef}
                tabIndex={0}
                onKeyDown={onKeyDown}
                className={`scroll-thin min-h-0 flex-1 overflow-auto p-1.5 outline-none ${view === "tiles" ? "grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-1.5" : "flex flex-col"}`}
                data-testid="library-list"
              >
                {loc.kind === "used" && synthTracks > 0 && (
                  <div
                    className="col-span-full px-2 py-1.5 text-[11px] text-faint"
                    data-testid="used-synths"
                  >
                    {synthTracks === 1
                      ? "1 instrument track plays"
                      : `${synthTracks} instrument tracks play`}{" "}
                    a synth or built-in instrument, not a sample.
                  </div>
                )}
                {items.length === 0 && (
                  <div className="col-span-full px-4 py-8 text-center text-[12px] text-faint">
                    {samples.length === 0 && loc.kind === "all"
                      ? "Drop audio files, folders or zips here, or use the import button."
                      : "Nothing here."}
                  </div>
                )}
                {items.map((item) => {
                  const active = item.id === selectedId;
                  const used = usedIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      data-sample={item.id}
                      data-hint="library.sample"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(SAMPLE_MIME, item.id);
                        e.dataTransfer.setData("text/plain", item.name);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => {
                        select(item.id);
                        play(item);
                      }}
                      onDoubleClick={() => !item.builtIn && openSampleEditor(item.id)}
                      onContextMenu={(e) => {
                        select(item.id);
                        contextMenu(e, menu(item));
                      }}
                      className={`group flex cursor-pointer gap-2 rounded-md px-1.5 ${view === "tiles" ? "flex-col border border-line p-2" : "h-9 items-center"}`}
                      style={{
                        background: active
                          ? "color-mix(in oklab, var(--accent) 16%, transparent)"
                          : undefined,
                      }}
                    >
                      <PeaksCanvas
                        peaks={item.peaks}
                        color={active ? "var(--accent)" : undefined}
                        className={view === "tiles" ? "h-10 w-full" : "h-6 w-12 shrink-0"}
                      />
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        {renaming === item.id ? (
                          <input
                            autoFocus
                            defaultValue={item.name}
                            className="input !h-6 min-w-0 flex-1"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === "Enter") e.currentTarget.blur();
                              if (e.key === "Escape") setRenaming(null);
                            }}
                            onBlur={(e) => {
                              const v = e.currentTarget.value.trim();
                              if (v && v !== item.name) updateSample(item.id, { name: v });
                              setRenaming(null);
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
                        <span className="num shrink-0 text-[9.5px] text-faint">
                          {fmtDur(item.duration)}
                        </span>
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
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* footer */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-t border-line px-2 text-[10.5px] text-faint">
        <Volume2 size={12} className="shrink-0" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={previewVolume}
          onChange={(e) => setPreviewVolume(Number(e.target.value))}
          className="w-16 accent-[var(--accent)]"
          title="Preview volume"
          data-hint="library.preview.volume"
        />
        <button
          className="tool-btn !h-5 !text-[10px]"
          data-active={sync}
          onClick={() => setSync(!sync)}
          title="Play loops at the song tempo, starting on the beat"
          data-hint="library.sync"
        >
          Sync
        </button>
        <span className="flex-1" />
        {importing ? (
          <span className="text-accent">
            Importing {importing.done}/{importing.total}…
          </span>
        ) : (
          <span>
            {items.length} {items.length === 1 ? "sound" : "sounds"}
          </span>
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
