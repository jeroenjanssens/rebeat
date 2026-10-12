/**
 * Web MIDI input: pads and notes play tracks (and record when recording), controllers drive
 * learned mappings (this project's, then your global ones, D121), Mackie Control inputs run the
 * transport (D123). Controller drivers (Launchpad, Push) hook in with `onMidiMessage`. The logic
 * without the browser is in `midi/mapping.ts`.
 */
import { create } from "zustand";
import { releaseCommand, runCommand } from "../app/commands";
import { toast } from "../components/Toast";
import { trigger } from "../engine/engine";
import { uid } from "../model/id";
import type { MidiMapping, MidiMode } from "../model/project";
import { platform } from "../platform";
import {
  chordPadDown,
  chordPadUp,
  keyDialPress,
  keyDialTurn,
  setBassOctaves,
  setChordVoicing,
  keysControl,
  keysSustain,
  keysTakeNotes,
  keysTargetName,
  noteOn,
} from "../state/keys";
import { CHORD_PADS, VOICING_RANGE } from "../model/padChords";
import { padInput } from "../state/input";
import { useSettings } from "../state/settings";
import { useStore } from "../state/store";
import { setPerfControl } from "../engine/perf";
import { setSynthParam } from "../library/synthTrack";
import { fromKnob, paramOf } from "../model/patchParams";
import { soundDefs } from "../library/synthTrack";
import {
  detectMode,
  walksLikeAbsolute,
  knobZone,
  notchSteps,
  findMapping,
  pickedUp,
  readTarget,
  relativeDelta,
  resolveTarget,
  routeNote,
  withMapping,
  type TargetContext,
} from "../midi/mapping";
import {
  correctedSlots,
  detectController,
  mapById,
  missingSlots,
  slotKind,
  SHIFT_PADS,
} from "../midi/controllers";
import { emitControllerEvent, type ControlKind } from "../midi/controllerEvents";
import { browsePlayable } from "../library/playable";

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
  /** Structured event kind, when this came from a controller slot. */
  eventKind?: ControlKind;
  /** 0-based event index within that kind. */
  eventIndex?: number;
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

// ---------- D129: duplicate message filter ----------
// The MiniLab 3 sends on its MIDI port AND its MCU port simultaneously; ignore the second
// copy of an identical CC that arrives within 10 ms from a "sibling" port of the same device.
const lastMsgKey = new Map<string, { device: string; time: number }>();

/** Strip common port-name suffixes to compare device families. */
const deviceFamily = (name: string) =>
  name
    .replace(/\s+(midi|mcu|daw|port\s*\d+|in\d?|out\d?)\s*$/i, "")
    .toLowerCase()
    .trim();

function isDuplicate(m: MidiMessage): boolean {
  if (m.type !== "cc" && m.type !== "noteon" && m.type !== "noteoff") return false;
  const key = `${m.type}:${m.channel}:${m.number}:${m.value}`;
  const now = Date.now();
  const prev = lastMsgKey.get(key);
  lastMsgKey.set(key, { device: m.device, time: now });
  if (
    prev &&
    now - prev.time < 10 &&
    prev.device !== m.device &&
    deviceFamily(prev.device) === deviceFamily(m.device)
  ) {
    return true;
  }
  return false;
}

// ---------- D129: shift modifier tracking ----------
// Per-device shift state (e.g. MiniLab 3's Shift button CC 9).
const shiftHeld = new Map<string, boolean>();

function isShiftHeld(device: string): boolean {
  return shiftHeld.get(device) ?? false;
}

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
  // D129: clear old handlers before requesting new access, so messages aren't handled twice
  if (access) {
    for (const input of access.inputs.values()) input.onmidimessage = null;
  }
  access = await platform.midi.request(sysex);
  sysexGranted ||= sysex && !!access;
  if (!access) {
    useMidi.setState({ status: "denied" });
    return false;
  }
  useMidi.setState({ status: "on" });
  access.onstatechange = refreshPorts;

  // D129: reset any fader mappings that were mistakenly sniffed as relative
  const s = useSettings.getState();
  const map = mapById(s.midiController);
  // and correct the numbers the map has fixed since (the MiniLab 3's encoder: CC 28 → 114)
  const fixed = (map ? correctedSlots(map, s.midiMappings) : s.midiMappings).map((m) => {
    if (m.slot && slotKind(m.slot) === "fader" && m.mode !== "absolute") {
      return { ...m, mode: "absolute" as MidiMode };
    }
    return m;
  });
  // and add the slots the map gained since you picked it (the MiniLab 3's encoder)
  const added = map ? missingSlots(map, fixed, (p) => `${p}-${crypto.randomUUID()}`) : [];
  if (added.length || fixed.some((m, i) => m !== s.midiMappings[i])) {
    s.set({ midiMappings: [...fixed, ...added] });
  }

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

