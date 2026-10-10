import { useEffect, useRef, useState } from "react";
import { connectControllers, useControllers } from "../audio-io/controllers/controllers";
import { cancelLearn, isMackie, setInputEnabled, startMidi, useMidi } from "../audio-io/midi";
import { toast } from "../components/Toast";
import {
  CONTROLLER_MAPS,
  detectController,
  mapById,
  mappingsOf,
  type ControllerMap,
} from "../midi/controllers";
import { startMidiLearn } from "../midi/learn";
import type { PadsChannel } from "../midi/mapping";
import type { MidiMapping, MidiMode } from "../model/project";
import { platform } from "../platform";
import { useSettings } from "../state/settings";
import { useStore } from "../state/store";

const MODES: { id: MidiMode; label: string }[] = [
  { id: "absolute", label: "Absolute" },
  { id: "rel64", label: "Relative (64)" },
  { id: "rel2c", label: "Relative (2's compl.)" },
  { id: "relsign", label: "Relative (sign bit)" },
];

const control = (m: Pick<MidiMapping, "type" | "number" | "channel">) =>
  `${m.type === "cc" ? "CC" : "Note"} ${m.number} · ch ${m.channel + 1}`;

/** Choose a controller map: its slots replace the previous map's (your other global mappings,
 * such as learned buttons, stay). */
export function chooseControllerMap(id: string) {
  const s = useSettings.getState();
  const others = s.midiMappings.filter((m) => !m.slot);
  const map = mapById(id);
  s.set({
    midiController: id,
    midiMappings: [
      ...others,
      ...(map ? mappingsOf(map, (p) => `${p}-${crypto.randomUUID()}`) : []),
    ],
    ...(map ? { midiPadsChannel: map.padsChannel } : {}),
  });
}

