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
 * - FT2's effects (D284–D289): arpeggios as notes per tick, vibrato and slides as bends, envelopes
 *   played into the samples (the rest after key-off and the fadeout as the release), panning and
 *   volume changes as automation.
 */
import { guessCategory } from "../analysis";
import { makePattern, makeTrack, type Project } from "../../model/project";
import { emptyProject } from "../../templates/builder";
import {
  MAX_STEPS,
  type AutomationPoint,
  type Note,
  type NoteBend,
  type Section,
  type SongAnchor,
  type Sound,
  type StepSize,
  type TempoChange,
} from "../../model/types";
import { envAt, releaseKnob, releaseSeconds } from "./envelope";
import type { XmCell, XmEnvelope, XmInstrument, XmModule, XmSample } from "./parse";

/** The rate samples are rendered at. */
export const XM_RATE = 44100;
/** A played-out loop lasts at least this long, and at most the longest note (capped). */
const MIN_LOOP_SECONDS = 2;
const MAX_LOOP_SECONDS = 12;

export interface XmSampleOut {
  /** Placeholder id in the project (`sound.sampleId`), replaced once imported. */
  key: string;
  name: string;
  /** Mono, or left and right (a panning envelope). */
  channels: Float32Array[];
}

export interface XmImport {
  project: Project;
  samples: XmSampleOut[];
  /** What Rebeat doesn't play, by name and count (for the toast after the import). */
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
  ratchet: number;
  /** Rows it lasts when cut (ECx, a key-off at a tick). */
  cut?: number;
  /** Ticks per row where it starts. */
  spd: number;
  /** Where in its sample it starts (9xx), 0..1. */
  start?: number;
  /** Pitch effects while it sounds (D286): vibrato from a row, slides over rows (semitones), a
   * glide into it from the note before (semitones, over rows). */
  vib?: { row: number; speed: number; depth: number };
  slide?: { semis: number; from: number; to: number };
  scoop?: { amount: number; rows: number };
  /** Arpeggio rows (D284): the row, x, y and its ticks. */
  arps: [number, number, number, number][];
}

/** A channel's effect memory: FT2 commands with 00 repeat the last value. */
interface Memory {
  vibSpeed: number;
  vibDepth: number;
  up: number;
  down: number;
  fineUp: number;
  fineDown: number;
  tone: number;
  volSlide: number;
  panSlide: number;
  offset: number;
}

const memory = (): Memory => ({
  vibSpeed: 0,
  vibDepth: 0,
  up: 0,
  down: 0,
  fineUp: 0,
  fineDown: 0,
  tone: 0,
  volSlide: 0,
  panSlide: 0,
  offset: 0,
});

/** What FT2 does that isn't played, by name (counted). */
const IGNORED: Record<number, string> = {
  0x7: "tremolo (7xy)",
  0x10: "global volume (Gxx)",
  0x11: "global volume slides (Hxy)",
  0x15: "envelope positions (Lxx)",
  0x1b: "multi retriggers (Rxy)",
  0x1d: "tremor (Txy)",
};

/** The E commands Rebeat plays: fine slides, panning, retrigger, fine volume slides, cut, delay. */
const PLAYED_E = new Set([0x1, 0x2, 0x8, 0x9, 0xa, 0xb, 0xc, 0xd]);

