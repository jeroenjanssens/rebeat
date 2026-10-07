/**
 * Warping audio clips to the song tempo with Signalsmith Stretch (WASM/AudioWorklet): one stretch
 * node per audio track, holding that track's sample.
 */
import type { StretchNode } from "signalsmith-stretch";
import * as Tone from "tone";
import { getBuffer } from "./samples";

interface Warper {
  node: StretchNode | null;
  sampleId: string;
  loading: Promise<void> | null;
}

const warpers = new Map<string, Warper>();

/** A ready stretch node for a track's sample, or null while it is being prepared. */
export function warper(
  trackId: string,
  sampleId: string,
  dest: Tone.InputNode,
): StretchNode | null {
  let w = warpers.get(trackId);
  if (w && w.sampleId === sampleId) return w.node;
  if (w?.node) {
    w.node.stop();
    w.node.disconnect();
  }
  const buffer = getBuffer(sampleId);
  if (!buffer) return null;
  w = { node: null, sampleId, loading: null };
  warpers.set(trackId, w);
  const entry = w;
  w.loading = (async () => {
    const ctx = Tone.getContext().rawContext as AudioContext;
    // the WASM build loads on first use
    const { default: SignalsmithStretch } = await import("signalsmith-stretch");
    const node = await SignalsmithStretch(ctx, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [buffer.numberOfChannels],
    });
    await node.addBuffers(
      Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c)),
    );
    Tone.connect(node, dest);
    if (warpers.get(trackId) === entry) entry.node = node;
    else node.disconnect();
  })().catch((e) => console.warn("Time-stretch unavailable", e));
  return null;
}

export function disposeWarper(trackId: string) {
  const w = warpers.get(trackId);
  w?.node?.stop();
  w?.node?.disconnect();
  warpers.delete(trackId);
}
