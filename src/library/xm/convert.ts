/**
 * A Fast Tracker 2 module as a Rebeat project (D279–D283). Pure: the module in, the project out,
 * with the samples it needs (rendered at 44.1 kHz, tuned and with their loops played out) and a
 * list of what FT2 does that the project can't.
 *
 * - One track per instrument (D280): an XM channel changes instruments from row to row, a track
 *   has one sound. Notes from every channel that play an instrument go to its track (chords
 *   where they overlap). A one-shot sample played within an octave is a Hits track; the rest are
 *   Notes tracks playing the sample (or a multi-sample, by the instrument's keymap).
 * - The order list becomes the song (D281): one section per entry, the same pattern a clone;
 *   pattern breaks (Dxx) make a section shorter, a jump back (Bxx) ends the song.
 * - A row is a step (D282): the step size and tempo keep the rows' length (speed and BPM), and
 *   Fxx changes become tempo changes.
 * - Loops are played out into the sample (D283): a note's length ends it, as a key-off would.
 */
import { guessCategory } from "../analysis";
import { makePattern, makeTrack, type Project } from "../../model/project";
import { emptyProject } from "../../templates/builder";
import {
  MAX_STEPS,
  type Note,
  type Section,
  type Sound,
  type StepSize,
  type TempoChange,
} from "../../model/types";
import type { XmCell, XmModule, XmSample } from "./parse";

/** The rate samples are rendered at. */
export const XM_RATE = 44100;
/** A played-out loop lasts at least this long, and at most the longest note (capped). */
const MIN_LOOP_SECONDS = 2;
const MAX_LOOP_SECONDS = 12;

export interface XmSampleOut {
  /** Placeholder id in the project (`sound.sampleId`), replaced once imported. */
  key: string;
  name: string;
  pcm: Float32Array;
}

export interface XmImport {
  project: Project;
  samples: XmSampleOut[];
  /** What Rebeat doesn't play, in sentences (for the toast after the import). */
  notes: string[];
}

/** An XM note (1 = C-0) as MIDI (C-4, XM 49, is MIDI 60). */
export const xmToMidi = (n: number) => n + 11;

/** A sample's playback rate at C-4 in FT2 (8363 Hz, moved by its relative note and finetune). */
export const c4Rate = (s: Pick<XmSample, "relativeNote" | "finetune">) =>
  8363 * 2 ** ((s.relativeNote + s.finetune / 128) / 12);

/** Rows per step and the tempo (D282): rows are 1/16 when the tempo fits, else 1/32 or 1/8. */
function stepFor(speed: number, bpm: number): { stepSize: StepSize; factor: number } {
  const options: { stepSize: StepSize; factor: number }[] = [
    { stepSize: "1/16", factor: 6 },
    { stepSize: "1/32", factor: 3 },
    { stepSize: "1/8", factor: 12 },
  ];
  return (
    options.find((o) => {
      const b = (o.factor * bpm) / speed;
      return b >= 40 && b <= 300;
    }) ?? options[0]
  );
}

const clampBpm = (b: number) => Math.max(20, Math.min(300, Math.round(b * 100) / 100));

interface SectionPlan {
  order: number;
  pattern: number;
  /** Rows it plays (a pattern break makes it shorter). */
  end: number;
  /** Each channel's instrument when it starts (a note without one uses the last). */
  inst: number[];
  /** Ticks per row when it starts. */
  speed: number;
}

interface Event {
  channel: number;
  row: number;
  note: number;
  inst: number;
  velocity: number;
  /** Where it ends, in rows of its pattern (may run into the next section). */
  end: number;
  /** Rows after the row (EDx). */
  delay: number;
  slide: boolean;
  ratchet: number;
  /** Rows it lasts when cut (ECx, a key-off at a tick). */
  cut?: number;
}

