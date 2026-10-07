/**
 * PCM capture on the audio thread: sample-accurate start/stop at audio-context times, lossless.
 * Chunks are posted to the main thread as they arrive. (Plain JS: AudioWorklet scopes can't
 * load the dev server's module wrappers.)
 */
class Recorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.start = Infinity;
    this.end = Infinity;
    this.active = false;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === "start") {
        this.start = Math.round((d.start ?? 0) * sampleRate);
        this.end = d.end === undefined ? Infinity : Math.round(d.end * sampleRate);
        this.active = true;
      } else if (d.type === "stop") {
        this.end = d.end === undefined ? currentFrame : Math.round(d.end * sampleRate);
      }
    };
  }

  process(inputs) {
    if (!this.active) return true;
    const input = inputs[0];
    const n = input[0] ? input[0].length : 128;
    const f0 = currentFrame;
    const a = Math.max(0, this.start - f0);
    const b = Math.min(n, this.end - f0);
    if (b > a && input.length) {
      const chunk = input.map((ch) => ch.slice(a, b));
      this.port.postMessage({ type: "data", chunk }, chunk.map((c) => c.buffer));
    } else if (b > a) {
      // no input connected yet: record silence so timing stays right
      const chunk = [new Float32Array(b - a)];
      this.port.postMessage({ type: "data", chunk }, [chunk[0].buffer]);
    }
    if (f0 + n >= this.end) {
      this.active = false;
      this.port.postMessage({ type: "done" });
    }
    return true;
  }
}

registerProcessor("rebeat-recorder", Recorder);