let lastReported: MidiMessage | null = null;

function report(
  m: MidiMessage,
  action: string,
  ev?: {
    kind: ControlKind;
    index: number;
    slot?: string;
    value?: number;
    down?: boolean;
    target?: string;
    targetValue?: number;
    turn?: number;
  },
) {
  const entry: MonitorEntry = {
    time: Date.now(),
    device: m.device,
    text: describe(m),
    action,
    ...(ev ? { eventKind: ev.kind, eventIndex: ev.index } : {}),
  };
  useMidi.setState((s) => ({ monitor: [entry, ...s.monitor].slice(0, 20) }));
  lastReported = m;
  if (ev) {
    emitControllerEvent({
      device: m.device,
      control: { kind: ev.kind, index: ev.index, ...(ev.slot ? { slot: ev.slot } : {}) },
      value: ev.value ?? m.value,
      ...(ev.down !== undefined ? { down: ev.down } : {}),
      ...(ev.target ? { target: ev.target } : {}),
      ...(ev.targetValue !== undefined ? { targetValue: ev.targetValue } : {}),
      ...(ev.turn !== undefined ? { turn: ev.turn } : {}),
      action,
    });
  }
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

// ---------- D129: per-mapping gesture timestamps for sniffing ----------
// Each entry stores the last few values and when they arrived.
interface SeenEntry {
  values: number[];
  times: number[];
}
const lastInSeen = new Map<string, SeenEntry>();
const lastSet = new Map<string, number>();

// D129: track last selected track id per global mapping for pickup reset
const lastSelectedForPickup = new Map<string, string>();

function handle(e: MIDIMessageEvent, device: string) {
  const m = parse(e, device);
  if (m.type === "other") return;

  // D129: drop duplicate from sibling port of the same device within 10 ms
  if (isDuplicate(m)) return;

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
    if (found) {
      const action = applyMapping(found.mapping, m, found.scope);
      // applyMapping reports what it did with the control's event; the rest is reported here
      if (lastReported !== m) report(m, action);
      return;
    }
  }

  if (m.type === "noteon") {
    const done = shiftPad(m);
    if (done) return report(m, done, noteEvent(m, true));
    return report(m, playNote(m.channel, m.number, m.value / 127), noteEvent(m, true));
  }
  if (m.type === "noteoff") {
    if (shiftPadsHeld.delete(`${m.device}:${m.channel}:${m.number}`))
      return report(m, "Shift + pad released", noteEvent(m, false));
    if (releaseChordPad(m.channel, m.number))
      return report(m, "Chord pad released", noteEvent(m, false));
    releaseNote(m.number);
    return report(m, "Note released", noteEvent(m, false));
  }
  if (m.type === "pitchbend") {
    // 14 bits, 8192 in the middle
    const raw = (m.data[2] << 7) | m.data[1];
    synthControl("pitchbend", Math.max(-1, Math.min(1, (raw - 8192) / 8191)));
    return report(m, "Pitch bend of the selected track", {
      kind: "strip",
      index: 0,
      value: Math.round(m.value),
    });
  }
  if (m.type === "aftertouch") {
    synthControl("aftertouch", m.value / 127);
    return report(m, "Aftertouch of the selected track");
  }
  if (m.type === "cc" && m.number === 1) {
    synthControl("modwheel", m.value / 127);
    return report(m, "Mod wheel of the selected track", {
      kind: "strip",
      index: 1,
      value: m.value,
    });
  }
  if (m.type === "cc" && m.number === 64) {
    sustainPedal(m.value >= 64);
    return report(m, m.value >= 64 ? "Sustain down" : "Sustain up");
  }
  report(m, "Nothing (not mapped: right-click a knob → MIDI learn)");
}