function ModeSelect({ value, onChange }: { value: MidiMode; onChange: (m: MidiMode) => void }) {
  return (
    <select
      className="input !h-6 !text-[11px]"
      value={value}
      onChange={(e) => onChange(e.target.value as MidiMode)}
      data-hint="app.midi.mode"
      title="How this control sends values: absolute, or a relative encoder"
    >
      {MODES.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}

/** Settings → MIDI: inputs, your controller's map, how notes and knobs behave, mappings in
 * every project and in this one, and a monitor (D119–D125). */
export function MidiSettings() {
  const midi = useMidi();
  const settings = useSettings();
  const mappings = useStore((s) => s.project.midiMappings);
  const controllers = useControllers((s) => s.connected);
  const commit = useStore((s) => s.commit);
  if (!platform.midi.supported)
    return (
      <p className="py-3 text-[12px] text-dim">
        Web MIDI isn't supported in this browser (try Chrome or Edge, or the desktop app).
      </p>
    );
  const detected = detectController(midi.inputs.map((p) => p.name));
  const map = mapById(settings.midiController);
  const global = settings.midiMappings;
  const setGlobal = (fn: (list: MidiMapping[]) => MidiMapping[]) =>
    useSettings.getState().set({ midiMappings: fn(useSettings.getState().midiMappings) });
  const padsValue = String(settings.midiPadsChannel);

  return (
    <div className="flex flex-col gap-4 py-3 text-[12px]" data-testid="midi-settings">
      {midi.status !== "on" ? (
        <div className="flex items-center gap-3">
          <button
            className="hw-btn"
            onClick={async () => {
              if (await startMidi()) useSettings.getState().set({ midiEnabled: true });
            }}
            data-hint="app.midi.enable"
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
          <section>
            <div className="label mb-1">Inputs</div>
            {midi.inputs.length === 0 && (
              <div className="text-faint">No MIDI inputs connected.</div>
            )}
            {midi.inputs.map((p) => {
              const named = /\bMCU\b|mackie/i.test(p.name);
              return (
                <div key={p.id} className="flex items-center gap-3 py-0.5">
                  <label className="flex flex-1 items-center gap-2" data-hint="app.midi.input">
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={(e) => setInputEnabled(p.id, e.target.checked)}
                    />
                    {p.name}
                  </label>
                  <label
                    className="flex items-center gap-1.5 text-[11px] text-dim"
                    data-hint="app.midi.mackie"
                    title="Its transport buttons (Mackie Control) run Rebeat's transport"
                  >
                    <input
                      type="checkbox"
                      checked={isMackie(p.name)}
                      disabled={named}
                      onChange={(e) => {
                        const list = settings.midiMackieInputs.filter((n) => n !== p.name);
                        useSettings
                          .getState()
                          .set({ midiMackieInputs: e.target.checked ? [...list, p.name] : list });
                      }}
                    />
                    Mackie Control
                  </label>
                </div>
              );
            })}
          </section>

          <section data-hint="app.midi.controller">
            <div className="label mb-1">Controller</div>
            {detected && settings.midiController !== detected.id && (
              <div className="mb-2 flex items-center gap-2 rounded border border-line bg-surface px-2 py-1.5">
                <span className="flex-1">
                  {detected.name} is connected. Rebeat has a map for it.
                </span>
                <button
                  className="tool-btn border border-line !text-ink"
                  onClick={() => chooseControllerMap(detected.id)}
                  data-testid="midi-use-detected"
                >
                  Use it
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <select
                className="input !h-7"
                value={settings.midiController}
                onChange={(e) => chooseControllerMap(e.target.value)}
                data-testid="midi-controller"
              >
                <option value="none">None</option>
                {CONTROLLER_MAPS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
                <option value="custom">Custom (learn your own)</option>
              </select>
            </div>
            {map && (
              <div className="mt-2 space-y-2">
                <ul className="list-disc space-y-0.5 pl-5 text-[11px] text-dim">
                  {map.checklist.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                {map.unconfirmed && <p className="text-[11px] text-faint">{map.unconfirmed}</p>}
                <LearnAll map={map} />
                <table className="w-full text-[11px]" data-testid="midi-map-slots">
                  <tbody>
                    {map.slots.map((slot) => {
                      const m = global.find((x) => x.slot === slot.slot);
                      const learning = midi.learning?.slot === slot.slot;
                      return (
                        <tr key={slot.slot} className="border-t border-line">
                          <td className="py-1 pr-2">{slot.label}</td>
                          <td className="num py-1 pr-2 text-dim">
                            {learning ? (
                              <span className="text-accent">Move it…</span>
                            ) : m ? (
                              control(m)
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-1 pr-2">
                            {m && (
                              <ModeSelect
                                value={m.mode ?? "absolute"}
                                onChange={(mode) =>
                                  setGlobal((l) =>
                                    l.map((x) => (x.id === m.id ? { ...x, mode } : x)),
                                  )
                                }
                              />
                            )}
                          </td>
                          <td className="py-1 text-right">
                            <button
                              className="tool-btn !h-5"
                              onClick={() =>
                                startMidiLearn(
                                  slot.target,
                                  `${map.name} · ${slot.label}`,
                                  "global",
                                  slot.slot,
                                )
                              }
                              data-hint="app.midi.learnslot"
                            >
                              Learn
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {settings.midiController === "custom" && (
              <p className="mt-1 text-[11px] text-faint">
                Right-click a knob in the drum machine's encoder strip or a fader in the mixer →
                MIDI learn (every project); buttons learn in the Shortcuts dialog.
              </p>
            )}
          </section>

          <section className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex items-center gap-2" data-hint="app.midi.padschannel">
              <span className="label">Pads channel</span>
              <select
                className="input !h-6 !text-[11px]"
                value={padsValue}
                data-testid="midi-pads-channel"
                onChange={(e) => {
                  const v = e.target.value;
                  const ch: PadsChannel = v === "any" || v === "off" ? v : Number(v);
                  useSettings.getState().set({ midiPadsChannel: ch });
                }}
              >
                {Array.from({ length: 16 }, (_, i) => (
                  <option key={i} value={i}>
                    {i + 1}
                    {i === 9 ? " (drums)" : ""}
                  </option>
                ))}
                <option value="any">Any channel</option>
                <option value="off">Off</option>
              </select>
            </label>
            <label className="flex items-center gap-2" data-hint="app.midi.sensitivity">
              <span className="label">Relative knobs</span>
              <input
                type="range"
                min={0.5}
                max={8}
                step={0.5}
                value={settings.midiSensitivity}
                onChange={(e) =>
                  useSettings.getState().set({ midiSensitivity: Number(e.target.value) })
                }
                className="w-24"
              />
              <span className="num w-8 text-dim">×{settings.midiSensitivity}</span>
            </label>
            <label className="flex items-center gap-1.5" data-hint="app.midi.followstart">
              <input
                type="checkbox"
                checked={settings.midiFollowStart}
                onChange={(e) => useSettings.getState().set({ midiFollowStart: e.target.checked })}
              />
              Follow MIDI Start/Stop
            </label>
            <label className="flex items-center gap-1.5" data-hint="app.midi.pickup">
              <input
                type="checkbox"
                checked={settings.midiPickup}
                onChange={(e) => useSettings.getState().set({ midiPickup: e.target.checked })}
              />
              Pick up absolute knobs and faders
            </label>
          </section>

          <section>
            <div className="label mb-1">Grid controllers</div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="tool-btn border border-line"
                onClick={async () => {
                  const n = await connectControllers();
                  toast(
                    n
                      ? `Connected ${n} controller${n > 1 ? "s" : ""}`
                      : "No Launchpad or Push found",
                  );
                }}
                data-hint="app.midi.connect"
              >
                Connect Launchpad / Push
              </button>
              {controllers.map((c) => (
                <span key={c.id} className="text-dim">
                  {c.name} ✓
                </span>
              ))}
            </div>
          </section>
        </>
      )}

      <MappingList
        title="Mappings in every project"
        hint="app.midi.global"
        testId="midi-global-mappings"
        list={global.filter((m) => !m.slot || settings.midiController === "custom")}
        empty="None yet: choose your controller above, or learn knobs, faders and buttons."
        onMode={(id, mode) => setGlobal((l) => l.map((x) => (x.id === id ? { ...x, mode } : x)))}
        onRemove={(id) => setGlobal((l) => l.filter((x) => x.id !== id))}
      />
      <MappingList
        title="Mappings in this project"
        hint="app.midi.project"
        testId="midi-project-mappings"
        list={mappings}
        empty="None yet. Right-click a knob → MIDI learn."
        onMode={(id, mode) =>
          commit((p) => {
            const m = p.midiMappings.find((x) => x.id === id);
            if (m) m.mode = mode;
          })
        }
        onRemove={(id) =>
          commit((p) => void (p.midiMappings = p.midiMappings.filter((x) => x.id !== id)))
        }
      />

      {midi.status === "on" && (
        <section data-hint="app.midi.monitor">
          <div className="label mb-1">Monitor</div>
          <div
            className="scroll-thin max-h-40 overflow-y-auto rounded border border-line bg-surface p-1.5 font-mono text-[10.5px]"
            data-testid="midi-monitor"
          >
            {midi.monitor.length === 0 && (
              <div className="text-faint">Press a key or turn a knob on your controller.</div>
            )}
            {midi.monitor.map((e, i) => (
              <div key={`${e.time}-${i}`} className="flex gap-2">
                <span className="w-28 shrink-0 truncate text-faint">{e.device}</span>
                <span className="w-44 shrink-0 text-ink">{e.text}</span>
                <span className="truncate text-dim">{e.action}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MappingList(props: {
  title: string;
  hint: string;
  testId: string;
  list: MidiMapping[];
  empty: string;
  onMode: (id: string, mode: MidiMode) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section data-hint={props.hint} data-testid={props.testId}>
      <div className="label mb-1">{props.title}</div>
      {props.list.length === 0 && <div className="text-faint">{props.empty}</div>}
      {props.list.map((m) => (
        <div key={m.id} className="flex items-center gap-2 py-0.5">
          <span className="num w-28 shrink-0 text-dim">{control(m)}</span>
          <span className="flex-1 truncate">{m.label}</span>
          {m.type === "cc" && !m.target.startsWith("command:") && (
            <ModeSelect
              value={m.mode ?? "absolute"}
              onChange={(mode) => props.onMode(m.id, mode)}
            />
          )}
          <button
            className="tool-btn !h-5"
            onClick={() => props.onRemove(m.id)}
            data-hint="app.midi.removemap"
          >
            Remove
          </button>
        </div>
      ))}
    </section>
  );
}

/** Learn every slot of a map in turn ("turn knob 1… now knob 2…"): for controllers that are
 * set up differently from their factory settings, or have none (D124). */
function LearnAll({ map }: { map: ControllerMap }) {
  const [at, setAt] = useState<number | null>(null);
  const learning = useMidi((s) => s.learning);
  const before = useRef<string | undefined>(undefined);
  const slotMapping = (i: number) =>
    useSettings.getState().midiMappings.find((m) => m.slot === map.slots[i].slot)?.id;
  const begin = (i: number) => {
    if (i >= map.slots.length) return setAt(null);
    const slot = map.slots[i];
    before.current = slotMapping(i);
    setAt(i);
    startMidiLearn(slot.target, `${map.name} · ${slot.label}`, "global", slot.slot);
  };
  // when a slot is learned, go on to the next; Esc ends the walk-through
  useEffect(() => {
    if (at === null || learning) return;
    const learned = slotMapping(at) !== before.current;
    const id = window.setTimeout(() => (learned ? begin(at + 1) : setAt(null)), 150);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learning, at]);
  return (
    <div className="flex items-center gap-2" data-hint="app.midi.learnall">
      {at === null ? (
        <button
          className="tool-btn border border-line"
          onClick={() => begin(0)}
          data-testid="midi-learn-all"
        >
          Learn every control
        </button>
      ) : (
        <>
          <span className="text-accent" data-testid="midi-learn-all-step">
            Move {map.slots[at].label.replace(/ \(.*\)$/, "").toLowerCase()} on your controller (
            {at + 1} of {map.slots.length})
          </span>
          <button
            className="tool-btn border border-line"
            onClick={() => {
              cancelLearn();
              begin(at + 1);
            }}
          >
            Skip
          </button>
          <button
            className="tool-btn"
            onClick={() => {
              cancelLearn();
              setAt(null);
            }}
          >
            Stop
          </button>
        </>
      )}
    </div>
  );
}
