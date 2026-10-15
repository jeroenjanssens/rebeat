/**
 * The audio engine (no React). It reconciles audio nodes against the project in the store:
 * one channel strip per track, S.voices for drum hits, a synth per instrument track, S.clips for
 * audio tracks. The UI reads levels, waveforms and clip positions from here.
 */
import * as Tone from "tone";
import { toUnit } from "../model/params";
import type { AudioRegion, Note, NoteBend, Track } from "../model/types";
import { releaseTail } from "../model/bend";
import type { Project } from "../model/project";
import { isAudible, useStore } from "../state/store";
import { BusChannel, TrackChannel, faderGain } from "./channel";
import { FxChain, automatedParams, schedule, type AutoEvent } from "./effects";
import { getBuffer, sampleInfo } from "./samples";
import { disposeWarper, warper } from "./stretch";
import type { StretchNode } from "signalsmith-stretch";
import { createInstrument, instrumentKey, type InstrumentVoice } from "./instruments";
import { detectRootNote } from "../library/pitch";
import type { WorkletSynth } from "./synth/node";
import { macroValues } from "../library/synthTrack";
import { synthPath, synthValue } from "../model/synthAutomation";
import { patchPath } from "../model/patchSwitches";
import { hitNoteOf, hitNotes, player, sampleOf, soundChanged } from "../model/tracks";

export interface TriggerOptions {
  /** Audio time; default = now. */
  time?: number;
  ratchet?: number;
  /** Step duration in seconds (for ratchets, gate and note lengths). */
  stepDur?: number;
  notes?: Note[];
  /** Per-step pitch offset in semitones (Hits mode). */
  pitch?: number;
  /** Page transpose in semitones (Notes mode). */
  transpose?: number;
  /** Parameter locks for this step ("sound.tune" → value). */
  locks?: Record<string, number>;
  gate?: number;
  /** Play into this input instead of the track's channel (the keys' live channel, D134). */
  dest?: Tone.InputNode;
}

interface Voice {
  src: AudioBufferSourceNode;
  env: GainNode;
  trackId: string;
  end: number;
}

interface Clip {
  sources: AudioBufferSourceNode[];
  gains: GainNode[];
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
  /** The sample's own tempo (warped clips follow tempo changes, D192), and its pitch factor. */
  clipBpm: number | null;
  repitch: number;
}

interface Master {
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
}

/**
 * Everything the engine builds for one audio context. The live engine has one; offline
 * rendering (export, resampling) runs the same code against a fresh scope.
 */
export interface EngineScope {
  channels: Map<string, TrackChannel>;
  synths: Map<string, InstrumentVoice>;
  /** Separate voice per track for live (keys) play — never used offline. */
  liveVoices: Map<string, InstrumentVoice>;
  /** The keys' own channel per track (D134): its sound and effects, but unmuted and at 0 dB
   * unless recording. */
  liveChannels: Map<string, TrackChannel>;
  voices: Set<Voice>;
  /** Choke group membership: group number → track ids. Built in reconcile so playDrum never
   * reads the store. Only groups > 0 appear. */
  chokeMap: Map<number, Set<string>>;
  clips: Map<string, Clip>;
  activeUntil: Map<string, number>;
  scratchState: Map<string, { pos: number; speed: number }>;
  master: Master | null;
  buses: Map<string, BusChannel>;
  lastTracks: Map<string, { track: Track; audible: boolean; bpm: number }>;
  live: boolean;
  /** The tempo the transport plays at (D192: tempo changes); null = the project's. */
  tempo: number | null;
  /** The tempo the graph was last reconciled at. */
  builtBpm: number;
  /** Automation (D186): where each lane's last step ended (a jump sets its value first), and
   * the tracks whose synths are automated (D228). */
  autoLast: Map<string, number>;
  autoSynths: Set<string>;
}

export function newScope(live = false): EngineScope {
  return {
    channels: new Map(),
    synths: new Map(),
    liveVoices: new Map(),
    liveChannels: new Map(),
    voices: new Set(),
    chokeMap: new Map(),
    clips: new Map(),
    activeUntil: new Map(),
    scratchState: new Map(),
    master: null,
    buses: new Map(),
    lastTracks: new Map(),
    live,
    tempo: null,
    builtBpm: 120,
    autoLast: new Map(),
    autoSynths: new Set(),
  };
}

let S: EngineScope = newScope(true);

/** Resolves when every effect in a scope is ready to process audio. */
export function scopeReady(scope: EngineScope) {
  return Promise.all([
    ...[...scope.channels.values()].map((c) => c.ready()),
    ...[...scope.buses.values()].map((b) => b.ready()),
    scope.master?.fx.ready(),
    // sampled instruments load their samples (from the browser's cache after the first time)
    ...[...scope.synths.values()].map((v) => untilLoaded(v)),
  ]);
}

/** Resolves when every synth in a scope has the notes sent to it (before an offline render). */
export function scopeSettled(scope: EngineScope) {
  return Promise.all([...scope.synths.values()].map((v) => v.synth?.settled()));
}

/** Wait (up to 30 s) until an instrument has its samples, or failed to get them. */
async function untilLoaded(v: InstrumentVoice) {
  const end = performance.now() + 30_000;
  while (v.state() === "loading" && performance.now() < end)
    await new Promise((r) => setTimeout(r, 100));
}

/** Run engine code against another scope (e.g. inside Tone.Offline). */
export function withScope<T>(scope: EngineScope, fn: () => T): T {
  const prev = S;
  S = scope;
  try {
    return fn();
  } finally {
    S = prev;
  }
}

const raw = () => Tone.getContext().rawContext as AudioContext;
export const audioNow = () => Tone.getContext().currentTime;

// ---------- graph ----------

function ensureMaster() {
  if (S.master) return S.master;
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
  S.master = { input, fxOut, fx, fader, perfIn, perfOut, limiter, output, split, analysers };
  return S.master;
}

