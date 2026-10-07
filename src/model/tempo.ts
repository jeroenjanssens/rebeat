/** Tap tempo: the BPM from the most recent taps (a pause of more than 2 s starts over). */
export function createTapTempo(maxTaps = 6, resetMs = 2000) {
  let taps: number[] = [];
  return (now: number): number | null => {
    if (taps.length && now - taps[taps.length - 1] > resetMs) taps = [];
    taps.push(now);
    if (taps.length > maxTaps) taps.shift();
    if (taps.length < 2) return null;
    const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
    return Math.round(Math.min(300, Math.max(20, 60000 / avg)) * 10) / 10;
  };
}

export const TIME_SIGNATURES: [number, number][] = [
  [4, 4],
  [3, 4],
  [5, 4],
  [6, 8],
  [7, 8],
];
