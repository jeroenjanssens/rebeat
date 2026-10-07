/**
 * The microphone: asked for on the first record/monitor action, then one shared stream for the
 * whole session (library, tracks, calibration). Music settings: no echo cancellation, noise
 * suppression or auto gain (except in speaker mode).
 */
import { create } from "zustand";
import { audioContext } from "../engine/context";
import { platform } from "../platform";
import { useSettings } from "../state/settings";

interface MicState {
  status: "off" | "asking" | "on" | "denied" | "error";
  error: string;
  label: string;
}

export const useMic = create<MicState>()(() => ({ status: "off", error: "", label: "" }));

let stream: MediaStream | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let analyser: AnalyserNode | null = null;
let opened: Promise<MediaStreamAudioSourceNode> | null = null;
let openedWith = "";
const listeners = new Set<(s: MediaStreamAudioSourceNode) => void>();

function constraintsKey() {
  const s = useSettings.getState();
  return `${s.inputDeviceId}|${s.speakerMode}`;
}

/** The shared microphone source node (asks for permission the first time). */
export function openMic(): Promise<MediaStreamAudioSourceNode> {
  if (opened && openedWith === constraintsKey()) return opened;
  closeMic();
  openedWith = constraintsKey();
  useMic.setState({ status: "asking", error: "" });
  const { inputDeviceId, speakerMode } = useSettings.getState();
  opened = (async () => {
    try {
      stream = await platform.media.getUserMedia({
        audio: {
          deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
          echoCancellation: speakerMode,
          noiseSuppression: speakerMode,
          autoGainControl: false,
          channelCount: { ideal: 2 },
        },
      });
    } catch (e) {
      opened = null;
      const denied = e instanceof DOMException && e.name === "NotAllowedError";
      useMic.setState({ status: denied ? "denied" : "error", error: String(e) });
      throw e;
    }
    const ctx = audioContext();
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    useMic.setState({ status: "on", label: stream.getAudioTracks()[0]?.label ?? "Microphone" });
    for (const fn of listeners) fn(source);
    return source;
  })();
  return opened;
}

export function micSource() {
  return source;
}

/** Called whenever the mic (re)opens, e.g. after switching the input device. */
export function onMicOpen(fn: (s: MediaStreamAudioSourceNode) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function closeMic() {
  stream?.getTracks().forEach((t) => t.stop());
  source?.disconnect();
  stream = null;
  source = null;
  analyser = null;
  opened = null;
  useMic.setState({ status: "off" });
}

const buf = new Float32Array(1024);

/** Input peak level (0..1). */
export function micLevel(): number {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(buf);
  let p = 0;
  for (let i = 0; i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]));
  return Math.min(1, p);
}

// switching the device or speaker mode reopens the stream (the permission is kept)
useSettings.subscribe((s, prev) => {
  if (stream && (s.inputDeviceId !== prev.inputDeviceId || s.speakerMode !== prev.speakerMode))
    void openMic();
});
