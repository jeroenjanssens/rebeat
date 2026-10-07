/**
 * A track's channel strip: sound filter + drive, EQ, width, pan, fader, mute — then a tap for
 * the scope/meter (after effects and fader, so a muted track shows nothing) and the master bus.
 */
import * as Tone from "tone";
import { toUnit } from "../model/params";
import type { Track } from "../model/types";
import type { Bus } from "../model/effects";
import { FxChain } from "./effects";

const FADE = 0.008;

export function faderGain(position: number): number {
  // 0.8 fader position = 0 dB; 40·log10 curve, as on the mini fader
  if (position <= 0.001) return 0;
  return Math.pow(position / 0.8, 2);
}

/** A send/return bus: effects (e.g. one reverb) shared by every track that sends to it. */
export class BusChannel {
  readonly input = new Tone.Gain(1);
  private fxOut = new Tone.Gain(1);
  private fader = new Tone.Gain(1);
  readonly output = new Tone.Gain(1);
  readonly analyser: AnalyserNode;
  private fx: FxChain;

  constructor(destination: Tone.InputNode) {
    this.fx = new FxChain(this.input, this.fxOut);
    this.fxOut.chain(this.fader, this.output);
    this.output.connect(destination);
    this.analyser = (Tone.getContext().rawContext as AudioContext).createAnalyser();
    this.analyser.fftSize = 1024;
    Tone.connect(this.output, this.analyser);
  }

  update(bus: Bus, bpm: number) {
    this.fx.sync(bus.effects, bpm);
    this.fader.gain.rampTo(bus.mute ? 0 : faderGain(bus.volume), 0.02);
  }

  dispose() {
    this.fx.dispose();
    for (const n of [this.input, this.fxOut, this.fader, this.output]) n.dispose();
    this.analyser.disconnect();
  }
}

export class TrackChannel {
  readonly input = new Tone.Gain(1);
  /** Inserts go between `preFx` and `postFx` (Phase 5). */
  readonly preFx = new Tone.Gain(1);
  readonly postFx = new Tone.Gain(1);
  private filter = new Tone.Filter({ type: "lowpass", frequency: 20000, Q: 0.7, rolloff: -12 });
  private drive = new Tone.Distortion({ distortion: 0, wet: 0, oversample: "2x" });
  private eq = new Tone.EQ3(0, 0, 0);
  private widener = new Tone.StereoWidener(0.5);
  private panner = new Tone.Panner(0);
  private fader = new Tone.Gain(1);
  /** Crossfader gain (performance). */
  private xfade = new Tone.Gain(1);
  readonly mute = new Tone.Gain(1);
  private sendBoost = { a: 0, b: 0 };
  /** Post-fader output: master bus and sends connect here. */
  readonly output = new Tone.Gain(1);
  readonly analyser: AnalyserNode;
  readonly sendA = new Tone.Gain(0);
  readonly sendB = new Tone.Gain(0);
  private last: Partial<Record<string, number>> = {};
  private fx: FxChain;

  constructor(destination: Tone.InputNode) {
    const raw = Tone.getContext().rawContext as AudioContext;
    this.analyser = raw.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0;
    this.input.chain(this.filter, this.drive, this.preFx);
    this.postFx.chain(
      this.eq,
      this.widener,
      this.panner,
      this.fader,
      this.xfade,
      this.mute,
      this.output,
    );
    this.fx = new FxChain(this.preFx, this.postFx);
    this.output.connect(destination);
    this.output.connect(this.sendA);
    this.output.connect(this.sendB);
    Tone.connect(this.output, this.analyser);
  }

  private set(key: string, value: number, apply: (v: number) => void) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    apply(value);
  }

  update(track: Track, audible: boolean, bpm: number) {
    this.fx.sync(track.effects, bpm);
    const p = track.params;
    const now = Tone.now();
    if (track.kind !== "instrument") {
      this.set("cutoff", p["sound.cutoff"] ?? 1, (v) =>
        this.filter.frequency.rampTo(Math.min(20000, toUnit.hz(v)), 0.02, now),
      );
      this.set("reso", p["sound.reso"] ?? 0.1, (v) => this.filter.Q.rampTo(toUnit.q(v), 0.02, now));
    }
    this.set("drive", p["sound.drive"] ?? 0, (v) => {
      this.drive.distortion = v * 0.9;
      this.drive.wet.rampTo(v > 0.001 ? Math.min(1, v * 3) : 0, 0.02, now);
    });
    this.set("low", p["mix.low"] ?? 0.5, (v) =>
      this.eq.low.rampTo(toUnit.db(-15, 15)(v), 0.02, now),
    );
    this.set("mid", p["mix.mid"] ?? 0.5, (v) =>
      this.eq.mid.rampTo(toUnit.db(-15, 15)(v), 0.02, now),
    );
    this.set("high", p["mix.high"] ?? 0.5, (v) =>
      this.eq.high.rampTo(toUnit.db(-15, 15)(v), 0.02, now),
    );
    this.set("width", p["mix.width"] ?? 1, (v) => this.widener.width.rampTo(v * 0.5, 0.02, now));
    this.set("pan", p["mix.pan"] ?? 0.5, (v) => this.panner.pan.rampTo(toUnit.pan(v), 0.02, now));
    this.set("volume", track.volume, (v) => this.fader.gain.rampTo(faderGain(v), 0.02, now));
    this.set("audible", audible ? 1 : 0, (v) => this.mute.gain.rampTo(v, FADE, now));
    this.set("sendA", p["mix.sendA"] ?? 0, () => this.applySends());
    this.set("sendB", p["mix.sendB"] ?? 0, () => this.applySends());
  }

  private applySends() {
    const a = Math.max(this.last.sendA ?? 0, this.sendBoost.a);
    const b = Math.max(this.last.sendB ?? 0, this.sendBoost.b);
    this.sendA.gain.rampTo(a, 0.02);
    this.sendB.gain.rampTo(b, 0.02);
  }

  /** Reverb/delay throws push the sends up while held. */
  setSendBoost(a: number, b: number) {
    this.sendBoost = { a, b };
    this.applySends();
  }

  setXfade(g: number) {
    this.xfade.gain.rampTo(g, 0.03);
  }

  /** Set the instrument filter (synths use the channel filter too). */
  setFilter(hz: number, q: number) {
    this.filter.frequency.rampTo(hz, 0.02);
    this.filter.Q.rampTo(q, 0.02);
  }

  dispose() {
    this.fx.dispose();
    for (const n of [
      this.input,
      this.filter,
      this.drive,
      this.preFx,
      this.postFx,
      this.eq,
      this.widener,
      this.panner,
      this.fader,
      this.xfade,
      this.mute,
      this.output,
      this.sendA,
      this.sendB,
    ])
      n.dispose();
    this.analyser.disconnect();
  }
}
