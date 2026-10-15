/**
 * Physical models in the synth's DSP (D249–D255): one PhysVoice per synth voice. An exciter
 * (pluck, strike, bow, blow, noise, or the oscillators) drives a resonator:
 * - String: a waveguide in two parts, split where it's excited (so a bow can stick and slip
 *   there), a loss filter and a dispersion allpass in the loop; read through a pickup comb
 * - Tube: a waveguide with a reed (closed end, like a clarinet) or a jet (open, like a flute)
 * - Bar, Bell, Membrane, Plate, Glass: banks of decaying complex resonators, one per partial
 * then a body (a few fixed resonances). Pure, like core.ts; tested in Node.
 */
import type { Physical } from "../../model/synth";
import { BODY_MODES, MAX_MODES, modeLevel, modeRatios, modeShape } from "./modal";

const BUF = 8192;
const MASK = BUF - 1;
const TWO_PI = Math.PI * 2;

/** Values the matrix adds to a physical model's knobs (natural units; decay in octaves). */
export interface PhysMods {
  hardness: number;
  position: number;
  pressure: number;
  decay: number;
  damping: number;
  structure: number;
  pickup: number;
}

let seed = 0x2545f491;
/** xorshift32: -1..1 (seeded with the core's, so offline renders repeat). */
function rand() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 0x80000000 - 1;
}
/** Reseed (the worklet's offline seed, D98). */
export const seedPhysical = (s: number) => void (seed = s >>> 0 || 1);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A read `d` samples back (d ≥ 2) with 4-point Lagrange interpolation (D253). */
function lagrange(buf: Float32Array, w: number, d: number) {
  const i = Math.floor(d);
  const f = d - i;
  const ym1 = buf[(w - i + 1) & MASK];
  const y0 = buf[(w - i) & MASK];
  const y1 = buf[(w - i - 1) & MASK];
  const y2 = buf[(w - i - 2) & MASK];
  const c0 = (-f * (f - 1) * (f - 2)) / 6;
  const c1 = ((f + 1) * (f - 1) * (f - 2)) / 2;
  const c2 = (-(f + 1) * f * (f - 2)) / 2;
  const c3 = ((f + 1) * f * (f - 1)) / 6;
  return c0 * ym1 + c1 * y0 + c2 * y1 + c3 * y2;
}

/** The phase delay (samples) at ω of a one-pole low-pass y = (1−a)x + a·y₋₁. */
const lpDelay = (a: number, w: number) => Math.atan2(a * Math.sin(w), 1 - a * Math.cos(w)) / w;
/** Its gain at ω. */
const lpGain = (a: number, w: number) => (1 - a) / Math.hypot(1 - a * Math.cos(w), a * Math.sin(w));
/** The phase delay at ω of a first-order allpass (c + z⁻¹)/(1 + c·z⁻¹). */
function apDelay(c: number, w: number) {
  // A(e^{iω}) = (c + e^{−iω}) / (1 + c·e^{−iω})
  const nr = c + Math.cos(w);
  const ni = -Math.sin(w);
  const dr = 1 + c * Math.cos(w);
  const di = -c * Math.sin(w);
  const ph = Math.atan2(ni, nr) - Math.atan2(di, dr);
  let d = -ph / w;
  while (d < 0) d += TWO_PI / w;
  return d;
}

/** The bow's friction (STK's bow table): slips when the difference in speed is large. */
function bowTable(dv: number, pressure: number) {
  const slope = 5 - pressure * 3.5;
  const x = Math.abs(dv * slope) + 0.75;
  return Math.min(1, Math.pow(x, -4));
}

