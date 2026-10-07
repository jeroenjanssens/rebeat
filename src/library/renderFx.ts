/** Render effects into audio offline (faster than real time), for the sample editor. */
import * as Tone from "tone";
import { createFx } from "../engine/effects";
import type { Effect } from "../model/types";

export async function renderWithEffects(
  channels: Float32Array[],
  sampleRate: number,
  effects: Effect[],
  bpm: number,
  tail = 2,
): Promise<Float32Array[]> {
  const nch = Math.max(2, channels.length);
  const duration =
    channels[0].length / sampleRate +
    (effects.some((e) => ["Reverb", "Delay"].includes(e.name)) ? tail : 0);
  const rendered = await Tone.Offline(
    async () => {
      const buf = new Tone.ToneAudioBuffer().fromArray(
        channels.length === 1 ? channels[0] : channels,
      );
      const player = new Tone.Player(buf);
      const nodes = effects.filter((e) => !e.bypass).map((e) => createFx(e, bpm));
      let prev: Tone.ToneAudioNode = player;
      for (const n of nodes) {
        prev.connect(n.input);
        prev = n.output;
      }
      prev.toDestination();
      await Promise.all(nodes.map((n) => n.ready));
      player.start(0);
    },
    duration,
    nch,
    sampleRate,
  );
  return Array.from({ length: nch }, (_, c) => rendered.getChannelData(c).slice());
}
