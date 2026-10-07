/**
 * Live loop recording on armed audio tracks while the beat keeps playing: it starts on the next
 * bar, records one loop (page length or 1/2/4/8 bars), compensates the recording latency, and
 * plays the loop right away. Recording again adds an overdub layer.
 */
import { openMic } from "../audio-io/mic";
import { toast } from "../components/Toast";
import { saveRecording } from "../library/library";
import { useSettings } from "../state/settings";
import { useStore } from "../state/store";
import { audioContext } from "./context";
import { audioNow, startClip } from "./engine";
import { record } from "./recorder";
import { nextBarTime, pageDuration, play, playStartTime } from "./transport";
import { STEP_SIZE_QUARTERS } from "../model/types";
import { slotPattern } from "../model/project";
import { uid } from "../model/id";

const get = () => useStore.getState();

function armedAudioTrack() {
  return get().project.tracks.find((t) => t.kind === "audio" && t.arm);
}

let busy = false;

async function startLoopRecording() {
  const track = armedAudioTrack();
  if (!track || busy) return;
  busy = true;
  const s = get();
  try {
    const mic = await openMic();
    const { project } = get();
    const free =
      !s.playing &&
      useSettings.getState().freeFirstLoop &&
      !project.tracks.some((t) => t.kind === "audio" && t.sampleId);
    if (free) return await freeLoop(track.id, mic);
    if (!get().playing) play();
    const start =
      get().playing && s.playing ? (nextBarTime() ?? audioNow() + 0.05) : playStartTime();
    const pattern = slotPattern(project, get().playSlotId);
    const barSec =
      (60 / project.bpm) *
      STEP_SIZE_QUARTERS[pattern.stepSize] *
      Math.round(1 / STEP_SIZE_QUARTERS[pattern.stepSize]) *
      project.timeSignature[0];
    const length = get().loopBars
      ? get().loopBars * barSec
      : pageDuration(pattern, project.bpm, project.swing);
    const latency = useSettings.getState().recordLatencyMs / 1000;
    const rec = await record(mic, start, start + length + latency);
    get().setUi({ looper: { status: "waiting", trackId: track.id, start, end: start + length } });
    const waitMs = Math.max(0, (start - audioNow()) * 1000);
    const toRecording = window.setTimeout(() => {
      if (get().looper.status === "waiting")
        get().setUi({ looper: { ...get().looper, status: "recording" } });
    }, waitMs);
    const channels = await rec.done;
    clearTimeout(toRecording);
    await finish(track.id, channels, latency, length, start + length, project.bpm);
  } catch (e) {
    toast(`Recording failed: ${e instanceof Error ? e.message : e}`, "error");
  } finally {
    busy = false;
    get().setUi({ recording: false, looper: { status: "idle", trackId: "", start: 0, end: 0 } });
  }
}

/** Keep `length` seconds after the latency offset, then store and play the loop. */
async function finish(
  trackId: string,
  channels: Float32Array[],
  latency: number,
  length: number,
  playAt: number,
  bpm: number,
) {
  get().setUi({ looper: { ...get().looper, status: "saving" } });
  const sr = audioContext().sampleRate;
  const from = Math.round(latency * sr);
  const n = Math.round(length * sr);
  const loop = channels.map((c) => {
    const out = new Float32Array(n);
    out.set(c.subarray(from, from + n));
    return out;
  });
  const track = get().project.tracks.find((t) => t.id === trackId);
  if (!track) return;
  const id = await saveRecording(loop, sr, `${track.name} ${new Date().toLocaleTimeString()}`, bpm);
  if (!id) return;
  const playSlot = get().playSlotId;
  get().commit((p) => {
    const t = p.tracks.find((x) => x.id === trackId);
    if (!t) return;
    if (!t.sampleId) {
      t.sampleId = id;
      t.source = "Recording";
    } else {
      // overdub: a separate layer that can be muted, undone or merged later
      t.layers = [...(t.layers ?? []), { id: uid("layer"), sampleId: id, gain: 1, mute: false }];
    }
    const lane = slotPattern(p, playSlot).lanes[trackId];
    if (lane?.kind === "clip") {
      lane.active = true;
      lane.launchMode = "loop";
    }
  });
  const updated = get().project.tracks.find((t) => t.id === trackId)!;
  if (get().playing) {
    const pattern = slotPattern(get().project, get().playSlotId);
    // join in right away (late by the time it took to save), the next page start restarts it
    startClip(
      updated,
      playAt,
      pageDuration(pattern, get().project.bpm, get().project.swing),
      false,
    );
  }
  toast(
    updated.layers?.length ? `Overdub layer ${updated.layers.length} recorded` : "Loop recorded",
  );
}

/** Free first loop: record until Rec is pressed again; the loop's length sets the tempo. */
async function freeLoop(trackId: string, mic: AudioNode) {
  const start = audioNow() + 0.05;
  const latency = useSettings.getState().recordLatencyMs / 1000;
  const rec = await record(mic, start);
  get().setUi({ looper: { status: "recording", trackId, start, end: 0 } });
  await new Promise<void>((resolve) => {
    const off = useStore.subscribe((s) => {
      if (!s.recording) {
        off();
        resolve();
      }
    });
  });
  const end = audioNow();
  rec.stop(end + latency);
  const channels = await rec.done;
  const dur = end - start;
  // pick the bar count that gives the most natural tempo
  let best = { bars: 1, bpm: 120 };
  for (const bars of [1, 2, 4, 8]) {
    const bpm = (bars * 4 * 60) / dur;
    if (Math.abs(bpm - 110) < Math.abs(best.bpm - 110)) best = { bars, bpm };
  }
  const bpm = Math.round(Math.min(200, Math.max(60, best.bpm)) * 100) / 100;
  get().commit((p) => {
    p.bpm = bpm;
    const pat = slotPattern(p, get().editSlotId);
    pat.stepCount = Math.min(128, best.bars * 16);
    pat.stepSize = "1/16";
  });
  await finish(trackId, channels, latency, dur, audioNow(), bpm);
  play();
}

let started = false;

export function startLooper() {
  if (started) return;
  started = true;
  useStore.subscribe((s, prev) => {
    if (s.recording && !prev.recording && armedAudioTrack()) void startLoopRecording();
  });
}