/** A band-pass biquad (constant peak gain), for the bodies. */
class Biquad {
  b0 = 0;
  b2 = 0;
  a1 = 0;
  a2 = 0;
  x1 = 0;
  x2 = 0;
  y1 = 0;
  y2 = 0;
  set(hz: number, q: number, sr: number) {
    const w = (TWO_PI * Math.min(hz, sr * 0.45)) / sr;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * Math.cos(w)) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  process(x: number) {
    const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
  clear() {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
}

export class PhysVoice {
  // ---- waveguides ----
  /** String: the bridge side and the nut side; tube: the bore (and the jet). */
  private a = new Float32Array(BUF);
  private b = new Float32Array(BUF);
  private wa = 0;
  private wb = 0;
  /** Delays of the two parts (samples), the loss filter, the allpass, the loop gain. */
  private da = 10;
  private db = 10;
  private lp = 0;
  private lpA = 0;
  private apC = 0;
  private ap1x = 0;
  private ap1y = 0;
  private ap2x = 0;
  private ap2y = 0;
  private g = 0.99;
  /** The pickup comb (string): what came out, and how far back each pickup reads. */
  private hist = new Float32Array(BUF);
  private wh = 0;
  private pickL = 10;
  private pickR = 12;
  private dc = 0;
  private dcY = 0;
  private jetX = 0;
  private jetY = 0;
  /** A blown tube's loudness (velocity and Level act after the reed or jet). */
  private blowGain = 1;

  // ---- modal ----
  private zr = new Float64Array(MAX_MODES);
  private zi = new Float64Array(MAX_MODES);
  private cr = new Float64Array(MAX_MODES);
  private ci = new Float64Array(MAX_MODES);
  private inGain = new Float64Array(MAX_MODES);
  private outL = new Float64Array(MAX_MODES);
  private outR = new Float64Array(MAX_MODES);
  private modes = 0;
  private ratios: number[] = [];
  private ratioKey = "";

  // ---- exciter ----
  private burst = 0;
  private burstLen = 0;
  private strikeLen = 0;
  private exLp = 0;
  private exA = 0;
  private drive = 0;
  private driveUp = 0.01;
  private driveDown = 0.01;
  private amp = 1;
  private continuous = false;
  private impulseNorm = 1;

  // ---- body ----
  // sized from the largest body so a new entry in BODY_MODES can't write out of bounds
  private bodyL: Biquad[] = Array.from(
    { length: Math.max(...Object.values(BODY_MODES).map((m) => m.length)) },
    () => new Biquad(),
  );
  private bodyR: Biquad[] = Array.from(
    { length: Math.max(...Object.values(BODY_MODES).map((m) => m.length)) },
    () => new Biquad(),
  );
  private bodyGain: number[] = [];
  private bodyKey = "";
  private bodyMix = 0;

  /** The loudest output in the last block, and for how long it has been quiet (D254). */
  peak = 0;
  quiet = 0;
  outLeft = 0;
  outRight = 0;

  /** Silence (panic, D99). */
  clear() {
    this.a.fill(0);
    this.b.fill(0);
    this.hist.fill(0);
    this.zr.fill(0);
    this.zi.fill(0);
    this.lp = this.ap1x = this.ap1y = this.ap2x = this.ap2y = 0;
    this.dc = this.dcY = this.exLp = this.jetX = this.jetY = 0;
    this.burst = this.burstLen = this.strikeLen = this.drive = 0;
    for (const q of [...this.bodyL, ...this.bodyR]) q.clear();
    this.peak = 0;
    this.quiet = 0;
  }

  /** A note starts: an impulsive exciter fires, a continuous one starts to drive. */
  start(p: Physical, f0: number, velocity: number, sr: number) {
    const e = p.exciter;
    const hard = clamp(e.hardness + (velocity - 0.5) * e.velocity, 0, 1);
    this.amp = e.level * (1 - e.velocity * (1 - velocity));
    const model = p.resonator.model;
    this.continuous = !(e.type === "pluck" || e.type === "strike");
    if (e.type === "pluck") {
      // one period for a string (a plucked string's first shape), a few ms otherwise
      const period = sr / Math.max(20, f0);
      this.burstLen = Math.max(
        8,
        Math.round(model === "string" ? period : sr * (0.0015 + (1 - hard) * 0.005)),
      );
      this.burst = this.burstLen;
    }
    if (e.type === "strike") {
      // a mallet's contact: shorter the harder it is
      this.strikeLen = Math.max(4, Math.round(sr * (0.0003 + (1 - hard) ** 2 * 0.006)));
      this.burst = this.strikeLen;
      this.burstLen = this.strikeLen;
    }
    // a bank of modes adds up an impulse (a waveguide holds it): the same area for any length,
    // so a soft mallet isn't louder than a hard one
    this.impulseNorm =
      !this.continuous && model !== "string" && model !== "tube" ? 2 / this.burstLen : 1;
    // the exciter's brightness: a one-pole low-pass on its noise
    this.exA = Math.exp((-TWO_PI * (300 + hard * hard * 15000)) / sr);
    // continuous exciters ramp in, softer ones slower
    this.driveUp = 1 - Math.exp(-1 / (sr * (0.004 + (1 - hard) * 0.25)));
    this.driveDown = 1 - Math.exp(-1 / (sr * 0.04));
    this.quiet = 0;
  }

  /**
   * Per control block: delays, filters and partials for the note's pitch now (bends and glide
   * move them smoothly), the knobs with their modulation, and whether the note is held.
   */
  block(p: Physical, f0: number, sr: number, gate: boolean, m: PhysMods) {
    const r = p.resonator;
    const e = p.exciter;
    const hz = clamp(f0, 16, sr * 0.2);
    let decay = r.decay * Math.pow(2, m.decay);
    if (!gate) decay *= Math.max(0.03, 1 - r.release * 0.97);
    const damping = clamp(r.damping + m.damping, 0, 1);
    const pos = clamp(e.position + m.position, 0.02, 0.98);
    const pickup = clamp(r.pickup + m.pickup, 0.02, 0.98);
    const w0 = (TWO_PI * hz) / sr;
    const period = sr / hz;
    if (r.model === "string" || r.model === "tube") {
      // the loss filter: how many harmonics survive (damping), compensated so it stays in tune
      const kept = Math.pow(2, (1 - damping) * 7);
      const fc = Math.min(sr * 0.45, hz * (1 + kept));
      this.lpA = Math.exp((-TWO_PI * fc) / sr);
      let loop = lpDelay(this.lpA, w0);
      // stiffness: two allpasses spread the partials (a piano's stretched overtones)
      const want = -r.inharmonicity * 0.7;
      const budget = (r.model === "tube" && r.end === "closed" ? period / 2 : period) * 0.3;
      // (a weak allpass still delays a sample: on the highest notes there's no room for one)
      let c = want;
      for (let i = 0; i < 12 && c < 0 && 2 * apDelay(c, w0) > budget; i++) c *= 0.7;
      if (c > -0.02 || 2 * apDelay(c, w0) > budget) c = 0;
      this.apC = c;
      if (c !== 0) loop += 2 * apDelay(c, w0);
      // one round trip loses what `decay` asks for (60 dB in `decay` seconds)
      const perTrip = Math.pow(10, -3 / (hz * decay));
      this.g = Math.min(0.99995, perTrip / lpGain(this.lpA, w0));
      if (r.model === "string") {
        const total = Math.max(4, period - loop);
        this.da = clamp(total * pos, 2, BUF - 4);
        this.db = Math.max(1, Math.round(total - this.da));
        this.da = clamp(total - this.db, 2, BUF - 4);
        // the pickups: a comb at the point they're at
        this.pickL = clamp(Math.round(pickup * period), 1, BUF - 1);
        this.pickR = clamp(
          Math.round(clamp(pickup + r.width * 0.25, 0.02, 0.98) * period),
          1,
          BUF - 1,
        );
      } else {
        // a closed tube resonates on odd harmonics: half the period round trip, inverted
        const closed = r.end === "closed";
        const total = (closed ? period / 2 : period) - loop;
        this.da = clamp(total, 2, BUF - 4);
        // the jet's delay (open tubes): about a third of the bore
        this.db = clamp(Math.round(this.da * (0.2 + pos * 0.3)), 1, BUF - 1);
      }
    } else {
      const s = clamp(r.structure + m.structure, 0, 1);
      const key = `${r.model}:${s.toFixed(3)}`;
      if (key !== this.ratioKey) {
        this.ratios = modeRatios(r.model, s);
        this.ratioKey = key;
      }
      const stretch = 1 + r.inharmonicity * 0.25;
      const n = Math.min(r.modes, MAX_MODES);
      let k = 0;
      let norm = 0;
      for (let i = 0; i < n; i++) {
        const ratio = Math.pow(this.ratios[i], stretch);
        const f = hz * ratio;
        if (f > sr * 0.45) break;
        // higher partials die sooner with damping
        const t60 = Math.max(0.005, decay * Math.pow(Math.max(1, ratio), -damping * 1.6));
        const R = Math.exp(-6.9078 / (t60 * sr));
        const th = (TWO_PI * f) / sr;
        this.cr[k] = R * Math.cos(th);
        this.ci[k] = R * Math.sin(th);
        const level = modeLevel(r.model, i) * modeShape(r.model, i, pos);
        // a continuous exciter builds up as much as a partial rings: √(2(1 − R)) keeps the
        // level the same for any decay
        this.inGain[k] = level * (this.continuous ? Math.sqrt(2 * (1 - R)) * 3 : 1);
        this.outL[k] = modeShape(r.model, i, pickup);
        this.outR[k] = modeShape(r.model, i, clamp(pickup + r.width * 0.3, 0.02, 0.98));
        norm += level * level;
        k++;
      }
      // partials that stopped fitting (a pitch going up) are let go
      for (let i = k; i < this.modes; i++) this.zr[i] = this.zi[i] = 0;
      this.modes = k;
      const g = 1 / Math.sqrt(Math.max(1e-6, norm));
      for (let i = 0; i < k; i++) this.inGain[i] *= g;
    }
    // the body
    const b = p.body;
    const bodyKey = `${b.type}:${b.size}:${b.type === "tube" ? hz.toFixed(1) : ""}`;
    if (bodyKey !== this.bodyKey) {
      this.bodyKey = bodyKey;
      const modes: [number, number, number][] =
        b.type === "none"
          ? []
          : b.type === "tube"
            ? [
                [hz, 14, 1],
                [hz * 3, 12, 0.5],
              ]
            : BODY_MODES[b.type].map(([f, q, gain]) => [f / b.size, q, gain]);
      this.bodyGain = modes.map(([, , gain]) => gain);
      modes.forEach(([f, q], i) => {
        this.bodyL[i].set(f, q, sr);
        this.bodyR[i].set(f * 1.02, q, sr);
      });
    }
    this.bodyMix = b.type === "none" ? 0 : b.mix;
    this.pressure = clamp(e.pressure + m.pressure, 0, 1);
    // a continuous exciter's brightness follows Hardness (and its modulation) as it plays
    if (this.continuous) {
      const hard = clamp(e.hardness + m.hardness, 0, 1);
      this.exA = Math.exp((-TWO_PI * (300 + hard * hard * 15000)) / sr);
    }
    this.gate = gate;
  }
  private pressure = 0.5;
  private gate = false;

  /** The exciter's sample (impulses, or what a continuous one adds), times its level. */
  private excite(p: Physical, input: number): number {
    const e = p.exciter;
    this.drive += ((this.gate ? 1 : 0) - this.drive) * (this.gate ? this.driveUp : this.driveDown);
    if (e.type === "pluck" || e.type === "strike") {
      if (this.burst <= 0) return 0;
      const i = this.burstLen - this.burst--;
      const x = i / this.burstLen;
      const noise = rand();
      this.exLp = (1 - this.exA) * noise + this.exA * this.exLp;
      const g = this.amp * this.impulseNorm;
      if (e.type === "strike") {
        // a raised cosine (the mallet's contact), with a little noise
        const pulse = 0.5 - 0.5 * Math.cos(TWO_PI * x);
        return g * (pulse * (1 - e.noise * 0.7) + this.exLp * e.noise) * 2;
      }
      // a pluck: a triangle (the string pulled aside) and filtered noise
      const tri = x < 0.5 ? x * 2 : 2 - x * 2;
      return g * (tri * (1 - e.noise) + this.exLp * (0.3 + e.noise)) * 1.5;
    }
    const d = this.drive * this.amp;
    if (d < 1e-5) return 0;
    if (e.type === "oscillators") return input * d;
    const noise = rand();
    this.exLp = (1 - this.exA) * noise + this.exA * this.exLp;
    // noise, a breath on a resonator that isn't a tube, a bow on a modal one (scraping)
    return this.exLp * d * (0.4 + this.pressure * 0.8);
  }

  /** One sample: the exciter (with `input`, the oscillators), resonator, body. */
  tick(p: Physical, input: number) {
    const r = p.resonator;
    const e = p.exciter;
    let l = 0;
    let rr = 0;
    if (r.model === "string") {
      const bOut = lagrange(this.a, this.wa, this.da);
      const nOut = this.b[(this.wb - this.db) & MASK];
      // the bridge: loss, dispersion, inverted
      this.lp = (1 - this.lpA) * bOut + this.lpA * this.lp;
      let x = this.lp * this.g;
      if (this.apC !== 0) {
        const c = this.apC;
        const y1 = c * x + this.ap1x - c * this.ap1y;
        this.ap1x = x;
        this.ap1y = y1;
        const y2 = c * y1 + this.ap2x - c * this.ap2y;
        this.ap2x = y1;
        this.ap2y = y2;
        x = y2;
      }
      const bridge = -x;
      const nut = -nOut;
      let inj: number;
      if (e.type === "bow") {
        // stick and slip where the bow is (D250)
        const bowV = this.drive * this.amp * (0.03 + this.pressure * 0.25);
        this.drive +=
          ((this.gate ? 1 : 0) - this.drive) * (this.gate ? this.driveUp : this.driveDown);
        const dv = bowV - (bridge + nut);
        inj = dv * bowTable(dv, this.pressure);
        if (e.noise > 0) inj += rand() * e.noise * 0.002 * this.drive;
      } else inj = this.excite(p, input) * (this.continuous ? 0.5 * this.feed() : 1);
      this.b[this.wb] = bridge + inj;
      this.a[this.wa] = nut + inj;
      this.wa = (this.wa + 1) & MASK;
      this.wb = (this.wb + 1) & MASK;
      // two pickups (left, right): a comb where each sits
      this.hist[this.wh] = bOut;
      l = bOut - this.hist[(this.wh - this.pickL) & MASK] * 0.8;
      rr = bOut - this.hist[(this.wh - this.pickR) & MASK] * 0.8;
      this.wh = (this.wh + 1) & MASK;
    } else if (r.model === "tube") {
      const out = lagrange(this.a, this.wa, this.da);
      this.lp = (1 - this.lpA) * out + this.lpA * this.lp;
      const refl = this.lp * this.g;
      let next: number;
      if (e.type === "blow" && r.end === "closed") {
        // a reed (STK's clarinet): breath pressure against what comes back
        const breath =
          this.drive * (0.55 + this.pressure * 0.45) + rand() * e.noise * 0.05 * this.drive;
        this.drive +=
          ((this.gate ? 1 : 0) - this.drive) * (this.gate ? this.driveUp : this.driveDown);
        const diff = -refl - breath;
        const reed = clamp(0.7 - 0.3 * diff, -1, 1);
        next = breath + diff * reed;
        this.blowGain = this.amp;
      } else if (e.type === "blow") {
        // a jet (STK's flute): breath across the embouchure, delayed, through x³ − x
        // (a jet speaks between about 0.85 and 1.9 of breath: Pressure moves within that, and
        // velocity changes how loud, not whether it speaks)
        const breath =
          this.drive * (0.9 + this.pressure * 0.42) + rand() * e.noise * 0.1 * this.drive;
        this.drive +=
          ((this.gate ? 1 : 0) - this.drive) * (this.gate ? this.driveUp : this.driveDown);
        // the breath is steady pressure: keep it out of the loop, or the jet stops working
        const raw = -refl;
        this.jetY = raw - this.jetX + 0.995 * this.jetY;
        this.jetX = raw;
        const temp = this.jetY;
        this.b[this.wb] = breath - 0.5 * temp;
        const jet = this.b[(this.wb - this.db) & MASK];
        this.wb = (this.wb + 1) & MASK;
        const j = clamp(jet * (jet * jet - 1), -1, 1);
        next = j + 0.5 * temp;
        this.blowGain = this.amp;
      } else {
        // a linear tube: closed inverts, open doesn't
        next = (r.end === "closed" ? -refl : refl) + this.excite(p, input) * 0.5 * this.feed();
        this.blowGain = 1;
      }
      this.a[this.wa] = next;
      this.wa = (this.wa + 1) & MASK;
      l = rr = out * this.blowGain;
    } else {
      // (a bow on a bar, a bell or a bowl is its rosin's noise: the partials pick their notes
      // out of it, as a singing bowl does)
      const x = this.excite(p, input);
      const { zr: ZR, zi: ZI, cr: CR, ci: CI, inGain: IN, outL: OL, outR: OR } = this;
      for (let k = 0, n = this.modes; k < n; k++) {
        const zr = ZR[k];
        const zi = ZI[k];
        const nr = CR[k] * zr - CI[k] * zi + x * IN[k];
        const ni = CI[k] * zr + CR[k] * zi;
        ZR[k] = nr;
        ZI[k] = ni;
        l += ni * OL[k];
        rr += ni * OR[k];
      }
      l *= 1.5;
      rr *= 1.5;
    }
    // the body, blended in
    if (this.bodyMix > 0) {
      let bl = 0;
      let br = 0;
      for (let i = 0; i < this.bodyGain.length; i++) {
        bl += this.bodyL[i].process(l) * this.bodyGain[i];
        br += this.bodyR[i].process(rr) * this.bodyGain[i];
      }
      l = l * (1 - this.bodyMix * 0.7) + bl * this.bodyMix * 1.6;
      rr = rr * (1 - this.bodyMix * 0.7) + br * this.bodyMix * 1.6;
    }
    // no DC, and nothing runs away (D255)
    const m = (l + rr) * 0.5;
    this.dcY = m - this.dc + 0.995 * this.dcY;
    this.dc = m;
    const off = m - this.dcY;
    l = clamp(l - off, -4, 4);
    rr = clamp(rr - off, -4, 4);
    const a = Math.abs(l) + Math.abs(rr);
    if (a > this.peak) this.peak = a;
    this.outLeft = l;
    this.outRight = rr;
  }

  /** A continuous exciter into a waveguide builds up as much as the loop rings: scale it. */
  private feed() {
    return this.continuous ? Math.min(1, (1 - this.g) * 40) : 1;
  }

  /** Whether the oscillators feed this model (only then are they worth computing). */
  static usesOscillators(p: Physical) {
    return p.exciter.type === "oscillators";
  }

  /** After a block: whether it has died away (quiet for 50 ms, D254). */
  settle(blockSec: number, impulsive: boolean, held: boolean): boolean {
    if (this.peak < 2e-5) this.quiet += blockSec;
    else this.quiet = 0;
    this.peak = 0;
    return this.quiet > 0.05 && (!held || impulsive);
  }
}
