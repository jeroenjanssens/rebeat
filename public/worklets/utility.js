/**
 * The Utility effect (D216): gain, stereo width and phase. Its output has as many channels as
 * its input, so a mono sound stays mono (and keeps the channel's equal-power pan law), while a
 * stereo one gets mid/side width. The parameters add to their inputs: the engine drives them
 * with signals, so they can be automated.
 */
class Utility extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "gain", defaultValue: 0 },
      { name: "width", defaultValue: 0 },
      { name: "phase", defaultValue: 0 },
    ];
  }

  process(inputs, outputs, p) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input.length) return true;
    const at = (a, i) => (a.length > 1 ? a[i] : a[0]);
    const n = input[0].length;
    if (input.length === 1 || output.length === 1) {
      const x = input[0];
      for (const out of output)
        for (let i = 0; i < n; i++) out[i] = x[i] * at(p.gain, i) * at(p.phase, i);
      return true;
    }
    const [l, r] = input;
    const [ol, or] = output;
    for (let i = 0; i < n; i++) {
      const g = at(p.gain, i) * at(p.phase, i);
      const m = (l[i] + r[i]) / 2;
      const s = ((l[i] - r[i]) / 2) * at(p.width, i);
      ol[i] = (m + s) * g;
      or[i] = (m - s) * g;
    }
    return true;
  }
}

registerProcessor("rebeat-utility", Utility);
