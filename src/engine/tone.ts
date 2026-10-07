/**
 * Small building blocks that replace Tone.js nodes which color the sound:
 * - Tone.EQ3 splits into bands with crossovers whose sum isn't flat (−17 dB notches at the
 *   crossover frequencies even with every gain at 0 dB). Shelves + a peak are exactly flat at 0 dB.
 * - Tone.Distortion's curve has a gain of ⅓ at low drive, so it mostly turned the level down.
 */
import * as Tone from "tone";

/** Three-band EQ: low shelf, mid peak, high shelf. Flat when every gain is 0 dB. */
export class FlatEQ extends Tone.ToneAudioNode {
  readonly name = "FlatEQ";
  readonly low = new Tone.Filter({ type: "lowshelf", frequency: 250 });
  readonly mid = new Tone.Filter({ type: "peaking", frequency: 1000, Q: 0.8 });
  readonly high = new Tone.Filter({ type: "highshelf", frequency: 4000 });
  readonly input = this.low;
  readonly output = this.high;

  constructor() {
    super();
    this.low.chain(this.mid, this.high);
  }

  setGains(lowDb: number, midDb: number, highDb: number) {
    this.low.gain.value = lowDb;
    this.mid.gain.value = midDb;
    this.high.gain.value = highDb;
  }

  /** Crossover points: the mid band sits between them. */
  setFrequencies(lowHz: number, highHz: number) {
    this.low.frequency.value = lowHz;
    this.high.frequency.value = highHz;
    this.mid.frequency.value = Math.sqrt(lowHz * highHz);
  }

  dispose() {
    super.dispose();
    this.low.dispose();
    this.mid.dispose();
    this.high.dispose();
    return this;
  }
}

/**
 * Soft-clipping drive (tanh). `amount` 0 = clean (unity gain); higher values push the signal into
 * saturation with level compensation.
 */
export class Drive extends Tone.ToneAudioNode {
  readonly name = "Drive";
  private shaper = new Tone.WaveShaper((x) => x, 4096);
  readonly input = this.shaper;
  readonly output = this.shaper;
  private amount = -1;

  constructor() {
    super();
    this.shaper.oversample = "2x";
  }

  setAmount(amount: number) {
    if (Math.abs(amount - this.amount) < 0.001) return;
    this.amount = amount;
    // pre-gain into tanh, then 1/√g back: quiet parts come up, peaks are tamed, so the level
    // stays roughly the same while the sound gets denser
    const g = 1 + amount * 20;
    const post = 1 / Math.sqrt(g);
    this.shaper.setMap(amount < 0.001 ? (x) => x : (x) => Math.tanh(g * x) * post);
  }

  dispose() {
    super.dispose();
    this.shaper.dispose();
    return this;
  }
}
