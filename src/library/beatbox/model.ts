/**
 * The beatbox model in the app (D109): loaded only when the Beatbox panel first needs it, in a
 * worker; the model and the runtime's .wasm are cached by the service worker on first use.
 */
import { create } from "zustand";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import { MODEL_VERSION, type Classified, type ModelInfo } from "./modelInfo";

export interface ModelState {
  status: "idle" | "loading" | "ready" | "error";
  info?: ModelInfo;
  error?: string;
}

export const useModel = create<ModelState>()(() => ({ status: "idle" }));

const base = () => `${import.meta.env.BASE_URL}models/beatbox/${MODEL_VERSION}/`;

let worker: Worker | null = null;
let loading: Promise<ModelInfo> | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (v: Classified[]) => void; reject: (e: Error) => void; n: number; size: number }
>();
let embedSize = 64;
let classCount = 8;

function onMessage(e: MessageEvent) {
  const m = e.data;
  if (m.type === "result") {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    const out: Classified[] = [];
    for (let i = 0; i < p.n; i++)
      out.push({
        logits: m.logits.slice(i * classCount, (i + 1) * classCount),
        embedding: m.embeddings.slice(i * embedSize, (i + 1) * embedSize),
      });
    p.resolve(out);
  } else if (m.type === "error" && m.id !== undefined) {
    pending.get(m.id)?.reject(new Error(m.error));
    pending.delete(m.id);
  }
}

/** Load the model (once). Resolves with its model.json. */
export function loadModel(): Promise<ModelInfo> {
  if (loading) return loading;
  useModel.setState({ status: "loading", error: undefined });
  loading = (async () => {
    const res = await fetch(base() + "model.json");
    if (!res.ok) throw new Error(`The model's description couldn't be downloaded (${res.status}).`);
    const info = (await res.json()) as ModelInfo;
    embedSize = info.embedding;
    classCount = info.classes.length;
    worker = new Worker(new URL("./model.worker.ts", import.meta.url), { type: "module" });
    await new Promise<void>((resolve, reject) => {
      worker!.onmessage = (e) => {
        if (e.data.type === "ready") resolve();
        else if (e.data.type === "error") reject(new Error(e.data.error));
      };
      worker!.onerror = (e) => reject(new Error(e.message || "The model's worker failed."));
      worker!.postMessage({ type: "load", url: base() + "model.onnx", wasm: wasmUrl });
    });
    worker.onmessage = onMessage;
    useModel.setState({ status: "ready", info });
    return info;
  })().catch((err: Error) => {
    loading = null;
    worker?.terminate();
    worker = null;
    useModel.setState({ status: "error", error: err.message });
    throw err;
  });
  return loading;
}

/** Classify windows of 16 kHz audio (each `info.window` long). */
export async function classify(windows: Float32Array[]): Promise<Classified[]> {
  if (!windows.length) return [];
  const info = await loadModel();
  const size = info.window;
  const flat = new Float32Array(windows.length * size);
  windows.forEach((w, i) => flat.set(w.subarray(0, size), i * size));
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, n: windows.length, size });
    worker!.postMessage({ type: "run", id, windows: flat, n: windows.length }, [flat.buffer]);
  });
}

/** Whether the model was ever loaded this session (tests check it stays unloaded until used). */
export const modelLoaded = () => !!loading;
