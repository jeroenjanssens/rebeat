import { useEffect, useMemo, useState } from "react";
import * as Tone from "tone";
import { FolderPlus, ListPlus, Loader2, Plus, Search } from "lucide-react";
import { toast } from "../../components/Toast";
import { auditionBuffer } from "../../library/audition";
import {
  ONLINE_MIME,
  fetchKitIndex,
  kitDefaults,
  kitSoundList,
  machineName,
  searchSounds,
  soundFile,
  soundLabel,
  soundName,
  typeCategory,
  type OnlineKit,
  type OnlineSound,
} from "../../library/onlineKits";
import { importSounds, previewBuffer } from "../../library/onlineImport";
import { addSampleTracks } from "../../state/trackActions";

/**
 * Browse the online tidal-drum-machines collection. Previews play without touching the library;
 * sounds are added on request (+, Add kit, Load as tracks, or dragging one onto a track).
 */
export function OnlineKits() {
  const [kits, setKits] = useState<OnlineKit[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchKitIndex().then(setKits, (e) => setError(String(e.message ?? e)));
  }, []);

  const q = query.trim().toLowerCase();
  const matchingKits = useMemo(
    () => (kits ?? []).filter((k) => machineName(k.machine).toLowerCase().includes(q)),
    [kits, q],
  );
  const matchingSounds = useMemo(() => searchSounds(kits ?? [], q), [kits, q]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast(`Couldn't download: ${e instanceof Error ? e.message : e}`, "error");
    }
    setBusy(null);
  };

  const preview = (s: OnlineSound) =>
    run(s.url, async () => {
      const ctx = Tone.getContext().rawContext as BaseAudioContext;
      auditionBuffer(await previewBuffer(s, ctx));
    });

  const add = (s: OnlineSound) =>
    run(`add:${s.url}`, async () => {
      const [id] = await importSounds([s]);
      if (!id) throw new Error(soundName(s));
      toast(`Added ${soundName(s)} to the library`);
    });

  const addKit = (kit: OnlineKit) =>
    run(`kit:${kit.machine}`, async () => {
      const ids = (await importSounds(kitDefaults(kit))).filter(Boolean);
      toast(`Added ${ids.length} sounds of ${machineName(kit.machine)} to the library`);
    });

  const load = (kit: OnlineKit) =>
    run(`tracks:${kit.machine}`, async () => {
      const sounds = kitDefaults(kit);
      const ids = await importSounds(sounds);
      const ok = sounds.flatMap((s, i) => (ids[i] ? [{ id: ids[i]!, s }] : []));
      addSampleTracks(
        ok.map((x) => x.id),
        undefined,
        ok.map((x) => typeCategory(x.s.type)),
      );
      toast(`Loaded ${machineName(kit.machine)}: ${ok.length} tracks`);
    });

  if (error)
    return <div className="p-4 text-[12px] text-faint">Online kits are unavailable: {error}</div>;
  if (!kits)
    return (
      <div className="flex items-center gap-2 p-4 text-[12px] text-faint">
        <Loader2 size={13} className="animate-spin" /> Loading the kit index…
      </div>
    );

  const row = (s: OnlineSound, withMachine: boolean) => (
    <SoundRow
      key={s.url}
      sound={s}
      withMachine={withMachine}
      busy={busy}
      onPreview={() => preview(s)}
      onAdd={() => add(s)}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="online-kits">
      <div className="shrink-0 border-b border-line px-2.5 py-1.5">
        <label className="field w-full" data-hint="library.online.search">
          <Search size={12} className="text-dim" />
          <input
            className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-faint"
            placeholder="Search machines and sounds"
            title={`${kits.length} drum machines`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="online-search"
          />
        </label>
        <p className="mt-1.5 text-[10px] leading-snug text-faint">
          From the community “tidal-drum-machines” collection. Click a sound to hear it; add it to
          your library with +, or drag it onto a track. The sounds come from many sources: check
          their licensing before publishing music made with them.
        </p>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto p-1.5">
        {matchingKits.map((kit) => {
          const isOpen = open === kit.machine;
          const sounds = kitSoundList(kit);
          return (
            <div key={kit.machine} className="rounded-md" data-online-kit={kit.machine}>
              <div className="flex h-8 items-center gap-1.5 rounded-md px-1.5 hover:bg-surface">
                <button
                  className="min-w-0 flex-1 truncate text-left text-[12px]"
                  data-hint="library.online.machine"
                  onClick={() => setOpen(isOpen ? null : kit.machine)}
                >
                  {machineName(kit.machine)}
                  <span className="ml-1.5 text-[10px] text-faint">{sounds.length} sounds</span>
                </button>
                <button
                  className="tool-btn !h-6 !w-6 shrink-0 !p-0"
                  disabled={!!busy}
                  title="Add the kit to the library"
                  data-hint="library.online.addkit"
                  onClick={() => addKit(kit)}
                >
                  {busy === `kit:${kit.machine}` ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <FolderPlus size={13} />
                  )}
                </button>
                <button
                  className="tool-btn !h-6 !w-6 shrink-0 !p-0"
                  disabled={!!busy}
                  title="Load as tracks"
                  aria-label="Load as tracks"
                  data-hint="library.online.load"
                  onClick={() => load(kit)}
                >
                  {busy === `tracks:${kit.machine}` ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <ListPlus size={14} />
                  )}
                </button>
              </div>
              {isOpen && <div className="pb-1.5 pl-2">{sounds.map((s) => row(s, false))}</div>}
            </div>
          );
        })}
        {q && (
          <>
            <div className="label mt-2 px-1.5 pb-1" data-testid="online-sound-count">
              Sounds ({matchingSounds.length === 200 ? "200+" : matchingSounds.length})
            </div>
            {matchingSounds.map((s) => row(s, true))}
          </>
        )}
        {q && !matchingKits.length && !matchingSounds.length && (
          <div className="px-1.5 py-2 text-[12px] text-faint">Nothing found</div>
        )}
      </div>
    </div>
  );
}

function SoundRow({
  sound,
  withMachine,
  busy,
  onPreview,
  onAdd,
}: {
  sound: OnlineSound;
  withMachine: boolean;
  busy: string | null;
  onPreview: () => void;
  onAdd: () => void;
}) {
  return (
    <div
      className="group flex h-7 cursor-grab items-center gap-1.5 rounded-md px-1.5 hover:bg-surface"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(ONLINE_MIME, JSON.stringify(sound));
        e.dataTransfer.setData("text/plain", soundName(sound));
        e.dataTransfer.effectAllowed = "copy";
      }}
      data-online-sound={sound.url}
      data-hint="library.online.sound"
    >
      <button
        className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left"
        onClick={onPreview}
        title="Click to preview · drag onto a track"
      >
        <span className="shrink-0 text-[12px]">
          {withMachine ? `${machineName(sound.machine)} · ` : ""}
          {soundLabel(sound)}
        </span>
        <span className="truncate text-[10.5px] text-faint">{soundFile(sound)}</span>
      </button>
      {busy === sound.url && <Loader2 size={11} className="shrink-0 animate-spin text-dim" />}
      <button
        className="tool-btn !h-5 !w-5 shrink-0 !p-0 opacity-60 group-hover:opacity-100"
        disabled={!!busy}
        title="Add to the library"
        data-hint="library.online.add"
        onClick={onAdd}
      >
        {busy === `add:${sound.url}` ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <Plus size={12} />
        )}
      </button>
    </div>
  );
}
