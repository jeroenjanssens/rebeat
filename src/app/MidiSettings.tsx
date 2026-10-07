import { setInputEnabled, startMidi, useMidi } from "../audio-io/midi";
import { platform } from "../platform";
import { useSettings } from "../state/settings";
import { useStore } from "../state/store";

/** Settings → MIDI: enable Web MIDI, choose inputs, see and remove learned mappings. */
export function MidiSettings() {
  const midi = useMidi();
  const mappings = useStore((s) => s.project.midiMappings);
  const commit = useStore((s) => s.commit);
  if (!platform.midi.supported)
    return (
      <p className="py-3 text-[12px] text-dim">
        Web MIDI isn't supported in this browser (try Chrome or Edge).
      </p>
    );
  return (
    <div className="flex flex-col gap-3 py-3 text-[12px]">
      {midi.status !== "on" ? (
        <div className="flex items-center gap-3">
          <button
            className="hw-btn"
            onClick={async () => {
              if (await startMidi()) useSettings.getState().set({ midiEnabled: true });
            }}
          >
            Enable MIDI
          </button>
          <span className="text-dim">
            {midi.status === "denied"
              ? "Access was denied in the browser."
              : "Pads, keyboards and controllers."}
          </span>
        </div>
      ) : (
        <>
          <div>
            <div className="label mb-1">Inputs</div>
            {midi.inputs.length === 0 && (
              <div className="text-faint">No MIDI inputs connected.</div>
            )}
            {midi.inputs.map((p) => (
              <label key={p.id} className="flex items-center gap-2 py-0.5">
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={(e) => setInputEnabled(p.id, e.target.checked)}
                />
                {p.name}
              </label>
            ))}
          </div>
          <div className="num text-[11px] text-faint">Last message: {midi.last || "—"}</div>
          <p className="text-[11px] text-faint">
            Notes play the selected instrument track; on drum tracks, notes 36 and up play pads 1,
            2, 3… Right-click any knob → MIDI learn.
          </p>
        </>
      )}
      <div>
        <div className="label mb-1">Mappings in this project</div>
        {mappings.length === 0 && <div className="text-faint">None yet.</div>}
        {mappings.map((m) => (
          <div key={m.id} className="flex items-center gap-2 py-0.5">
            <span className="num w-28 text-dim">
              {m.type === "cc" ? "CC" : "Note"} {m.number} · ch {m.channel + 1}
            </span>
            <span className="flex-1 truncate">{m.label}</span>
            <button
              className="tool-btn !h-5"
              onClick={() =>
                commit((p) => void (p.midiMappings = p.midiMappings.filter((x) => x.id !== m.id)))
              }
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
