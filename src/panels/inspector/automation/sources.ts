/**
 * What the Inspector's point table edits (D199, D201): an automation lane or the tempo changes,
 * behind one interface, so the table is the same for both.
 */
import { curveAt, toSong } from "../../../model/arrangement";
import { knobFor, lanePointsOf, laneTitle } from "../../../model/automation";
import { IN_TYPES, OUT_TYPES, TEMPO_TYPES, type Ease, type EaseType } from "../../../model/ease";
import type { Project } from "../../../model/project";
import { tempoAt } from "../../../model/tempoMap";
import {
  addPoint,
  addTempoChange,
  deletePoints,
  deleteTempoChanges,
  insertOnCurve,
  insertTempoOnCurve,
  movePointsBy,
  moveTempoBy,
  setPointEase,
  setPointsOn,
  setPointsValue,
  setTempoBpm,
  setTempoEase,
  setTempoOn,
  setTempoRamp,
} from "../../../state/timelineActions";
import { parseValue } from "./parse";

export interface Row {
  /** Index in the saved list. */
  index: number;
  /** Song position (null: hidden, its section is shorter now). */
  q: number | null;
  value: number;
  on: boolean;
  in?: Ease;
  out?: Ease;
  /** Tempo changes: a ramp from the change before. */
  ramp?: boolean;
}

export interface PointSource {
  /** The selection's key: a lane id, or "tempo". */
  key: string;
  title: string;
  rows: Row[];
  min: number;
  max: number;
  format: (v: number) => string;
  parse: (text: string) => number | null;
  /** What double-click resets a value to. */
  reset: number;
  inTypes: EaseType[];
  outTypes: EaseType[];
  curve: (q: number) => number | null;
  setValue: (indexes: number[], v: number, key: string) => void;
  moveBy: (indexes: number[], dq: number, key: string) => void;
  setOn: (indexes: number[], on: boolean) => void;
  setEase: (indexes: number[], side: "in" | "out", ease: Ease) => void;
  remove: (indexes: number[]) => void;
  /** A point at q on the curve; returns its index. */
  insert: (q: number) => number;
  /** A point at q with this value. */
  add: (q: number, value: number) => number;
  setRamp?: (indexes: number[], ramp: boolean) => void;
  /** A stepped lane (D229, D230): how many values (values on bands, no eases); 0 is smooth. */
  steps?: number;
}

/** Rows in time order (hidden ones last). */
const ordered = (rows: Row[]) =>
  rows.sort((a, b) => (a.q ?? Infinity) - (b.q ?? Infinity) || a.index - b.index);

export function laneSource(project: Project, laneId: string): PointSource | null {
  const lane = project.automation?.find((l) => l.id === laneId);
  if (!lane) return null;
  const knob = knobFor(project, lane.target);
  const def = knob?.def;
  const resolved = lanePointsOf(project, lane);
  return {
    key: lane.id,
    title: laneTitle(project, lane.target),
    rows: ordered(
      lane.points.map((p, index) => ({
        index,
        q: toSong(project, p),
        value: p.value,
        on: p.on !== false,
        in: p.in,
        out: p.out,
      })),
    ),
    min: 0,
    max: 1,
    format: (v) => (def ? def.format(v) : `${Math.round(v * 100)}%`),
    parse: (t) =>
      def
        ? parseValue(def, t)
        : Number.isFinite(parseFloat(t))
          ? Math.max(0, Math.min(1, parseFloat(t) / 100))
          : null,
    reset: def?.default ?? 0.5,
    inTypes: IN_TYPES,
    outTypes: OUT_TYPES,
    curve: (q) => curveAt(resolved, q),
    steps: def?.steps && def.steps >= 2 ? def.steps : 0,
    setValue: (ids, v, key) => setPointsValue(lane.id, ids, v, key),
    moveBy: (ids, dq, key) => movePointsBy(lane.id, ids, dq, key),
    setOn: (ids, on) => setPointsOn(lane.id, ids, on),
    setEase: (ids, side, ease) => setPointEase(lane.id, ids, side, ease),
    remove: (ids) => deletePoints(lane.id, ids),
    insert: (q) => insertOnCurve(lane.id, q),
    add: (q, v) => addPoint(lane.id, q, v),
  };
}

export function tempoSource(project: Project): PointSource {
  const changes = project.tempo ?? [];
  return {
    key: "tempo",
    title: "Tempo changes",
    rows: ordered(
      changes.map((t, index) => ({
        index,
        q: toSong(project, t),
        value: t.bpm,
        on: t.on !== false,
        in: t.in,
        out: t.out,
        ramp: !!t.ramp,
      })),
    ),
    min: 20,
    max: 300,
    format: (v) => `${Math.round(v * 10) / 10} BPM`,
    parse: (t) => {
      const n = parseFloat(t);
      return Number.isFinite(n) ? Math.max(20, Math.min(300, n)) : null;
    },
    // double-click: back to the song's start tempo
    reset: project.bpm,
    inTypes: TEMPO_TYPES,
    outTypes: TEMPO_TYPES,
    curve: (q) => tempoAt(project, q),
    setValue: (ids, v, key) => setTempoBpm(ids, v, key),
    moveBy: (ids, dq, key) => moveTempoBy(ids, dq, key),
    setOn: (ids, on) => setTempoOn(ids, on),
    setEase: (ids, side, ease) => setTempoEase(ids, side, ease),
    remove: (ids) => deleteTempoChanges(ids),
    insert: (q) => insertTempoOnCurve(q),
    add: (q, v) => addTempoChange(q, v),
    setRamp: (ids, ramp) => ids.forEach((i) => setTempoRamp(i, ramp)),
  };
}
