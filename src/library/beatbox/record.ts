/**
 * Recording in the Beatbox panel (D111): single sounds (one class, paced by a pulse on screen
 * and, if you like, a click) or a take (to the metronome at the project's tempo, or free).
 * Clicks go straight to the output, not the master; with speakers the mic hears them, so
 * they're off by default for single sounds.
 */
import { create } from "zustand";
import { audioContext } from "../../engine/context";
import { record, type Recording } from "../../engine/recorder";
import { openMic } from "../../audio-io/mic";
import { useSettings } from "../../state/settings";
import { useStore } from "../../state/store";
import { CLASS_INFO, type BeatboxClass } from "./classes";
import { addRecording } from "./store";

export interface Session {
  kind: "sounds" | "take";
  status: "count-in" | "recording" | "saving";
  /** Audio times. */
  start: number;
  end?: number;
  /** Single sounds: when each prompt is, and the label. */
  prompts?: number[];
  label?: BeatboxClass;
  /** A take to the metronome: its beat length and beats per bar. */
  beat?: number;
  beatsPerBar?: number;
}

export const useBeatboxRecorder = create<{ session: Session | null }>()(() => ({ session: null }));

interface Token {
  rec: Recording | null;
  cancelled: boolean;
  clicks: AudioScheduledSourceNode[];
}
let current: Token | null = null;

function click(at: number, accent: boolean) {
  const ctx = audioContext();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.value = accent ? 1760 : 1320;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(0.25, at + 0.002);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
  osc.connect(g).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.06);
  return osc;
}

const latency = () => useSettings.getState().recordLatencyMs / 1000;

async function finish(
  token: Token,
  rec: Recording,
  opts: Parameters<typeof addRecording>[2],
  sampleRate: number,
) {
  const channels = await rec.done;
  if (token.cancelled) return null;
  useBeatboxRecorder.setState((s) => ({
    session: s.session && { ...s.session, status: "saving" },
  }));
  try {
    return await addRecording(channels, sampleRate, opts);
  } finally {
    useBeatboxRecorder.setState({ session: null });
    if (current === token) current = null;
  }
}

/** Record `count` hits of one class, one per `interval` seconds after two count-in pulses. */
export async function recordSounds(label: BeatboxClass, count = 8, interval = 0.8, clicks = false) {
  if (current) return null;
  const mic = await openMic();
  const ctx = audioContext();
  const t0 = ctx.currentTime + 0.3;
  const prompts = Array.from({ length: count }, (_, i) => t0 + (i + 2) * interval);
  const start = t0 + 2 * interval - 0.3;
  const end = prompts[count - 1] + interval * 0.9;
  current = { rec: null, cancelled: false, clicks: [] };
  if (clicks) current.clicks = [t0, t0 + interval, ...prompts].map((t, i) => click(t, i < 2));
  useBeatboxRecorder.setState({
    session: { kind: "sounds", status: "count-in", start, end, prompts, label },
  });
  window.setTimeout(
    () =>
      useBeatboxRecorder.setState((s) => ({
        session: s.session && { ...s.session, status: "recording" },
      })),
    (start - ctx.currentTime) * 1000,
  );
  const rec = await record(mic, start + latency(), end + latency());
  current.rec = rec;
  return finish(
    current,
    rec,
    { name: `${CLASS_INFO[label].name} ×${count}`, kind: "sounds", label, labeledBy: "you" },
    ctx.sampleRate,
  );
}

/** Record a take: to the metronome (one bar of count-in, then `bars` bars) or free (until stopped). */
export async function recordTake(mode: "metronome" | "free", bars = 4, clicks = true) {
  if (current) return null;
  const mic = await openMic();
  const ctx = audioContext();
  const { bpm, timeSignature } = useStore.getState().project;
  const name = `Take ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  current = { rec: null, cancelled: false, clicks: [] };
  if (mode === "free") {
    const start = ctx.currentTime + 0.1;
    useBeatboxRecorder.setState({ session: { kind: "take", status: "recording", start } });
    const rec = await record(mic, start + latency());
    current.rec = rec;
    return finish(current, rec, { name, kind: "take" }, ctx.sampleRate);
  }
  const beatsPerBar = timeSignature[0];
  const beat = (60 / bpm) * (4 / timeSignature[1]);
  const t0 = ctx.currentTime + 0.3;
  const start = t0 + beatsPerBar * beat;
  const end = start + bars * beatsPerBar * beat;
  const times = Array.from(
    { length: beatsPerBar * (clicks ? bars + 1 : 1) },
    (_, i) => t0 + i * beat,
  );
  current.clicks = times.map((t, i) => click(t, i % beatsPerBar === 0));
  useBeatboxRecorder.setState({
    session: { kind: "take", status: "count-in", start, end, beat, beatsPerBar },
  });
  window.setTimeout(
    () =>
      useBeatboxRecorder.setState((s) => ({
        session: s.session && { ...s.session, status: "recording" },
      })),
    (start - ctx.currentTime) * 1000,
  );
  const rec = await record(mic, start + latency(), end + latency());
  current.rec = rec;
  return finish(current, rec, { name, kind: "take", bpm, barStart: 0 }, ctx.sampleRate);
}

/** Stop a free take (keeps it). */
export function stopRecording() {
  current?.rec?.stop();
}

/** Throw the recording away. */
export function cancelRecording() {
  if (!current) return;
  current.cancelled = true;
  for (const c of current.clicks) {
    try {
      c.stop();
    } catch {
      // already ended
    }
  }
  current.rec?.stop();
  current = null;
  useBeatboxRecorder.setState({ session: null });
}
