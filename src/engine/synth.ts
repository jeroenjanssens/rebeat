/**
 * The synth voice (D79): plays any SynthPatch with native Web Audio nodes, so it sounds the same
 * live and in offline renders. Poly patches build a small graph per note (cheap: the nodes are
 * native and freed after the release); mono patches keep one voice running, for glide.
 */
import type * as Tone from "tone";
import { STEP_SIZE_QUARTERS, type Note } from "../model/types";
import type { Adsr, Osc, SynthPatch } from "../model/synth";

const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- shared per audio context ----------

const pulseWaves = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
const shapers = new WeakMap<BaseAudioContext, Map<number, Float32Array<ArrayBuffer>>>();

/** A pulse wave of the given width, from its Fourier series (cached per context). */
function pulseWave(ctx: BaseAudioContext, width: number): PeriodicWave {
  const w = Math.round(width * 100) / 100;
  let m = pulseWaves.get(ctx);
  if (!m) pulseWaves.set(ctx, (m = new Map()));
  let wave = m.get(w);
  if (!wave) {
    const n = 64;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * w * 2) * 0.5;
      imag[k] = (2 / (k * Math.PI)) * (1 - Math.cos(k * Math.PI * w * 2)) * 0.5;
    }
    wave = ctx.createPeriodicWave(real, imag);
    m.set(w, wave);
  }
  return wave;
}

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseBuffers.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, b);
  }
  return b;
}

