# Plan: editing automation as a table, eases between points, tempo changes too

Status: agreed and being built 2026-10-13 (decisions D196–D205; Jeroen: "all the proposals").
How we work: on `main`, commit early and often, e2e once at the end of the batch.

The idea in one line: **a lane's points as a table in the Inspector**, with exact positions and
values, an on/off per point, and an **ease in and ease out** per point so the curve between two
points can be smooth, exponential or bounce. The table and the lane on the timeline show the
same data: edit either and the other follows.

## 0. Where it starts

- A lane is `AutomationLane { id, target, on, points: AutomationPoint[] }`. A point is
  `{ slotId, at, value (0..1), hold? }` (schema 10, D186). Points are anchored to sections
  (D187).
- `model/arrangement.ts: lanePoints` resolves points to song positions (sorted, hidden ones
  dropped), and `curveAt` gives the value at q: linear, or held until the next point.
- `engine/automation.ts: curveEvents` turns one step of a curve into timed events: ramps to the
  points inside the step, a 3 ms ramp where a held point ends, and the value at the step's end.
  AudioParams ramp linearly (or exponentially for frequencies) between events.
- Tempo changes are `TempoChange { slotId, at, bpm, ramp? }`: a jump, or a linear ramp from the
  change before (D192). `model/tempoMap.ts` integrates 60 / bpm exactly.
- The timeline draws lanes with `CurveLane` (selection is local to it). The Inspector shows the
  selected track only.

## 1. The ease model (D196)

Each point has an **ease in** (how the curve arrives at it) and an **ease out** (how it leaves).
The stretch from point A to point B takes its shape from **A's out and B's in**:

```
v(t) = vA + (vB − vA) · f(t),   t = 0..1 across the stretch
f(t) = (1 − t) · out(t) + t · in(t)
```

`out` and `in` are each a full ease from 0 to 1. Blending them by t means the start of the stretch
follows A's out (its slope at 0 is out's), and its end follows B's in (its slope at 1 is in's).
Two smooth sides make an S-curve; "leave slowly, bounce in" just works.

| Type                 | As the ease out of A (leaving)                                     | As the ease in of B (arriving)                         |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| **None (jump)**      | Holds A's value, jumps at B (in 3 ms, D186). B's in doesn't apply. | — (not offered)                                        |
| **Linear** (default) | `t`                                                                | `t`                                                    |
| **Smooth**           | `(1−s)·t + s·(1 − cos(πt/2))`: starts slowly                       | `(1−s)·t + s·sin(πt/2)`: settles slowly                |
| **Exponential**      | `(2^(kt) − 1) / (2^k − 1)`, `k = 10s`: slow start, fast finish     | mirrored: fast start, slow finish                      |
| **Bounce**           | — (not offered)                                                    | `(1−s)·t + s·bounceOut(t)`: lands, bounces back onto B |

`s` is the side's **strength**, 0..1 (default 0.5); `s = 0` is linear for every type. Strength
doesn't apply to Linear or None.

- Saved as `in?: Ease`, `out?: Ease` on the point, `Ease = { type, strength? }`; no ease saved
  means Linear (so lanes stay small and today's lanes stay as they are).
- **Schema 11**: `hold: true` becomes `out: { type: "none" }` (a migration with a test);
  `hold` is gone from the code.
- **Points that are off** (`on: false`): kept and drawn hollow and dimmed, but the curve and the
  sound skip them, as if they weren't there.

## 2. Playing eased curves (D197)

- `model/ease.ts` (pure): the eases, `easeAt(outEase, inEase, t)`, `isLinear(a, b)`.
- `curveAt` uses it; `lanePoints` keeps the eases and drops points that are off.
- `curveEvents`: a step over a stretch that isn't linear is **sampled**: 8 ramps per step for
  AudioParams (a 16th at 112 BPM: one every 17 ms), 4 for a synth's macros (each is a message).
  Linear stretches send what they send now. Live and offline use the same function, so exports
  match.

## 3. Tempo changes get eases too (D198)

- `TempoChange` gains `on?`, `in?` and `out?` (types Linear, Smooth, Exponential; no Bounce, and
  no None: a jump is `ramp: false`, as now). A ramp from change P to change C takes its shape from
  P's out and C's in. The start tempo has a linear out.
- `model/tempoMap.ts`: a segment carries its eases; `bpmIn` uses `easeAt`; `seconds` stays exact
  for linear segments and integrates eased ones numerically (Simpson's rule, 64 intervals: well
  under a millisecond off over a ramp). `quarterAt` bisects as before.
- Changes that are off are skipped.

## 4. The Inspector shows a lane (D199)

- **Opening it**: the lane's ⋯ menu gets **Edit points in the Inspector** (and the Tempo lane's
  name menu, **Edit tempo changes in the Inspector**); double-clicking a lane's header does the
  same. The Inspector opens (or comes forward) and shows the lane.