/** A key or a pad (notes on the pads' channel), for the controller events. */
function noteEvent(m: MidiMessage, down: boolean) {
  const pads = useSettings.getState().midiPadsChannel;
  const onPads = m.number >= 36 && (pads === "any" || pads === m.channel);
  return onPads
    ? { kind: "pad" as const, index: m.number - 36, value: down ? m.value : 0, down }
    : { kind: "key" as const, index: m.number, value: down ? m.value : 0, down };
}

export const targetContext = (): TargetContext => {
  const s = useStore.getState();
  return {
    project: s.project,
    selectedTrackId: s.selectedTrackId,
    soundIds: (t) => soundDefs(t).map((d) => d.id),
  };
};

/** Apply a mapping to a message; returns what it did (for the monitor). */
function applyMapping(map: MidiMapping, m: MidiMessage, scope: "project" | "global"): string {
  // where the knob was, in any pad mode: turning it in Drum mode doesn't make a jump later (D141)
  const before = m.type === "cc" ? lastValue.get(map.id) : undefined;
  if (m.type === "cc") lastValue.set(map.id, m.value);
  // Chord and Key mode (D140): knob 1 is the chord voicing, knob 5 the bass, a step per notch
  if (
    (map.slot === "knob1" || map.slot === "knob5") &&
    m.type === "cc" &&
    useSettings.getState().padMode !== "drum"
  ) {
    const voicing = map.slot === "knob1";
    // as zones, left to right: voicing −8..+8, the bass −3, −2, −1, Off
    const settings = useSettings.getState();
    const n = voicing ? 2 * VOICING_RANGE + 1 : 4;
    const current = voicing ? settings.chordVoicing + VOICING_RANGE : 3 - settings.bassOctaves;
    const mode = knobMode(map, m.value);
    const zone = steppedKnob(map, mode, m.value, before, n, current);
    if (zone !== current) {
      if (voicing) setChordVoicing(zone - VOICING_RANGE);
      else setBassOctaves((3 - zone) as 0 | 1 | 2 | 3);
    }
    const s = useSettings.getState();
    const action = voicing
      ? `${map.label}: chord voicing ${s.chordVoicing > 0 ? "+" : ""}${s.chordVoicing}`
      : `${map.label}: bass ${s.bassOctaves ? `−${s.bassOctaves}` : "off"}`;
    report(m, action, {
      ...slotEventFromMapping(map),
      value: m.value,
      target: voicing ? "keys:voicing" : "keys:bass",
      ...(mode !== "absolute" ? { turn: relativeDelta(mode, m.value) } : {}),
      // where the knob's needle points: the voicing in its range, the bass (Off at the right)
      targetValue: voicing
        ? (s.chordVoicing + VOICING_RANGE) / (2 * VOICING_RANGE)
        : (3 - s.bassOctaves) / 3,
    });
    return action;
  }

  const target = resolveTarget(map.target, targetContext());
  if (!target) return `${map.label}: nothing to control (select a track)`;
  const where = scope === "global" ? " (everywhere)" : "";

  // modifier:shift — track held state per device, don't apply to any parameter
  if (target === "modifier:shift") {
    const held = m.type === "noteon" || (m.type === "cc" && m.value >= 64);
    shiftHeld.set(m.device, held);
    report(m, `${map.label}: shift ${held ? "held" : "released"}`, {
      kind: "button",
      index: 0,
      slot: map.slot,
      value: m.value,
      down: held,
    });
    return `${map.label}: shift ${held ? "held" : "released"}`;
  }

  // browse:sound / browse:section — library encoder (WS-E implements browsePlayable)
  if (target === "browse:sound" || target === "browse:section") {
    if (m.type === "noteoff") return `${map.label}: released`;
    const bySection = target === "browse:section" || isShiftHeld(m.device);
    const mode = map.mode ?? "absolute";
    const now = Date.now();
    const prevSeen = lastInSeen.get(map.id) ?? { values: [], times: [] };
    const recent =
      prevSeen.times.length > 0 && now - prevSeen.times[prevSeen.times.length - 1] > 250
        ? { values: [m.value], times: [now] }
        : {
            values: [...prevSeen.values, m.value].slice(-6),
            times: [...prevSeen.times, now].slice(-6),
          };
    lastInSeen.set(map.id, recent);
    const delta =
      mode === "absolute"
        ? recent.values.length > 1
          ? m.value - recent.values[recent.values.length - 2]
          : 0
        : relativeDelta(mode, m.value);
    // Key mode (D138): the encoder is the Key dial (the root; Shift: the scale; pressed: transpose)
    if (useSettings.getState().padMode === "key") {
      if (delta !== 0) keyDialTurn(Math.sign(delta), bySection);
      const action = `${map.label}: Key dial`;
      report(m, action, { kind: "encoder", index: 0, slot: map.slot, value: m.value, turn: delta });
      return action;
    }
    // one sound per message, as Arturia's own scripts do (fast turns send bigger steps)
    if (delta !== 0) browsePlayable(Math.sign(delta), bySection);
    const action = `${map.label}: browse ${bySection ? "section" : "sound"}`;
    report(m, action, { kind: "encoder", index: 0, slot: map.slot, value: m.value, turn: delta });
    return action;
  }

  const slotEv = slotEventFromMapping(map);

  // Key mode (D138): the encoder's click is the Key dial's press (a click selects, press and turn
  // transposes), so it doesn't add a track
  if (map.slot === "encoder-click" && useSettings.getState().padMode === "key") {
    const down = m.type === "noteon" || (m.type === "cc" && m.value >= 64);
    keyDialPress(down);
    const action = `${map.label}: Key dial ${down ? "pressed" : "released"}`;
    report(m, action, { ...slotEv, value: m.value, down });
    return action;
  }

  if (target.startsWith("command:")) {
    const id = target.slice(8);
    const down = m.type === "noteon" || (m.type === "cc" && m.value >= 64);
    const prevSeen = lastInSeen.get(map.id) ?? { values: [], times: [] };
    const prevDown = prevSeen.values[prevSeen.values.length - 1];
    const now = Date.now();
    lastInSeen.set(map.id, {
      values: [...prevSeen.values, down ? 1 : 0].slice(-6),
      times: [...prevSeen.times, now].slice(-6),
    });
    if (down && prevDown !== 1) runCommand(id);
    else if (!down && prevDown === 1) releaseCommand(id);
    const action = `${map.label}${where}`;
    report(m, action, { ...slotEv, value: m.value, down, target });
    return action;
  }

  if (m.type === "noteoff") return `${map.label}: released`;
  if (m.type === "noteon") {
    applyTarget(target, m.value / 127, false);
    const action = `${map.label}${where}`;
    report(m, action, {
      ...slotEv,
      value: m.value,
      down: true,
      target,
      targetValue: m.value / 127,
    });
    return action;
  }

  // a CC: absolute, or a relative encoder (D120)
  // D129: another selected track means another value to pick up (selected:* roles)
  if (map.target.startsWith("selected:")) {
    const selected = useStore.getState().selectedTrackId ?? "";
    const before = lastSelectedForPickup.get(map.id);
    lastSelectedForPickup.set(map.id, selected);
    if (before !== undefined && before !== selected) lastInSeen.delete(map.id);
  }
  const mode = knobMode(map, m.value);

  const current =
    pending.get(target) ?? readTarget(target, useStore.getState().project) ?? lastSet.get(target);
  const settings = useSettings.getState();
  let v: number;
  if (mode === "absolute") {
    v = m.value / 127;
    if (settings.midiPickup && current !== undefined && current !== null) {
      const seenValues = lastInSeen.get(map.id)?.values ?? [];
      const prev = seenValues.length > 1 ? seenValues[seenValues.length - 2] / 127 : undefined;
      if (!pickedUp(prev, v, current)) return `${map.label}: waiting to pick up`;
    }
  } else {
    const step = (relativeDelta(mode, m.value) * settings.midiSensitivity) / 127;
    v = Math.max(0, Math.min(1, (current ?? 0.5) + step));
  }
  lastSet.set(target, v);
  applySoon(target, v);
  const action = `${map.label}${where} = ${Math.round(v * 100)}%`;
  report(m, action, {
    ...slotEv,
    value: m.value,
    target,
    targetValue: v,
    ...(mode !== "absolute" ? { turn: relativeDelta(mode, m.value) } : {}),
  });
  return action;
}

