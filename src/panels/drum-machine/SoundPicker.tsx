import { useMemo, useState } from "react";
import { AudioWaveform, Library, Search } from "lucide-react";
import { focusPanel, openSampleEditor } from "../../app/openers";
import { SAMPLED_INSTRUMENTS, SYNTH_PRESETS } from "../../engine/instruments";
import { KITS, KIT_SOUNDS, kitSounds } from "../../engine/kits";
import { SoundIcon, type SoundKind } from "../../components/soundIcons";
import { isBuiltIn, useLibrary } from "../../library/library";
import { soundFamily, type SoundFamily, type Track } from "../../model/types";
import { sampleOf } from "../../model/tracks";
import { replaceSound, setSound, soundLabel } from "../../state/trackActions";

interface Choice {
  /** A sample id, or "synth:<preset>" / "smplr:<instrument>". */
  id: string;
  name: string;
  group: string;
  kind: SoundKind;
}

const FAMILIES: [SoundFamily, string][] = [
  ["sample", "Sample"],
  ["synth", "Synth"],
  ["instrument", "Sampled instrument"],
];

/**
 * The sound of a step track in its menu: what it plays now, and a searchable list to replace it
 * with a sample, a synth or a sampled instrument (D94; Clip tracks play samples only). The mode
 * stays where the new sound has it (D93).
 */
export function SoundPicker({ track, close }: { track: Track; close: () => void }) {
  const samples = useLibrary((s) => s.samples);
  const [query, setQuery] = useState("");
  const clip = track.mode === "clip";
  const [family, setFamily] = useState<SoundFamily>(
    track.sound ? soundFamily(track.sound) : track.mode === "notes" ? "synth" : "sample",
  );
  // the sample it plays (for the library and editor buttons)
  const sample = sampleOf(track);
  const src = track.sound;
  const current = !src || src.source === "sample" ? src?.sampleId : `${src.source}:${src.preset}`;

  const sounds = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (s: Choice) => !q || `${s.name} ${s.group}`.toLowerCase().includes(q);
    if (!clip && family === "synth")
      return SYNTH_PRESETS.map((p) => ({
        id: `synth:${p.id}`,
        name: p.name,
        group: p.group,
        kind: "synth" as const,
      })).filter(match);
    if (!clip && family === "instrument")
      return SAMPLED_INSTRUMENTS.map((p) => ({
        id: `smplr:${p.id}`,
        name: p.name,
        group: p.family === p.group ? p.family : `${p.family} · ${p.group}`,
        kind: "instrument" as const,
      })).filter(match);
    const own: Choice[] = [...samples]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((s): Choice => ({
        id: s.id,
        name: s.name,
        group: "Library",
        kind: s.bpm ? "loop" : "oneshot",
      }));
    // Clip tracks play loops; Hits and Notes the kits
    const builtIn: Choice[] = clip
      ? KIT_SOUNDS.filter((k) => k.bpm).map((k): Choice => ({
          id: k.id,
          name: k.name,
          group: "Loops",
          kind: "loop",
        }))
      : KITS.flatMap((kit) =>
          kitSounds(kit).map((k): Choice => ({
            id: k.id,
            name: k.name,
            group: `${kit} kit`,
            kind: "oneshot",
          })),
        );
    return [...own, ...builtIn].filter(match);
  }, [samples, clip, query, family]);

  const pick = (id: string) => {
    if (id !== current) {
      const [prefix, preset] = id.split(/:(.*)/);
      if (family !== "sample" && (prefix === "synth" || prefix === "smplr"))
        setSound(track.id, { source: prefix, preset });
      else replaceSound(track.id, id);
    }
    close();
  };

  return (
    <div className="flex w-[280px] flex-col gap-1.5 px-2 py-1.5" data-testid="sound-picker">
      <div className="label">Sound</div>
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-[12px]" data-testid="current-sound">
          {soundLabel(track) || "None"}
        </span>
        {sample && !isBuiltIn(sample) && (
          <>
            <button
              className="tool-btn !h-6 !w-6 !p-0"
              title="Show in library"
              data-hint="dm.sound.show"
              onClick={() => {
                useLibrary.getState().set({ selectedId: sample });
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
                openSampleEditor(sample);
                close();
              }}
            >
              <AudioWaveform size={13} />
            </button>
          </>
        )}
      </div>
      {!clip && (
        <div className="segmented self-start" data-hint="dm.sound.kind" data-testid="sound-kind">
          {FAMILIES.map(([f, label]) => (
            <button key={f} data-active={family === f} onClick={() => setFamily(f)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <label className="field" data-hint="dm.sound.search">
        <Search size={12} className="text-dim" />
        <input
          autoFocus
          className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-faint"
          placeholder={family !== "sample" ? "Find…" : "Replace with…"}
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
              className="flex w-full items-center gap-1.5 rounded px-1.5 py-[3px] text-left text-[12px] hover:bg-surface data-[active=true]:text-accent"
              data-active={s.id === current}
              data-sound={s.id}
              onClick={() => pick(s.id)}
            >
              <span className="text-faint">
                <SoundIcon kind={s.kind} size={11} />
              </span>
              <span className="truncate">{s.name}</span>
            </button>
          </div>
        ))}
        {!sounds.length && <div className="px-1.5 py-2 text-[11px] text-faint">Nothing found</div>}
      </div>
    </div>
  );
}
