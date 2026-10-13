/** Standard MIDI File (type 1) export of the song or one section. */
import { blockOf, layout, type Block } from "./arrangement";
import type { Project } from "./project";
import { tempoAt, tempoMap } from "./tempoMap";
import {
  STEP_SIZE_QUARTERS,
  type Pattern,
  type Section,
  type SoundCategory,
  type Track,
} from "./types";

const PPQ = 480;
/** Every channel except 10 (index 9), which is for drums. */
const MELODIC_CHANNELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];

/** General MIDI drum notes per sound category. */
const GM_DRUMS: Record<SoundCategory, number> = {
  kick: 36,
  snare: 38,
  clap: 39,
  hat: 42,
  tom: 45,
  perc: 37,
  bass: 35,
  keys: 56,
  vocal: 54,
  fx: 49,
};

function vlq(n: number): number[] {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}

const str = (s: string) => [...new TextEncoder().encode(s)];
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

interface Ev {
  tick: number;
  data: number[];
}

function trackChunk(events: Ev[]): number[] {
  events.sort((a, b) => a.tick - b.tick || (a.data[0] & 0xf0) - (b.data[0] & 0xf0));
  const body: number[] = [];
  let last = 0;
  for (const e of events) {
    body.push(...vlq(Math.max(0, e.tick - last)), ...e.data);
    last = e.tick;
  }
  body.push(0, 0xff, 0x2f, 0x00);
  return [...str("MTrk"), ...u32(body.length), ...body];
}

/** One repeat of a section, as it plays: its pattern, its settings, how many steps. */
export interface Play {
  pattern: Pattern;
  section: Section;
  steps: number;
}

/** The repeats in order (the song, or one section once). */
export function playsInOrder(project: Project, range: "song" | "section", slotId?: string): Play[] {
  const blocks: Block[] =
    range === "section" ? [blockOf(project, slotId ?? "") ?? layout(project)[0]] : layout(project);
  return blocks.flatMap((b) =>
    Array.from({ length: range === "section" ? 1 : b.repeats }, () => ({
      pattern: b.pattern,
      section: b.section,
      steps: b.steps,
    })),
  );
}

/** The patterns in order (the song, or one section). */
export function patternsInOrder(
  project: Project,
  range: "song" | "section",
  slotId?: string,
): Pattern[] {
  return playsInOrder(project, range, slotId).map((p) => p.pattern);
}

function trackEvents(track: Track, plays: Play[], channel: number): Ev[] {
  const ev: Ev[] = [
    { tick: 0, data: [0xff, 0x03, ...vlq(str(track.name).length), ...str(track.name)] },
  ];
  let offset = 0;
  for (const { pattern, section, steps } of plays) {
    const stepTicks = STEP_SIZE_QUARTERS[pattern.stepSize] * PPQ;
    const lane = pattern.lanes[track.id];
    // muted in this section (D183): nothing from it here
    if (lane && track.mode !== "clip" && !section.mutes?.includes(track.id)) {
      const len = lane.stepCountOverride ?? pattern.stepCount;
      const laneTicks = STEP_SIZE_QUARTERS[lane.stepSizeOverride ?? pattern.stepSize] * PPQ;
      const count = Math.floor((steps * stepTicks) / laneTicks);
      for (let i = 0; i < count; i++) {
        const s = lane.steps[i % len];
        if (!s.on) continue;
        const stepAt = offset + (i + s.nudge) * laneTicks;
        const notes =
          track.mode === "notes"
            ? (s.notes ?? []).map((n) => ({
                pitch:
                  n.pitch +
                  (track.transpose ?? 0) +
                  (pattern.transpose ?? 0) +
                  (section.transpose ?? 0),
                // fractional lengths are preserved (D128)
                len: n.length,
                vel: n.velocity,
                // per-note offset: how far into the step the note starts (D128)
                offset: n.offset ?? 0,
              }))
            : [
                {
                  pitch: GM_DRUMS[track.category],
                  len: Math.max(0.25, s.gate),
                  vel: s.accent ? 1 : s.velocity,
                  offset: 0,
                },
              ];
        for (const n of notes) {
          const v = Math.max(1, Math.min(127, Math.round(n.vel * 127)));
          const pitch = Math.max(0, Math.min(127, n.pitch));
          const at = Math.round(stepAt + n.offset * laneTicks);
          ev.push({ tick: Math.max(0, at), data: [0x90 | channel, pitch, v] });
          ev.push({
            tick: Math.max(0, at + Math.round(n.len * laneTicks) - 1),
            data: [0x80 | channel, pitch, 0],
          });
        }
      }
    }
    offset += steps * stepTicks;
  }
  return ev;
}

const setTempo = (tick: number, bpm: number): Ev => {
  const t = Math.round(60_000_000 / bpm);
  return { tick, data: [0xff, 0x51, 0x03, (t >> 16) & 255, (t >> 8) & 255, t & 255] };
};

/** The tempo map as Set Tempo events (D193): a jump as one, a ramp as one every 16th. */
function tempoEvents(project: Project, from: number, to: number): Ev[] {
  const tick = (q: number) => Math.round((q - from) * PPQ);
  const ev: Ev[] = [setTempo(0, tempoAt(project, from))];
  for (const s of tempoMap(project)) {
    if (s.end <= from || s.q >= to) continue;
    if (s.bpm === s.to) {
      if (s.q > from) ev.push(setTempo(tick(s.q), s.bpm));
      continue;
    }
    for (let q = Math.max(from, s.q); q < Math.min(to, s.end); q += 0.25)
      ev.push(setTempo(tick(q), tempoAt(project, q + 0.125)));
  }
  return ev;
}

export function exportMidi(
  project: Project,
  range: "song" | "section",
  slotId?: string,
): Uint8Array {
  const plays = playsInOrder(project, range, slotId);
  const [num, den] = project.timeSignature;
  const block = range === "section" ? blockOf(project, slotId ?? "") : undefined;
  const from = block?.start ?? 0;
  const to = from + plays.reduce((q, p) => q + p.steps * STEP_SIZE_QUARTERS[p.pattern.stepSize], 0);
  const conductor = trackChunk([
    { tick: 0, data: [0xff, 0x03, ...vlq(str(project.name).length), ...str(project.name)] },
    ...tempoEvents(project, from, to),
    { tick: 0, data: [0xff, 0x58, 0x04, num, Math.round(Math.log2(den)), 24, 8] },
  ]);
  let melodic = 0;
  const tracks = project.tracks
    .filter((t) => t.mode !== "clip")
    .map((t) => {
      // hits on channel 10 (the drums); notes get their own channels (skipping 10)
      const ch = t.mode === "hits" ? 9 : MELODIC_CHANNELS[melodic++ % MELODIC_CHANNELS.length];
      return trackChunk(trackEvents(t, plays, ch));
    });
  const header = [
    ...str("MThd"),
    ...u32(6),
    0,
    1,
    0,
    tracks.length + 1,
    (PPQ >> 8) & 255,
    PPQ & 255,
  ];
  return new Uint8Array([...header, ...conductor, ...tracks.flat()]);
}
