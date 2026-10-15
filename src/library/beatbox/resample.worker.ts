/**
 * Worker for the windowed-sinc resampler: identical to the main-thread code so the model's
 * parity fixtures stay valid (Q7). Runs off the main thread to avoid jank on long takes.
 */
import { resample } from "./resample";

self.onmessage = (e: MessageEvent<{ x: Float32Array; from: number }>) => {
  const { x, from } = e.data;
  const result = resample(x, from);
  // Transfer the buffer back — zero-copy.
  (self as unknown as Worker).postMessage(result, [result.buffer]);
};