/** What FT2 does that isn't played, by name (counted). */
const IGNORED: Record<number, string> = {
  0x0: "arpeggios (0xy)",
  0x1: "slides up (1xx)",
  0x2: "slides down (2xx)",
  0x4: "vibrato (4xy)",
  0x5: "glide and volume slides (5xy)",
  0x6: "vibrato and volume slides (6xy)",
  0x7: "tremolo (7xy)",
  0x8: "panning (8xx)",
  0x9: "sample offsets (9xx)",
  0xa: "volume slides (Axy)",
  0x10: "global volume (Gxx)",
  0x11: "global volume slides (Hxy)",
  0x15: "envelope positions (Lxx)",
  0x19: "panning slides (Pxy)",
  0x1b: "multi retriggers (Rxy)",
  0x1d: "tremor (Txy)",
  0x21: "extra fine slides (Xxy)",
};

export function convertXm(mod: XmModule, fileName = ""): XmImport {
  const ignored = new Map<string, number>();
  const note = (what: string) => ignored.set(what, (ignored.get(what) ?? 0) + 1);
  const { stepSize, factor } = stepFor(mod.speed, mod.bpm);

  // ---- 1. play the order list through: sections, tempo, instruments per channel ----
  const plan: SectionPlan[] = [];
  const tempo: { section: number; row: number; bpm: number }[] = [];
  let speed = mod.speed;
  let bpm = mod.bpm;
  let current = clampBpm((factor * bpm) / speed);
  const startBpm = current;
  const inst = new Array(mod.channels).fill(0);
  const seen = new Set<number>();
  let i = 0;
  while (i < mod.orders.length && !seen.has(i) && plan.length < 512) {
    seen.add(i);
    const p = mod.orders[i];
    const pattern = mod.patterns[p];
    let end = pattern.rows;
    let jump: number | null = null;
    const startInst = [...inst];
    const startSpeed = speed;
    for (let r = 0; r < pattern.rows && r < end; r++) {
      for (let c = 0; c < mod.channels; c++) {
        const cell = pattern.cells[r][c];
        if (cell.instrument) inst[c] = cell.instrument;
        if (cell.effect === 0x0f && cell.param) {
          if (cell.param < 0x20) speed = cell.param;
          else bpm = cell.param;
          const b = clampBpm((factor * bpm) / speed);
          if (b !== current) {
            tempo.push({ section: plan.length, row: r, bpm: b });
            current = b;
          }
        }
        if (cell.effect === 0x0d) {
          end = r + 1;
          if (cell.param) note("pattern breaks into a later row (Dxx)");
        }
        if (cell.effect === 0x0b) {
          end = r + 1;
          jump = cell.param;
        }
      }
    }
    plan.push({ order: i, pattern: p, end, inst: startInst, speed: startSpeed });
    // a jump back is where the song loops: it ends there
    if (jump !== null) {
      if (jump <= i) break;
      i = jump;
    } else i += 1;
  }
  if (!plan.length) throw new Error("The module's order list is empty");

  // ---- 2. the notes of each pattern, from its first section ----
  const events = new Map<number, Event[]>();
  const firstOf = new Map<number, number>();
  plan.forEach((s, k) => {
    if (!firstOf.has(s.pattern)) firstOf.set(s.pattern, k);
  });
  for (const [p, k] of firstOf) {
    const s = plan[k];
    const pattern = mod.patterns[p];
    const list: Event[] = [];
    const chInst = [...s.inst];
    const open: (Event | null)[] = new Array(mod.channels).fill(null);
    const endAt = (c: number, row: number) => {
      const e = open[c];
      if (e && e.end === Infinity) e.end = Math.max(e.row + e.delay + 0.05, row);
      open[c] = null;
    };
    let spd = s.speed;
    for (let r = 0; r < s.end; r++) {
      // Fxx takes effect on its own row
      for (const cell of pattern.cells[r])
        if (cell.effect === 0x0f && cell.param && cell.param < 0x20) spd = cell.param;
      for (let c = 0; c < mod.channels; c++) {
        const cell = pattern.cells[r][c];
        if (cell.instrument) chInst[c] = cell.instrument;
        countIgnored(cell, note);
        const slide = cell.effect === 0x03 || cell.effect === 0x05 || cell.volume >= 0xf0;
        if (cell.note === 97) endAt(c, r);
        if (cell.effect === 0x14) endAt(c, r + cell.param / spd);
        if (cell.note >= 1 && cell.note <= 96) {
          const n = chInst[c];
          const instrument = mod.instruments[n - 1];
          const sample = instrument?.samples[instrument.keymap[cell.note - 1] ?? 0];
          if (!instrument || !sample || !sample.length) continue;
          endAt(c, r);
          const sub = cell.effect === 0x0e ? cell.param >> 4 : -1;
          const x = cell.param & 15;
          const vol =
            cell.volume >= 0x10 && cell.volume <= 0x50
              ? cell.volume - 0x10
              : cell.effect === 0x0c
                ? Math.min(64, cell.param)
                : sample.volume;
          const e: Event = {
            channel: c,
            row: r,
            note: cell.note,
            inst: n,
            velocity: Math.max(0.05, vol / 64),
            end: Infinity,
            delay: sub === 0xd ? Math.min(0.5, x / spd) : 0,
            slide,
            ratchet: sub === 0x9 && x ? Math.max(1, Math.min(8, Math.round(spd / x))) : 1,
            ...(sub === 0xc ? { cut: Math.max(0.05, x / spd) } : {}),
          };
          list.push(e);
          open[c] = e;
        } else if (cell.volume === 0x10 || (cell.effect === 0x0c && cell.param === 0)) {
          // volume 0 silences the note: as good as its end
          endAt(c, r);
        }
      }
    }
    // notes still sounding at the end: until the first note or key-off in the next section
    const next = plan[k + 1];
    for (let c = 0; c < mod.channels; c++) {
      const e = open[c];
      if (!e) continue;
      let tail = 0;
      if (next) {
        const np = mod.patterns[next.pattern];
        const limit = Math.min(next.end, 64);
        while (tail < limit && !np.cells[tail][c].note) tail++;
      }
      e.end = s.end + tail;
    }
    events.set(p, list);
  }

  // ---- 3. one track per instrument ----
  const project = emptyProject(
    mod.name || fileName.replace(/\.xm$/i, "") || "FT2 module",
    startBpm,
  );
  project.playMode = "song";
  const samples: XmSampleOut[] = [];
  const all = [...events.values()].flat();
  const used = [...new Set(all.map((e) => e.inst))].sort((a, b) => a - b);
  const rowSeconds = 60 / startBpm / (stepSize === "1/32" ? 8 : stepSize === "1/8" ? 2 : 4);
  const plans = new Map<number, InstrumentPlan & { trackId: string }>();
  for (const n of used) {
    const instrument = mod.instruments[n - 1];
    const evs = all.filter((e) => e.inst === n);
    const p = planInstrument(evs, instrument.keymap, instrument.samples);
    if (instrument.hasVolumeEnvelope) note("volume envelopes");
    if (instrument.fadeout && p.mode === "notes") note("fadeouts");
    if (instrument.vibrato) note("instrument vibrato");
    const longest = Math.max(1, ...evs.map((e) => (isFinite(e.end) ? e.end - e.row : 4)));
    const sounds: Sound["zones"] = [];
    for (const z of p.zones) {
      const s = instrument.samples[z.sample];
      const key = `xm:${n}:${z.sample}:${z.root}`;
      const top = Math.max(z.root, ...evs.map((e) => xmToMidi(e.note)));
      const seconds = longest * rowSeconds * 2 ** ((top - z.root) / 12);
      samples.push({
        key,
        name: s.name || `${instrument.name || `Instrument ${n}`} ${z.sample + 1}`,
        pcm: renderSample(s, z.root, seconds),
      });
      sounds.push({ note: z.root, sampleId: key });
    }
    const name = (instrument.name || `Instrument ${n}`).slice(0, 20);
    const sound: Sound =
      sounds.length === 1
        ? { source: "sample", sampleId: sounds[0].sampleId, rootNote: sounds[0].note, name }
        : { source: "multi", zones: sounds, rootNote: sounds[0].note, name };
    const guessed = guessCategory(name);
    const category = guessed !== "perc" ? guessed : p.mode === "hits" ? "perc" : "keys";
    const track = makeTrack(p.mode, category, name, name, [], sound);
    const pan = instrument.samples[p.zones[0].sample]?.panning ?? 128;
    if (pan !== 128) track.params["mix.pan"] = pan / 255;
    project.tracks.push(track);
    plans.set(n, { ...p, trackId: track.id });
  }
  if (!project.tracks.length) throw new Error("The module plays no notes");

  // ---- 4. patterns (split at 128 rows) and their notes ----
  const chunksOf = new Map<number, string[]>();
  for (const p of firstOf.keys()) {
    const rows = mod.patterns[p].rows;
    const ids: string[] = [];
    for (let at = 0; at < rows; at += MAX_STEPS) {
      const pat = makePattern(project, patternName(p, at, rows), Math.min(MAX_STEPS, rows - at));
      pat.stepSize = stepSize;
      project.patterns[pat.id] = pat;
      ids.push(pat.id);
    }
    chunksOf.set(p, ids);
    for (const e of events.get(p) ?? []) {
      const ip = plans.get(e.inst);
      if (!ip) continue;
      const chunk = Math.floor(e.row / MAX_STEPS);
      const lane = project.patterns[ids[chunk]].lanes[ip.trackId];
      const step = lane.steps[e.row - chunk * MAX_STEPS];
      const pitch = xmToMidi(e.note);
      const length =
        e.cut ?? Math.max(0.1, (isFinite(e.end) ? e.end : mod.patterns[p].rows) - e.row - e.delay);
      if (ip.mode === "hits") {
        // two channels hitting the same drum on a row: one hit, the louder
        step.velocity = step.on ? Math.max(step.velocity, e.velocity) : e.velocity;
        step.on = true;
        step.pitch = Math.max(-12, Math.min(12, pitch - ip.zones[0].root));
        if (e.delay) step.nudge = e.delay;
        if (e.ratchet > 1) step.ratchet = e.ratchet;
        if (e.cut !== undefined && e.cut < 1) step.gate = e.cut;
      } else {
        const n: Note = { pitch, length, velocity: e.velocity };
        if (e.delay) n.offset = e.delay;
        if (e.slide) n.slide = true;
        step.notes = [...(step.notes ?? []).filter((x) => x.pitch !== pitch), n].sort(
          (a, b) => a.pitch - b.pitch,
        );
        step.on = true;
        step.velocity = Math.max(...step.notes.map((x) => x.velocity));
        if (e.ratchet > 1) step.ratchet = e.ratchet;
      }
    }
  }

  // ---- 5. the song: a section per order entry (per 128 rows of its pattern) ----
  const slotOf: { slotId: string; from: number; to: number }[][] = [];
  plan.forEach((s, k) => {
    const ids = chunksOf.get(s.pattern)!;
    const parts: { slotId: string; from: number; to: number }[] = [];
    ids.forEach((pid, c) => {
      const from = c * MAX_STEPS;
      if (from >= s.end) return;
      const steps = Math.min(MAX_STEPS, s.end - from);
      const section: Section = { id: `slot-${k}-${c}`, patternId: pid, repeats: 1 };
      if (steps < project.patterns[pid].stepCount) section.steps = steps;
      project.slots.push(section);
      parts.push({ slotId: section.id, from, to: from + steps });
    });
    slotOf.push(parts);
  });
  const q = stepSize === "1/32" ? 0.125 : stepSize === "1/8" ? 0.5 : 0.25;
  const changes: TempoChange[] = [];
  for (const t of tempo) {
    const part = slotOf[t.section]?.find((x) => t.row >= x.from && t.row < x.to);
    if (part) changes.push({ slotId: part.slotId, at: (t.row - part.from) * q, bpm: t.bpm });
  }
  if (changes.length) project.tempo = changes;

  const notes = [...ignored].map(([what, n]) => `${what} (${n}×)`);
  return { project, samples, notes };
}

