/// <reference lib="webworker" />
/**
 * Runs the beatbox model (D109) with ONNX Runtime Web's WASM backend, off the main thread.
 * Messages: { type: "load", url, wasm } → { type: "ready" }; { type: "run", id, windows, n } →
 * { type: "result", id, logits, embeddings }.
 */
import * as ort from "onnxruntime-web/wasm";

let session: ort.InferenceSession | null = null;

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      ort.env.wasm.wasmPaths = { wasm: msg.wasm };
      // threads need a cross-origin isolated page (GitHub Pages isn't); one is plenty here
      ort.env.wasm.numThreads = 1;
      const res = await fetch(msg.url);
      if (!res.ok) throw new Error(`The model couldn't be downloaded (${res.status}).`);
      session = await ort.InferenceSession.create(new Uint8Array(await res.arrayBuffer()), {
        executionProviders: ["wasm"],
      });
      self.postMessage({ type: "ready" });
    } else if (msg.type === "run") {
      if (!session) throw new Error("The model isn't loaded.");
      const n: number = msg.n;
      const size = msg.windows.length / Math.max(1, n);
      const out = await session.run({ audio: new ort.Tensor("float32", msg.windows, [n, size]) });
      const logits = out.logits.data as Float32Array;
      const embeddings = out.embedding.data as Float32Array;
      self.postMessage({ type: "result", id: msg.id, logits, embeddings }, [
        logits.buffer,
        embeddings.buffer,
      ]);
    }
  } catch (err) {
    self.postMessage({ type: "error", id: msg.id, error: String((err as Error).message ?? err) });
  }
};
