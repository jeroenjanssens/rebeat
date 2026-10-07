/**
 * Scratch voice: reads a buffer at a variable, signed speed driven by the jog/platter (vinyl
 * style, including backwards), with smoothing so hand movements don't click.
 */
class ScratchVoice extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ch = null;
    this.len = 1;
    this.pos = 0; // in buffer frames
    this.rate = 0;
    this.target = 0;
    this.gain = 0;
    this.targetGain = 0;
    this.srRatio = 1;
    this.frames = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.buffer) {
        this.ch = d.buffer;
        this.len = d.buffer[0].length;
        this.srRatio = d.bufferRate / sampleRate;
      }
      if (d.pos !== undefined) this.pos = d.pos * this.srRatio * sampleRate;
      if (d.rate !== undefined) this.target = d.rate;
      if (d.gain !== undefined) this.targetGain = d.gain;
    };
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    if (!this.ch || !out.length) return true;
    const n = out[0].length;
    const len = this.len;
    for (let i = 0; i < n; i++) {
      // ~5 ms smoothing on speed, ~2 ms on the cut fader
      this.rate += (this.target - this.rate) * 0.004;
      this.gain += (this.targetGain - this.gain) * 0.01;
      const p = this.pos;
      const i0 = Math.floor(p);
      const f = p - i0;
      const a0 = ((i0 % len) + len) % len;
      const a1 = (a0 + 1) % len;
      for (let c = 0; c < out.length; c++) {
        const d = this.ch[Math.min(c, this.ch.length - 1)];
        out[c][i] = (d[a0] + (d[a1] - d[a0]) * f) * this.gain;
      }
      this.pos = (((p + this.rate * this.srRatio) % len) + len) % len;
    }
    this.frames += n;
    if (this.frames >= 1024) {
      this.frames = 0;
      this.port.postMessage({ pos: this.pos / this.srRatio / sampleRate });
    }
    return true;
  }
}

registerProcessor("rebeat-scratch", ScratchVoice);