/** A pattern's name: its number in hex, as FT2 shows it (and the part, past 128 rows). */
const patternName = (p: number, at: number, rows: number) =>
  `${p.toString(16).toUpperCase().padStart(2, "0")}${rows > MAX_STEPS ? `.${at / MAX_STEPS + 1}` : ""}`;

function countIgnored(cell: XmCell, note: (what: string) => void) {
  const fx = cell.effect;
  if (fx === 0x0e) {
    const sub = cell.param >> 4;
    if (![0x9, 0xc, 0xd].includes(sub) && cell.param)
      note(`E${sub.toString(16).toUpperCase()}x commands`);
  } else if (IGNORED[fx] && (fx !== 0 || cell.param)) note(IGNORED[fx]);
  const v = cell.volume;
  if (v >= 0x60 && v < 0xf0) note("volume column slides, vibrato and panning");
}

interface InstrumentPlan {
  mode: "hits" | "notes";
  /** The samples it plays, each at the root its rendering is tuned to (MIDI). */
  zones: { sample: number; root: number }[];
}

/**
 * How an instrument plays (D280): a one-shot sample played within an octave of its most common
 * note is a Hits track tuned to that note; otherwise Notes, one zone per sample it uses, rooted
 * in the middle of the notes its keymap gives that sample.
 */
