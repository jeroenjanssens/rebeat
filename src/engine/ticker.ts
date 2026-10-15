/**
 * A steady tick for the scheduler. A Web Worker timer keeps running in background tabs, where
 * main-thread timers are throttled to once a second.
 */
const SOURCE = `let t = 0;
onmessage = (e) => {
  clearInterval(t);
  if (e.data > 0) t = setInterval(() => postMessage(0), e.data);
};`;

let worker: Worker | null = null;
const subscribers = new Set<() => void>();

function ensureWorker() {
  if (worker || typeof Worker === "undefined") return worker;
  try {
    worker = new Worker(URL.createObjectURL(new Blob([SOURCE], { type: "text/javascript" })));
    worker.onmessage = () => subscribers.forEach((fn) => fn());
  } catch {
    worker = null;
  }
  return worker;
}

export function startTicker(fn: () => void, intervalMs = 20): () => void {
  const first = subscribers.size === 0;
  subscribers.add(fn);
  const w = ensureWorker();
  let fallback = 0;
  // post the interval only when the first subscriber arrives; subsequent callers share the tick
  if (first) {
    if (w) w.postMessage(intervalMs);
    else fallback = window.setInterval(() => subscribers.forEach((f) => f()), intervalMs);
  }
  return () => {
    subscribers.delete(fn);
    if (fallback && subscribers.size === 0) clearInterval(fallback);
    if (w && subscribers.size === 0) w.postMessage(0);
  };
}
