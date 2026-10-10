import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { combineLoad, notifyTick, getLoad, _resetForTest } from "./load";

beforeEach(() => {
  _resetForTest();
});

afterEach(() => {
  _resetForTest();
});

// ── combineLoad (pure) ────────────────────────────────────────────────────────

describe("combineLoad", () => {
  it("returns Main when audio is unavailable and scheduler is idle", () => {
    const r = combineLoad(-1, 0.08, 0);
    expect(r.label).toBe("Main 8%");
    expect(r.fraction).toBeCloseTo(0.08);
  });

  it("returns Audio when it is the dominant metric", () => {
    const r = combineLoad(0.6, 0.1, 0);
    expect(r.label).toBe("Audio 60%");
    expect(r.fraction).toBeCloseTo(0.6);
  });

  it("returns Sched when scheduler lateness dominates", () => {
    // 60 ms out of 120 ms scale → 50%
    const r = combineLoad(0.1, 0.05, 60);
    expect(r.label).toBe("Sched 50%");
    expect(r.fraction).toBeCloseTo(0.5);
  });

  it("caps Sched fraction at 1.0 when lateness exceeds the 120 ms scale", () => {
    const r = combineLoad(-1, 0, 240);
    expect(r.fraction).toBe(1);
    expect(r.label).toBe("Sched 100%");
  });

  it("includes audio in candidates when aAvg is exactly 0", () => {
    const r = combineLoad(0, 0, 0);
    expect(r.label).toBe("Audio 0%");
  });

  it("picks Main over Sched when they are equal (Main listed first)", () => {
    // main = 0.3, sched = 36/120 = 0.3 — equal; Main comes first in candidates
    const r = combineLoad(-1, 0.3, 36);
    expect(r.fraction).toBeCloseTo(0.3);
    expect(r.label).toBe("Main 30%");
  });

  it("label percent is rounded", () => {
    // 0.076 × 100 = 7.6 → rounds to 8
    const r = combineLoad(-1, 0.076, 0);
    expect(r.label).toBe("Main 8%");
  });
});

// ── notifyTick + schedulerLateMs ──────────────────────────────────────────────

describe("notifyTick lateness measurement", () => {
  it("records lateness when a tick fires late (EWMA α=0.2)", () => {
    let t = 10000;
    const orig = performance.now;
    performance.now = () => t;

    // First call just sets lastTickAt — no measurement yet.
    notifyTick();
    // Second call: 40 ms after first (expected 20 ms) → 20 ms late.
    t += 40;
    notifyTick();
    // EWMA: 0 * 0.8 + 20 * 0.2 = 4 ms
    expect(getLoad().schedulerLateMs).toBeCloseTo(4, 1);

    performance.now = orig;
  });

  it("records zero lateness for on-time ticks", () => {
    let t = 20000;
    const orig = performance.now;
    performance.now = () => t;

    notifyTick();
    t += 20; // exactly on time
    notifyTick();
    expect(getLoad().schedulerLateMs).toBe(0);

    performance.now = orig;
  });

  it("EWMA decays toward 0 after a burst of on-time ticks", () => {
    let t = 30000;
    const orig = performance.now;
    performance.now = () => t;

    // Seed with a very late tick.
    notifyTick();
    t += 200; // 180 ms late
    notifyTick();
    expect(getLoad().schedulerLateMs).toBeGreaterThan(10);

    // Drive down with 40 on-time ticks.
    for (let i = 0; i < 40; i++) {
      t += 20;
      notifyTick();
    }
    expect(getLoad().schedulerLateMs).toBeLessThan(2);

    performance.now = orig;
  });
});
