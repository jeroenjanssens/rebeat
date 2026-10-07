import { uid } from "./id";
import { EFFECT_PARAMS, defaultParams } from "./params";
import type { Effect } from "./types";

export function makeEffect(name: string, params: Record<string, number> = {}): Effect {
  return {
    id: uid("fx"),
    name,
    params: { ...defaultParams(EFFECT_PARAMS[name] ?? []), ...params },
    bypass: false,
  };
}

export interface Bus {
  id: string;
  name: string;
  effects: Effect[];
  /** Return level (fader position, 0.8 = 0 dB). */
  volume: number;
  mute: boolean;
}

export interface Master {
  volume: number;
  effects: Effect[];
}

/** The two default send/return buses: A = reverb, B = delay. */
export function defaultBuses(): Bus[] {
  return [
    {
      id: "bus-a",
      name: "Reverb",
      effects: [makeEffect("Reverb", { mix: 1 })],
      volume: 0.8,
      mute: false,
    },
    {
      id: "bus-b",
      name: "Delay",
      effects: [makeEffect("Delay", { mix: 1 })],
      volume: 0.8,
      mute: false,
    },
  ];
}

/** EQ → compressor → limiter. */
export function defaultMaster(): Master {
  return {
    volume: 0.8,
    effects: [
      makeEffect("EQ3"),
      makeEffect("Compressor", { threshold: 0.8, ratio: 0.08, makeup: 0 }),
      makeEffect("Limiter"),
    ],
  };
}
