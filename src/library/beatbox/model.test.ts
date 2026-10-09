import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as ort from "onnxruntime-web";
import { BEATBOX_CLASSES } from "./classes";
import { MODEL_VERSION, type ModelInfo } from "./modelInfo";
import parity from "./fixtures/parity.json";

const dir = `public/models/beatbox/${MODEL_VERSION}/`;

describe("the shipped model", () => {
  it("lists the app's classes", () => {
    const info = JSON.parse(readFileSync(dir + "model.json", "utf8")) as ModelInfo;
    expect(info.version).toBe(MODEL_VERSION);
    expect(info.classes.map((c) => c.id)).toEqual([...BEATBOX_CLASSES]);
    expect(info.window).toBe(3200);
    expect(info.sampleRate).toBe(16000);
  });

  it("gives the scores and embeddings PyTorch computed (parity, D109)", async () => {
    expect(parity.version).toBe(MODEL_VERSION);
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(readFileSync(dir + "model.onnx"));
    const n = parity.audio.length;
    const flat = Float32Array.from(parity.audio.flat());
    const out = await session.run({ audio: new ort.Tensor("float32", flat, [n, 3200]) });
    const logits = out.logits.data as Float32Array;
    const emb = out.embedding.data as Float32Array;
    let worst = 0;
    parity.logits.flat().forEach((v, i) => (worst = Math.max(worst, Math.abs(v - logits[i]))));
    parity.embedding.flat().forEach((v, i) => (worst = Math.max(worst, Math.abs(v - emb[i]))));
    expect(worst).toBeLessThan(1e-3);
  });
});