function planInstrument(evs: Event[], keymap: number[], samples: XmSample[]): InstrumentPlan {
  const used = [...new Set(evs.map((e) => keymap[e.note - 1] ?? 0))].filter(
    (s) => samples[s]?.length,
  );
  const pitches = evs.map((e) => xmToMidi(e.note));
  const counts = new Map<number, number>();
  for (const p of pitches) counts.set(p, (counts.get(p) ?? 0) + 1);
  const common = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 60;
  const span = Math.max(...pitches) - Math.min(...pitches);
  if (
    used.length === 1 &&
    samples[used[0]].loopType === 0 &&
    pitches.every((p) => Math.abs(p - common) <= 12) &&
    span <= 12
  )
    return { mode: "hits", zones: [{ sample: used[0], root: common }] };
  if (used.length <= 1) return { mode: "notes", zones: [{ sample: used[0] ?? 0, root: 60 }] };
  return {
    mode: "notes",
    zones: used.map((s) => {
      const keys = keymap.flatMap((k, i) => (k === s ? [xmToMidi(i + 1)] : []));
      return { sample: s, root: keys[Math.floor(keys.length / 2)] ?? 60 };
    }),
  };
}

/**
 * A sample rendered at 44.1 kHz so that it plays at its pitch on MIDI note `root` (D283): its
 * rate at C-4 moved to the root, linear interpolation (as FT2), a loop played out (forward or
 * ping-pong) for `seconds`, at least two seconds, at most twelve (a module with many looping instruments stays a few MB).
 */
