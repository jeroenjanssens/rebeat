/** Standard MIDI File (type 1) export of the song or one page. */
import type { Project } from "./project";
import { STEP_SIZE_QUARTERS, type Pattern, type SoundCategory, type Track } from "./types";

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

export function patternsInOrder(
  project: Project,
  range: "song" | "page",
  slotId?: string,
): Pattern[] {
  if (range === "page") {
    const slot = project.slots.find((s) => s.id === slotId) ?? project.slots[0];
    return [project.patterns[slot.patternId]];
  }
  return project.slots.flatMap((s) =>
    Array.from({ length: s.repeats }, () => project.patterns[s.patternId]),
  );
}

function trackEvents(track: Track, patterns: Pattern[], channel: number): Ev[] {
  const ev: Ev[] = [
    { tick: 0, data: [0xff, 0x03, ...vlq(str(track.name).length), ...str(track.name)] },
  ];
  let offset = 0;
  for (const pattern of patterns) {
    const stepTicks = STEP_SIZE_QUARTERS[pattern.stepSize] * PPQ;
    const lane = pattern.lanes[track.id];
    if (lane?.kind === "steps") {
      const len = lane.stepCountOverride ?? pattern.stepCount;
      const laneTicks = STEP_SIZE_QUARTERS[lane.stepSizeOverride ?? pattern.stepSize] * PPQ;
      const count = Math.floor((pattern.stepCount * stepTicks) / laneTicks);
      for (let i = 0; i < count; i++) {
        const s = lane.steps[i % len];
        if (!s.on) continue;
        const at = Math.round(offset + (i + s.nudge) * laneTicks);
        const notes =
          track.kind === "instrument"
            ? (s.notes ?? []).map((n) => ({
                pitch: n.pitch + (track.transpose ?? 0) + (pattern.transpose ?? 0),
                len: n.length,
                vel: n.velocity,
              }))
            : [
                {
                  pitch: GM_DRUMS[track.category],
                  len: Math.max(0.25, s.gate),
                  vel: s.accent ? 1 : s.velocity,
                },
              ];
        for (const n of notes) {
          const v = Math.max(1, Math.min(127, Math.round(n.vel * 127)));
          const pitch = Math.max(0, Math.min(127, n.pitch));
          ev.push({ tick: Math.max(0, at), data: [0x90 | channel, pitch, v] });
          ev.push({
            tick: Math.max(0, at + Math.round(n.len * laneTicks) - 1),
            data: [0x80 | channel, pitch, 0],
          });
        }
      }
    }
    offset += pattern.stepCount * stepTicks;
  }
  return ev;
}

export function exportMidi(project: Project, range: "song" | "page", slotId?: string): Uint8Array {
  const patterns = patternsInOrder(project, range, slotId);
  const tempo = Math.round(60_000_000 / project.bpm);
  const [num, den] = project.timeSignature;
  const conductor = trackChunk([
    { tick: 0, data: [0xff, 0x03, ...vlq(str(project.name).length), ...str(project.name)] },
    { tick: 0, data: [0xff, 0x51, 0x03, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255] },
    { tick: 0, data: [0xff, 0x58, 0x04, num, Math.round(Math.log2(den)), 24, 8] },
  ]);
  let melodic = 0;
  const tracks = project.tracks
    .filter((t) => t.kind !== "audio")
    .map((t) => {
      // drums on channel 10; instruments get their own channels (skipping 10)
      const ch = t.kind === "drum" ? 9 : MELODIC_CHANNELS[melodic++ % MELODIC_CHANNELS.length];
      return trackChunk(trackEvents(t, patterns, ch));
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
