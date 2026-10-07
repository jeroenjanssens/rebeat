/**
 * The audio engine (no React). It reconciles audio nodes against the project in the store:
 * one channel strip per track, voices for drum hits, a synth per instrument track, clips for
 * audio tracks. The UI reads levels, waveforms and clip positions from here.
 */
import * as Tone from "tone";
import { toUnit } from "../model/params";
import type { Note, Track } from "../model/types";
import { isAudible, useStore } from "../state/store";
import { BusChannel, TrackChannel, faderGain } from "./channel";
import { FxChain } from "./effects";
import { getBuffer, sampleInfo } from "./samples";
import { warper } from "./stretch";
import type { StretchNode } from "signalsmith-stretch";
import { createInstrument, instrumentKey, type InstrumentVoice } from "./instruments";

export interface TriggerOptions {
  /** Audio time; default = now. */
  time?: number;
  ratchet?: number;
  /** Step duration in seconds (for ratchets, gate and note lengths). */
  stepDur?: number;
  notes?: Note[];
  /** Per-step pitch offset in semitones (drum tracks). */
  pitch?: number;
  /** Page transpose in semitones (instrument tracks). */
  transpose?: number;
  gate?: number;
}

interface Voice {
  src: AudioBufferSourceNode;
  env: GainNode;
  trackId: string;
  end: number;
}

interface Clip {
  sources: AudioBufferSourceNode[];
  warp: StretchNode | null;
  start: number;
  /** Seconds of buffer per second of playback. */
  rate: number;
  duration: number;
  loopLength: number;
  oneshot: boolean;
  offset: number;
  bufferDuration: number;
  from: number;
  until: number;
}

const channels = new Map<string, TrackChannel>();
const synths = new Map<string, InstrumentVoice>();
const voices: Voice[] = [];
const clips = new Map<string, Clip>();
const activeUntil = new Map<string, number>();
const scratchState = new Map<string, { pos: number; speed: number }>();

let master: {
  input: Tone.Gain;
  fxOut: Tone.Gain;
  fx: FxChain;
  fader: Tone.Gain;
  /** Performance FX (filter sweep, stutter, tape stop) are spliced in between these two. */
  perfIn: Tone.Gain;
  perfOut: Tone.Gain;
  limiter: Tone.Limiter;
  output: Tone.Gain;
  split: Tone.Split;
  analysers: [AnalyserNode, AnalyserNode];
} | null = null;
const buses = new Map<string, BusChannel>();

const raw = () => Tone.getContext().rawContext as AudioContext;
export const audioNow = () => Tone.getContext().currentTime;

// ---------- graph ----------

function ensureMaster() {
  if (master) return master;
  const input = new Tone.Gain(1);
  const fxOut = new Tone.Gain(1);
  const fx = new FxChain(input, fxOut);
  const fader = new Tone.Gain(1);
  const perfIn = new Tone.Gain(1);
  const perfOut = new Tone.Gain(1);
  // a fixed safety limiter after everything the user controls
  const limiter = new Tone.Limiter(-0.3);
  const output = new Tone.Gain(1);
  const split = new Tone.Split(2);
  const analysers: [AnalyserNode, AnalyserNode] = [raw().createAnalyser(), raw().createAnalyser()];
  for (const a of analysers) {
    a.fftSize = 8192;
    a.smoothingTimeConstant = 0.6;
  }
  fxOut.chain(fader, perfIn);
  perfIn.connect(perfOut);
  perfOut.chain(limiter, output);
  output.toDestination();
  output.connect(split);
  Tone.connect(split, analysers[0], 0, 0);
  Tone.connect(split, analysers[1], 1, 0);
  master = { input, fxOut, fx, fader, perfIn, perfOut, limiter, output, split, analysers };
  return master;
}

function bus(id: string): BusChannel {
  let b = buses.get(id);
  if (!b) {
    b = new BusChannel(ensureMaster().input);
    buses.set(id, b);
  }
  return b;
}

