/**
 * Web MIDI input: pads and notes play tracks (and record when recording), controllers drive
 * learned mappings (this project's, then your global ones, D121), Mackie Control inputs run the
 * transport (D123). Controller drivers (Launchpad, Push) hook in with `onMidiMessage`. The logic
 * without the browser is in `midi/mapping.ts`.
 */
import { create } from "zustand";
import { releaseCommand, runCommand } from "../app/commands";
import { toast } from "../components/Toast";
import { holdNote, trackSynth, trigger } from "../engine/engine";
import { uid } from "../model/id";
import type { MidiMapping } from "../model/project";
import { platform } from "../platform";
import { padInput, playedNotes } from "../state/input";
import { useSettings } from "../state/settings";
import { useStore } from "../state/store";
import { setPerfControl } from "../engine/perf";
import { setSynthParam } from "../library/synthTrack";
import { fromKnob, paramOf } from "../model/patchParams";
import { soundDefs } from "../library/synthTrack";
import {
  detectMode,
  findMapping,
  pickedUp,
  readTarget,
  relativeDelta,
  resolveTarget,
  routeNote,
  withMapping,
  type TargetContext,
} from "../midi/mapping";
import { detectController } from "../midi/controllers";

export interface MidiPort {
  id: string;
  name: string;
  enabled: boolean;
}

export interface Learning {
  target: string;
  label: string;
  /** Where the mapping is saved: this project, or everywhere (your controller). */
  scope: "project" | "global";
  /** A controller map's slot being learned again. */
  slot?: string;
}

export interface MonitorEntry {
  time: number;
  device: string;
  text: string;
  /** What Rebeat did with it. */
  action: string;
}

interface MidiState {
  status: "off" | "asking" | "on" | "unsupported" | "denied";
  inputs: MidiPort[];
  outputs: MidiPort[];
  learning: Learning | null;
  last: string;
  /** The last 20 messages (D125). */
  monitor: MonitorEntry[];
}

export const useMidi = create<MidiState>()(() => ({
  status: platform.midi.supported ? "off" : "unsupported",
  inputs: [],
  outputs: [],
  learning: null,
  last: "",
  monitor: [],
}));

export interface MidiMessage {
  type: "noteon" | "noteoff" | "cc" | "pitchbend" | "aftertouch" | "start" | "stop" | "other";
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
  const known = detectController([...access.inputs.values()].map((p) => p.name ?? ""));
  if (known && known.id !== offered && useSettings.getState().midiController === "none") {
    offered = known.id;
    toast(`${known.name} connected: Settings → MIDI has a map for it`);
  }
}

/** The controller we told you about (once per session). */
let offered = "";

let sysexGranted = false;

