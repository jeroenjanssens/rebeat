/**
 * Calibration by prototypes (D112), the same math as `ml/rebeat_ml/calibrate.py`: a class's
 * prototype is the mean embedding of a voice's labeled hits; a hit's probabilities blend the
 * model's with a softmax over cosine similarity to the prototypes, by w = n / (n + k), where n
 * is the average number of examples per calibrated class.
 */

export interface Prototypes {
  vectors: (Float32Array | null)[];
  counts: number[];
}

export function softmax(z: ArrayLike<number>): number[] {
  let max = -Infinity;
  for (let i = 0; i < z.length; i++) max = Math.max(max, z[i]);
  const e = Array.from({ length: z.length }, (_, i) =>
    z[i] === -Infinity ? 0 : Math.exp(z[i] - max),
  );
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

export function prototypes(
  examples: { embedding: ArrayLike<number>; label: number }[],
  classes: number,
): Prototypes {
  const vectors: (Float32Array | null)[] = Array.from({ length: classes }, () => null);
  const counts = new Array(classes).fill(0);
  for (const { embedding, label } of examples) {
    const v = (vectors[label] ??= new Float32Array(embedding.length));
    for (let i = 0; i < v.length; i++) v[i] += embedding[i];
    counts[label]++;
  }
  for (const v of vectors) {
    if (!v) continue;
    let n = 0;
    for (const x of v) n += x * x;
    n = Math.sqrt(n) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= n;
  }
  return { vectors, counts };
}

export function blend(
  logits: ArrayLike<number>,
  embedding: ArrayLike<number>,
  protos: Prototypes | null,
  tau = 0.1,
  k = 4,
): number[] {
  const model = softmax(logits);
  if (!protos || !protos.counts.some((c) => c > 0)) return model;
  const sims = protos.vectors.map((v) => {
    if (!v) return -Infinity;
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * embedding[i];
    return s / tau;
  });
  const proto = softmax(sims);
  const have = protos.counts.filter((c) => c > 0);
  const n = have.reduce((a, b) => a + b, 0) / have.length;
  const w = n / (n + k);
  return model.map((p, i) => (1 - w) * p + w * proto[i]);
}

/** Per-class sums of a voice's embeddings, so one hit can be left out of its own prototype
 * (its guess shouldn't be helped by its own label). */
export class PrototypeSums {
  sums: Float32Array[];
  counts: number[];
  constructor(classes: number, size: number) {
    this.sums = Array.from({ length: classes }, () => new Float32Array(size));
    this.counts = new Array(classes).fill(0);
  }
  add(embedding: ArrayLike<number>, label: number) {
    const s = this.sums[label];
    for (let i = 0; i < s.length; i++) s[i] += embedding[i];
    this.counts[label]++;
  }
  /** Normalized prototypes, optionally without one example. */
  prototypes(without?: { embedding: ArrayLike<number>; label: number }): Prototypes {
    const counts = [...this.counts];
    if (without) counts[without.label]--;
    const vectors = this.sums.map((s, c) => {
      if (counts[c] <= 0) return null;
      const v = Float32Array.from(s);
      if (without && without.label === c)
        for (let i = 0; i < v.length; i++) v[i] -= without.embedding[i];
      let n = 0;
      for (const x of v) n += x * x;
      n = Math.sqrt(n) || 1;
      for (let i = 0; i < v.length; i++) v[i] /= n;
      return v;
    });
    return { vectors, counts: counts.map((c) => Math.max(0, c)) };
  }
}
