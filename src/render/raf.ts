/** One shared requestAnimationFrame loop for every animated canvas and DOM update. */
type FrameFn = (now: number, dt: number) => void;

const subscribers = new Set<FrameFn>();
let handle = 0;
let last = 0;
let load = 0;

function frame(now: number) {
  const dt = last ? Math.min(now - last, 100) : 16;
  last = now;
  const t0 = performance.now();
  for (const fn of subscribers) fn(now, dt);
  // smoothed share of the frame budget spent in our drawing/scheduling work
  load = load * 0.95 + Math.min(1, (performance.now() - t0) / 16.7) * 0.05;
  handle = subscribers.size ? requestAnimationFrame(frame) : 0;
}

export function onFrame(fn: FrameFn): () => void {
  subscribers.add(fn);
  if (!handle) {
    last = 0;
    handle = requestAnimationFrame(frame);
  }
  return () => {
    subscribers.delete(fn);
  };
}

/** Main-thread load of the UI loop (0..1), for the CPU meter. */
export function frameLoad() {
  return load;
}
