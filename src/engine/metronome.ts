/** Metronome clicks. They go straight to the speakers, not through the master bus or its scope. */
import * as Tone from "tone";

let out: GainNode | null = null;

export function setMetronomeVolume(v: number) {
  if (out) out.gain.value = v;
}

export function click(time: number, accent: boolean) {
  const ctx = Tone.getContext().rawContext as AudioContext;
  if (!out) {
    out = ctx.createGain();
    out.gain.value = 0.5;
    out.connect(ctx.destination);
  }
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.frequency.value = accent ? 1760 : 1175;
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(accent ? 0.9 : 0.6, time + 0.001);
  env.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  osc.connect(env).connect(out);
  osc.start(time);
  osc.stop(time + 0.06);
  scheduled.add(osc);
  osc.onended = () => {
    scheduled.delete(osc);
    env.disconnect();
  };
}

const scheduled = new Set<OscillatorNode>();

/** Clicks already scheduled (the transport looks ahead) don't play after a stop. */
export function silenceMetronome() {
  for (const osc of scheduled) {
    osc.onended = null;
    osc.stop();
    osc.disconnect();
  }
  scheduled.clear();
}