/** Every mapping's last CC value, in any pad mode (D141). */
const lastValue = new Map<string, number>();
/**
 * How a mapping's CC is read now (D120, D129, D141): its saved mode, or a better guess from
 * this gesture's values (within 250 ms of each other), saved for next time. Only knobs and
 * encoders are guessed; faders stay absolute. A knob taken for relative that walks like an
 * absolute one switches back.
 */
function knobMode(map: MidiMapping, value: number): MidiMode {
  const now = Date.now();
  const prev = lastInSeen.get(map.id) ?? { values: [], times: [] };
  const recent =
    prev.times.length > 0 && now - prev.times[prev.times.length - 1] > 250
      ? { values: [value], times: [now] }
      : { values: [...prev.values, value].slice(-6), times: [...prev.times, now].slice(-6) };
  lastInSeen.set(map.id, recent);
  const seen = recent.values;
  let mode = map.mode ?? "absolute";
  const kind = slotKind(map.slot ?? "");
  if (kind !== "knob" && kind !== "encoder") return mode;
  let next = mode;
  if (mode === "absolute" && seen.length >= 4) {
    // a controller map guessed absolute, but this knob turns out to be relative
    const sniffed = detectMode(seen);
    if (sniffed && sniffed !== "absolute") next = sniffed;
  } else if (mode !== "absolute" && kind === "knob" && walksLikeAbsolute(seen, mode)) {
    next = "absolute";
  }
  if (next !== mode) {
    mode = next;
    const s = useSettings.getState();
    s.set({ midiMappings: s.midiMappings.map((x) => (x.id === map.id ? { ...x, mode } : x)) });
  }
  return mode;
}

