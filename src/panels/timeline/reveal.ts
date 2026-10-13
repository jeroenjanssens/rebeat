/** Scroll the timeline to a song position (a row clicked in the Inspector's table, D200). */
type Reveal = (q: number) => void;
const listeners = new Set<Reveal>();

export function onReveal(fn: Reveal): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function revealOnTimeline(q: number) {
  for (const fn of listeners) fn(q);
}
