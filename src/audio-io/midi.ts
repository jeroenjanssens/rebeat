/**
 * Web MIDI input: pads and notes play tracks (and record when recording), controllers drive
 * learned mappings. Controller drivers (Launchpad, Push) hook in with `onMidiMessage`.
 */
import { create } from "zustand";
import { runCommand } from "../app/commands";
import { toast } from "../components/Toast";
import { trigger } from "../engine/engine";
import { uid } from "../model/id";
import type { MidiMapping } from "../model/project";
import { platform } from "../platform";
import { padInput, playedNotes } from "../state/input";
import { useSettings } from "../state/settings";
import { useStore } from "../state/store";
import { setPerfControl } from "../engine/perf";

export interface MidiPort {
  id: string;
  name: string;
  enabled: boolean;
}

interface MidiState {
  status: "off" | "asking" | "on" | "unsupported" | "denied";
  inputs: MidiPort[];
  outputs: MidiPort[];
  learning: { target: string; label: string } | null;
  last: string;
}

export const useMidi = create<MidiState>()(() => ({
  status: platform.midi.supported ? "off" : "unsupported",
  inputs: [],
  outputs: [],
  learning: null,
  last: "",
}));

export interface MidiMessage {
  type: "noteon" | "noteoff" | "cc" | "other";
  channel: number;
  number: number;
  value: number; // 0..127
  device: string;
  data: Uint8Array;
}

type Hook = (m: MidiMessage) => boolean;
const hooks: Hook[] = [];
let access: MIDIAccess | null = null;

/** Handle raw MIDI before the default behavior; return true when used. */
export function onMidiMessage(fn: Hook): () => void {
  hooks.push(fn);
  return () => {
    hooks.splice(hooks.indexOf(fn), 1);
  };
}

export function midiOutputs(): MIDIOutput[] {
  return access ? [...access.outputs.values()] : [];
}

export function midiInputs(): MIDIInput[] {
  return access ? [...access.inputs.values()] : [];
}

const enabled = (id: string) => useSettings.getState().midiInputs[id] !== false;

function refreshPorts() {
  if (!access) return;
  useMidi.setState({
    inputs: [...access.inputs.values()].map((p) => ({
      id: p.id,
      name: p.name ?? "MIDI input",
      enabled: enabled(p.id),
    })),
    outputs: [...access.outputs.values()].map((p) => ({
      id: p.id,
      name: p.name ?? "MIDI output",
      enabled: true,
    })),
  });
  for (const input of access.inputs.values())
    input.onmidimessage = enabled(input.id) ? (e) => handle(e, input.name ?? "") : null;
}

export async function startMidi(): Promise<boolean> {
  if (access) return true;
  if (!platform.midi.supported) return false;
  useMidi.setState({ status: "asking" });
  access = await platform.midi.request();
  if (!access) {
    useMidi.setState({ status: "denied" });
    return false;
  }
  useMidi.setState({ status: "on" });
  access.onstatechange = refreshPorts;
  refreshPorts();
  return true;
}

export function setInputEnabled(id: string, on: boolean) {
  const s = useSettings.getState();
  s.set({ midiInputs: { ...s.midiInputs, [id]: on } });
  refreshPorts();
}

export function startLearn(target: string, label: string) {
  void startMidi().then((ok) => {
    if (!ok) return toast("Web MIDI isn't available in this browser", "error");
    useMidi.setState({ learning: { target, label } });
    toast(`MIDI learn: move a control for ${label} (Esc to cancel)`);
  });
}

export function cancelLearn() {
  useMidi.setState({ learning: null });
}

function parse(e: MIDIMessageEvent, device: string): MidiMessage {
  const d = e.data ?? new Uint8Array();
  const status = d[0] & 0xf0;
  const channel = d[0] & 0x0f;
  const type =
    status === 0x90 && d[2] > 0
      ? "noteon"
      : status === 0x80 || (status === 0x90 && d[2] === 0)
        ? "noteoff"
        : status === 0xb0
          ? "cc"
          : "other";
  return { type, channel, number: d[1] ?? 0, value: d[2] ?? 0, device, data: d };
}

function handle(e: MIDIMessageEvent, device: string) {
  const m = parse(e, device);
  if (m.type === "other") return;
  useMidi.setState({ last: `${m.type} ch${m.channel + 1} #${m.number} = ${m.value}` });
  for (const h of hooks) if (h(m)) return;

  const learn = useMidi.getState().learning;
  if (learn && (m.type === "cc" || m.type === "noteon")) {
    const mapping: MidiMapping = {
      id: uid("midi"),
      type: m.type === "cc" ? "cc" : "note",
      channel: m.channel,
      number: m.number,
      device,
      target: learn.target,
      label: learn.label,
    };
    useStore.getState().commit((p) => {
      p.midiMappings = p.midiMappings.filter(
        (x) =>
          x.target !== learn.target &&
          !(x.type === mapping.type && x.channel === m.channel && x.number === m.number),
      );
      p.midiMappings.push(mapping);
    });
    useMidi.setState({ learning: null });
    toast(
      `${learn.label} ← ${mapping.type === "cc" ? "CC" : "note"} ${m.number} (channel ${m.channel + 1})`,
    );
    return;
  }

  const kind = m.type === "cc" ? "cc" : "note";
  const map = useStore
    .getState()
    .project.midiMappings.find(
      (x) =>
        x.type === kind &&
        x.channel === m.channel &&
        x.number === m.number &&
        (!x.device || x.device === device),
    );
  if (map) {
    if (m.type === "noteoff") return;
    applyTarget(map.target, m.value / 127, m.type === "cc");
    return;
  }
  if (m.type === "noteon") playNote(m.number, m.value / 127);
}

/** Notes play the selected instrument track; on drum tracks 36… = pads 1… (MPC/Push layout). */
function playNote(note: number, velocity: number) {
  const s = useStore.getState();
  const selected = s.project.tracks.find((t) => t.id === s.selectedTrackId);
  if (selected?.kind === "instrument") {
    const notes = playedNotes(note);
    trigger(selected, velocity, {
      notes: notes.map((pitch) => ({ pitch, length: 2, velocity })),
      stepDur: 0.15,
    });
    padInput(selected, velocity, notes);
    return;
  }
  const track = s.project.tracks[note - 36];
  if (!track || track.kind === "audio" || track.mute) return;
  trigger(track, velocity, { stepDur: 0.12 });
  padInput(track, velocity);
}

/** Set a mapped parameter from a 0..1 value (continuous) or fire it (buttons). */
export function applyTarget(target: string, v: number, continuous: boolean) {
  const [kind, id, ...rest] = target.split(":");
  const key = rest.join(":");
  const commit = useStore.getState().commit;
  if (kind === "command") return void (v > 0 && runCommand(id + (key ? `:${key}` : "")));
  if (kind === "perf") return setPerfControl(id, v, continuous);
  commit((p) => {
    if (kind === "master" && id === "volume") p.master.volume = v;
    else if (kind === "bus") {
      const b = p.buses.find((x) => x.id === id);
      if (b) b.volume = v;
    } else if (kind === "track") {
      const t = p.tracks.find((x) => x.id === id);
      if (!t) return;
      if (key === "volume") t.volume = v;
      else if (key.startsWith("fx:")) {
        const [, fxId, param] = key.split(":");
        const fx = t.effects.find((f) => f.id === fxId);
        if (fx) fx.params[param] = v;
      } else t.params[key] = v;
    }
  }, `midi-${target}`);
}

window.addEventListener(
  "keydown",
  (e) => e.key === "Escape" && useMidi.getState().learning && cancelLearn(),
);