function bus(id: string): BusChannel {
  let b = S.buses.get(id);
  if (!b) {
    b = new BusChannel(ensureMaster().input);
    S.buses.set(id, b);
  }
  return b;
}

/** The master chain's performance-FX insert point. */
export function masterPerfPoints() {
  const m = ensureMaster();
  return { input: m.perfIn, output: m.perfOut };
}

export function masterOutput() {
  return ensureMaster().output;
}

function channel(trackId: string): TrackChannel {
  let ch = S.channels.get(trackId);
  if (!ch) {
    ch = new TrackChannel(ensureMaster().input);
    ch.sendA.connect(bus("bus-a").input);
    ch.sendB.connect(bus("bus-b").input);
    S.channels.set(trackId, ch);
  }
  return ch;
}

export function getChannel(trackId: string) {
  return S.channels.get(trackId);
}

export function forEachChannel(fn: (ch: TrackChannel, trackId: string) => void) {
  for (const [id, ch] of S.channels) fn(ch, id);
}

/** Build/update the audio graph for a project (live: on every change; offline: once). */
export function reconcile(project: Project = useStore.getState().project) {
  const ids = new Set(project.tracks.map((t) => t.id));
  for (const [id, ch] of S.channels) {
    if (ids.has(id)) continue;
    // One place where all per-track runtime state dies: channels, voices, warpers, scratches,
    // the level/activity caches. Keep this list complete.
    ch.dispose();
    S.channels.delete(id);
    S.synths.get(id)?.dispose();
    S.synths.delete(id);
    S.liveVoices.get(id)?.dispose();
    S.liveVoices.delete(id);
    S.liveChannels.get(id)?.dispose();
    S.liveChannels.delete(id);
    clearTimeout(liveIdleTimers.get(id));
    liveIdleTimers.delete(id);
    S.lastTracks.delete(id);
    stopClip(id);
    // time-stretch WASM nodes (created lazily for Clip tracks)
    disposeWarper(id);
    // scratch worklet nodes (created lazily for Clip tracks)
    const scratch = scratches.get(id);
    if (scratch) {
      scratch.node.disconnect();
      scratches.delete(id);
    }
    // per-track level and activity caches
    S.activeUntil.delete(id);
    levelCache.delete(id);
  }
  // while the song plays its tempo changes, synced things follow the transport's tempo
  const bpm = S.tempo ?? project.bpm;
  S.builtBpm = bpm;
  for (const t of project.tracks) {
    const audible = isAudible(t.id, project);
    const last = S.lastTracks.get(t.id);
    // immer keeps unchanged tracks identical: skip them
    if (last && last.track === t && last.audible === audible && last.bpm === bpm) continue;
    S.lastTracks.set(t.id, { track: t, audible, bpm });
    channel(t.id).update(t, audible, bpm);
    S.liveChannels.get(t.id)?.update(liveView(t), true, bpm);
    // a level, pan or send (a controller's fader) is the channel's: the voice keeps its patch
    const voiceSame = last && last.bpm === bpm && !soundChanged(last.track, t);
    if (player(t) === "voice" && voiceSame && S.synths.has(t.id)) continue;
    if (player(t) === "voice") {
      updateSynth(t, bpm);
      // keep the live voice in sync; if the instrument key changed, rebuild it
      if (S.live) {
        const lv = S.liveVoices.get(t.id);
        if (lv) {
          if (lv.key !== instrumentKey(t)) {
            lv.dispose();
            S.liveVoices.delete(t.id);
          } else {
            lv.update(t, bpm);
          }
        }
      }
    } else if (S.synths.has(t.id)) {
      // switched to playing hits of its sample, or a clip: the voice isn't needed any more
      S.synths.get(t.id)!.dispose();
      S.synths.delete(t.id);
      // also the live voice
      S.liveVoices.get(t.id)?.dispose();
      S.liveVoices.delete(t.id);
    }
  }
  for (const b of project.buses) bus(b.id).update(b, bpm);
  const m = ensureMaster();
  m.fx.sync(project.master.effects, bpm);
  m.fader.gain.rampTo(faderGain(project.master.volume), 0.02);
  Tone.getTransport().bpm.value = bpm;
  // rebuild choke group membership so playDrum doesn't need the store
  S.chokeMap.clear();
  for (const t of project.tracks) {
    const g = chokeGroup(t);
    if (g > 0) {
      let members = S.chokeMap.get(g);
      if (!members) S.chokeMap.set(g, (members = new Set()));
      members.add(t.id);
    }
  }
}

let started = false;

// ---------- Keys channel (library sounds on the keys, D126) ----------

interface KeysChannel {
  channel: TrackChannel;
  voice: InstrumentVoice;
  /** The library sound as a track (not in the project): its level and sends are the strip's. */
  track: Track;
}

/** The Keys strip (D126, D212): level, sends, pan (as a track's), mute and insert effects. */
export interface KeysMix {
  volume: number;
  sendA: number;
  sendB: number;
  pan?: number;
  mute?: boolean;
  effects?: Track["effects"];
}

const withMix = (track: Track, mix: KeysMix): Track => ({
  ...track,
  volume: mix.volume,
  mute: !!mix.mute,
  effects: mix.effects ?? [],
  params: {
    ...track.params,
    "mix.sendA": mix.sendA,
    "mix.sendB": mix.sendB,
    "mix.pan": mix.pan ?? 0.5,
  },
});

let keysChannelEntry: KeysChannel | null = null;
let keysChannelDisposeTimer = 0;

/**
 * Create (or replace) the Keys channel for a library track. The channel connects to the master
 * so the sound goes through the DJ filter and the performance tools, unlike previews.
 */
