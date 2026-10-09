/**
 * Live performance controls on the master and the tracks: a DJ filter (left = low-pass,
 * right = high-pass), tape stop, beat repeat, reverb/delay throws, a crossfader and mute groups.
 * Runtime only: nothing here is saved in the project except the mute groups and crossfader sides.
 */
import { sampleOf } from "../model/tracks";
import * as Tone from "tone";
import { create } from "zustand";
import { useStore } from "../state/store";
import type { Track } from "../model/types";
import {
  audioNow,
  forEachChannel,
  onPanic,
  masterPerfPoints,
  scratchBegin,
  scratchEnd,
  scratchMove,
} from "./engine";
import { nextBarTime, setBeatRepeat, stop } from "./transport";

interface PerfState {
  filter: number; // 0..1, 0.5 = open
  crossfader: number; // 0 = A, 1 = B
  repeat: number | null; // repeat length in steps
  throwA: boolean;
  throwB: boolean;
  tapeStopping: boolean;
  queuedMutes: boolean;
  /** Mute group toggles waiting for the next bar. */
  pending: number[];
}

export const usePerf = create<PerfState>()(() => ({
  filter: 0.5,
  crossfader: 0.5,
  repeat: null,
  throwA: false,
  throwB: false,
  tapeStopping: false,
  queuedMutes: false,
  pending: [],
}));

let chain: { lp: Tone.Filter; hp: Tone.Filter; delay: DelayNode; gain: GainNode } | null = null;

function ensureChain() {
  if (chain) return chain;
  const { input, output } = masterPerfPoints();
  const ctx = Tone.getContext().rawContext as AudioContext;
  const lp = new Tone.Filter({ type: "lowpass", frequency: 20000, Q: 1.2 });
  const hp = new Tone.Filter({ type: "highpass", frequency: 10, Q: 1.2 });
  const delay = ctx.createDelay(5);
  const gain = ctx.createGain();
  input.disconnect();
  input.chain(lp, hp);
  Tone.connect(hp, delay);
  delay.connect(gain);
  Tone.connect(gain, output);
  chain = { lp, hp, delay, gain };
  return chain;
}

/** Stop (D99): the filters ring briefly after the sound ends, so they're built again, as set. */
function flushChain() {
  if (!chain) return;
  const { input } = masterPerfPoints();
  const fresh = (old: Tone.Filter) =>
    new Tone.Filter({ type: old.type, frequency: old.frequency.value, Q: old.Q.value });
  const lp = fresh(chain.lp);
  const hp = fresh(chain.hp);
  input.disconnect();
  chain.lp.dispose();
  chain.hp.dispose();
  input.chain(lp, hp);
  Tone.connect(hp, chain.delay);
  chain.lp = lp;
  chain.hp = hp;
}

/** DJ filter: below 0.5 closes a low-pass, above 0.5 opens a high-pass. */
export function setFilter(v: number) {
  const c = ensureChain();
  usePerf.setState({ filter: v });
  const lpHz = v < 0.5 ? 60 * Math.pow(20000 / 60, v / 0.5) : 20000;
  const hpHz = v > 0.5 ? 10 * Math.pow(8000 / 10, (v - 0.5) / 0.5) : 10;
  c.lp.frequency.rampTo(lpHz, 0.03);
  c.hp.frequency.rampTo(hpHz, 0.03);
}

/** Slow everything down to a halt like a stopping turntable, then stop the transport. */
export function tapeStop(seconds = 1.2) {
  const c = ensureChain();
  if (usePerf.getState().tapeStopping) return;
  usePerf.setState({ tapeStopping: true });
  const t0 = audioNow() + 0.01;
  // pitch falls linearly to 0: the delay grows as t²/2d
  const n = 64;
  const curve = Float32Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * seconds;
    return (t * t) / (2 * seconds);
  });
  c.delay.delayTime.cancelScheduledValues(t0);
  c.delay.delayTime.setValueCurveAtTime(curve, t0, seconds);
  c.gain.gain.setValueAtTime(1, t0 + seconds * 0.6);
  c.gain.gain.linearRampToValueAtTime(0, t0 + seconds);
  setTimeout(
    () => {
      stop();
      const t = audioNow();
      c.delay.delayTime.cancelScheduledValues(t);
      c.delay.delayTime.setValueAtTime(0, t + 0.05);
      c.gain.gain.cancelScheduledValues(t);
      c.gain.gain.setValueAtTime(1, t + 0.06);
      usePerf.setState({ tapeStopping: false });
    },
    seconds * 1000 + 30,
  );
}