/** A relative stepped knob's leftover steps, and when it last sent (a pause starts afresh). */
const notchAcc = new Map<string, { acc: number; at: number }>();

/** How many relative messages a mapping's knob sends per notch, from its controller map (D146). */
function ticksPerNotch(map: MidiMapping): number {
  const controller = mapById(useSettings.getState().midiController);
  return controller?.slots.find((s) => s.slot === map.slot)?.ticksPerNotch ?? 1;
}

/**
 * Where a knob puts a stepped setting of `n` values now at `current` (D140, D142, D146): an
 * absolute knob picks the zone it points at (with pickup on, once it reaches or passes the
 * current one); a relative knob moves one step per notch.
 */
function steppedKnob(
  map: MidiMapping,
  mode: MidiMode,
  value: number,
  before: number | undefined,
  n: number,
  current: number,
): number {
  if (mode !== "absolute") {
    const now = Date.now();
    const prev = notchAcc.get(map.id);
    const acc = prev && now - prev.at < 400 ? prev.acc : 0;
    const r = notchSteps(acc, Math.sign(relativeDelta(mode, value)), ticksPerNotch(map));
    notchAcc.set(map.id, { acc: r.acc, at: now });
    return Math.max(0, Math.min(n - 1, current + r.steps));
  }
  const zone = knobZone(value, n);
  if (!useSettings.getState().midiPickup) return zone;
  const from = before === undefined ? zone : knobZone(before, n);
  return (from - current) * (zone - current) <= 0 ? zone : current;
}

/** Derive controller event kind+index from a mapping's slot id. */
function slotEventFromMapping(map: MidiMapping): {
  kind: ControlKind;
  index: number;
  slot?: string;
} {
  const slot = map.slot ?? "";
  const k = slotKind(slot);
  const numStr = slot.replace(/^[^0-9]+/, "");
  const n = parseInt(numStr, 10);
  const index = isNaN(n) ? 0 : n - 1;
  return { kind: k, index: index < 0 ? 0 : index, ...(slot ? { slot } : {}) };
}

/** The known controller among the connected inputs (to offer its map, D124). */
export function connectedController() {
  return detectController(useMidi.getState().inputs.map((p) => p.name));
}