export function renderSample(s: XmSample, root: number, seconds: number): Float32Array {
  const rate = c4Rate(s) * 2 ** ((root - 60) / 12);
  const step = rate / XM_RATE;
  const loops = s.loopType !== 0 && s.loopLength > 1;
  const loopEnd = s.loopStart + s.loopLength;
  const frames = loops
    ? Math.round(XM_RATE * Math.min(MAX_LOOP_SECONDS, Math.max(MIN_LOOP_SECONDS, seconds)))
    : Math.min(XM_RATE * 60, Math.ceil((s.length - 1) / step) + 1);
  const at = (pos: number) => {
    if (!loops || pos < loopEnd) return pos;
    const L = s.loopLength;
    if (s.loopType === 1) return s.loopStart + ((pos - s.loopStart) % L);
    const m = (pos - s.loopStart) % (2 * L);
    return m < L ? s.loopStart + m : loopEnd - (m - L) - 1e-6;
  };
  const read = (pos: number) => {
    const p = at(pos);
    const i = Math.floor(p);
    const f = p - i;
    const a = s.data[i] ?? 0;
    // the next frame: past a loop's end, its start (forward) or the frame before (ping-pong)
    let j = i + 1;
    if (loops && j >= loopEnd) j = s.loopType === 1 ? s.loopStart : loopEnd - 1;
    const b = s.data[Math.min(j, s.length - 1)] ?? a;
    return a + (b - a) * f;
  };
  const out = new Float32Array(Math.max(1, frames));
  for (let j = 0; j < out.length; j++) out[j] = read(j * step);
  // a played-out loop ends with a short fade, so a note longer than it doesn't click
  if (loops) {
    const fade = Math.min(out.length, Math.round(XM_RATE * 0.02));
    for (let j = 0; j < fade; j++) out[out.length - 1 - j] *= j / fade;
  }
  return out;
}
