/**
 * What the automation table shows and reads (D204): positions as bar.beat.16th (bars as the
 * ruler counts them, D185) or section:beat.16th, and values in the knob's own units, read back by
 * searching the knob's range against its format.
 */
import { bars, blockAt, layout } from "../../../model/arrangement";
import type { ParamDef } from "../../../model/params";
import type { Project } from "../../../model/project";

const SIXTEENTH = 0.25;
const beatQ = (p: Project) => 4 / p.timeSignature[1];

/** "17.3.2" (a fraction of a 16th: "17.3.2.5"). */
export function formatPosition(project: Project, q: number): string {
  const lines = bars(project);
  let line = lines[0] ?? { q: 0, bar: 1, short: false };
  for (const l of lines) {
    if (l.q > q + 1e-9) break;
    line = l;
  }
  return `${line.bar}.${beatAndSixteenth(project, q - line.q)}`;
}

/** "3.2" (".5": half a 16th later) for quarter notes into a bar or a section. */
function beatAndSixteenth(project: Project, into: number): string {
  const b = beatQ(project);
  const beat = Math.floor(into / b + 1e-9);
  const rest = into - beat * b;
  const six = Math.floor(rest / SIXTEENTH + 1e-9);
  const frac = Math.round(((rest - six * SIXTEENTH) / SIXTEENTH) * 100) / 100;
  const tail = frac > 0 && frac < 1 ? `.${String(frac).slice(2)}` : "";
  return `${beat + 1}.${six + 1}${tail}`;
}

/** "6 Chorus · 3.2": the section and where in it (beats over all its repeats). */
export function formatInSection(project: Project, q: number): string {
  const b = blockAt(project, q);
  if (!b) return "";
  return `${b.index + 1} ${b.pattern.name} · ${beatAndSixteenth(project, q - b.start)}`;
}

/** "beat.16th[.fraction]" (or "bar.beat.16th[.fraction]" with a bar first). */
const NUM = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?$/;

/** Quarter notes for beat, 16th and a fraction of a 16th, counting from 1. */
const into = (project: Project, beat = "1", six = "1", frac?: string) =>
  (Number(beat) - 1) * beatQ(project) +
  (Number(six) - 1) * SIXTEENTH +
  (frac ? Number(`0.${frac}`) * SIXTEENTH : 0);

/** Read "17.3.2", "17.3.2.5", "17" or "6:3.2" (section 6, beat 3, 16th 2) as a song position. */
export function parsePosition(project: Project, text: string): number | null {
  const t = text.trim().replace(/\s+/g, "");
  const section = /^(\d+):(.+)$/.exec(t);
  if (section) {
    const m = NUM.exec(section[2]);
    const block = layout(project)[Number(section[1]) - 1];
    if (!m || !block) return null;
    return block.start + Math.min(block.span - 1e-6, into(project, m[1], m[2], m[3]));
  }
  const m = NUM.exec(t);
  if (!m) return null;
  const line = bars(project).find((l) => l.bar === Number(m[1]));
  return line ? line.q + into(project, m[2], m[3], m[4]) : null;
}

/** The number in a knob's text: "1.2k" → 1200, "-6.0" → −6, "L20" → −20, "1.50s" → 1500. */
export function numberIn(text: string): number {
  const t = text.trim().replace("−", "-");
  if (/^C$/i.test(t)) return 0;
  if (t.includes("∞")) return t.startsWith("-") ? -Infinity : Infinity;
  const pan = /^([LR])\s*(\d+(?:\.\d+)?)/i.exec(t);
  if (pan) return (pan[1].toUpperCase() === "L" ? -1 : 1) * Number(pan[2]);
  const m = /^[+]?(-?\d*\.?\d+)\s*(k|ms|s)?/i.exec(t);
  if (!m) return NaN;
  const n = Number(m[1]);
  const unit = m[2]?.toLowerCase();
  return unit === "k" || unit === "s" ? n * 1000 : n;
}

/**
 * The knob position (0..1) for what's typed in the knob's units, by bisection against its own
 * format; "50%" is always the knob at 50%. Null when it can't be read.
 */
export function parseValue(def: ParamDef, text: string): number | null {
  const t = text.trim();
  // a stepped knob (D229): a value by its name ("HP", "on"), else a number lands on a band
  const n = def.steps ?? 0;
  if (n >= 2) {
    const names = Array.from({ length: n }, (_, i) => def.format(i / (n - 1)).toLowerCase());
    const w = t.toLowerCase();
    const i = names.findIndex((x) => x === w);
    const j = i >= 0 ? i : names.findIndex((x) => w && x.startsWith(w));
    if (j >= 0) return j / (n - 1);
  }
  const shown = def.format(0.5);
  if (t.endsWith("%") && !shown.endsWith("%")) {
    const n = Number(t.slice(0, -1));
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n / 100)) : null;
  }
  const target = numberIn(t.replace(/%$/, ""));
  if (Number.isNaN(target)) return null;
  const f = (v: number) => {
    const n = numberIn(def.format(v));
    return Number.isNaN(n) ? (v < 0.5 ? -Infinity : Infinity) : n;
  };
  const rising = f(1) >= f(0);
  if (rising ? target <= f(0) : target >= f(0)) return 0;
  if (rising ? target >= f(1) : target <= f(1)) return 1;
  // the knob positions that show the typed value form a range: find both its ends, take the
  // middle (one end alone is where the rounding flips to the next value)
  const edge = (past: (n: number) => boolean) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (past(f(mid))) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  const from = edge((n) => (rising ? n >= target : n <= target));
  const to = edge((n) => (rising ? n > target : n < target));
  return (from + Math.max(from, to)) / 2;
}