/** tanh saturation with makeup, quantized per drive amount (cached per context). */
function driveCurve(ctx: BaseAudioContext, drive: number): Float32Array<ArrayBuffer> {
  const d = Math.round(drive * 20) / 20;
  let m = shapers.get(ctx);
  if (!m) shapers.set(ctx, (m = new Map()));
  let c = m.get(d);
  if (!c) {
    const k = 1 + d * 12;
    c = new Float32Array(1024);
    for (let i = 0; i < c.length; i++) {
      const x = (i / (c.length - 1)) * 2 - 1;
      c[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    m.set(d, c);
  }
  return c;
}

const setOscType = (ctx: BaseAudioContext, node: OscillatorNode, o: Osc) => {
  if (o.wave === "pulse") node.setPeriodicWave(pulseWave(ctx, o.width));
  else node.type = o.wave;
};

/** Oscillator nodes for one oscillator section: unison voices spread in cents. */
function oscNodes(ctx: BaseAudioContext, o: Osc, hz: number, out: AudioNode, t: number) {
  const nodes: OscillatorNode[] = [];
  if (o.level <= 0) return nodes;
  const n = o.unison;
  const g = ctx.createGain();
  g.gain.value = o.level / Math.sqrt(n);
  g.connect(out);
  for (let i = 0; i < n; i++) {
    const node = ctx.createOscillator();
    setOscType(ctx, node, o);
    node.frequency.value = hz * Math.pow(2, o.octave);
    const spread = n > 1 ? (i / (n - 1) - 0.5) * 2 * o.spread : 0;
    node.detune.value = o.detune + spread;
    node.connect(g);
    node.start(t);
    nodes.push(node);
  }
  return nodes;
}

function adsrOn(p: AudioParam, e: Adsr, t: number, from: number, peak: number, base = 0) {
  p.cancelScheduledValues(t);
  p.setValueAtTime(from, t);
  p.linearRampToValueAtTime(peak, t + e.attack);
  p.setTargetAtTime(base + (peak - base) * e.sustain, t + e.attack, Math.max(0.001, e.decay / 3));
}

function adsrOff(p: AudioParam, e: Adsr, t: number, base = 0) {
  if ("cancelAndHoldAtTime" in p) p.cancelAndHoldAtTime(t);
  else (p as AudioParam).cancelScheduledValues(t);
  p.setTargetAtTime(base, t, Math.max(0.001, e.release / 4));
}

export interface PatchSynth {
  play(notes: Note[], time: number, stepDur: number): void;
  releaseAll(time: number): void;
  /** A new patch (or the same one with the track's knobs applied); `bpm` for synced LFOs. */
  setPatch(patch: SynthPatch, bpm: number): void;
  dispose(): void;
}

/** A synth playing `patch` into the native node `out`. */
export function patchSynth(dest: Tone.Gain, initial: SynthPatch, bpm = 120): PatchSynth {
  const out = dest.input as unknown as AudioNode;
  const ctx = out.context;
  let patch = initial;

  // shared: output level, drive, LFO, tremolo and pan
  const volume = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  const tremolo = ctx.createGain();
  const panner = ctx.createStereoPanner();
  volume.connect(shaper).connect(tremolo).connect(panner).connect(out);
  const lfo = ctx.createOscillator();
  const lfoDepth = ctx.createGain();
  lfo.connect(lfoDepth);
  lfo.start();
  // pitch and filter take the LFO per note; amp and pan here
  const lfoAmp = ctx.createGain();
  const lfoPan = ctx.createGain();
  lfoDepth.connect(lfoAmp).connect(tremolo.gain);
  lfoDepth.connect(lfoPan).connect(panner.pan);

  const apply = (p: SynthPatch, tempo: number) => {
    volume.gain.value = Math.pow(10, p.volume / 20);
    shaper.curve = p.drive > 0.01 ? driveCurve(ctx, p.drive) : null;
    lfo.type = p.lfo.shape;
    const rate = p.lfo.sync ? 1 / (STEP_SIZE_QUARTERS[p.lfo.sync] * 4 * (60 / tempo)) : p.lfo.rate;
    lfo.frequency.value = rate;
    lfoDepth.gain.value = p.lfo.depth;
    // tremolo: 1 ± depth/2 around 1 - depth/2
    tremolo.gain.value = p.lfo.target === "amp" ? 1 - p.lfo.depth / 2 : 1;
    lfoAmp.gain.value = p.lfo.target === "amp" ? 0.5 : 0;
    lfoPan.gain.value = p.lfo.target === "pan" ? 1 : 0;
  };
  apply(patch, bpm);

  /** Build one note's graph; returns how to release it. */
  const voice = (pitch: number, velocity: number, t: number) => {
    const p = patch;
    const hz = midiToHz(pitch);
    const level = 1 - p.velocity + p.velocity * velocity;
    const mix = ctx.createGain();
    const filters: BiquadFilterNode[] = [];
    for (let i = 0; i < (p.filter.slope === 24 ? 2 : 1); i++) {
      const f = ctx.createBiquadFilter();
      f.type = p.filter.type;
      f.Q.value = i === 0 ? p.filter.reso : 0.7;
      filters.push(f);
    }
    const vca = ctx.createGain();
    vca.gain.value = 0;
    mix.connect(filters[0]);
    for (let i = 1; i < filters.length; i++) filters[i - 1].connect(filters[i]);
    filters.at(-1)!.connect(vca).connect(volume);

    const sources: AudioScheduledSourceNode[] = [];
    const osc1 = oscNodes(ctx, p.osc1, hz, mix, t);
    const osc2 = oscNodes(ctx, p.osc2, hz, mix, t);
    sources.push(...osc1, ...osc2);
    if (p.sub > 0) {
      const sub = ctx.createOscillator();
      const g = ctx.createGain();
      sub.frequency.value = hz / 2;
      g.gain.value = p.sub;
      sub.connect(g).connect(mix);
      sub.start(t);
      sources.push(sub);
      osc1.push(sub);
    }
    if (p.noise > 0) {
      const n = ctx.createBufferSource();
      const g = ctx.createGain();
      n.buffer = noiseBuffer(ctx);
      n.loop = true;
      g.gain.value = p.noise * 0.5;
      n.connect(g).connect(mix);
      n.start(t, Math.random() * 1.5);
      sources.push(n);
    }
    // FM: a sine at ratio × the note bends oscillator 1, fading with its own decay
    let fmGain: GainNode | null = null;
    if (p.fm.index > 0 && osc1.length) {
      const mod = ctx.createOscillator();
      fmGain = ctx.createGain();
      mod.frequency.value = hz * p.fm.ratio;
      const peak = p.fm.index * hz * p.fm.ratio * (0.5 + velocity * 0.5);
      fmGain.gain.setValueAtTime(peak, t);
      fmGain.gain.setTargetAtTime(peak * 0.05, t, p.fm.decay / 3);
      mod.connect(fmGain);
      for (const o of osc1) fmGain.connect(o.frequency);
      mod.start(t);
      sources.push(mod);
    }
    // LFO on pitch (± a semitone at full depth) or the filter (± two octaves)
    const lfoLinks: AudioNode[] = [];
    if (p.lfo.depth > 0 && (p.lfo.target === "pitch" || p.lfo.target === "filter")) {
      const g = ctx.createGain();
      g.gain.value = p.lfo.target === "pitch" ? 100 : 2400;
      lfoDepth.connect(g);
      lfoLinks.push(g);
      if (p.lfo.target === "pitch") for (const o of [...osc1, ...osc2]) g.connect(o.detune);
      else for (const f of filters) g.connect(f.detune);
    }

    const keyed = p.filter.cutoff * Math.pow(hz / 261.63, p.filter.keytrack);
    const base = Math.min(20000, Math.max(20, keyed));
    const peak = Math.min(20000, Math.max(20, base * Math.pow(2, p.filter.env)));
    for (const f of filters) {
      if (p.filter.env === 0) f.frequency.setValueAtTime(base, t);
      else adsrOn(f.frequency, p.filterEnv, t, base, peak, base);
    }
    adsrOn(vca.gain, p.amp, t, 0, level);

    return (end: number) => {
      adsrOff(vca.gain, p.amp, end);
      if (p.filter.env !== 0) for (const f of filters) adsrOff(f.frequency, p.filterEnv, end, base);
      const stop = end + p.amp.release * 1.5 + 0.05;
      for (const s of sources) s.stop(stop);
      // free everything once it's silent
      sources[0]?.addEventListener("ended", () => {
        for (const l of lfoLinks) {
          lfoDepth.disconnect(l);
          l.disconnect();
        }
        vca.disconnect();
        fmGain?.disconnect();
      });
    };
  };

  // ---------- mono: one running voice with glide ----------
  interface Mono {
    oscs: OscillatorNode[];
    sources: AudioScheduledSourceNode[];
    vca: GainNode;
    filters: BiquadFilterNode[];
    hz: number;
    until: number;
    base: number;
  }
  let mono: Mono | null = null;

  const buildMono = (): Mono => {
    const p = patch;
    const mix = ctx.createGain();
    const filters: BiquadFilterNode[] = [];
    for (let i = 0; i < (p.filter.slope === 24 ? 2 : 1); i++) {
      const f = ctx.createBiquadFilter();
      f.type = p.filter.type;
      f.Q.value = i === 0 ? p.filter.reso : 0.7;
      filters.push(f);
    }
    const vca = ctx.createGain();
    vca.gain.value = 0;
    mix.connect(filters[0]);
    for (let i = 1; i < filters.length; i++) filters[i - 1].connect(filters[i]);
    filters.at(-1)!.connect(vca).connect(volume);
    const hz = 261.63;
    const t = ctx.currentTime;
    const oscs = [...oscNodes(ctx, p.osc1, hz, mix, t), ...oscNodes(ctx, p.osc2, hz, mix, t)];
    const sources: AudioScheduledSourceNode[] = [...oscs];
    if (p.sub > 0) {
      const sub = ctx.createOscillator();
      const g = ctx.createGain();
      sub.frequency.value = hz / 2;
      g.gain.value = p.sub;
      sub.connect(g).connect(mix);
      sub.start(t);
      oscs.push(sub);
      sources.push(sub);
    }
    if (p.noise > 0) {
      const n = ctx.createBufferSource();
      const g = ctx.createGain();
      n.buffer = noiseBuffer(ctx);
      n.loop = true;
      g.gain.value = p.noise * 0.5;
      n.connect(g).connect(mix);
      n.start(t);
      sources.push(n);
    }
    if (p.lfo.depth > 0 && (p.lfo.target === "pitch" || p.lfo.target === "filter")) {
      const g = ctx.createGain();
      g.gain.value = p.lfo.target === "pitch" ? 100 : 2400;
      lfoDepth.connect(g);
      if (p.lfo.target === "pitch") for (const o of oscs) g.connect(o.detune);
      else for (const f of filters) g.connect(f.detune);
    }
    return { oscs, sources, vca, filters, hz, until: 0, base: p.filter.cutoff };
  };

  const monoPlay = (m: Mono, n: Note, t: number, dur: number) => {
    const p = patch;
    const hz = midiToHz(n.pitch);
    const level = 1 - p.velocity + p.velocity * n.velocity;
    const glide = n.slide ? Math.max(0.06, p.glide) : p.glide;
    // overlapping notes with glide (or a slide) don't restart the envelopes
    const legato = m.until > 0 && t < m.until + 0.005 && glide > 0;
    for (const o of m.oscs) {
      const target = o.frequency.value * (hz / m.hz);
      o.frequency.cancelScheduledValues(t);
      o.frequency.setValueAtTime(o.frequency.value, t);
      if (glide > 0 && m.until > 0) o.frequency.exponentialRampToValueAtTime(target, t + glide);
      else o.frequency.setValueAtTime(target, t);
    }
    m.hz = hz;
    if (!legato) {
      adsrOn(m.vca.gain, p.amp, t, 0, level);
      const keyed = p.filter.cutoff * Math.pow(hz / 261.63, p.filter.keytrack);
      m.base = Math.min(20000, Math.max(20, keyed));
      const peak = Math.min(20000, Math.max(20, m.base * Math.pow(2, p.filter.env)));
      for (const f of m.filters)
        if (p.filter.env === 0) f.frequency.setValueAtTime(m.base, t);
        else adsrOn(f.frequency, p.filterEnv, t, m.base, peak, m.base);
    }
    const end = t + dur;
    adsrOff(m.vca.gain, p.amp, end);
    if (p.filter.env !== 0)
      for (const f of m.filters) adsrOff(f.frequency, p.filterEnv, end, m.base);
    m.until = end;
  };

  const disposeMono = () => {
    if (!mono) return;
    const t = ctx.currentTime;
    for (const s of mono.sources) s.stop(t + 0.05);
    const v = mono.vca;
    v.gain.setTargetAtTime(0, t, 0.01);
    setTimeout(() => v.disconnect(), 200);
    mono = null;
  };

  // changes to these need a new mono voice; the rest applies to the next note
  let structure = "";
  const structureOf = (p: SynthPatch) =>
    JSON.stringify([
      p.mono,
      p.osc1,
      p.osc2,
      p.sub > 0,
      p.noise > 0,
      p.filter.type,
      p.filter.slope,
      p.lfo.target,
      p.lfo.depth > 0,
    ]);

  return {
    play(notes, time, stepDur) {
      if (patch.mono) {
        mono ??= buildMono();
        const n = notes[notes.length - 1];
        monoPlay(mono, n, time, n.length * stepDur * 0.95);
        return;
      }
      for (const n of notes) voice(n.pitch, n.velocity, time)(time + n.length * stepDur * 0.95);
    },
    releaseAll(time) {
      if (mono) adsrOff(mono.vca.gain, patch.amp, time);
      volume.gain.setTargetAtTime(0, time, 0.02);
      volume.gain.setTargetAtTime(Math.pow(10, patch.volume / 20), time + 0.15, 0.01);
    },
    setPatch(next, tempo) {
      const s = structureOf(next);
      patch = next;
      apply(next, tempo);
      if (s !== structure) {
        structure = s;
        disposeMono();
      } else if (mono) {
        for (const f of mono.filters) f.Q.value = next.filter.reso;
      }
    },
    dispose() {
      disposeMono();
      lfo.stop();
      setTimeout(() => panner.disconnect(), 300);
    },
  };
}
