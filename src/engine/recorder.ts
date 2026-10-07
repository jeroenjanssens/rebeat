/** Recording audio-node input into buffers with the PCM capture worklet. */
import { audioContext } from "./context";

let loaded: Promise<void> | null = null;

function ensureWorklet() {
  loaded ??= audioContext().audioWorklet.addModule(
    `${import.meta.env.BASE_URL}worklets/recorder.js`,
  );
  return loaded;
}

export interface Recording {
  /** End the recording at an audio time (default: now). */
  stop(at?: number): void;
  /** Resolves with the captured channels once the end time has passed. */
  done: Promise<Float32Array[]>;
  /** Seconds captured so far. */
  captured(): number;
}

/** Capture `input` from audio time `start` until `end` (or until stopped). */
export async function record(input: AudioNode, start: number, end?: number): Promise<Recording> {
  await ensureWorklet();
  const ctx = audioContext();
  const node = new AudioWorkletNode(ctx, "rebeat-recorder", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 2,
    channelCountMode: "explicit",
  });
  // keep the node pulled by the graph without making a sound
  const sink = ctx.createGain();
  sink.gain.value = 0;
  node.connect(sink).connect(ctx.destination);
  input.connect(node);
  const chunks: Float32Array[][] = [];
  let frames = 0;
  const done = new Promise<Float32Array[]>((resolve) => {
    node.port.onmessage = (e) => {
      if (e.data.type === "data") {
        chunks.push(e.data.chunk);
        frames += e.data.chunk[0].length;
      } else if (e.data.type === "done") {
        input.disconnect(node);
        node.disconnect();
        sink.disconnect();
        const nch = chunks[0]?.length ?? 1;
        const out = Array.from({ length: nch }, () => new Float32Array(frames));
        let o = 0;
        for (const c of chunks) {
          for (let ch = 0; ch < nch; ch++) out[ch].set(c[ch] ?? c[0], o);
          o += c[0].length;
        }
        resolve(out);
      }
    };
  });
  node.port.postMessage({ type: "start", start, end });
  return {
    stop: (at) => node.port.postMessage({ type: "stop", end: at }),
    done,
    captured: () => frames / ctx.sampleRate,
  };
}

export function toAudioBuffer(
  channels: Float32Array[],
  sampleRate = audioContext().sampleRate,
): AudioBuffer {
  const b = new AudioBuffer({
    length: Math.max(1, channels[0].length),
    numberOfChannels: channels.length,
    sampleRate,
  });
  channels.forEach((c, i) => b.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  return b;
}