export function createKeysChannel(sound: Track, mix: KeysMix): KeysChannel {
  disposeKeysChannel(true);
  const track = withMix(sound, mix);
  const ch = new TrackChannel(ensureMaster().input);
  ch.sendA.connect(bus("bus-a").input);
  ch.sendB.connect(bus("bus-b").input);
  ch.update(track, !track.mute, useStore.getState().project.bpm);
  const v = createInstrument(track, ch.input);
  v.update(track, useStore.getState().project.bpm);
  keysChannelEntry = { channel: ch, voice: v, track };
  return keysChannelEntry;
}

/** Set the Keys strip's level and sends. */
export function setKeysChannelMix(mix: KeysMix) {
  const e = keysChannelEntry;
  if (!e) return;
  e.track = withMix(e.track, mix);
  e.channel.update(e.track, !e.track.mute, useStore.getState().project.bpm);
}

/** Peak level (0..1) of the Keys strip. */
export function keysLevel(): number {
  const ch = keysChannelEntry?.channel;
  if (!ch) return 0;
  const b = buf("keys", ch.analyser.fftSize);
  ch.analyser.getFloatTimeDomainData(b);
  let peak = 0;
  for (let i = 0; i < b.length; i += 2) peak = Math.max(peak, Math.abs(b[i]));
  return Math.min(1, peak);
}

/** The current Keys channel, if any. */
export function getKeysChannel(): KeysChannel | null {
  return keysChannelEntry;
}

/** Dispose the Keys channel (after a short tail so notes don't cut off). */
export function disposeKeysChannel(immediately = false) {
  const entry = keysChannelEntry;
  if (!entry) return;
  keysChannelEntry = null;
  clearTimeout(keysChannelDisposeTimer);
  const t = audioNow();
  entry.voice.releaseAll(t);
  const delay = immediately ? 0 : 3000;
  keysChannelDisposeTimer = window.setTimeout(() => {
    entry.voice.dispose();
    entry.channel.dispose();
  }, delay);
}

/** Build the graph and keep it in sync with the store. */
export function initEngine() {
  if (started) return;
  started = true;
  ensureMaster();
  reconcile();
  let last = useStore.getState().project;
  let recording = useStore.getState().recording;
  useStore.subscribe((s) => {
    if (s.recording !== recording) {
      // the keys' channels play at the track's level while recording (D134)
      recording = s.recording;
      for (const t of s.project.tracks)
        S.liveChannels.get(t.id)?.update(liveView(t), true, s.project.bpm);
    }
    if (s.project === last) return;
    last = s.project;
    reconcile();
  });
}

// ---------- instruments ----------

function instrument(track: Track): InstrumentVoice {
  const key = instrumentKey(track);
  let v = S.synths.get(track.id);
  if (!v || v.key !== key) {
    v?.dispose();
    v = createInstrument(track, channel(track.id).input);
    S.synths.set(track.id, v);
  }
  return v;
}

/** Idle-disposal timers for live voices (live scope only). */
const liveIdleTimers = new Map<string, number>();

/**
 * The live voice for a track: a second InstrumentVoice that the keys play, separate from the
 * sequencer's main voice. Created lazily; disposed after 30 s idle or on track removal (D126).
 */
function liveInstrument(track: Track): InstrumentVoice {
  const key = instrumentKey(track);
  let v = S.liveVoices.get(track.id);
  if (!v || v.key !== key) {
    v?.dispose();
    v = createInstrument(track, liveChannel(track).input);
    S.liveVoices.set(track.id, v);
    if (monitored.has(track.id)) v.synth?.monitor(true);
  }
  // cancel any pending idle disposal
  clearTimeout(liveIdleTimers.get(track.id));
  liveIdleTimers.delete(track.id);
  return v;
}

/**
 * What the keys' channel of a track plays like (D134): the track's sound and effects, but
 * heard even when the track is muted (or another is soloed), and at 0 dB unless you're
 * recording (then at the track's level, as it will play back).
 */
function liveView(t: Track): Track {
  return { ...t, mute: false, solo: false, volume: useStore.getState().recording ? t.volume : 0.8 };
}

function liveChannel(track: Track): TrackChannel {
  let ch = S.liveChannels.get(track.id);
  if (!ch) {
    ch = new TrackChannel(ensureMaster().input);
    ch.sendA.connect(bus("bus-a").input);
    ch.sendB.connect(bus("bus-b").input);
    S.liveChannels.set(track.id, ch);
    ch.update(liveView(track), true, useStore.getState().project.bpm);
    const p = track.params;
    if (player(track) === "voice")
      ch.setFilter(toUnit.hz(p["sound.cutoff"] ?? 1), toUnit.q(p["sound.reso"] ?? 0.2));
  }
  return ch;
}

/** After 30 s without a live note, the keys' voice and channel of a track go. */
function idleLive(trackId: string) {
  clearTimeout(liveIdleTimers.get(trackId));
  liveIdleTimers.set(
    trackId,
    window.setTimeout(() => {
      S.liveVoices.get(trackId)?.dispose();
      S.liveVoices.delete(trackId);
      S.liveChannels.get(trackId)?.dispose();
      S.liveChannels.delete(trackId);
      liveIdleTimers.delete(trackId);
    }, 30_000),
  );
}

/** The key a sample plays as it is on (D133): its sound's root, else its detected pitch. */
const roots = new Map<string, number>();
function sampleRootNote(track: Track): number {
  if (track.sound?.rootNote !== undefined) return track.sound.rootNote;
  const id = sampleOf(track);
  if (!id) return 60;
  let root = roots.get(id);
  if (root === undefined) {
    const buffer = getBuffer(id);
    root = (buffer && detectRootNote(buffer)) ?? 60;
    if (buffer) roots.set(id, root);
  }
  return root;
}