export function convertXm(mod: XmModule, fileName = ""): XmImport {
  const ignored = new Map<string, number>();
  const note = (what: string) => ignored.set(what, (ignored.get(what) ?? 0) + 1);
  const { stepSize, factor } = stepFor(mod.speed, mod.bpm);
  /** Quarter notes per row, and seconds per tick at the start tempo (envelopes, D287). */
  const q = stepSize === "1/32" ? 0.125 : stepSize === "1/8" ? 0.5 : 0.25;
  const tickSeconds = 2.5 / mod.bpm;

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

  // ---- 2. the notes of each pattern, from its first section, with their pitch effects ----
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
    const last: (number | undefined)[] = new Array(mod.channels).fill(undefined);
    const mem = Array.from({ length: mod.channels }, memory);
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
        const m = mem[c];
        if (cell.instrument) chInst[c] = cell.instrument;
        countIgnored(cell, note);
        const fx = cell.effect;
        const vc = cell.volume;
        const porta = fx === 0x03 || fx === 0x05 || vc >= 0xf0;
        if (fx === 0x03 && cell.param) m.tone = cell.param;
        if (vc >= 0xf0 && vc & 15) m.tone = (vc & 15) << 4;
        if (cell.note === 97) endAt(c, r);
        if (fx === 0x14) endAt(c, r + cell.param / spd);
        if (cell.note >= 1 && cell.note <= 96) {
          const n = chInst[c];
          const instrument = mod.instruments[n - 1];
          const sample = instrument?.samples[instrument.keymap[cell.note - 1] ?? 0];
          if (!instrument || !sample || !sample.length) continue;
          const before = open[c] ? last[c] : undefined;
          endAt(c, r);
          const sub = fx === 0x0e ? cell.param >> 4 : -1;
          const x = cell.param & 15;
          const vol =
            vc >= 0x10 && vc <= 0x50
              ? vc - 0x10
              : fx === 0x0c
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
            ratchet: sub === 0x9 && x ? Math.max(1, Math.min(8, Math.round(spd / x))) : 1,
            ...(sub === 0xc ? { cut: Math.max(0.05, x / spd) } : {}),
            spd,
            arps: [],
          };
          // a sample offset (9xx, 256 frames a step): a hit's sample start (D291)
          if (fx === 0x09) {
            m.offset = cell.param || m.offset;
            const frac = (m.offset * 256) / sample.length;
            if (frac > 0 && frac < 1) e.start = frac;
          }
          // tone portamento: the note glides in from the one that was sounding (D286)
          if (porta && before !== undefined && before !== cell.note && m.tone) {
            const semis = before - cell.note;
            e.scoop = { amount: semis, rows: Math.abs(semis) / (m.tone / 16) / spd };
          }
          list.push(e);
          open[c] = e;
          last[c] = cell.note;
        } else if (vc === 0x10 || (fx === 0x0c && cell.param === 0)) {
          // volume 0 silences the note: as good as its end
          endAt(c, r);
        }
        const e = open[c];
        if (!e) continue;
        pitchEffects(e, cell, r, spd, m);
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

  // ---- 3. one track per instrument, with its envelope and release (D287) ----
  const project = emptyProject(
    mod.name || fileName.replace(/\.xm$/i, "") || "FT2 module",
    startBpm,
  );
  project.playMode = "song";
  const samples: XmSampleOut[] = [];
  const all = [...events.values()].flat();
  const used = [...new Set(all.map((e) => e.inst))].sort((a, b) => a - b);
  const rowSeconds = (60 / startBpm) * q;
  const plans = new Map<number, InstrumentPlan & { trackId: string }>();
  for (const n of used) {
    const instrument = mod.instruments[n - 1];
    const evs = all.filter((e) => e.inst === n);
    const p = planInstrument(evs, instrument);
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
        channels: renderSample(s, z.root, seconds, {
          volume: instrument.volumeEnvelope,
          pan: instrument.panEnvelope,
          tick: tickSeconds,
        }),
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
    // FT2's attack is instant, and a key-off ends the note as its envelope and fadeout say
    if (p.mode === "notes") {
      track.params["sound.attack"] = 0;
      track.params["sound.release"] = releaseKnob(releaseSeconds(instrument, tickSeconds));
    }
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
      const list = pieces(e, rows, q, mod.instruments[e.inst - 1], note);
      for (const [i, piece] of list.entries()) {
        // a hit stays on its row (a delay is its nudge); a note's start may move it to the next
        let at = ip.mode === "hits" ? e.row : Math.round(piece.start);
        if (at >= rows) continue;
        if (at < 0) at = 0;
        const offset = piece.start - at;
        const chunk = Math.floor(at / MAX_STEPS);
        const lane = project.patterns[ids[chunk]].lanes[ip.trackId];
        const step = lane.steps[at - chunk * MAX_STEPS];
        if (ip.mode === "hits") {
          // a drum takes its first piece; two channels hitting it on a row: one hit, the louder
          if (i > 0) continue;
          step.velocity = step.on ? Math.max(step.velocity, e.velocity) : e.velocity;
          step.on = true;
          step.pitch = Math.max(-12, Math.min(12, piece.pitch - ip.zones[0].root));
          if (e.delay) step.nudge = e.delay;
          if (e.ratchet > 1) step.ratchet = e.ratchet;
          if (e.cut !== undefined && e.cut < 1) step.gate = e.cut;
          if (e.start !== undefined) step.locks = { ...step.locks, "sound.start": e.start };
          continue;
        }
        if (e.start !== undefined) note("sample offsets on notes (9xx)");
        const n: Note = { pitch: piece.pitch, length: piece.length, velocity: e.velocity };
        if (Math.abs(offset) > 1e-6) n.offset = Math.max(-0.5, Math.min(0.5, offset));
        if (piece.bend) n.bend = piece.bend;
        step.notes = [...(step.notes ?? []).filter((x) => x.pitch !== n.pitch), n].sort(
          (a, b) => a.pitch - b.pitch,
        );
        step.on = true;
        step.velocity = Math.max(...step.notes.map((x) => x.velocity));
        if (e.ratchet > 1 && i === 0) step.ratchet = e.ratchet;
      }
    }
  }

  // ---- 5. the song: a section per order entry (per 128 rows of its pattern) ----
  const slotOf: Part[][] = [];
  plan.forEach((s, k) => {
    const ids = chunksOf.get(s.pattern)!;
    const parts: Part[] = [];
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
  const anchor = (section: number, row: number) => anchorOf(slotOf, section, row, q);
  const changes: TempoChange[] = [];
  for (const t of tempo) {
    const a = anchor(t.section, t.row);
    if (a) changes.push({ ...a, bpm: t.bpm });
  }
  if (changes.length) project.tempo = changes;

  // ---- 6. panning and volume changes as automation on the instruments' tracks (D288, D289) ----
  const lanes = mixAutomation(mod, plan, anchor);
  for (const [n, kinds] of lanes) {
    const ip = plans.get(n);
    if (!ip) continue;
    for (const [kind, points] of Object.entries(kinds)) {
      if (!points.length) continue;
      project.automation ??= [];
      project.automation.push({
        id: `auto-xm-${n}-${kind}`,
        target: `track:${ip.trackId}:${kind === "pan" ? "mix.pan" : "volume"}`,
        on: true,
        points,
      });
    }
  }

  const notes = [...ignored].map(([what, n]) => `${what} (${n}×)`);
  return { project, samples, notes };
}

/** A section's part (patterns over 128 rows are split) and where it is in the pattern. */
interface Part {
  slotId: string;
  from: number;
  to: number;
}

/** A row of a section as a song anchor (its part and the quarter notes into it). */
function anchorOf(slotOf: Part[][], section: number, row: number, q: number) {
  const parts = slotOf[section];
  if (!parts?.length) return null;
  const part = parts.find((x) => row >= x.from && row < x.to) ?? parts[parts.length - 1];
  // the end of the last row (a ramp's end) stays inside the section
  const at = Math.min(row - part.from, part.to - part.from - 0.01) * q;
  return { slotId: part.slotId, at: Math.max(0, at) };
}

/** A row's pitch effects on the note sounding in its channel (D284, D286). */
function pitchEffects(e: Event, cell: XmCell, r: number, spd: number, m: Memory) {
  const fx = cell.effect;
  const x = cell.param >> 4;
  const y = cell.param & 15;
  const vc = cell.volume;
  // vibrato: 4xy, 6xy (its memory), the volume column's Sx (speed) and Vx (depth)
  let vib = false;
  if (fx === 0x04) {
    if (x) m.vibSpeed = x;
    if (y) m.vibDepth = y;
    vib = true;
  }
  if (fx === 0x06) vib = true;
  if (vc >= 0xa0 && vc < 0xb0 && vc & 15) m.vibSpeed = vc & 15;
  if (vc >= 0xb0 && vc < 0xc0) {
    if (vc & 15) m.vibDepth = vc & 15;
    vib = true;
  }
  if (vib && m.vibSpeed && m.vibDepth) {
    e.vib ??= { row: r, speed: m.vibSpeed, depth: m.vibDepth };
    e.vib.depth = Math.max(e.vib.depth, m.vibDepth);
  }
  // slides: 1xx and 2xx on every tick but the first, E1x/E2x once, X1x/X2x extra fine
  let semis = 0;
  if (fx === 0x01) semis = ((m.up = cell.param || m.up) * (spd - 1)) / 16;
  if (fx === 0x02) semis = -((m.down = cell.param || m.down) * (spd - 1)) / 16;
  if (fx === 0x0e && x === 0x1) semis = (m.fineUp = y || m.fineUp) / 16;
  if (fx === 0x0e && x === 0x2) semis = -(m.fineDown = y || m.fineDown) / 16;
  if (fx === 0x21 && x === 1) semis = y / 64;
  if (fx === 0x21 && x === 2) semis = -y / 64;
  if (semis) {
    e.slide ??= { semis: 0, from: r, to: r + 1 };
    e.slide.semis += semis;
    e.slide.to = r + 1;
  }
  // arpeggio: 0xy
  if (fx === 0x00 && cell.param) e.arps.push([r, x, y, spd]);
}

/** A part of a note as it's written: its start (rows, fractional), length, pitch and bend. */
interface Piece {
  start: number;
  length: number;
  pitch: number;
  bend?: NoteBend;
}

/** Arpeggio rows that follow each other with the same x and y: one stretch of the bend. */
function arpSpans(arps: Event["arps"]) {
  const spans: { from: number; to: number; x: number; y: number; spd: number }[] = [];
  for (const [row, x, y, spd] of arps) {
    const last = spans[spans.length - 1];
    if (last && last.to === row && last.x === x && last.y === y && last.spd === spd)
      last.to = row + 1;
    else spans.push({ from: row, to: row + 1, x, y, spd });
  }
  return spans;
}

/**
 * A note as it's written (D284, D286): one note, its pitch effects as a bend. An arpeggio is an
 * Arp bend over its rows (the note keeps sounding, as in FT2); a second stretch of arpeggio with
 * other notes starts the note again there.
 */
function pieces(
  e: Event,
  patternRows: number,
  q: number,
  instrument: XmInstrument,
  note: (what: string) => void,
): Piece[] {
  const pitch = xmToMidi(e.note);
  const start = e.row + e.delay;
  const end = Math.max(
    start + 0.05,
    e.cut !== undefined ? e.row + e.cut : isFinite(e.end) ? e.end : patternRows,
  );
  const bend = bendOf(e, instrument, q, note);
  const spans = arpSpans(e.arps).filter((sp) => sp.to > start && sp.from < end);
  if (!spans.length) return [{ start, length: end - start, pitch, ...(bend ? { bend } : {}) }];
  if (bend) note("pitch effects on arpeggiated notes");
  return spans.map((sp, i) => {
    const from = i === 0 ? start : sp.from;
    const to = spans[i + 1]?.from ?? end;
    const arp: NoteBend = {
      shape: "arp",
      amount: sp.x,
      second: sp.y,
      // a step per tick: ticks per quarter note
      rate: sp.spd / q,
      time: Math.max(0.001, (Math.min(sp.to, to) - Math.max(sp.from, from)) * q),
      delay: Math.max(0, (sp.from - from) * q),
      unit: "q",
    };
    return { start: from, length: to - from, pitch, bend: arp };
  });
}

/**
 * A note's bend from its pitch effects (D286): vibrato a Shake, slides a Rise by what they add up
 * to, a glide into the note a Scoop, the instrument's vibrato a Shake when there's no other. One
 * bend per note: the larger movement wins.
 */
function bendOf(
  e: Event,
  instrument: XmInstrument,
  q: number,
  note: (what: string) => void,
): NoteBend | undefined {
  const toQ = (rows: number) => Math.max(0, rows * q);
  const clamp = (s: number) => Math.max(-24, Math.min(24, Math.round(s * 100) / 100));
  const out: NoteBend[] = [];
  if (e.vib)
    out.push({
      shape: "shake",
      amount: clamp(e.vib.depth / 16),
      // FT2's vibrato moves speed/64 of a cycle per tick
      rate: ((e.vib.speed / 64) * e.spd) / q,
      time: 0.001,
      delay: toQ(e.vib.row - e.row),
      unit: "q",
    });
  if (e.slide && Math.abs(e.slide.semis) >= 0.05)
    out.push({
      shape: "rise",
      amount: clamp(e.slide.semis),
      time: Math.max(0.001, toQ(e.slide.to - e.slide.from - 1 / e.spd)),
      delay: toQ(e.slide.from - e.row + 1 / e.spd),
      unit: "q",
    });
  if (e.scoop)
    out.push({
      shape: "scoop",
      amount: clamp(e.scoop.amount),
      time: Math.max(0.001, toQ(e.scoop.rows)),
      delay: 0,
      unit: "q",
    });
  const v = instrument.vibrato;
  if (!out.length && v)
    out.push({
      shape: "shake",
      amount: clamp(v.depth / 32),
      rate: ((v.rate / 256) * e.spd) / q,
      time: Math.max(0.001, toQ(v.sweep / e.spd)),
      delay: 0,
      unit: "q",
    });
  if (out.length > 1) note("notes with two pitch effects (the larger one is played)");
  return out.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
}

type Points = AutomationPoint[];

/**
 * Panning and volume changes as automation (D288, D289), walking the song as it plays: 8xx, E8x,
 * the volume column's Px set a channel's pan, Pxy and the column's slides move it; Axy, 5xy, 6xy,
 * EAx, EBx, the column's slides and a volume set during a note move its level. They go to the
 * track of the instrument the channel plays: a pan lane, and a level lane relative to the note's
 * own velocity (0 dB at every new note). An instrument gets a lane only when it has such changes.
 */
function mixAutomation(
  mod: XmModule,
  plan: SectionPlan[],
  anchor: (section: number, row: number) => SongAnchor | null,
): Map<number, { pan: Points; level: Points }> {
  type Mark = { k: number; r: number; v: number; ramp?: { k: number; r: number; v: number } };
  const marks = new Map<number, { pan: Mark[]; level: Mark[]; panFx: boolean; levelFx: boolean }>();
  const of = (n: number) => {
    let m = marks.get(n);
    if (!m) marks.set(n, (m = { pan: [], level: [], panFx: false, levelFx: false }));
    return m;
  };
  const chan = Array.from({ length: mod.channels }, () => ({
    inst: 0,
    playing: false,
    noteVol: 64,
    vol: 64,
    pan: 128,
    mem: memory(),
  }));
  const fader = (vol: number, noteVol: number) =>
    noteVol <= 0 ? 0 : Math.min(1, 0.8 * Math.sqrt(Math.max(0, vol) / noteVol));
  plan.forEach((s, k) => {
    const pattern = mod.patterns[s.pattern];
    chan.forEach((c, i) => {
      if (!c.inst) c.inst = s.inst[i];
    });
    let spd = s.speed;
    for (let r = 0; r < s.end; r++) {
      for (const cell of pattern.cells[r])
        if (cell.effect === 0x0f && cell.param && cell.param < 0x20) spd = cell.param;
      pattern.cells[r].forEach((cell, i) => {
        const c = chan[i];
        if (cell.instrument) c.inst = cell.instrument;
        const fx = cell.effect;
        const vc = cell.volume;
        const x = cell.param >> 4;
        const y = cell.param & 15;
        const instrument = mod.instruments[c.inst - 1];
        if (cell.note >= 1 && cell.note <= 96 && instrument) {
          const sample = instrument.samples[instrument.keymap[cell.note - 1] ?? 0];
          if (sample?.length) {
            c.playing = true;
            c.noteVol =
              vc >= 0x10 && vc <= 0x50
                ? vc - 0x10
                : fx === 0x0c
                  ? Math.min(64, cell.param)
                  : sample.volume;
            c.vol = c.noteVol;
            // a new note takes its sample's panning (unless the row sets one)
            if (cell.instrument) c.pan = sample.panning;
            const m = of(c.inst);
            m.level.push({ k, r, v: 0.8 });
            m.pan.push({ k, r, v: c.pan / 255 });
          }
        }
        if (cell.note === 97) c.playing = false;
        if (!instrument) return;
        const m = of(c.inst);
        // panning
        let pan: number | null = null;
        let panSlide = 0;
        if (fx === 0x08) pan = cell.param;
        if (fx === 0x0e && x === 0x8) pan = y * 17;
        if (vc >= 0xc0 && vc < 0xd0) pan = (vc & 15) * 17;
        if (fx === 0x19) {
          const p = (c.mem.panSlide = cell.param || c.mem.panSlide);
          panSlide = ((p >> 4) - (p & 15)) * (spd - 1);
        }
        if (vc >= 0xd0 && vc < 0xe0) panSlide = -(vc & 15) * (spd - 1);
        if (vc >= 0xe0 && vc < 0xf0) panSlide = (vc & 15) * (spd - 1);
        if (pan !== null) {
          c.pan = pan;
          m.panFx = true;
          m.pan.push({ k, r, v: pan / 255 });
        }
        if (panSlide) {
          const from = c.pan;
          c.pan = Math.max(0, Math.min(255, c.pan + panSlide));
          m.panFx = true;
          m.pan.push({ k, r, v: from / 255, ramp: { k, r: r + 1, v: c.pan / 255 } });
        }
        if (!c.playing) return;
        // volume
        let vol: number | null = null;
        let slide = 0;
        const isNote = cell.note >= 1 && cell.note <= 96;
        if (!isNote && vc >= 0x11 && vc <= 0x50) vol = vc - 0x10;
        if (!isNote && fx === 0x0c && cell.param) vol = Math.min(64, cell.param);
        if (fx === 0x0a || fx === 0x05 || fx === 0x06) {
          const p = (c.mem.volSlide = cell.param || c.mem.volSlide);
          slide = (p >> 4 || -(p & 15)) * (spd - 1);
        }
        if (vc >= 0x60 && vc < 0x70) slide = -(vc & 15) * (spd - 1);
        if (vc >= 0x70 && vc < 0x80) slide = (vc & 15) * (spd - 1);
        if (vc >= 0x80 && vc < 0x90) slide = -(vc & 15);
        if (vc >= 0x90 && vc < 0xa0) slide = vc & 15;
        if (fx === 0x0e && x === 0xa) slide = y;
        if (fx === 0x0e && x === 0xb) slide = -y;
        if (vol !== null) {
          c.vol = vol;
          m.levelFx = true;
          m.level.push({ k, r, v: fader(vol, c.noteVol) });
        }
        if (slide) {
          const from = c.vol;
          c.vol = Math.max(0, Math.min(64, c.vol + slide));
          m.levelFx = true;
          m.level.push({
            k,
            r,
            v: fader(from, c.noteVol),
            ramp: { k, r: r + 1, v: fader(c.vol, c.noteVol) },
          });
        }
      });
    }
  });
  const out = new Map<number, { pan: Points; level: Points }>();
  const toPoints = (list: Mark[]): Points => {
    const pts: Points = [];
    for (const mk of list) {
      const a = anchor(mk.k, mk.r);
      if (!a) continue;
      const prev = pts[pts.length - 1];
      // the same place again: the later value wins
      if (prev && prev.slotId === a.slotId && Math.abs(prev.at - a.at) < 1e-9) pts.pop();
      const before = pts[pts.length - 1];
      if (!mk.ramp && before && before.value === mk.v && !before.in) continue;
      if (mk.ramp) {
        pts.push({ ...a, value: mk.v });
        const b = anchor(mk.ramp.k, mk.ramp.r);
        if (b) pts.push({ ...b, value: mk.ramp.v, out: { type: "none" } });
      } else pts.push({ ...a, value: mk.v, out: { type: "none" } });
    }
    return pts;
  };
  for (const [n, m] of marks)
    out.set(n, { pan: m.panFx ? toPoints(m.pan) : [], level: m.levelFx ? toPoints(m.level) : [] });
  return out;
}

/** A pattern's name: its number in hex, as FT2 shows it (and the part, past 128 rows). */
const patternName = (p: number, at: number, rows: number) =>
  `${p.toString(16).toUpperCase().padStart(2, "0")}${rows > MAX_STEPS ? `.${at / MAX_STEPS + 1}` : ""}`;

function countIgnored(cell: XmCell, note: (what: string) => void) {
  const fx = cell.effect;
  if (fx === 0x0e) {
    const sub = cell.param >> 4;
    if (!PLAYED_E.has(sub) && cell.param) note(`E${sub.toString(16).toUpperCase()}x commands`);
  } else if (IGNORED[fx] && cell.param) note(IGNORED[fx]);
}

interface InstrumentPlan {
  mode: "hits" | "notes";
  /** The samples it plays, each at the root its rendering is tuned to (MIDI). */
  zones: { sample: number; root: number }[];
}

/**
 * How an instrument plays (D280): a one-shot sample played within an octave of its most common
 * note is a Hits track tuned to that note; otherwise Notes, one zone per sample it uses, rooted
 * in the middle of the notes its keymap gives that sample. An instrument with an envelope gets a
 * zone per octave it plays (D287): a baked envelope runs faster as the sampler plays it higher.
 */
function planInstrument(evs: Event[], instrument: XmInstrument): InstrumentPlan {
  const { keymap, samples } = instrument;
  const sampleOf = (note: number) => keymap[note - 1] ?? 0;
  const used = [...new Set(evs.map((e) => sampleOf(e.note)))].filter((s) => samples[s]?.length);
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
  if (instrument.volumeEnvelope || instrument.panEnvelope) {
    const zones: InstrumentPlan["zones"] = [];
    for (const s of used) {
      const played = evs.filter((e) => sampleOf(e.note) === s).map((e) => xmToMidi(e.note));
      const octaves = [...new Set(played.map((p) => Math.floor(p / 12)))];
      for (const o of octaves) {
        const inOctave = played.filter((p) => Math.floor(p / 12) === o).sort((a, b) => a - b);
        const root = inOctave[Math.floor(inOctave.length / 2)];
        if (!zones.some((z) => z.root === root)) zones.push({ sample: s, root });
      }
    }
    if (zones.length) return { mode: "notes", zones };
  }
  if (used.length <= 1) return { mode: "notes", zones: [{ sample: used[0] ?? 0, root: 60 }] };
  return {
    mode: "notes",
    zones: used.map((s) => {
      const keys = keymap.flatMap((k, i) => (k === s ? [xmToMidi(i + 1)] : []));
      return { sample: s, root: keys[Math.floor(keys.length / 2)] ?? 60 };
    }),
  };
}

/** The envelopes a rendering plays in (D287), and the seconds of a tick. */
export interface RenderEnvelopes {
  volume?: XmEnvelope;
  pan?: XmEnvelope;
  tick: number;
}

/**
 * A sample rendered at 44.1 kHz so that it plays at its pitch on MIDI note `root` (D283): its
 * rate at C-4 moved to the root, linear interpolation (as FT2), a loop played out (forward or
 * ping-pong) for `seconds` (2 to 12, so a module with many looping instruments stays a few MB),
 * and the instrument's volume envelope up to its sustain point played in (D287); a panning
 * envelope makes it stereo. One channel per output channel.
 */
export function renderSample(
  s: XmSample,
  root: number,
  seconds: number,
  env: RenderEnvelopes = { tick: 0.02 },
): Float32Array[] {
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
  const n = Math.max(1, frames);
  const left = new Float32Array(n);
  const right = env.pan ? new Float32Array(n) : null;
  const perTick = XM_RATE * env.tick;
  for (let j = 0; j < n; j++) {
    const tick = j / perTick;
    const x = read(j * step) * (env.volume ? envAt(env.volume, tick) / 64 : 1);
    if (right && env.pan) {
      // the pan envelope (0 left, 32 centre, 64 right) as a balance
      const p = envAt(env.pan, tick) / 64;
      left[j] = x * Math.min(1, 2 * (1 - p));
      right[j] = x * Math.min(1, 2 * p);
    } else left[j] = x;
  }
  const out = right ? [left, right] : [left];
  // a played-out loop ends with a short fade, so a note longer than it doesn't click
  if (loops) {
    const fade = Math.min(n, Math.round(XM_RATE * 0.02));
    for (const ch of out) for (let j = 0; j < fade; j++) ch[n - 1 - j] *= j / fade;
  }
  return out;
}
