import { useMemo, useState } from "react";
import { AudioWaveform, Library, Search } from "lucide-react";
import { focusPanel, openSampleEditor } from "../../app/openers";
import { KITS, KIT_SOUNDS, kitSounds } from "../../engine/kits";
import { isBuiltIn, sampleName, useLibrary } from "../../library/library";
import type { Track } from "../../model/types";
import { replaceSound } from "../../state/trackActions";

interface Sound {
  id: string;
  name: string;
  group: string;
}

/** The sound of a track in its menu: what it plays now, and a searchable list to replace it. */
export function SoundPicker({ track, close }: { track: Track; close: () => void }) {
  const samples = useLibrary((s) => s.samples);
  const [query, setQuery] = useState("");
  const current = track.kind === "instrument" ? track.instrument?.sampleId : track.sampleId;

  const sounds = useMemo(() => {
    const own: Sound[] = [...samples]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((s) => ({ id: s.id, name: s.name, group: "Library" }));
    // audio tracks play loops; drum tracks the kits
    const builtIn: Sound[] =
      track.kind === "audio"
        ? KIT_SOUNDS.filter((k) => k.bpm).map((k) => ({ id: k.id, name: k.name, group: "Loops" }))
        : KITS.flatMap((kit) =>
            kitSounds(kit).map((k) => ({ id: k.id, name: k.name, group: `${kit} kit` })),
          );
    const q = query.trim().toLowerCase();
    return [...own, ...builtIn].filter(
      (s) => !q || `${s.name} ${s.group}`.toLowerCase().includes(q),
    );
  }, [samples, track.kind, query]);

  const pick = (id: string) => {
    if (id !== current) replaceSound(track.id, id);
    close();
  };

  return (
    <div className="flex w-[280px] flex-col gap-1.5 px-2 py-1.5" data-testid="sound-picker">
      <div className="label">Sound</div>
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-[12px]" data-testid="current-sound">
          {current ? sampleName(current) : "None"}
        </span>
        {current && !isBuiltIn(current) && (
          <>
            <button
              className="tool-btn !h-6 !w-6 !p-0"
              title="Show in library"
              data-hint="dm.sound.show"
              onClick={() => {
                useLibrary.getState().set({ selectedId: current });
                focusPanel("library");
                close();
              }}
            >
              <Library size={13} />
            </button>
            <button
              className="tool-btn !h-6 !w-6 !p-0"
              title="Open in sample editor"
              data-hint="dm.sound.edit"
              onClick={() => {
                openSampleEditor(current);
                close();
              }}
            >
              <AudioWaveform size={13} />
            </button>
          </>
        )}
      </div>
      <label className="field" data-hint="dm.sound.search">
        <Search size={12} className="text-dim" />
        <input
          autoFocus
          className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-faint"
          placeholder="Replace with…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && sounds[0]) pick(sounds[0].id);
          }}
          data-testid="sound-search"
        />
      </label>
      <div className="scroll-thin max-h-[220px] overflow-y-auto" data-hint="dm.sound.list">
        {sounds.map((s, i) => (
          <div key={s.id}>
            {s.group !== sounds[i - 1]?.group && (
              <div className="label mt-1 px-1 !text-[9.5px] text-faint">{s.group}</div>
            )}
            <button
              className="block w-full truncate rounded px-1.5 py-[3px] text-left text-[12px] hover:bg-surface data-[active=true]:text-accent"
              data-active={s.id === current}
              data-sound={s.id}
              onClick={() => pick(s.id)}
            >
              {s.name}
            </button>
          </div>
        ))}
        {!sounds.length && <div className="px-1.5 py-2 text-[11px] text-faint">Nothing found</div>}
      </div>
    </div>
  );
}