/**
 * A sample from the keys (D134): `pitch` against its base key, played to its end like a pad (a
 * tap plays the whole kick); a long sample (over 2 s) stops when the key is let go. Into the
 * track's live channel, or the Keys strip ("keys") for a library sample. Returns the release.
 */
export function playKeysSample(
  track: Track,
  pitch: number,
  velocity: number,
  into: "track" | "keys" = "track",
  at = audioNow(),
): (end?: number) => void {
  const dest = into === "keys" ? keysChannelEntry?.channel.input : liveChannel(track).input;
  if (!dest) return () => {};
  const voice = playDrum(track, velocity, at, {
    pitch: pitch - sampleRootNote(track),
    dest,
  });
  if (into === "track" && S.live) idleLive(track.id);
  const buffer = getBuffer(sampleOf(track));
  return (end = audioNow()) => {
    if (voice && buffer && buffer.duration > 2) stopVoice(voice, Math.max(end, at));
  };
}

function updateSynth(track: Track, bpm: number) {
  const v = instrument(track);
  v.update(track, bpm);
  // instruments use the channel filter for cutoff/resonance
  const p = track.params;
  const hz = toUnit.hz(p["sound.cutoff"] ?? 1);
  const q = toUnit.q(p["sound.reso"] ?? 0.2);
  channel(track.id).setFilter(hz, q);
  S.liveChannels.get(track.id)?.setFilter(hz, q);
}

