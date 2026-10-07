/** One shared requestAnimationFrame loop for every animated canvas and DOM update. */
type FrameFn = (now: number, dt: number) => void;

const subscribers = new Set<FrameFn>();
let handle = 0;
let last = 0;

function frame(now: number) {
  const dt = last ? Math.min(now - last, 100) : 16;
  last = now;
  for (const fn of subscribers) fn(now, dt);
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
