/** Which model the app ships (D109), and what its `model.json` says. Pure, for tests too. */
import type { BeatboxClass } from "./classes";

/** The version under `public/models/beatbox/`; bump it with every model you ship. */
export const MODEL_VERSION = "1";

export interface ModelInfo {
  format: "rebeat-beatbox-model";
  version: string;
  sampleRate: number;
  window: number;
  pre: number;
  classes: { id: BeatboxClass; name: string }[];
  embedding: number;
  calibration: { tau: number; k: number };
  trainedOn: string[];
  metrics: Record<string, Record<string, number | null>>;
}

export interface Classified {
  logits: Float32Array;
  embedding: Float32Array;
}