- **UI state**: `inspect: { kind: "lane", id } | { kind: "tempo" } | null` in the store's UI.
  The Inspector shows the lane while it's set; **← Back to the track** clears it, and selecting a
  track (in the drum machine, the mixer…) clears it too.
- **Shared selection** (D200): `pointSelection: { lane: string ("tempo" for the Tempo lane);
indexes: number[] }` in the UI state, used by both the lane on the timeline (`CurveLane`) and
  the table. Clicking a row selects its point and scrolls the timeline to it; selecting points on
  the lane highlights their rows.

## 5. The table (D201)

Header: the lane's name ("Master · Filter cutoff"), its On/Off, the number of points, **+ at the
start marker** and **+ after the last point**.

| Column                 | Behavior                                                                                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **On**                 | A checkbox: off, the curve skips the point (drawn hollow on the lane).                                                                                                                                                                                                           |
| **Position**           | `17.3.2` (bar, beat, 16th; bars as the ruler counts them, D185), with the section under it ("Chorus 1 · 3.2"). Drag sideways or scroll: a step of the Snap grid (Shift: a 16th, or free). Type `17.3.2`, `17.3.2.5` (half a 16th later), or `6:3.2` (section 6, beat 3, 16th 2). |
| **Value**              | In the knob's units (`880Hz`, `-6.0dB`, `35%`), BPM for tempo. Drag up and down or scroll (Shift: fine); type a number in the same units (or a percentage with `%`); double-click resets it to the knob's default (for tempo: the start tempo).                                  |
| **Ease in / Ease out** | A type (a small menu) and a strength (drag or scroll, 0–100%). Types the side doesn't offer don't show; strength is greyed out for Linear and None.                                                                                                                              |
| **⋯**                  | Duplicate (one beat later), reset the value, delete. ✕ deletes.                                                                                                                                                                                                                  |

- **Rows are in time order.** A row whose position passes its neighbor's moves when the edit ends.
- **Inserting** (D202): a **+** between two rows (on hover) inserts a point **halfway in time,
  at the value the curve has there**, with Linear eases, so the line keeps its shape until you
  change the new point. **+ at the start marker** puts one there, on the curve.
- **Keys**: ↑/↓ move the selection, Delete removes the selected points, Esc clears the selection.
- **Several rows selected**: typing a value or choosing an ease sets all of them; dragging a
  position moves them together.
- **Long lanes**: the rows are virtualized (only the visible ones are made), so a recorded lane
  with hundreds of points stays quick.
- **Every edit is one commit**, drags with a merge key; the lane redraws from the same data.

## 6. Clicking on the lane (D203)

- A click **on the line** (within 6 px of the curve) adds a point **on the curve** (its value
  there); a click elsewhere adds one at the clicked height, as now.
- The lane's point menu (right-click) gets the eases: **Ease in ▸**, **Ease out ▸** (the types),
  **On/Off**, and **Edit in the Inspector**. "Hold until the next point" becomes ease out None.
- The lane draws eased stretches as curves (sampled every few pixels); a point's handle shows a
  small mark for eases other than Linear; off points are hollow and dimmed.

## 7. Parsing what you type (D204)

- **Positions**: `bar.beat.16th[.fraction]` through `bars()` (bars count from each section),
  or `section:beat.16th` within a section's span.
- **Values**: knobs only know how to _format_ their values, so typing goes the other way by
  search: the number typed (with `k`, `L`/`R` for pan, `%`) is matched by bisection over the
  knob's 0..1 range against the knob's own format. That works for every knob without a new table
  of inverses. `50%` always means the knob at 50%.

## 8. Building it

