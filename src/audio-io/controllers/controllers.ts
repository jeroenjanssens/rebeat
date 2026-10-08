/** Connected grid controllers: they mirror the drum machine and edit it from their pads. */
import { create } from "zustand";
import { onStep } from "../../engine/transport";
import * as transport from "../../engine/transport";
import { SOUND_PARAMS } from "../../model/params";
import { soundDefs } from "../../library/synthTrack";
import { slotPattern } from "../../model/project";
import { setStep } from "../../state/actions";
import { useStore } from "../../state/store";
import { midiInputs, midiOutputs, onMidiMessage, startMidi } from "../midi";
import { detectDevice, relative, type ControllerDevice } from "./devices";
import { clampView, gridColors, padTarget, type GridView } from "./grid";

interface Connected {
  device: ControllerDevice;
  input: string;
  output: MIDIOutput;
  view: GridView;
  lastFrame: string;
}

export const useControllers = create<{ connected: { id: string; name: string }[] }>()(() => ({
  connected: [],
}));

const connected: Connected[] = [];
let playStep: number | null = null;
let raf = 0;
let started = false;

function render() {
  raf = 0;
  const s = useStore.getState();
  const pattern = slotPattern(s.project, s.editSlotId);
  const showHead = s.playing && s.playSlotId === s.editSlotId ? playStep : null;
  for (const c of connected) {
    c.view = clampView(s.project, pattern, c.view);
    const colors = gridColors(s.project, pattern, c.view, showHead);
    const key = JSON.stringify(colors);
    if (key === c.lastFrame) continue;
    c.lastFrame = key;
    for (const msg of c.device.lights(colors)) c.output.send(msg);
  }
}

const schedule = () => (raf ||= requestAnimationFrame(render));

function handle(c: Connected, m: { type: string; number: number; value: number }) {
  const s = useStore.getState();
  if (m.type === "noteon") {
    const at = c.device.pad(m.number);
    if (!at) return false;
    const target = padTarget(s.project, c.view, at.row, at.col);
    if (!target) return true;
    const pattern = slotPattern(s.project, s.editSlotId);
    const lane = pattern.lanes[target.trackId];
    if (lane?.kind !== "steps") return true;
    setStep(target.trackId, target.step, !lane.steps[target.step].on, `ctl-${performance.now()}`);
    s.setUi({ selectedTrackId: target.trackId });
    return true;
  }
  if (m.type === "noteoff") return !!c.device.pad(m.number);
  if (m.type !== "cc") return false;
  const enc = c.device.encoders?.[m.number];
  if (enc !== undefined) {
    // encoders turn the selected track's sound parameters
    const track = s.project.tracks.find((t) => t.id === s.selectedTrackId);
    const def = track && soundDefs(track, SOUND_PARAMS[track.kind])[enc];
    if (track && def) {
      const key = `sound.${def.id}`;
      const v = Math.min(
        1,
        Math.max(0, (track.params[key] ?? def.default) + relative(m.value) / 100),
      );
      s.commit((p) => {
        const t = p.tracks.find((x) => x.id === track.id);
        if (t) t.params[key] = v;
      }, `ctl-enc-${key}`);
    }
    return true;
  }
  const button = c.device.buttons[m.number];
  if (!button) return false;
  if (m.value === 0) return true;
  if (button === "play") transport.toggle();
  else if (button === "up") c.view.trackOffset -= 1;
  else if (button === "down") c.view.trackOffset += 1;
  else if (button === "left") c.view.stepOffset -= 8;
  else if (button === "right") c.view.stepOffset += 8;
  schedule();
  return true;
}

/** Look for supported controllers among the MIDI ports and connect them. */
export async function connectControllers(): Promise<number> {
  if (!(await startMidi(true))) return 0;
  for (const out of midiOutputs()) {
    const device = detectDevice(out.name ?? "");
    if (!device || connected.some((c) => c.output.id === out.id)) continue;
    const input = midiInputs().find((i) => detectDevice(i.name ?? "")?.id === device.id);
    const c: Connected = {
      device,
      input: input?.name ?? "",
      output: out,
      view: { trackOffset: 0, stepOffset: 0 },
      lastFrame: "",
    };
    for (const msg of device.init) out.send(msg);
    connected.push(c);
  }
  useControllers.setState({
    connected: connected.map((c) => ({ id: c.output.id, name: c.device.name })),
  });
  if (!started && connected.length) {
    started = true;
    useStore.subscribe(schedule);
    onStep((e) => {
      playStep = e.pageStep < 0 ? null : e.pageStep;
      schedule();
    });
    onMidiMessage((m) => {
      const c = connected.find((x) => x.input && x.input === m.device);
      return c ? handle(c, m) : false;
    });
  }
  schedule();
  return connected.length;
}
