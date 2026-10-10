/**
 * Honest load metrics for the CPU meter.
 *
 * Three signals, all opt-in via feature detection:
 *   1. Audio render load — AudioRenderCapacity (Chromium ≥ 124; Electron 44 uses Chrome 132).
 *   2. Main-thread busy fraction — PerformanceObserver "long-animation-frame" (Chrome ≥ 123),
 *      falling back to "longtask". Computed as sum of entry durations in a 1-second window.
 *   3. Scheduler lateness — EWMA of how late each 20 ms transport tick fires vs. the 120 ms
 *      lookahead budget.
 *
 * getLoad() returns the worst of the three with a label ("Audio 23%", "Main 8%", "Sched 15%").
 * The module keeps computing independently of the rAF loop.
 */

// Minimal interfaces for newer browser APIs not yet in TypeScript's DOM lib (TS 6.0).

interface AudioRenderCapacityEvent extends Event {
  readonly timestamp: number;
  readonly averageLoad: number;
  readonly peakLoad: number;
  readonly underrunRatio: number;
}

interface AudioRenderCapacity extends EventTarget {
  start(options?: { updateInterval?: number }): void;
  stop(): void;
}

// ── Audio load (AudioRenderCapacity) ──────────────────────────────────────────

let audioAvg = -1;
let audioPeak = -1;
let underruns = -1;

/**
 * Start AudioRenderCapacity monitoring on the live AudioContext.
 * Feature-detected: no-ops on browsers without the API.
 * Returns a stop function.
 */
export function startAudioLoad(ctx: AudioContext): () => void {
  const rc = (ctx as unknown as Record<string, unknown>).renderCapacity as
    AudioRenderCapacity | undefined;
  if (!rc) return () => {};
  underruns = 0;
  let stopped = false;
  const onUpdate = (e: Event) => {
    if (stopped) return;
    const ev = e as unknown as AudioRenderCapacityEvent;
    audioAvg = ev.averageLoad;
    audioPeak = ev.peakLoad;
    if (ev.underrunRatio > 0) underruns += 1;
  };
  rc.addEventListener("update", onUpdate);
  rc.start({ updateInterval: 0.5 });
  return () => {
    stopped = true;
    rc.removeEventListener("update", onUpdate);
    rc.stop();
    audioAvg = -1;
    audioPeak = -1;
    underruns = -1;
  };
}

// ── Main-thread busy fraction ─────────────────────────────────────────────────

let mainBusy = 0;
let mainLoadActive = false;

// Sliding window of recent long-frame / long-task entries (last 1 second).
const longFrames: Array<{ start: number; duration: number }> = [];
const WINDOW_MS = 1000;

function recordEntry(start: number, duration: number) {
  longFrames.push({ start, duration });
  const cutoff = start - WINDOW_MS;
  while (longFrames.length > 0 && longFrames[0].start < cutoff) longFrames.shift();
  let busy = 0;
  for (const f of longFrames) busy += f.duration;
  mainBusy = Math.min(1, busy / WINDOW_MS);
}

/**
 * Start main-thread busy monitoring.
 * Idempotent — safe to call more than once.
 * No-ops on environments without PerformanceObserver (Node, old browsers).
 * Returns a stop function.
 */
export function startMainLoad(): () => void {
  if (mainLoadActive) return () => {};
  if (typeof PerformanceObserver === "undefined") return () => {};
  const supported: ReadonlyArray<string> = PerformanceObserver.supportedEntryTypes ?? [];
  const type = supported.includes("long-animation-frame")
    ? "long-animation-frame"
    : supported.includes("longtask")
      ? "longtask"
      : null;
  if (!type) return () => {};
  mainLoadActive = true;
  const obs = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) recordEntry(entry.startTime, entry.duration);
  });
  obs.observe({ type, buffered: false });
  return () => {
    obs.disconnect();
    mainLoadActive = false;
    mainBusy = 0;
  };
}

// ── Scheduler lateness ────────────────────────────────────────────────────────

/** Expected interval between transport ticks (matches ticker.ts default). */
const TICK_INTERVAL_MS = 20;
/** 120 ms lookahead = scale for 100% scheduler load. */
const SCHED_LATE_SCALE_MS = 120;

let lastTickAt = 0;
let schedulerLateMs = 0;

/**
 * Call at the start of each onTick() in transport.ts.
 * Measures how late the tick fired vs. the expected 20 ms interval and keeps an EWMA.
 */
export function notifyTick(): void {
  const now = performance.now();
  if (lastTickAt > 0) {
    const late = Math.max(0, now - lastTickAt - TICK_INTERVAL_MS);
    // EWMA α = 0.2 — smooth but quick to react to a run of late ticks.
    schedulerLateMs = schedulerLateMs * 0.8 + late * 0.2;
  }
  lastTickAt = now;
}

// ── Combining ─────────────────────────────────────────────────────────────────

export interface LoadSnapshot {
  /** 0..1 average audio render load, or -1 when AudioRenderCapacity is unavailable. */
  audioAvg: number;
  /** 0..1 peak audio render load, or -1 when unavailable. */
  audioPeak: number;
  /** Cumulative count of underrun intervals, or -1 when unavailable. */
  underruns: number;
  /** 0..1 fraction of the last second spent in long animation frames / long tasks. */
  mainBusy: number;
  /** EWMA of scheduler tick lateness in ms (how late vs. the 20 ms interval). */
  schedulerLateMs: number;
  /** 0..1 normalized value of the worst metric. */
  fraction: number;
  /** Human label of the worst metric, e.g. "Audio 23%" or "Main 8%". */
  label: string;
}

/**
 * Pure function: given the three raw signals, pick the dominant one and build its label.
 * Exported for unit tests.
 *
 * @param aAvg   0..1 audio render average, or -1 (unavailable)
 * @param mBusy  0..1 main-thread busy fraction
 * @param sLateMs scheduler lateness EWMA in milliseconds
 */
export function combineLoad(
  aAvg: number,
  mBusy: number,
  sLateMs: number,
): { fraction: number; label: string } {
  const sched = Math.min(1, sLateMs / SCHED_LATE_SCALE_MS);
  type Candidate = { value: number; mkLabel: (pct: number) => string };
  const candidates: Candidate[] = [];
  if (aAvg >= 0) candidates.push({ value: aAvg, mkLabel: (p) => `Audio ${p}%` });
  candidates.push({ value: mBusy, mkLabel: (p) => `Main ${p}%` });
  candidates.push({ value: sched, mkLabel: (p) => `Sched ${p}%` });
  const best = candidates.reduce((a, b) => (b.value > a.value ? b : a));
  return { fraction: best.value, label: best.mkLabel(Math.round(best.value * 100)) };
}

/** Current load state. */
export function getLoad(): LoadSnapshot {
  const { fraction, label } = combineLoad(audioAvg, mainBusy, schedulerLateMs);
  return { audioAvg, audioPeak, underruns, mainBusy, schedulerLateMs, fraction, label };
}

/** Reset all mutable state. For unit tests only. */
export function _resetForTest(): void {
  audioAvg = -1;
  audioPeak = -1;
  underruns = -1;
  mainBusy = 0;
  mainLoadActive = false;
  longFrames.length = 0;
  lastTickAt = 0;
  schedulerLateMs = 0;
}
