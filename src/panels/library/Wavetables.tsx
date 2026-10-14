/**
 * Your wavetables (D246), under Your sounds: put one on the selected synth's first oscillator,
 * rename or delete it. Tables are made from samples (Make a wavetable…) or files.
 */
import { contextMenu } from "../../components/Menu";
import { toast } from "../../components/Toast";
import { deleteWavetable, renameWavetable, useWavetables } from "../../library/wavetables";
import { editPatch, isSynthTrack } from "../../library/synthTrack";
import { useSelectedTrack, useStore } from "../../state/store";

export function WavetableList() {
  const list = useWavetables((s) => s.list);
  const track = useSelectedTrack();
  if (!list.length) return null;
  const synth = track && isSynthTrack(track) ? track : undefined;
  const putOn = (id: string, name: string) => {
    if (!synth) return toast("Select a track that plays a synth first");
    useStore.getState().commit((pr) => {
      const t = pr.tracks.find((x) => x.id === synth.id);
      if (t)
        editPatch(t, (p) => {
          p.osc[0].type = "wavetable";
          p.osc[0].table = id;
        });
    });
    toast(`${synth.name}'s oscillator 1 plays “${name}”`);
  };
  return (
    <div className="shrink-0 border-t border-line p-1.5" data-testid="library-wavetables">
      <div className="label px-1 pb-1 !text-[9.5px] text-faint" data-hint="library.wavetables">
        Wavetables
      </div>
      {list.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-2 rounded px-1.5 py-0.5 text-[11.5px] hover:bg-surface"
          data-wavetable={t.id}
          onDoubleClick={() => putOn(t.id, t.name)}
          onContextMenu={(e) =>
            contextMenu(e, [
              {
                label: synth ? `Use on ${synth.name}` : "Use on the selected synth",
                disabled: !synth,
                onSelect: () => putOn(t.id, t.name),
              },
              {
                label: "Rename",
                onSelect: () => {
                  const name = window.prompt("Rename the wavetable", t.name)?.trim();
                  if (name) void renameWavetable(t.id, name);
                },
              },
              { separator: true },
              { label: "Delete", onSelect: () => void deleteWavetable(t.id) },
            ])
          }
        >
          <span className="min-w-0 flex-1 truncate">{t.name}</span>
          <span className="text-[10px] text-faint">{t.frames} frames</span>
        </div>
      ))}
    </div>
  );
}