/** Beat repeat: loop the current 1/4, 1/8, 1/16… (in steps) while held. */
export function setRepeat(steps: number | null) {
  usePerf.setState({ repeat: steps });
  setBeatRepeat(steps);
}

/** Throw: push every track into the reverb (A) or delay (B) bus while held. */
export function setThrow(bus: "A" | "B", on: boolean) {
  usePerf.setState(bus === "A" ? { throwA: on } : { throwB: on });
  const { throwA, throwB } = usePerf.getState();
  forEachChannel((ch) => ch.setSendBoost(throwA ? 0.9 : 0, throwB ? 0.9 : 0));
}

/** Crossfade between the tracks assigned to side A and side B. */
export function setCrossfader(v: number) {
  usePerf.setState({ crossfader: v });
  applyCrossfader();
}

export function applyCrossfader() {
  const v = usePerf.getState().crossfader;
  const sides = useStore.getState().project.perf.crossfade;
  forEachChannel((ch, trackId) => {
    const side = sides[trackId];
    // both sides at full level in the middle, like a DJ mixer
    const g = side === "A" ? Math.min(1, 2 * (1 - v)) : side === "B" ? Math.min(1, 2 * v) : 1;
    ch.setXfade(g);
  });
}

/** Toggle a mute group now, or at the next bar when mutes are queued. */
export function toggleMuteGroup(i: number) {
  const apply = () => {
    const s = useStore.getState();
    const ids = s.project.perf.muteGroups[i]?.tracks ?? [];
    if (!ids.length) return;
    const anyOn = s.project.tracks.some((t) => ids.includes(t.id) && !t.mute);
    s.commit((p) => {
      for (const t of p.tracks) if (ids.includes(t.id)) t.mute = anyOn;
    });
  };
  const queued = usePerf.getState().queuedMutes && useStore.getState().playing;
  if (!queued) return apply();
  const at = nextBarTime();
  if (at === null) return apply();
  usePerf.setState((s) => ({ pending: [...s.pending, i] }));
  setTimeout(
    () => {
      apply();
      usePerf.setState((s) => ({ pending: s.pending.filter((x) => x !== i) }));
    },
    Math.max(0, (at - audioNow()) * 1000 - 10),
  );
}

/** MIDI-mapped performance controls. */
export function setPerfControl(name: string, v: number, continuous: boolean) {
  const on = continuous ? v >= 0.5 : true;
  if (name === "filter") setFilter(v);
  else if (name === "crossfader") setCrossfader(v);
  else if (name === "tapestop") {
    if (on) tapeStop();
  } else if (name === "throwA") setThrow("A", continuous ? on : !usePerf.getState().throwA);
  else if (name === "throwB") setThrow("B", continuous ? on : !usePerf.getState().throwB);
  else if (name === "repeat") setRepeat(on ? 2 : null);
  else if (name.startsWith("mute")) toggleMuteGroup(Number(name.slice(4)));
  else if (name === "jog") jog(v);
}

let jogTimer = 0;
let jogging: Track | null = null;

/** A MIDI jog wheel (relative CC, learned as "perf:jog") scratches the selected Clip track. */
function jog(v: number) {
  const s = useStore.getState();
  const clip = (t: Track) => t.mode === "clip" && !!sampleOf(t);
  const track =
    s.project.tracks.find((t) => t.id === s.selectedTrackId && clip(t)) ??
    s.project.tracks.find(clip);
  if (!track) return;
  const raw = Math.round(v * 127);
  const ticks = raw < 64 ? raw : raw - 128;
  if (!jogging) {
    jogging = track;
    void scratchBegin(track);
  }
  scratchMove(track.id, Math.max(-4, Math.min(4, ticks / 4)));
  clearTimeout(jogTimer);
  jogTimer = window.setTimeout(() => {
    if (jogging) scratchEnd(jogging);
    jogging = null;
  }, 120);
}

export function startPerf() {
  ensureChain();
  onPanic(flushChain);
  let last = useStore.getState().project.perf;
  useStore.subscribe((s) => {
    if (s.project.perf === last) return;
    last = s.project.perf;
    applyCrossfader();
  });
}
