import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FolderInput, Link2, Upload, Volume2 } from "lucide-react";
import { toast } from "../../components/Toast";
import { kitSounds } from "../../engine/kits";
import { audition, setPreviewVolume, stopAudition } from "../../library/audition";
import { filesFromDrop, importFiles, useLibrary } from "../../library/library";
import { platform } from "../../platform";
import { useSettings } from "../../state/settings";
import { useSelectedTrack, useStore } from "../../state/store";
import { KIT_MIME, addSampleTracks } from "../../state/trackActions";
import { FilterBar } from "./Filters";
import { ImportLink } from "./ImportLink";
import { ItemRow } from "./ItemRow";
import {
  useFoldersAndTags,
  useLibraryItems,
  useUsedIds,
  type Filters,
  type Item,
  type Location,
} from "./items";
import { Locations } from "./Locations";
import { OnlineKits } from "./OnlineKits";
import { RecorderStrip } from "./RecorderStrip";

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

/** The sound browser: locations, the list of sounds, importing and previewing. */
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
  const [filters, setFilters] = useState<Filters>({
    query: "",
    type: "all",
    tag: null,
    length: "any",
  });
  const [sync, setSync] = useState(false);
  const [dropHover, setDropHover] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const select = (id: string | null) => useLibrary.getState().set({ selectedId: id });

  // one sample per row; tiles only when the panel is really wide
  const view = width < 640 ? "list" : "tiles";
  const sidebar = width >= 520;

  const { folders, tags } = useFoldersAndTags();
  const usedIds = useUsedIds();
  const items = useLibraryItems(loc, filters);
  const synthTracks = project.tracks.filter(
    (t) => t.kind === "instrument" && !t.instrument?.sampleId,
  ).length;

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
        {!sidebar && <Locations folders={folders} loc={loc} setLoc={setLoc} sidebar={false} />}
        {/* online kits have their own search */}
        {loc.kind !== "online" && (
          <FilterBar
            filters={filters}
            set={(f) => setFilters((cur) => ({ ...cur, ...f }))}
            tags={tags}
          />
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
        <button
          className="tool-btn shrink-0"
          title="Import from a link"
          data-hint="library.import.link"
          data-testid="library-import-link"
          onClick={() => setLinkOpen(true)}
        >
          <Link2 size={13} />
        </button>
        <ImportLink
          open={linkOpen}
          onClose={() => setLinkOpen(false)}
          onSource={() => setLoc({ kind: "online" })}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        {sidebar && <Locations folders={folders} loc={loc} setLoc={setLoc} sidebar />}

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
                {items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    active={item.id === selectedId}
                    used={usedIds.has(item.id)}
                    tiles={view === "tiles"}
                    renaming={renaming === item.id}
                    track={track}
                    onSelect={() => select(item.id)}
                    onPlay={() => play(item)}
                    setRenaming={(on) => setRenaming(on ? item.id : null)}
                  />
                ))}
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