/** Notes held on a MIDI keyboard: they sound until the key goes up. */
const held = new Map<number, () => void>();

/** Chord pads held on a controller ("channel:note" → pad index), D137. */
const chordPadsHeld = new Map<string, number>();

function releaseChordPad(channel: number, note: number): boolean {
  const pad = chordPadsHeld.get(`${channel}:${note}`);
  if (pad === undefined) return false;
  chordPadsHeld.delete(`${channel}:${note}`);
  chordPadUp(pad);
  return true;
}

function releaseNote(note: number) {
  const release = held.get(note);
  held.delete(note);
  if (release) release();
}

/** Notes on the pads' channel play step tracks by position (36 = track 1, D119); others play
 * the keys' target track (or tracks by position when none is selected, D119). */
/** Pads pressed with Shift held, so their release doesn't play anything either. */
const shiftPadsHeld = new Set<string>();

/**
 * Shift + pads 4–8 (the MiniLab 3's loop, stop, play, record and tap): a pad's note while Shift
 * is held runs its command instead of playing (in DAW mode the device sends CCs for these, which
 * the map has as slots). Null when it isn't one.
 */
function shiftPad(m: MidiMessage): string | null {
  if (!isShiftHeld(m.device)) return null;
  const pads = useSettings.getState().midiPadsChannel;
  const index = m.number - 36;
  if (!(pads === "any" || pads === m.channel) || index < 3 || index > 7) return null;
  const [name, command] = SHIFT_PADS[index - 3];
  runCommand(command);
  shiftPadsHeld.add(`${m.device}:${m.channel}:${m.number}`);
  return `Shift + Pad ${index + 1}: ${name}`;
}

function playNote(channel: number, note: number, velocity: number): string {
  const s = useStore.getState();
  const route = routeNote(channel, note, useSettings.getState().midiPadsChannel, keysTakeNotes());

  if (!route) return "Nothing (below the pads' notes)";
  if (route.to === "notes") {
    // route to the keys' target (selected/locked track or library sound)
    const targetName = keysTargetName();
    releaseNote(note);
    // noteOn handles scale lock, chord mode, live voice, recording and sustain
    held.set(note, noteOn(note, velocity, "midi"));
    return `Played on ${targetName}`;
  }
  // Chord and Key mode (D137, D138): pads 1–8 are the chord pads; the others still play tracks
  if (route.to === "pad" && route.index < 8 && useSettings.getState().padMode !== "drum") {
    chordPadDown(route.index);
    chordPadsHeld.set(`${channel}:${note}`, route.index);
    return `Chord pad: ${CHORD_PADS[route.index]}`;
  }
  const track = route.to === "pad" ? s.project.tracks[route.index] : undefined;
  if (!track) return `Pad ${note - 35}: no track ${note - 35}`;
  if (track.mode === "clip" || track.mute)
    return `Pad: ${track.name} is ${track.mute ? "muted" : "a Clip track"}`;
  trigger(track, velocity, { stepDur: 0.12 });
  padInput(track, velocity);
  return `Pad: ${track.name}`;
}

/** Mod wheel, aftertouch and pitch bend go to the keys' voice. */
function synthControl(name: "modwheel" | "aftertouch" | "pitchbend", value: number) {
  keysControl(name, value);
}

/** The sustain pedal: delegated to the keys module so it works with all note sources. */
function sustainPedal(down: boolean) {
  keysSustain(down);
}

/**
 * A fader or knob sends up to a few hundred messages a second; every commit re-renders what
 * shows the target (for a track: its row, the Inspector, the synth editor). So continuous
 * values are applied at most once per frame (about 60 a second), the newest one winning; the
 * controller events (the Controller panel) still see every message.
 */
const pending = new Map<string, number>();
let flushTimer = 0;

function applySoon(target: string, v: number) {
  pending.set(target, v);
  if (flushTimer) return;
  // a timer, not requestAnimationFrame: it also runs while the window is in the background
  flushTimer = window.setTimeout(() => {
    flushTimer = 0;
    const values = [...pending];
    pending.clear();
    for (const [t, x] of values) applyTarget(t, x, true);
  }, 16);
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