export function getBus(id: string) {
  return buses.get(id);
}

/** The master chain's performance-FX insert point. */
export function masterPerfPoints() {
  const m = ensureMaster();
  return { input: m.perfIn, output: m.perfOut };
}

/** The master bus input (tracks, send returns). */
export function masterInput() {
  return ensureMaster().input;
}

export function masterOutput() {
  return ensureMaster().output;
}

function channel(trackId: string): TrackChannel {
  let ch = channels.get(trackId);
  if (!ch) {
    ch = new TrackChannel(ensureMaster().input);
    ch.sendA.connect(bus("bus-a").input);
    ch.sendB.connect(bus("bus-b").input);
    channels.set(trackId, ch);
    channelListeners.forEach((fn) => fn(trackId, ch!));
  }
  return ch;
}

const channelListeners = new Set<(trackId: string, ch: TrackChannel) => void>();
/** Called when a channel strip is created (effects and sends hook in here). */
export function onChannel(fn: (trackId: string, ch: TrackChannel) => void) {
  channelListeners.add(fn);
  for (const [id, ch] of channels) fn(id, ch);
  return () => channelListeners.delete(fn);
}

export function getChannel(trackId: string) {
  return channels.get(trackId);
}

const lastTracks = new Map<string, { track: Track; audible: boolean; bpm: number }>();

function reconcile() {
  const { project } = useStore.getState();
  const ids = new Set(project.tracks.map((t) => t.id));
  for (const [id, ch] of channels) {
    if (ids.has(id)) continue;
    ch.dispose();
    channels.delete(id);
    synths.get(id)?.dispose();
    synths.delete(id);
    lastTracks.delete(id);
    stopClip(id);
  }
  const bpm = project.bpm;
  for (const t of project.tracks) {
    const audible = isAudible(t.id, project);
    const last = lastTracks.get(t.id);
    // immer keeps unchanged tracks identical: skip them
    if (last && last.track === t && last.audible === audible && last.bpm === bpm) continue;
    lastTracks.set(t.id, { track: t, audible, bpm });
    channel(t.id).update(t, audible, bpm);
    if (t.kind === "instrument") updateSynth(t);
  }
  for (const b of project.buses) bus(b.id).update(b, bpm);
  const m = ensureMaster();
  m.fx.sync(project.master.effects, bpm);
  m.fader.gain.rampTo(faderGain(project.master.volume), 0.02);
  Tone.getTransport().bpm.value = bpm;
}

let started = false;

/** Build the graph and keep it in sync with the store. */
export function initEngine() {
  if (started) return;
  started = true;
  ensureMaster();
  reconcile();
  let last = useStore.getState().project;
  useStore.subscribe((s) => {
    if (s.project === last) return;
    last = s.project;
    reconcile();
  });
}

// ---------- instruments ----------

function instrument(track: Track): InstrumentVoice {
  const key = instrumentKey(track);
  let v = synths.get(track.id);
  if (!v || v.key !== key) {
    v?.dispose();
    v = createInstrument(track, channel(track.id).input);
    synths.set(track.id, v);
  }
  return v;
}

function updateSynth(track: Track) {
  const v = instrument(track);
  v.update(track);
  // instruments use the channel filter for cutoff/resonance
  const p = track.params;
  channel(track.id).setFilter(
    toUnit.hz(p["sound.cutoff"] ?? 0.7),
    toUnit.q(p["sound.reso"] ?? 0.2),
  );
}

/** Loading state of a track's sampled instrument. */
export function instrumentState(trackId: string) {
  return synths.get(trackId)?.state() ?? "ready";
}

// ---------- triggering ----------

function chokeGroup(track: Track) {
  return toUnit.choke(track.params["sound.choke"] ?? 0);
}