export async function startMidi(sysex = false): Promise<boolean> {
  if (access && (!sysex || sysexGranted)) return true;
  if (!platform.midi.supported) return false;
  useMidi.setState({ status: "asking" });
  access = await platform.midi.request(sysex);
  sysexGranted ||= sysex && !!access;
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

export function startLearn(
  target: string,
  label: string,
  scope: Learning["scope"] = "project",
  slot?: string,
) {
  void startMidi().then((ok) => {
    if (!ok) return toast("Web MIDI isn't available in this browser", "error");
    capture = null;
    useMidi.setState({ learning: { target, label, scope, ...(slot ? { slot } : {}) } });
    toast(`MIDI learn: move a control for ${label} (Esc to cancel)`);
  });
}

export function cancelLearn() {
  if (capture) window.clearTimeout(capture.timer);
  capture = null;
  useMidi.setState({ learning: null });
}

/** While learning a CC: its first messages, to tell absolute from relative (D120). */
let capture: { m: MidiMessage; values: number[]; timer: number } | null = null;

function finishLearn(m: MidiMessage, mode: MidiMapping["mode"]) {
  const learn = useMidi.getState().learning;
  capture = null;
  if (!learn) return;
  const mapping: MidiMapping = {
    // global mappings outlive the session: a random id, not model/id's counter
    id: learn.scope === "global" ? `midi-${crypto.randomUUID()}` : uid("midi"),
    type: m.type === "cc" ? "cc" : "note",
    channel: m.channel,
    number: m.number,
    device: m.device,
    target: learn.target,
    label: learn.label,
    mode: mode ?? "absolute",
    ...(learn.slot ? { slot: learn.slot } : {}),
  };
  if (learn.scope === "global") {
    const s = useSettings.getState();
    s.set({ midiMappings: withMapping(s.midiMappings, mapping) });
  } else
    useStore.getState().commit((p) => {
      p.midiMappings = withMapping(p.midiMappings, mapping);
    });
  useMidi.setState({ learning: null });
  const relative = mapping.mode !== "absolute" ? ", relative" : "";
  toast(
    `${learn.label} ← ${mapping.type === "cc" ? "CC" : "note"} ${m.number} (channel ${m.channel + 1}${relative})`,
  );
}

function learnFrom(m: MidiMessage) {
  if (m.type === "noteon") return finishLearn(m, "absolute");
  if (m.type !== "cc") return;
  // a CC: listen to the same control for a moment, to see how it sends values
  if (!capture) {
    capture = { m, values: [m.value], timer: window.setTimeout(() => done(), 600) };
    return;
  }
  if (capture.m.channel !== m.channel || capture.m.number !== m.number) return;
  capture.values.push(m.value);
  const mode = detectMode(capture.values);
  if (mode && capture.values.length >= 4) done();
  function done() {
    if (!capture) return;
    window.clearTimeout(capture.timer);
    finishLearn(capture.m, detectMode(capture.values) ?? "absolute");
  }
}

function parse(e: MIDIMessageEvent, device: string): MidiMessage {
  const d = e.data ?? new Uint8Array();
  // real-time Start (and Continue) and Stop: a controller's Play/Stop buttons, or another app
  if (d[0] === 0xfa || d[0] === 0xfb)
    return { type: "start", channel: 0, number: 0, value: 0, device, data: d };
  if (d[0] === 0xfc) return { type: "stop", channel: 0, number: 0, value: 0, device, data: d };
  const status = d[0] & 0xf0;
  const channel = d[0] & 0x0f;
  const type =
    status === 0x90 && d[2] > 0
      ? "noteon"
      : status === 0x80 || (status === 0x90 && d[2] === 0)
        ? "noteoff"
        : status === 0xb0
          ? "cc"
          : status === 0xe0
            ? "pitchbend"
            : status === 0xd0 || status === 0xa0
              ? "aftertouch"
              : "other";
  // pitch bend is 14 bits: value is 0..127 with 64 the middle, `data` has the detail
  if (type === "pitchbend")
    return { type, channel, number: 0, value: ((d[2] << 7) | d[1]) / 128, device, data: d };
  // channel pressure has its value in byte 1; polyphonic aftertouch in byte 2
  if (type === "aftertouch")
    return { type, channel, number: 0, value: status === 0xd0 ? d[1] : d[2], device, data: d };
  return { type, channel, number: d[1] ?? 0, value: d[2] ?? 0, device, data: d };
}

function describe(m: MidiMessage) {
  if (m.type === "start") return "MIDI Start";
  if (m.type === "stop") return "MIDI Stop";
  const ch = `ch ${m.channel + 1}`;
  if (m.type === "noteon") return `Note on ${m.number} vel ${m.value} · ${ch}`;
  if (m.type === "noteoff") return `Note off ${m.number} · ${ch}`;
  if (m.type === "cc") return `CC ${m.number} = ${m.value} · ${ch}`;
  if (m.type === "pitchbend") return `Pitch bend ${Math.round(m.value)} · ${ch}`;
  return `Aftertouch ${m.value} · ${ch}`;
}

function report(m: MidiMessage, action: string) {
  const entry = { time: Date.now(), device: m.device, text: describe(m), action };
  useMidi.setState((s) => ({ monitor: [entry, ...s.monitor].slice(0, 20) }));
}

export const isMackie = (device: string) =>
  /\bMCU\b|mackie/i.test(device) || useSettings.getState().midiMackieInputs.includes(device);

/** Mackie Control's transport (D123): notes on channel 1, the jog wheel on CC 60. */
const MACKIE: Record<number, [string, string]> = {
  94: ["transport.play", "Play"],
  93: ["transport.stop", "Stop"],
  95: ["transport.record", "Record"],
  86: ["transport.mode", "Loop/song"],
  91: ["page.previous", "Previous page"],
  92: ["page.next", "Next page"],
};

function mackie(m: MidiMessage): string | null {
  if (m.type === "noteon" && MACKIE[m.number]) {
    runCommand(MACKIE[m.number][0]);
    return `Mackie: ${MACKIE[m.number][1]}`;
  }
  if (m.type === "cc" && m.number === 60) {
    const d = relativeDelta("relsign", m.value);
    if (d) runCommand(d > 0 ? "page.next" : "page.previous");
    return "Mackie: jog wheel";
  }
  return m.type === "noteoff" ? "Mackie" : null;
}

function handle(e: MIDIMessageEvent, device: string) {
  const m = parse(e, device);
  if (m.type === "other") return;
  useMidi.setState({ last: `${m.type} ch${m.channel + 1} #${m.number} = ${m.value}` });
  for (const h of hooks) if (h(m)) return report(m, "Controller driver");

  if (useMidi.getState().learning && (m.type === "cc" || m.type === "noteon")) {
    learnFrom(m);
    return report(m, "MIDI learn");
  }

  if (m.type === "start" || m.type === "stop") {
    if (!useSettings.getState().midiFollowStart)
      return report(m, "Ignored (Follow MIDI Start/Stop is off)");
    runCommand(m.type === "start" ? "transport.play" : "transport.stop");
    return report(m, m.type === "start" ? "Play" : "Stop");
  }

  if (isMackie(device)) {
    const done = mackie(m);
    if (done) return report(m, done);
  }

  if (m.type === "cc" || m.type === "noteon" || m.type === "noteoff") {
    const s = useSettings.getState();
    const found = findMapping(
      { kind: m.type === "cc" ? "cc" : "note", channel: m.channel, number: m.number, device },
      useStore.getState().project.midiMappings,
      s.midiMappings,
    );
    if (found) return report(m, applyMapping(found.mapping, m, found.scope));
  }

  if (m.type === "noteon") return report(m, playNote(m.channel, m.number, m.value / 127));
  if (m.type === "noteoff") {
    releaseNote(m.number);
    return report(m, "Note released");
  }
  if (m.type === "pitchbend") {
    // 14 bits, 8192 in the middle
    const raw = (m.data[2] << 7) | m.data[1];
    synthControl("pitchbend", Math.max(-1, Math.min(1, (raw - 8192) / 8191)));
    return report(m, "Pitch bend of the selected track");
  }
  if (m.type === "aftertouch") {
    synthControl("aftertouch", m.value / 127);
    return report(m, "Aftertouch of the selected track");
  }
  if (m.type === "cc" && m.number === 1) {
    synthControl("modwheel", m.value / 127);
    return report(m, "Mod wheel of the selected track");
  }
  if (m.type === "cc" && m.number === 64) {
    sustainPedal(m.value >= 64);
    return report(m, m.value >= 64 ? "Sustain down" : "Sustain up");
  }
  report(m, "Nothing (not mapped: right-click a knob → MIDI learn)");
}

export const targetContext = (): TargetContext => {
  const s = useStore.getState();
  return {
    project: s.project,
    selectedTrackId: s.selectedTrackId,
    soundIds: (t) => soundDefs(t).map((d) => d.id),
  };
};

/** Values a mapping last saw (pickup, mode sniffing) and set (relative steps on targets that
 * can't be read back). */
const lastIn = new Map<string, number[]>();
const lastSet = new Map<string, number>();

/** Apply a mapping to a message; returns what it did (for the monitor). */
function applyMapping(map: MidiMapping, m: MidiMessage, scope: "project" | "global"): string {
  const target = resolveTarget(map.target, targetContext());
  if (!target) return `${map.label}: nothing to control (select a track)`;
  const where = scope === "global" ? " (everywhere)" : "";
  if (target.startsWith("command:")) {
    const id = target.slice(8);
    const down = m.type === "noteon" || (m.type === "cc" && m.value >= 64);
    const prev = lastIn.get(map.id)?.[0];
    lastIn.set(map.id, [down ? 1 : 0]);
    if (down && prev !== 1) runCommand(id);
    else if (!down && prev === 1) releaseCommand(id);
    return `${map.label}${where}`;
  }
  if (m.type === "noteoff") return `${map.label}: released`;
  if (m.type === "noteon") {
    applyTarget(target, m.value / 127, false);
    return `${map.label}${where}`;
  }
  // a CC: absolute, or a relative encoder (mapping modes, D120)
  const seen = [...(lastIn.get(map.id) ?? []), m.value].slice(-6);
  lastIn.set(map.id, seen);
  let mode = map.mode ?? "absolute";
  if (mode === "absolute" && map.slot && seen.length >= 4) {
    // a controller map guessed absolute, but this knob turns out to be relative: switch
    const sniffed = detectMode(seen);
    if (sniffed && sniffed !== "absolute") {
      mode = sniffed;
      const s = useSettings.getState();
      s.set({ midiMappings: s.midiMappings.map((x) => (x.id === map.id ? { ...x, mode } : x)) });
    }
  }
  const current = readTarget(target, useStore.getState().project) ?? lastSet.get(target);
  const settings = useSettings.getState();
  let v: number;
  if (mode === "absolute") {
    v = m.value / 127;
    if (settings.midiPickup && current !== undefined && current !== null) {
      const prev = seen.length > 1 ? seen[seen.length - 2] / 127 : undefined;
      if (!pickedUp(prev, v, current)) return `${map.label}: waiting to pick up`;
    }
  } else {
    const step = (relativeDelta(mode, m.value) * settings.midiSensitivity) / 127;
    v = Math.max(0, Math.min(1, (current ?? 0.5) + step));
  }
  lastSet.set(target, v);
  applyTarget(target, v, true);
  return `${map.label}${where} = ${Math.round(v * 100)}%`;
}

/** The known controller among the connected inputs (to offer its map, D124). */
export function connectedController() {
  return detectController(useMidi.getState().inputs.map((p) => p.name));
}

/** Mod wheel, aftertouch and pitch bend go to the selected instrument track's synth. */
function synthControl(name: "modwheel" | "aftertouch" | "pitchbend", value: number) {
  const s = useStore.getState();
  const track = s.project.tracks.find((t) => t.id === s.selectedTrackId);
  if (track) trackSynth(track)?.control(name, value);
}

/** The sustain pedal: notes let go while it's down keep sounding until it comes up. */
let sustain = false;
const sustained: (() => void)[] = [];

function sustainPedal(down: boolean) {
  sustain = down;
  if (down) return;
  for (const release of sustained.splice(0)) release();
}

/** Notes held on a MIDI keyboard: they sound until the key goes up. */
const held = new Map<number, (() => void)[]>();

function releaseNote(note: number) {
  const releases = held.get(note) ?? [];
  held.delete(note);
  if (sustain) sustained.push(...releases);
  else for (const release of releases) release();
}

/** Notes on the pads' channel play step tracks by position (36 = track 1, D119); others play
 * the selected Notes track, or tracks by position when none is selected. */
function playNote(channel: number, note: number, velocity: number): string {
  const s = useStore.getState();
  const selected = s.project.tracks.find((t) => t.id === s.selectedTrackId);
  const route = routeNote(
    channel,
    note,
    useSettings.getState().midiPadsChannel,
    selected?.mode === "notes",
  );
  if (!route) return "Nothing (below the pads' notes)";
  if (route.to === "notes" && selected) {
    const notes = playedNotes(note);
    releaseNote(note);
    held.set(
      note,
      notes.map((pitch) => holdNote(selected, pitch, velocity)),
    );
    padInput(selected, velocity, notes);
    return `Played on ${selected.name}`;
  }
  const track = route.to === "pad" ? s.project.tracks[route.index] : undefined;
  if (!track) return `Pad ${note - 35}: no track ${note - 35}`;
  if (track.mode === "clip" || track.mute)
    return `Pad: ${track.name} is ${track.mute ? "muted" : "a Clip track"}`;
  trigger(track, velocity, { stepDur: 0.12 });
  padInput(track, velocity);
  return `Pad: ${track.name}`;
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
      } else if (key.startsWith("synth:")) {
        // a synth editor knob: the controller turns the knob (0..1 along its curve)
        const path = key.slice(6);
        const d = paramOf(path);
        if (d) setSynthParam(t, path, fromKnob(d, v));
      } else t.params[key] = v;
    }
  }, `midi-${target}`);
}

window.addEventListener(
  "keydown",
  (e) => e.key === "Escape" && useMidi.getState().learning && cancelLearn(),
);
