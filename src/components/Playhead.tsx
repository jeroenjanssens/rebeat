/**
 * A line that runs across a waveform while it plays once (A1). Give it a new `run` to start;
 * it removes itself at the end.
 */
export function Playhead({ run }: { run: { n: number; seconds: number } | null }) {
  if (!run || run.seconds <= 0) return null;
  return (
    <span
      key={run.n}
      className="pointer-events-none absolute inset-y-0 w-px bg-white/80"
      style={{ animation: `playhead ${run.seconds}s linear forwards` }}
      data-testid="playhead"
    />
  );
}