| Step | What                                                                                                                                                                                                       | Decisions        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1    | `model/ease.ts` + tests; types (`Ease`, `on`, `in`, `out`), schema 11 (hold → out none), `curveAt`/`lanePoints` with eases and off points; tests                                                           | D196             |
| 2    | `curveEvents` sampling eased stretches; tempo map with eases (numeric integration) and off changes; tests                                                                                                  | D197, D198       |
| 3    | UI state (`inspect`, `pointSelection`), timeline actions (set ease, on/off, insert on the curve, move several, tempo equivalents)                                                                          | D199, D200, D202 |
| 4    | Parsing positions and values (`panels/inspector/automation/parse.ts`) + tests                                                                                                                              | D204             |
| 5    | The Inspector's lane view: header, the table (virtualized), cells (position, value, eases), insert, keys, multi-select                                                                                     | D201, D202       |
| 6    | CurveLane: shared selection, eased drawing, click on the line, the point menu with eases, off points; the Tempo lane the same; "Edit in the Inspector"                                                     | D199, D203       |
| 7    | Long Way Home uses eases (a smooth Brightness rise, an exponential high-pass sweep, a bounce on the reverb throw, smooth tempo ramps); its golden levels re-recorded (it's meant to sound different there) | D205             |
| 8    | Guide (the timeline chapter: the table, eases), hints, PLAN.md §0.6p and D196–D205, AGENTS.md; e2e                                                                                                         | D205             |

## 9. Tests

- **Unit**: every ease at 0 and 1; slopes at the ends follow the sides; strength 0 is linear;
  `curveAt` with eases and off points; schema 10 → 11 (hold → out none); `curveEvents` samples
  eased steps and not linear ones; the tempo map's eased seconds against a fine numeric sum, and
  `quarterAt` inverting it; parsing positions (bar format, section format, fractions) and
  values (Hz with k, dB, %, pan L/R) round-trip through the format.
- **E2E**: open a lane in the Inspector from its menu; the rows match the points; type a position
  and a value and see the point move on the lane; insert between two points (halfway, on the
  curve); turn a point off (hollow on the lane, the curve skips it); set an ease (the lane's
  path changes); delete a row; selecting on the lane highlights the row; the Tempo lane's
  table; explain mode covers every new control.
- **Golden levels**: every song unchanged except Long Way Home, re-recorded on purpose (its
  eases).

## 10. Decisions

- **D196 — Eases per point, in and out.** Each point has an ease in and an ease out; the stretch
  between two points blends the first's out and the second's in (`(1−t)·out + t·in`). Types:
  None (out only: a jump), Linear (default), Smooth, Exponential, Bounce (in only), with a
  strength per side. Schema 11: `hold` became ease out None; points can be off. Alt: one ease per
  stretch (simpler, less control); Bézier handles (more to learn).
- **D197 — Eased curves are sampled per step.** 8 ramps per step for AudioParams, 4 for a
  synth's macros, the same live and offline; linear stretches as before. Alt:
  `setValueCurveAtTime` (can't overlap other events, awkward with chasing).
- **D198 — Tempo ramps ease too.** Tempo changes get on/off and eases (Linear, Smooth,
  Exponential); eased ramps are integrated numerically. Alt: tempo stays linear.
- **D199 — The Inspector shows a lane.** Opened from the lane's menu or by double-clicking its
  header; ← Back to the track, or selecting a track, returns. Alt: a separate Automation panel.
- **D200 — One selection for the lane and its table.** Points selected on the timeline are the
  rows selected in the table, and the other way round. Alt: separate selections.
- **D201 — The table.** One row per point in time order: On, Position (bar.beat.16th and the
  section), Value (in the knob's units), Ease in, Ease out, a menu; drag, scroll or type
  everywhere, double-click resets a value. Alt: a form for one point at a time.
- **D202 — Inserting keeps the line.** A point inserted between two others goes halfway in time,
  on the curve, with linear eases; one added at the start marker goes on the curve too. Alt: the
  value of the point before.
- **D203 — Clicks on the line land on it.** A click within 6 px of the curve adds a point on the
  curve; elsewhere at the clicked height. The point menu has the eases and On/Off. Alt: every
  click on the curve.
- **D204 — Typing values by search.** What you type is matched against the knob's own format by
  bisection, so every knob takes typed values in its units without a table of inverses;
  positions take bar.beat.16th or section:beat.16th. Alt: inverse functions per knob.
- **D205 — Long Way Home eases.** Its Brightness rises smoothly, the high-pass sweeps
  exponentially, the reverb throw bounces back, and its tempo ramps are smooth; its golden levels
  are re-recorded for that. Alt: leave the song linear.
