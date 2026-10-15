/**
 * Static metadata for the eight keys-setting knobs that step in Chord and Key mode (D140, D148).
 * Each entry names the knob's slot, its display name, its MIDI-learn target, and how many zones
 * (values) it has — one zone per equal CC range across 0–127.
 *
 * The dynamic behaviour (reading and writing state) lives in `audio-io/midi.ts`, which imports
 * these counts so the zone math here and the live stepping stay in sync.
 */
import { BASS_OCTAVES, VOICING_RANGE } from "../model/padChords";
import { ARP_RATES, PATTERNS, STRUM_TIMES } from "../model/perform";

export interface KeysKnobMeta {
  /** Controller-map slot id, e.g. "knob1". */
  slot: string;
  name: string;
  target: string;
  /** Total number of equal CC zones (steps). knobZone(value, values) maps a CC to a zone. */
  values: number;
}

export const KEYS_KNOBS: KeysKnobMeta[] = [
  {
    slot: "knob1",
    name: "chord voicing",
    target: "keys:voicing",
    values: 2 * VOICING_RANGE + 1,
  },
  { slot: "knob2", name: "transpose", target: "keys:transpose", values: 25 },
  { slot: "knob3", name: "strum", target: "keys:strum", values: STRUM_TIMES.length + 1 },
  { slot: "knob4", name: "arp", target: "keys:arp", values: ARP_RATES.length + 1 },
  { slot: "knob5", name: "bass", target: "keys:bass", values: BASS_OCTAVES + 1 },
  { slot: "knob6", name: "slop", target: "keys:slop", values: 11 },
  { slot: "knob7", name: "pattern", target: "keys:pattern", values: PATTERNS.length + 1 },
  { slot: "knob8", name: "balance", target: "keys:balance", values: 11 },
];

/** A keyed lookup by slot id (e.g. "knob1"). */
export const KEYS_KNOBS_BY_SLOT: Record<string, KeysKnobMeta> = Object.fromEntries(
  KEYS_KNOBS.map((k) => [k.slot, k]),
);