/** Loading state of a track's sampled instrument. */
export function instrumentState(trackId: string) {
  return S.synths.get(trackId)?.state() ?? "ready";
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
  const buffer = getBuffer(sampleOf(track));
  if (!buffer) return undefined;
  const ctx = raw();
  const p = o.locks ? { ...track.params, ...o.locks } : track.params;
  const group = chokeGroup(track);
  if (group > 0) {
    const members = S.chokeMap.get(group);
    if (members)
      for (const v of S.voices) if (members.has(v.trackId) && v.end > time) stopVoice(v, time);
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
  Tone.connect(env, o.dest ?? channel(track.id).input);
  const end = time + Math.min(natural, length + 0.25);
  if (o.locks && !o.dest)
    channel(track.id).lockStep(o.locks, track.params, time, time + (o.stepDur ?? 0.12));
  src.start(time, offset);
  src.stop(end);
  const voice: Voice = { src, env, trackId: track.id, end };
  S.voices.add(voice);
  src.onended = () => {
    env.disconnect();
    S.voices.delete(voice);
  };
  S.activeUntil.set(track.id, Math.max(S.activeUntil.get(track.id) ?? 0, end + 0.1));
  return voice;
}

function playNotes(track: Track, velocity: number, time: number, o: TriggerOptions) {
  const notes = o.notes?.length ? o.notes : [{ pitch: 48, length: 1, velocity }];
  const step = o.stepDur ?? 0.125;
  const shift = (track.transpose ?? 0) + (o.transpose ?? 0);
  const voice = instrument(track);
  // parameter locks on a synth's macros hold for the step's notes
  const locked = o.locks && Object.keys(o.locks).filter((k) => k.startsWith("sound.macro"));
  if (voice.synth && locked?.length) {
    const values = macroValues({ ...track, params: { ...track.params, ...o.locks } });
    voice.synth.lockMacros(values, time, time + Math.max(...notes.map((n) => n.length)) * step);
  }
  const pitched = shift ? notes.map((n) => ({ ...n, pitch: n.pitch + shift })) : notes;
  // Notes with a non-zero offset (D128) start at time + offset × stepDur; clamp to audioNow()
  // so a negative offset on the very first scheduled step never goes below the context's time.
  const hasOffsets = pitched.some((n) => n.offset);
  if (hasOffsets) {
    for (const n of pitched) {
      const t = n.offset ? Math.max(audioNow(), time + n.offset * step) : time;
      voice.play([n], t, step);
    }
  } else {
    voice.play(pitched, time, step);
  }
  const maxOffset = hasOffsets ? Math.max(...pitched.map((n) => (n.offset ?? 0) * step)) : 0;
  const secPerQ = 60 / (S.tempo ?? useStore.getState().project.bpm);
  // a Fall or a Doit sounds on after the note (D221)
  const tails = Math.max(0, ...notes.map((n) => (n.bend ? releaseTail(n.bend, secPerQ) : 0)));
  const dur = maxOffset + Math.max(...notes.map((n) => n.length)) * step + tails;
  const release = toUnit.ms(1, 8000)(track.params["sound.release"] ?? 0.35) / 1000;
  S.activeUntil.set(
    track.id,
    Math.max(S.activeUntil.get(track.id) ?? 0, time + dur + release + 0.5),
  );
}

/**
 * Clicking a wave (A1): hear the track once, as it plays it. Hits: a hit; Notes: a note at the
 * root; Clip: the clip from its start (again: stop). Returns how long it sounds in seconds (0 when
 * nothing has a playhead), for the playhead on the wave.
 */
export function playOnce(track: Track): number {
  const t = audioNow() + 0.01;
  if (player(track) === "clip") {
    if (S.clips.has(track.id)) {
      stopClip(track.id);
      return 0;
    }
    // while the song plays, the clip plays with it
    if (useStore.getState().playing) return 0;
    startClip(track, t, 3600, true);
    return 0;
  }
  if (player(track) === "voice") {
    // a sample plays at its own pitch (its root note)
    const pitch = hitNoteOf(track);
    const buffer = getBuffer(sampleOf(track));
    const length = buffer ? Math.max(1, buffer.duration / 0.125) : 4;
    playNotes(track, 0.8, t, { notes: [{ pitch, length, velocity: 0.8 }], stepDur: 0.125 });
    return buffer?.duration ?? 0;
  }
  trigger(track, 0.8, { time: t });
  const buffer = getBuffer(sampleOf(track));
  if (!buffer) return 0;
  const p = track.params;
  const rate = Math.pow(2, toUnit.semis(24)(p["sound.tune"] ?? 0.5) / 12);
  const start = (p["sound.start"] ?? 0) * buffer.duration;
  return Math.min((buffer.duration - start) / rate, toUnit.drumDecay(p["sound.decay"] ?? 1));
}

/** The synth of a track (live engine), if it plays one. */
export function trackSynth(track: Track) {
  return player(track) === "voice" ? instrument(track).synth : undefined;
}

/** Start a note on a track's voice that sounds until released (on-screen and MIDI keys). */
export function holdNote(
  track: Track,
  pitch: number,
  velocity: number,
  at = audioNow(),
  bend?: NoteBend,
): (end?: number) => void {
  if (player(track) !== "voice") return () => {};
  const shift = track.transpose ?? 0;
  // live scope: use the dedicated live voice so keys never cut sequenced notes (D126)
  const v = S.live ? liveInstrument(track) : instrument(track);
  const t = at;
  S.activeUntil.set(track.id, Infinity);
  const release =
    v.hold?.(pitch + shift, velocity, t, bend) ??
    // instruments without held notes: a long note
    (v.play([{ pitch: pitch + shift, length: 8, velocity }], t, 0.125), () => {});
  return (at = audioNow()) => {
    // a note that ends before it starts (a short arp gate) ends just after it
    const end = Math.max(at, t + 0.005);
    release(end);
    // a Fall or a Doit sounds on after the release (D221)
    const tail =
      toUnit.ms(1, 8000)(track.params["sound.release"] ?? 0.35) / 1000 +
      (bend ? releaseTail(bend, 60 / (S.tempo ?? useStore.getState().project.bpm)) : 0);
    S.activeUntil.set(track.id, end + Math.max(tail, 2) + 0.5);
    if (S.live) idleLive(track.id);
  };
}

/**
 * The synth of the live voice for a track, if it exists. Used by keysControl to send pitch
 * bend, mod wheel and aftertouch to the keys' voice without interfering with the sequencer.
 */
export function liveVoiceSynth(track: Track) {
  return S.liveVoices.get(track.id)?.synth;
}

/** Tracks whose synth the editor watches (their live voices report modulation too). */
const monitored = new Set<string>();
type EditorSynth = Pick<WorkletSynth, "monitor" | "modulation" | "control">;
const editorSynths = new Map<string, EditorSynth>();

/**
 * What the synth editor watches and its wheels move: both of a track's voices, the keys' first
 * (you play the editor's keyboard on the live voice, D126).
 */
export function editorSynth(track: Track): EditorSynth | undefined {
  if (player(track) !== "voice") return undefined;
  let e = editorSynths.get(track.id);
  if (!e) {
    const id = track.id;
    const main = () => S.synths.get(id)?.synth;
    const live = () => S.liveVoices.get(id)?.synth;
    e = {
      monitor(on) {
        if (on) monitored.add(id);
        else monitored.delete(id);
        main()?.monitor(on);
        live()?.monitor(on);
      },
      modulation: () => live()?.modulation() ?? main()?.modulation() ?? null,
      control(name, value) {
        main()?.control(name, value);
        live()?.control(name, value);
      },
    };
    editorSynths.set(id, e);
  }
  // the main voice exists from here on (as trackSynth made sure before)
  instrument(track);
  return e;
}

/**
 * A hit on a voice (a synth or sampled instrument in Hits mode, D93): one note at the track's hit
 * note plus the step's pitch, as long as the step's gate. Transposes (the track's and the
 * page's) are for notes: they don't move hits, so the track's is taken back out.
 */
function hitOptions(track: Track, velocity: number, o: TriggerOptions): TriggerOptions {
  return {
    ...o,
    transpose: -(track.transpose ?? 0),
    notes: hitNotes(track, velocity, o.pitch, o.gate),
  };
}

/** Play a track's sound (a step, a pad hit, an audition). */
export function trigger(track: Track, velocity: number, o: TriggerOptions = {}) {
  const time = Math.max(audioNow(), o.time ?? audioNow());
  const r = Math.max(1, o.ratchet ?? 1);
  for (let i = 0; i < r; i++) {
    const t = time + (r > 1 && o.stepDur ? (o.stepDur / r) * i : 0);
    const v = i === 0 ? velocity : velocity * 0.85;
    const opts = r > 1 && o.stepDur ? { ...o, stepDur: o.stepDur / r } : o;
    const who = player(track);
    if (who === "drum") playDrum(track, v, t, opts);
    else if (who === "voice" && track.mode === "hits")
      playNotes(track, v, t, hitOptions(track, v, opts));
    else if (who === "voice") playNotes(track, v, t, opts);
  }
}

// ---------- audio S.clips ----------

export function startClip(track: Track, time: number, pageDur: number, oneshot: boolean) {
  stopClip(track.id, time);
  const sampleId = sampleOf(track);
  const buffer = getBuffer(sampleId);
  if (!buffer || !sampleId) return;
  const p = track.params;
  const bpm = S.tempo ?? useStore.getState().project.bpm;
  const clipBpm = sampleInfo(sampleId)?.bpm;
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
  const gains: GainNode[] = [];
  // offline renders repitch: the stretch nodes belong to the live engine
  if (S.live && (Math.abs(ratio - 1) > 0.002 || Math.abs(pitch) > 0.01)) {
    warp = warper(track.id, sampleId, dest);
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
    // Fade in / Fade out (SOUND bank): when the clip starts and before it stops on a page
    const fadeIn =
      (p["sound.fadein"] ?? 0) > 0.001 ? toUnit.ms(1, 2000)(p["sound.fadein"]) / 1000 : 0;
    const fadeOut =
      (p["sound.fadeout"] ?? 0) > 0.001 ? toUnit.ms(1, 2000)(p["sound.fadeout"]) / 1000 : 0;
    if (fadeIn) {
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(level, t + Math.min(fadeIn, end - t));
    }
    if (fadeOut && end - fadeOut > t + fadeIn) {
      env.gain.setValueAtTime(level, end - fadeOut);
      env.gain.linearRampToValueAtTime(0, end);
    }
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
    gains.push(env);
  };
  play(buffer, gain, true);
  for (const l of track.layers ?? []) {
    const lb = getBuffer(l.sampleId);
    if (lb && !l.mute) play(lb, gain * l.gain, false);
  }
  // a clip that restarts while scratching stays silent until the platter is let go
  if (S.scratchState.has(track.id)) for (const g of gains) g.gain.value = 0;
  S.clips.set(track.id, {
    sources,
    gains,
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
    clipBpm: (p["sound.warp"] ?? 1) >= 0.5 && clipBpm ? clipBpm : null,
    repitch: warp ? 1 : Math.pow(2, pitch / 12),
  });
  S.activeUntil.set(track.id, end + 0.1);
}

export function stopClip(trackId: string, time = audioNow()) {
  const c = S.clips.get(trackId);
  if (!c) return;
  const at = Math.max(time, audioNow());
  for (const src of c.sources)
    try {
      src.stop(at);
    } catch {
      // not started or already stopped
    }
  c.warp?.schedule({ output: at, active: false });
  S.clips.delete(trackId);
}

/** Clip playhead (0..1 of the sample) or null when it isn't playing. */
export function clipPosition(trackId: string): number | null {
  const sc = S.scratchState.get(trackId);
  if (sc) return sc.pos;
  const c = S.clips.get(trackId);
  const now = audioNow();
  if (!c || now < c.from || now > c.until) return null;
  // `start` is where the clip would have started from its beginning (earlier for late joins)
  const t = now - c.start;
  const into = c.oneshot ? t : t % c.loopLength;
  return (c.offset + into * c.rate) / c.bufferDuration;
}

// ---------- scratching ----------

interface Scratch {
  node: AudioWorkletNode;
  pos: number;
  duration: number;
  sampleId: string;
}

const scratches = new Map<string, Scratch>();
let scratchModule: Promise<void> | null = null;

/** Grab the platter: the scratch voice takes over from the clip at its current position. */
export async function scratchBegin(track: Track) {
  const sampleId = sampleOf(track);
  const buffer = getBuffer(sampleId);
  if (!buffer || !sampleId) return;
  const ctx = raw();
  scratchModule ??= ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/scratch.js`);
  await scratchModule;
  let s = scratches.get(track.id);
  if (!s || s.sampleId !== sampleId) {
    s?.node.disconnect();
    const node = new AudioWorkletNode(ctx, "rebeat-scratch", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    node.port.postMessage({
      buffer: Array.from({ length: buffer.numberOfChannels }, (_, c) =>
        buffer.getChannelData(c).slice(),
      ),
      bufferRate: buffer.sampleRate,
    });
    Tone.connect(node, channel(track.id).input);
    const entry: Scratch = { node, pos: 0, duration: buffer.duration, sampleId };
    node.port.onmessage = (e) => (entry.pos = e.data.pos);
    s = entry;
    scratches.set(track.id, s);
  }
  const pos = (clipPosition(track.id) ?? 0) * buffer.duration;
  s.pos = pos;
  s.node.port.postMessage({ pos, rate: 0, gain: 1 });
  setClipGain(track.id, 0);
  S.clips.get(track.id)?.warp?.schedule({ output: audioNow(), active: false });
  S.scratchState.set(track.id, { pos: pos / buffer.duration, speed: 0 });
}

/** Move the platter: `rate` 1 = normal speed forwards, negative = backwards. */
export function scratchMove(trackId: string, rate: number) {
  const s = scratches.get(trackId);
  if (!s) return;
  s.node.port.postMessage({ rate });
  S.scratchState.set(trackId, { pos: s.pos / s.duration, speed: rate });
}

/** The cut button: silence while held (transform and crab scratches). */
export function scratchCut(trackId: string, cut: boolean) {
  scratches.get(trackId)?.node.port.postMessage({ gain: cut ? 0 : 1 });
}

/** Let go: back to synced playback (catching the beat), or carry on from the new position. */
export function scratchEnd(track: Track, keepPosition = false) {
  const s = scratches.get(track.id);
  if (!s) return;
  s.node.port.postMessage({ rate: 0, gain: 0 });
  S.scratchState.delete(track.id);
  if (keepPosition && S.clips.has(track.id)) {
    const c = S.clips.get(track.id)!;
    // shift the clip so it continues from where the record was left
    c.start = audioNow() - (s.pos - c.offset) / c.rate;
  }
  setClipGain(track.id, 1);
  const c = S.clips.get(track.id);
  if (c?.warp) {
    const t = audioNow();
    const into = (t - c.start) % c.loopLength;
    c.warp.schedule({ output: t, active: true, input: c.offset + into * c.rate, rate: c.rate });
  }
}

function setClipGain(trackId: string, g: number) {
  const c = S.clips.get(trackId);
  if (!c) return;
  for (const env of c.gains) env.gain.setTargetAtTime(g, audioNow(), 0.005);
}

export function stopAll() {
  const t = audioNow();
  for (const v of S.voices) stopVoice(v, t);
  for (const id of [...S.clips.keys()]) stopClip(id, t);
  for (const v of S.synths.values()) v.releaseAll(t);
}

/**
 * A page step for the effects that follow the beat (Pump, D104), on every track, bus and the
 * master: from `posQ` quarter notes into the page, `stepQ` long, at `time`. Called by
 * `playStep`, so it's the same live and offline.
 */
export function effectsStep(time: number, posQ: number, stepQ: number, secPerQ: number) {
  for (const ch of S.channels.values()) ch.step(time, posQ, stepQ, secPerQ);
  for (const b of S.buses.values()) b.step(time, posQ, stepQ, secPerQ);
  S.master?.fx.step(time, posQ, stepQ, secPerQ);
}

/**
 * A tempo change at an audio time (D192), from the transport (live and offline): synced delays,
 * the synths' synced LFOs and warped clips follow it. `null` (stop) goes back to the project's
 * tempo.
 */
export function tempoStep(bpm: number | null, time: number) {
  const to = bpm ?? (S.live ? useStore.getState().project.bpm : S.builtBpm);
  const was = S.tempo ?? S.builtBpm;
  S.tempo = bpm;
  if (was === to) return;
  for (const ch of S.channels.values()) ch.tempo(to, time);
  for (const ch of S.liveChannels.values()) ch.tempo(to, time);
  keysChannelEntry?.channel.tempo(to, time);
  for (const b of S.buses.values()) b.tempo(to, time);
  S.master?.fx.tempo(to, time);
  for (const v of [...S.synths.values(), ...S.liveVoices.values()]) v.synth?.tempo(to, time);
  for (const c of S.clips.values()) {
    if (!c.clipBpm) continue;
    const rate = to / c.clipBpm;
    // the live stretch keeps the pitch; repitching (offline) bends it with the speed (§0.7)
    if (c.warp) c.warp.schedule({ output: Math.max(time, audioNow()), rate });
    for (const src of c.sources) src.playbackRate.setValueAtTime(rate * c.repitch, time);
    c.rate = rate;
  }
}

// ---------- automation (D186) and timeline audio (D188) ----------

/** The engine side of a scope's automation, for engine/automation.ts. */
export function automationState() {
  return { last: S.autoLast, live: S.live };
}

/** Automation events for a target (a MIDI-learn target string), at their audio times. */
export function automateTarget(target: string, events: AutoEvent[]) {
  if (!events.length) return;
  const [kind, id, ...rest] = target.split(":");
  const key = rest.join(":");
  if (kind === "master") {
    const m = ensureMaster();
    if (id === "volume") schedule(m.fader.gain, events, faderGain);
    else if (id === "fx") m.fx.automate(rest[0], rest[1], events);
    return;
  }
  if (kind === "bus") return S.buses.get(id)?.automate(key || "volume", events);
  if (kind !== "track") return;
  const path = synthPath(key);
  if (path) {
    // a synth's macro, knob or switch (D228): the worklet ramps and writes it in place
    const synth = S.synths.get(id)?.synth;
    if (!synth) return;
    synth.automate(
      patchPath(path),
      events.map((e) => ({ t: e.t, v: synthValue(path, e.v), ramp: e.ramp })),
    );
    S.autoSynths.add(id);
    return;
  }
  S.channels.get(id)?.automate(key, events);
}

/** Automation is over (stop): every automated value goes back to its knob. */
export function releaseAutomation() {
  const now = audioNow();
  for (const p of automatedParams) p.cancelScheduledValues(now);
  automatedParams.clear();
  S.autoLast.clear();
  for (const id of S.autoSynths) S.synths.get(id)?.synth?.automateEnd(now);
  S.autoSynths.clear();
  const project = useStore.getState().project;
  for (const ch of S.channels.values()) ch.release();
  for (const b of project.buses) S.buses.get(b.id)?.release(b);
  if (S.master) {
    S.master.fx.refresh();
    S.master.fader.gain.rampTo(faderGain(project.master.volume), 0.02);
  }
  // the channels apply their knobs again
  S.lastTracks.clear();
  if (S.live) reconcile(project);
}

/**
 * Play a region (D188) from `into` seconds of its sample at `time`, until `until`: through its
 * track's channel, kept with the clips (`rgn:<id>`), so stop, panic and tempo changes reach it.
 * One sound per track: the track's own clip stops.
 */
export function startRegion(
  track: Track,
  region: AudioRegion,
  time: number,
  into: number,
  until: number,
) {
  const key = `rgn:${region.id}`;
  stopClip(key, time);
  stopClip(track.id, time);
  const buffer = getBuffer(region.sampleId);
  if (!buffer || until <= time) return;
  const p = track.params;
  const bpm = S.tempo ?? useStore.getState().project.bpm;
  const clipBpm = sampleInfo(region.sampleId)?.bpm;
  const warpOn = (p["sound.warp"] ?? 1) >= 0.5 && !!clipBpm;
  const ratio = warpOn ? bpm / clipBpm! : 1;
  const pitch = toUnit.semis(12)(p["sound.pitch"] ?? 0.5);
  const repitch = Math.pow(2, pitch / 12);
  const offset = region.offset + into;
  if (offset >= buffer.duration) return;
  const dest = channel(track.id).input;
  const level =
    Math.pow(10, toUnit.db(-12, 12)(p["sound.gain"] ?? 0.5) / 20) *
    Math.pow(10, (region.gain ?? 0) / 20);
  const t = Math.max(time, audioNow());
  const src = raw().createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = ratio * repitch;
  const env = raw().createGain();
  env.gain.value = level;
  // fades, in seconds at the tempo where they are
  const spq = 60 / bpm;
  const fadeIn = (region.fadeIn ?? 0) * spq;
  const fadeOut = (region.fadeOut ?? 0) * spq;
  if (fadeIn > 0 && into < fadeIn) {
    env.gain.setValueAtTime(level * (into / fadeIn), t);
    env.gain.linearRampToValueAtTime(level, t + (fadeIn - into));
  }
  if (fadeOut > 0 && until - fadeOut > t) {
    env.gain.setValueAtTime(level, until - fadeOut);
    env.gain.linearRampToValueAtTime(0, until);
  }
  // live, a warped sample off its own tempo (or repitched) is time-stretched, as clips are;
  // offline it's repitched (§0.7)
  const warp =
    S.live && (Math.abs(ratio - 1) > 0.002 || Math.abs(pitch) > 0.01)
      ? warper(key, region.sampleId, dest)
      : null;
  if (warp) {
    warp.schedule({ output: t, active: true, input: offset, rate: ratio, semitones: pitch });
    warp.schedule({ output: until, active: false });
  } else {
    src.connect(env);
    Tone.connect(env, dest);
    src.start(t, offset);
    src.stop(until + 0.005);
    src.onended = () => env.disconnect();
  }
  S.clips.set(key, {
    sources: warp ? [] : [src],
    gains: [env],
    warp,
    start: t - into / ratio,
    rate: ratio,
    duration: until - t,
    loopLength: buffer.duration,
    oneshot: true,
    offset: 0,
    bufferDuration: buffer.duration,
    from: t,
    until,
    clipBpm: warpOn ? clipBpm! : null,
    repitch: warp ? 1 : repitch,
  });
  S.activeUntil.set(track.id, until + 0.1);
}

/** How long stop takes to fade the master out (and back in): instant, without a click. */
const FADE = 0.005;
/** Tracks whose notes can't be cut short (smplr lets them decay): muted until then. */
const gated = new Set<string>();
let ungateTimer = 0;

/**
 * Stop means silence (D99). The master fades out over a few milliseconds; every source stops
 * without its release (hits, clips, synth voices and the notes still to come, samplers); the
 * effects that hold sound are built again on every track, bus and the master, so a reverb or
 * delay tail doesn't come back; then the master fades in again, over silence.
 */
export function panic() {
  const m = ensureMaster();
  const t = audioNow();
  const at = t + FADE;
  const g = m.output.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(0, at);
  const mute = (id: string) => {
    const input = channel(id).input.gain;
    input.cancelScheduledValues(t);
    input.setValueAtTime(input.value, t);
    input.linearRampToValueAtTime(0, at);
    gated.add(id);
  };
  for (const v of S.voices) stopVoice(v, at);
  for (const id of [...S.clips.keys()]) stopClip(id, at);
  // a warped clip's time-stretcher still holds a few hundred milliseconds of audio
  for (const t of useStore.getState().project.tracks) if (t.mode === "clip") mute(t.id);
  // decaying on their own (smplr): quiet until they're done, or until playing starts
  for (const [id, v] of S.synths) if (v.panic(at)) mute(id);
  // the keys' voices that can't be cut short: drop them (the next note makes a new one)
  for (const [id, v] of S.liveVoices)
    if (v.panic(at)) {
      v.dispose();
      S.liveVoices.delete(id);
    }
  clearTimeout(ungateTimer);
  if (gated.size) ungateTimer = window.setTimeout(ungate, 600);
  clearTimeout(flushTimer);
  // after the fade (and a little time for the audio thread): drop the tails
  flushTimer = window.setTimeout(() => {
    for (const ch of S.channels.values()) ch.flush();
    for (const ch of S.liveChannels.values()) ch.flush();
    keysChannelEntry?.channel.flush();
    for (const b of S.buses.values()) b.flush();
    // the master's filters (EQ, the performance filters) ring briefly too: all of it
    m.fx.flush(true);
    for (const fn of onPanicFns) fn();
    reopen();
  }, 30);
}

let flushTimer = 0;
const onPanicFns = new Set<() => void>();

/** Something with its own nodes on the master (the performance filters) flushes on stop too. */
export function onPanic(fn: () => void): () => void {
  onPanicFns.add(fn);
  return () => onPanicFns.delete(fn);
}

/** Open the master again after a stop. */
function reopen() {
  const g = S.master?.output.gain;
  if (!g || g.value > 0.999) return;
  const now = audioNow();
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(1, now + FADE);
}

/**
 * Open what a stop closed: the master, and the tracks muted until their notes decayed. When
 * playing starts, or once they're quiet.
 */
export function ungate() {
  reopen();
  clearTimeout(ungateTimer);
  const t = audioNow();
  for (const id of gated) {
    const input = S.channels.get(id)?.input.gain;
    input?.cancelScheduledValues(t);
    input?.setValueAtTime(0, t);
    input?.linearRampToValueAtTime(1, t + FADE);
  }
  gated.clear();
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
  return (S.activeUntil.get(trackId) ?? 0) > audioNow();
}

/** Time-domain samples of a track (after effects and fader), or null when silent. */
export function waveform(trackId: string): Float32Array | null {
  const ch = S.channels.get(trackId);
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
  const b = S.buses.get(id);
  if (!b) return 0;
  const w = buf(`bus${id}`, b.analyser.fftSize);
  b.analyser.getFloatTimeDomainData(w);
  let peak = 0;
  for (let i = 0; i < w.length; i += 2) peak = Math.max(peak, Math.abs(w[i]));
  return Math.min(1, peak);
}

/** Frequency data (dB per bin) of a track, for the spectrum view. */
export function spectrum(trackId: string): Float32Array | null {
  const ch = S.channels.get(trackId);
  if (!ch) return null;
  const b = buf(`spec${trackId}`, ch.analyser.frequencyBinCount);
  ch.analyser.getFloatFrequencyData(b);
  return b;
}

/** Master output L/R peak levels. */
export function masterLevel(): [number, number] {
  const m = S.master;
  if (!m) return [0, 0];
  return m.analysers.map((a, i) => {
    const b = buf(`S.master${i}`, a.fftSize);
    a.getFloatTimeDomainData(b);
    let peak = 0;
    // only the most recent ~23 ms: the analyser keeps much more for the S.master scope
    for (let j = b.length - 1024; j < b.length; j++) peak = Math.max(peak, Math.abs(b[j]));
    return Math.min(1, peak);
  }) as [number, number];
}

/** Master output L/R time-domain data (for the master scope). */
export function masterWaveform(): [Float32Array, Float32Array] | null {
  const m = S.master;
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