function stopVoice(v: Voice, time: number) {
  v.env.gain.cancelScheduledValues(time);
  v.env.gain.setTargetAtTime(0, time, 0.004);
  try {
    v.src.stop(time + 0.03);
  } catch {
    // already stopped
  }
}

function playDrum(track: Track, velocity: number, time: number, o: TriggerOptions) {
  const buffer = getBuffer(track.sampleId);
  if (!buffer) return;
  const ctx = raw();
  const p = track.params;
  const group = chokeGroup(track);
  if (group > 0) {
    const { project } = useStore.getState();
    const members = new Set(project.tracks.filter((t) => chokeGroup(t) === group).map((t) => t.id));
    for (const v of voices) if (members.has(v.trackId) && v.end > time) stopVoice(v, time);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const semis = toUnit.semis(24)(p["sound.tune"] ?? 0.5) + (o.pitch ?? 0);
  src.playbackRate.value = Math.pow(2, semis / 12);
  const env = ctx.createGain();
  const gainDb = toUnit.db(-12, 12)(p["sound.gain"] ?? 0.5);
  const peak = velocity * velocity * Math.pow(10, gainDb / 20);
  const offset = (p["sound.start"] ?? 0) * buffer.duration;
  const natural = (buffer.duration - offset) / src.playbackRate.value;
  const decay = toUnit.drumDecay(p["sound.decay"] ?? 1);
  const gate = o.gate !== undefined && o.gate < 1 && o.stepDur ? o.gate * o.stepDur : Infinity;
  const length = Math.min(natural, decay, gate);
  env.gain.setValueAtTime(peak, time);
  if (length < natural) {
    // hold, then a short exponential release
    env.gain.setTargetAtTime(0, time + length * 0.7, Math.max(0.005, length * 0.12));
  }
  src.connect(env);
  Tone.connect(env, channel(track.id).input);
  const end = time + Math.min(natural, length + 0.25);
  src.start(time, offset);
  src.stop(end);
  const voice: Voice = { src, env, trackId: track.id, end };
  voices.push(voice);
  src.onended = () => {
    env.disconnect();
    const i = voices.indexOf(voice);
    if (i >= 0) voices.splice(i, 1);
  };
  activeUntil.set(track.id, Math.max(activeUntil.get(track.id) ?? 0, end + 0.1));
}

function playNotes(track: Track, velocity: number, time: number, o: TriggerOptions) {
  const notes = o.notes?.length ? o.notes : [{ pitch: 48, length: 1, velocity }];
  const step = o.stepDur ?? 0.125;
  const shift = (track.transpose ?? 0) + (o.transpose ?? 0);
  instrument(track).play(
    shift ? notes.map((n) => ({ ...n, pitch: n.pitch + shift })) : notes,
    time,
    step,
  );
  const dur = Math.max(...notes.map((n) => n.length)) * step;
  const release = toUnit.ms(1, 8000)(track.params["sound.release"] ?? 0.35) / 1000;
  activeUntil.set(track.id, Math.max(activeUntil.get(track.id) ?? 0, time + dur + release + 0.5));
}

/** Play a track's sound (a step, a pad hit, an audition). */
export function trigger(track: Track, velocity: number, o: TriggerOptions = {}) {
  const time = Math.max(audioNow(), o.time ?? audioNow());
  const r = Math.max(1, o.ratchet ?? 1);
  for (let i = 0; i < r; i++) {
    const t = time + (r > 1 && o.stepDur ? (o.stepDur / r) * i : 0);
    const v = i === 0 ? velocity : velocity * 0.85;
    const opts = r > 1 && o.stepDur ? { ...o, stepDur: o.stepDur / r } : o;
    if (track.kind === "instrument") playNotes(track, v, t, opts);
    else if (track.kind === "drum") playDrum(track, v, t, opts);
  }
}

// ---------- audio clips ----------

export function startClip(track: Track, time: number, pageDur: number, oneshot: boolean) {
  stopClip(track.id, time);
  const buffer = getBuffer(track.sampleId);
  if (!buffer || !track.sampleId) return;
  const p = track.params;
  const bpm = useStore.getState().project.bpm;
  const clipBpm = sampleInfo(track.sampleId)?.bpm;
  const pitch = toUnit.semis(12)(p["sound.pitch"] ?? 0.5);
  // warp: follow the song tempo; without a known tempo the clip plays at its own speed
  const ratio = (p["sound.warp"] ?? 1) >= 0.5 && clipBpm ? bpm / clipBpm : 1;
  const startOffset = (p["sound.start"] ?? 0) * buffer.duration;
  let offset = startOffset;
  let t = time;
  const now = audioNow();
  // a loop that was just recorded starts late: join in at the right place
  if (t < now) {
    offset += (now - t) * ratio;
    t = now;
  }
  const loopLength = buffer.duration - startOffset;
  if (!oneshot && loopLength > 0) offset = startOffset + ((offset - startOffset) % loopLength);
  const gain = Math.pow(10, toUnit.db(-12, 12)(p["sound.gain"] ?? 0.5) / 20);
  const playable = oneshot ? (buffer.duration - offset) / ratio : pageDur - (t - time);
  const end = t + Math.max(0, Math.min(pageDur - (t - time), playable));
  const dest = channel(track.id).input;

  let warp: StretchNode | null = null;
  const sources: AudioBufferSourceNode[] = [];
  if (Math.abs(ratio - 1) > 0.002 || Math.abs(pitch) > 0.01) {
    warp = warper(track.id, track.sampleId, dest);
    if (warp) {
      warp.schedule({
        output: t,
        active: true,
        input: offset,
        rate: ratio,
        semitones: pitch,
        loopStart: oneshot ? 0 : startOffset,
        loopEnd: oneshot ? 0 : buffer.duration,
      });
      warp.schedule({ output: end, active: false });
    }
  }
  const play = (buf: AudioBuffer, level: number, isMain: boolean) => {
    if (isMain && warp) return;
    const src = raw().createBufferSource();
    src.buffer = buf;
    // repitch fallback: speed and pitch change together
    src.playbackRate.value = ratio * (warp ? 1 : Math.pow(2, pitch / 12));
    const env = raw().createGain();
    env.gain.value = level;
    src.connect(env);
    Tone.connect(env, dest);
    if (!oneshot) {
      src.loop = true;
      src.loopStart = Math.min(startOffset, buf.duration);
      src.loopEnd = buf.duration;
    }
    src.start(t, Math.min(offset, Math.max(0, buf.duration - 0.001)));
    src.stop(end + 0.005);
    src.onended = () => env.disconnect();
    sources.push(src);
  };
  play(buffer, gain, true);
  for (const l of track.layers ?? []) {
    const lb = getBuffer(l.sampleId);
    if (lb && !l.mute) play(lb, gain * l.gain, false);
  }
  clips.set(track.id, {
    sources,
    warp,
    start: t - (offset - startOffset) / ratio,
    rate: ratio,
    duration: end - t,
    loopLength: loopLength / ratio,
    oneshot,
    offset: startOffset,
    bufferDuration: buffer.duration,
    from: t,
    until: end,
  });
  activeUntil.set(track.id, end + 0.1);
}

export function stopClip(trackId: string, time = audioNow()) {
  const c = clips.get(trackId);
  if (!c) return;
  const at = Math.max(time, audioNow());
  for (const src of c.sources)
    try {
      src.stop(at);
    } catch {
      // not started or already stopped
    }
  c.warp?.schedule({ output: at, active: false });
  clips.delete(trackId);
}

/** Clip playhead (0..1 of the sample) or null when it isn't playing. */
export function clipPosition(trackId: string): number | null {
  const sc = scratchState.get(trackId);
  if (sc) return sc.pos;
  const c = clips.get(trackId);
  const now = audioNow();
  if (!c || now < c.from || now > c.until) return null;
  // `start` is where the clip would have started from its beginning (earlier for late joins)
  const t = now - c.start;
  const into = c.oneshot ? t : t % c.loopLength;
  return (c.offset + into * c.rate) / c.bufferDuration;
}

/** Scratching (a simple version; the AudioWorklet scratch voice arrives in Phase 8). */
export function scratch(track: Track, pos: number | null, speed = 0) {
  if (pos === null) scratchState.delete(track.id);
  else scratchState.set(track.id, { pos, speed });
}

export function stopAll() {
  const t = audioNow();
  for (const v of voices) stopVoice(v, t);
  for (const id of [...clips.keys()]) stopClip(id, t);
  for (const v of synths.values()) v.releaseAll(t);
}

// ---------- metering ----------

const scratchBufs = new Map<string, Float32Array<ArrayBuffer>>();
const levelCache = new Map<string, { at: number; level: number }>();

function buf(key: string, n: number) {
  let b = scratchBufs.get(key);
  if (!b || b.length !== n) {
    b = new Float32Array(n);
    scratchBufs.set(key, b);
  }
  return b;
}

function isActive(trackId: string) {
  return (activeUntil.get(trackId) ?? 0) > audioNow();
}

/** Time-domain samples of a track (after effects and fader), or null when silent. */
export function waveform(trackId: string): Float32Array | null {
  const ch = channels.get(trackId);
  if (!ch || !isActive(trackId)) return null;
  const b = buf(trackId, ch.analyser.fftSize);
  ch.analyser.getFloatTimeDomainData(b);
  return b;
}

/** Peak level (0..1) of a track; 0 without reading the analyser when nothing plays. */
export function level(trackId: string): number {
  const now = performance.now();
  const c = levelCache.get(trackId);
  if (c && now - c.at < 8) return c.level;
  const w = waveform(trackId);
  let peak = 0;
  if (w) for (let i = 0; i < w.length; i++) peak = Math.max(peak, Math.abs(w[i]));
  const l = Math.min(1, peak);
  levelCache.set(trackId, { at: now, level: l });
  return l;
}

/** Peak level of a send/return bus. */
export function busLevel(id: string): number {
  const b = buses.get(id);
  if (!b) return 0;
  const w = buf(`bus${id}`, b.analyser.fftSize);
  b.analyser.getFloatTimeDomainData(w);
  let peak = 0;
  for (let i = 0; i < w.length; i += 2) peak = Math.max(peak, Math.abs(w[i]));
  return Math.min(1, peak);
}

/** Frequency data (dB per bin) of a track, for the spectrum view. */
export function spectrum(trackId: string): Float32Array | null {
  const ch = channels.get(trackId);
  if (!ch) return null;
  const b = buf(`spec${trackId}`, ch.analyser.frequencyBinCount);
  ch.analyser.getFloatFrequencyData(b);
  return b;
}

/** Master output L/R peak levels. */
export function masterLevel(): [number, number] {
  const m = master;
  if (!m) return [0, 0];
  return m.analysers.map((a, i) => {
    const b = buf(`master${i}`, a.fftSize);
    a.getFloatTimeDomainData(b);
    let peak = 0;
    // only the most recent ~23 ms: the analyser keeps much more for the master scope
    for (let j = b.length - 1024; j < b.length; j++) peak = Math.max(peak, Math.abs(b[j]));
    return Math.min(1, peak);
  }) as [number, number];
}

/** Master output L/R time-domain data (for the master scope). */
export function masterWaveform(): [Float32Array, Float32Array] | null {
  const m = master;
  if (!m) return null;
  return m.analysers.map((a, i) => {
    const b = buf(`masterw${i}`, a.fftSize);
    a.getFloatTimeDomainData(b);
    return b;
  }) as [Float32Array, Float32Array];
}

export function masterAnalysers() {
  return ensureMaster().analysers;
}
