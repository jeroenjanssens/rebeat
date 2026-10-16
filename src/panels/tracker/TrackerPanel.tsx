/**
 * The Tracker panel (D265–D277): the edited pattern as rows of text in the look of Fast Tracker 2,
 * in the current theme's colors. The top panel (FT2's fields with ▲▼, the lamps, the scopes), the
 * pattern on one canvas with the cursor row fixed in the middle, and a status line that says what
 * the field under the cursor is. Keys: the note keys and digits here, everything else is a scoped
 * command (`app/trackerCommands.ts`).
 */
import { useEffect, useMemo, useReducer, useRef } from "react";
import { addKeyHook } from "../../app/commands";
import { setTempo } from "../../app/TransportBar";
import { cycleRows, setOctave, toggleEdit, zoom } from "../../app/trackerCommands";
import { Scope } from "../../components/Scope";
import { soundDefs } from "../../library/synthTrack";
import { CELL_H, CELL_W, drawText } from "../../render/pixelFont";
import { onFrame } from "../../render/raf";
import { onThemeChange } from "../../render/theme";
import { useCanvas } from "../../render/useCanvas";
import * as clock from "../../engine/transport";
import { noteOn, type KeysSource } from "../../state/keys";
import { useSettings } from "../../state/settings";
import { useStore } from "../../state/store";
import {
  clickCursor,
  cursorIn,
  describeCursor,
  enterDigit,
  enterFxLetter,
  enterNote,
  enterOff,
  moveRows,
  selectionBlock,
  setClip,
  setTrackerSettings,
  trackerContext,
  trackerSettings,
  useTracker,
  type TrackerContext,
} from "../../state/tracker";
import { lockLabel, rowDigits, rowLabel, rowSegments, type Role } from "../../model/trackerText";
import { writeOff } from "../../model/trackerEdit";
import { STEP_SIZES, type StepSize } from "../../model/types";
import { trackerPalette, type TrackerPalette } from "./palette";
import type { PanelProps } from "../../app/panels";

/** The tracker's note keys (physical keys): two octaves, from the current octave. */
export const TRACKER_KEYS: Record<string, number> = {
  KeyZ: 0,
  KeyS: 1,
  KeyX: 2,
  KeyD: 3,
  KeyC: 4,
  KeyV: 5,
  KeyG: 6,
  KeyB: 7,
  KeyH: 8,
  KeyN: 9,
  KeyJ: 10,
  KeyM: 11,
  Comma: 12,
  KeyL: 13,
  Period: 14,
  Semicolon: 15,
  Slash: 16,
  KeyQ: 12,
  Digit2: 13,
  KeyW: 14,
  Digit3: 15,
  KeyE: 16,
  KeyR: 17,
  Digit5: 18,
  KeyT: 19,
  Digit6: 20,
  KeyY: 21,
  Digit7: 22,
  KeyU: 23,
  KeyI: 24,
  Digit9: 25,
  KeyO: 26,
  Digit0: 27,
  KeyP: 28,
  BracketLeft: 29,
  Equal: 30,
  BracketRight: 31,
};
const OFF_KEYS = new Set(["Backquote", "Digit1"]);

const SOURCE: KeysSource = "tracker";

/** A note key that's down: its preview's release, and where edit mode wrote it. */
interface Held {
  release: () => void;
  wrote: { trackId: string; row: number; col: number } | null;
}

/** The note keys, digits and letters, while the tracker has focus. */
function useTrackerKeys(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const held = new Map<string, Held>();
    const inside = (e: KeyboardEvent) => {
      const el = root.current;
      return !!el && el.contains(e.target as Node);
    };
    const off = addKeyHook((e, down) => {
      if (!down) {
        const h = held.get(e.code);
        if (!h) return false;
        held.delete(e.code);
        h.release();
        // recording while playing: the note ends where the key came up
        const playRow = useTracker.getState().playRow;
        if (h.wrote && useStore.getState().playing && playRow !== null && playRow > h.wrote.row) {
          const ctx = trackerContext();
          const w = h.wrote;
          useStore.getState().commit((p) => void writeOff(p, ctx.at, w.trackId, playRow, w.col));
        }
        return true;
      }
      if (!inside(e) || e.metaKey || e.ctrlKey) return false;
      const settings = trackerSettings();
      // FT2 keys: Space is edit mode, F1–F8 the octave (play/stop is Shift+Space then)
      if (settings.ft2Keys && !e.altKey) {
        if (e.code === "Space" && !e.shiftKey) {
          if (!e.repeat) toggleEdit();
          return true;
        }
        if (e.code === "Space" && e.shiftKey) {
          if (!e.repeat) clock.toggle();
          return true;
        }
        const f = /^F([1-8])$/.exec(e.code);
        if (f) {
          setTrackerSettings({ octave: Number(f[1]) - 1 });
          return true;
        }
      }
      if (e.altKey) return false;
      const ctx = trackerContext();
      const c = cursorIn(ctx);
      if (!c) return false;
      const { edit } = useTracker.getState();
      const kind = c.field.kind;
      const code = e.code;
      const noShift = !e.shiftKey;
      if (kind === "note" && noShift) {
        const semis = TRACKER_KEYS[code];
        if (semis !== undefined) {
          if (e.repeat) return true;
          const pitch = Math.max(0, Math.min(127, (settings.octave + 1) * 12 + semis));
          const velocity = settings.volume / 127;
          const release = noteOn(pitch, velocity, SOURCE);
          let wrote: Held["wrote"] = null;
          if (edit && !(useStore.getState().playing && useStore.getState().recording)) {
            // a key while another is down is a chord: the next column on the first one's row
            const chord = [...held.values()].find((h) => h.wrote)?.wrote;
            const r = enterNote(pitch, velocity, chord ? { chordOf: chord.row } : {});
            if (r) wrote = { trackId: c.col.track.id, ...r };
          }
          held.set(code, { release, wrote });
          return true;
        }
        if (OFF_KEYS.has(code)) {
          if (edit && !e.repeat) enterOff();
          return true;
        }
      }
      const hex = /^(?:Digit|Numpad)(\d)$/.exec(code)?.[1] ?? /^Key([A-F])$/.exec(code)?.[1];
      const letter = /^Key([A-Z])$/.exec(code)?.[1] ?? /^Digit(\d)$/.exec(code)?.[1];
      if (kind === "fx" && c.field.digit === 0 && letter && noShift) {
        if (edit) enterFxLetter(letter);
        else useTracker.setState({ message: "Edit mode is off (Esc turns it on)" });
        return true;
      }
      if ((kind === "vol" || kind === "lock" || kind === "fx") && hex && noShift) {
        if (edit) enterDigit(parseInt(hex, 16));
        else useTracker.setState({ message: "Edit mode is off (Esc turns it on)" });
        return true;
      }
      if (kind === "clip" && noShift && (code === "KeyL" || code === "KeyO")) {
        if (edit) setClip(code === "KeyL" ? "loop" : "oneshot");
        return true;
      }
      // other letters and digits do nothing here (they'd reach the global shortcuts)
      if (/^(Key[A-Z]|Digit\d)$/.test(code) && noShift) return true;
      return false;
    }, true);
    return () => {
      off();
      for (const h of held.values()) h.release();
    };
  }, [root]);
}

/** The playhead's row in the edited pattern (and the cursor, when following). */
function usePlayhead() {
  useEffect(
    () =>
      onFrame(() => {
        const s = useStore.getState();
        const t = useTracker.getState();
        if (!s.playing) {
          if (t.playRow !== null) useTracker.setState({ playRow: null });
          return;
        }
        const pos = clock.position();
        const ctx = trackerContext();
        const row =
          pos.pattern.id === ctx.pattern.id ? Math.floor(pos.progress * ctx.rows + 1e-6) : null;
        if (row === t.playRow) return;
        useTracker.setState({ playRow: row });
        if (row !== null && s.follow) useTracker.setState({ cursor: { ...t.cursor, row } });
      }),
    [],
  );
}

const roleColor = (p: TrackerPalette, role: Role) =>
  role === "text"
    ? p.text
    : role === "dim"
      ? p.dim
      : role === "faint"
        ? p.faint
        : role === "volume"
          ? p.volume
          : role === "fx"
            ? p.fx
            : p.lock;

/** Where everything is on the canvas (device pixels), for drawing and for clicks. */

function geometryOf(ctx: TrackerContext, w: number, h: number, dpr: number, scrollX: number) {
  const settings = ctx.settings;
  const px = Math.max(1, Math.round(settings.scale * dpr));
  const cw = CELL_W * px;
  const ch = CELL_H * px;
  const headerH = ch * 2 + px * 4;
  const digits = rowDigits(ctx.rows);
  const numW = (digits + 1) * cw;
  const c = cursorIn(ctx);
  const t = useTracker.getState();
  const focusRow =
    useStore.getState().playing && useStore.getState().follow && t.playRow !== null
      ? t.playRow
      : (c?.row ?? 0);
  const visible = Math.max(1, Math.floor((h - headerH) / ch));
  const top = focusRow - Math.floor(visible / 2);
  // keep the cursor's track in view
  const chars = Math.max(1, Math.floor((w - numW) / cw));
  let sx = scrollX;
  if (c) {
    if (c.col.x < sx) sx = c.col.x;
    if (c.col.x + c.col.width > sx + chars) sx = Math.max(0, c.col.x + c.col.width - chars);
  }
  return { px, cw, ch, headerH, numW, scrollX: sx, top, visible, digits };
}

function draw(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  dpr: number,
  scroll: { current: number },
  labels: (trackId: string) => Record<string, string>,
) {
  const ctx = trackerContext();
  const pal = trackerPalette();
  g.setTransform(1, 0, 0, 1, 0, 0);
  const W = Math.round(w * dpr);
  const H = Math.round(h * dpr);
  const geo = geometryOf(ctx, W, H, dpr, scroll.current);
  scroll.current = geo.scrollX;
  const { px, cw, ch, headerH, numW, top, visible, digits } = geo;
  const t = useTracker.getState();
  const s = useStore.getState();
  const c = cursorIn(ctx);
  const block = t.anchor ? selectionBlock(ctx) : null;
  const playRow = s.playing ? t.playRow : null;

  g.fillStyle = pal.pattern;
  g.fillRect(0, 0, W, H);
  // the header strip, in the chrome
  g.fillStyle = pal.chrome;
  g.fillRect(0, 0, W, headerH);
  g.fillStyle = pal.light;
  g.fillRect(0, 0, W, px);
  g.fillStyle = pal.dark;
  g.fillRect(0, headerH - px, W, px);

  const xOf = (chars: number) => numW + (chars - geo.scrollX) * cw;

  for (let i = 0; i <= visible; i++) {
    const r = top + i;
    const y = headerH + i * ch;
    if (y >= H) break;
    if (r < 0 || r >= ctx.rows) continue;
    // the lighter rows: every quarter note, every bar
    const bar = ctx.perBar >= 1 && Number.isInteger(ctx.perBar) && r % ctx.perBar === 0;
    const beat = Number.isInteger(ctx.perQuarter) && r % ctx.perQuarter === 0;
    if (bar || beat) {
      g.fillStyle = bar ? pal.bar : pal.beat;
      g.fillRect(0, y, W, ch);
    }
    if (r === playRow) {
      g.fillStyle = pal.playBand;
      g.fillRect(0, y, W, ch);
    }
    if (c && r === c.row) {
      g.fillStyle = pal.cursorBand;
      g.fillRect(0, y, W, ch);
    }
    const past = r >= ctx.sectionRows;

    for (const col of ctx.cols) {
      const x = xOf(col.x);
      if (x + col.width * cw < numW || x > W) continue;
      const seg = rowSegments(col, ctx.pattern, r, ctx.settings.decimal);
      if (seg.shaded) {
        g.fillStyle = pal.shade;
        g.globalAlpha = 0.6;
        g.fillRect(x, y, col.width * cw, ch);
        g.globalAlpha = 1;
      }
      if (block && block.trackIds.includes(col.track.id) && r >= block.from && r <= block.to) {
        g.fillStyle = pal.select;
        g.globalAlpha = 0.55;
        g.fillRect(x, y, col.width * cw, ch);
        g.globalAlpha = 1;
      }
      for (const sg of seg.segments) {
        const color = past ? pal.faint : roleColor(pal, sg.role);
        drawText(g, sg.text, x + sg.x * cw, y, color, px);
      }
      // the cursor's field: solid, its characters in the pattern's color
      if (c && r === c.row && col.track.id === c.col.track.id) {
        const f = c.field;
        const fx = x + f.x * cw;
        g.fillStyle = t.edit ? pal.fx : pal.cursor;
        g.fillRect(fx, y, f.w * cw, ch);
        const fi = col.fields.indexOf(f);
        const sg = seg.segments.find((x) => x.fields.includes(fi));
        if (sg) {
          const from = f.x - sg.x;
          drawText(g, sg.text.slice(from, from + f.w), fx, y, pal.cursorText, px);
        }
      }
    }
  }

  // the row numbers, on the chrome
  g.fillStyle = pal.chrome;
  g.fillRect(0, 0, numW, H);
  for (let i = 0; i <= visible; i++) {
    const r = top + i;
    const y = headerH + i * ch;
    if (y >= H) break;
    if (r < 0 || r >= ctx.rows) continue;
    const bar = ctx.perBar >= 1 && Number.isInteger(ctx.perBar) && r % ctx.perBar === 0;
    if (c && r === c.row) {
      g.fillStyle = pal.dark;
      g.fillRect(0, y, numW - px, ch);
    }
    const color = c && r === c.row ? pal.text : bar ? pal.chromeText : pal.chromeDim;
    drawText(g, rowLabel(r, digits), cw / 2, y, color, px);
  }
  // the header: track number and name, its color, mute and solo, the lock columns' names
  for (const col of ctx.cols) {
    const x = xOf(col.x);
    if (x + col.width * cw < numW || x > W) continue;
    const i = ctx.project.tracks.indexOf(col.track);
    const flags = col.track.solo ? "S" : col.track.mute ? "M" : "";
    const name = `${(i + 1).toString(16).toUpperCase().padStart(2, "0")} ${col.track.name}`;
    const room = col.width - (flags ? 2 : 0);
    const active = c?.col.track.id === col.track.id;
    drawText(g, name.slice(0, room), x + cw, px * 2, active ? pal.chromeText : pal.chromeDim, px);
    if (flags) drawText(g, flags, x + (col.width - 1) * cw, px * 2, pal.fx, px);
    const lab = labels(col.track.id);
    col.layout.locks.forEach((key, j) => {
      const f = col.fields.find((f) => f.kind === "lock" && f.col === j);
      if (f) drawText(g, lockLabel(key, lab), x + f.x * cw, px * 2 + ch, pal.chromeText, px);
    });
    if (col.track.mode === "clip") drawText(g, "CLIP", x + cw, px * 2 + ch, pal.chromeDim, px);
    else if (!col.layout.grid.onGrid) drawText(g, "~ROWS", x + cw, px * 2 + ch, pal.chromeDim, px);
    // its color under the name
    g.fillStyle = col.track.color;
    g.fillRect(x + px, headerH - px * 3, col.width * cw - px * 2, px * 2);
  }
  // separators between tracks (bevels in the chrome's colors)
  for (const col of ctx.cols) {
    const x = xOf(col.x + col.width) + Math.floor(cw / 2);
    if (x < numW || x > W) continue;
    g.fillStyle = pal.dark;
    g.fillRect(x - px, 0, px, H);
    g.fillStyle = pal.light;
    g.fillRect(x, 0, px, H);
  }
  g.fillStyle = pal.dark;
  g.fillRect(numW - px, 0, px, H);
}

/** The pattern on a canvas, with clicks and the wheel. */
function PatternView() {
  const scroll = useRef(0);
  const project = useStore((s) => s.project);
  const editSlotId = useStore((s) => s.editSlotId);
  const playing = useStore((s) => s.playing);
  const follow = useStore((s) => s.follow);
  const t = useTracker();
  const settings = useSettings((s) => s.tracker);
  // the lock columns' names: the knobs' labels (a synth's macros have their own)
  const labelMap = useMemo(
    () =>
      new Map(
        project.tracks.map((track) => [
          track.id,
          Object.fromEntries(soundDefs(track).map((d) => [`sound.${d.id}`, d.label])),
        ]),
      ),
    [project.tracks],
  );
  const labels = (id: string) => labelMap.get(id) ?? {};
  const { ref, size } = useCanvas(
    (g, { width, height, dpr }) => draw(g, width, height, dpr, scroll, labels),
    [project, editSlotId, t, settings, playing, follow],
  );

  const hit = (e: React.MouseEvent) => {
    const canvas = ref.current;
    if (!canvas) return null;
    const ctx = trackerContext();
    const { dpr } = size.current;
    const rect = canvas.getBoundingClientRect();
    const geo = geometryOf(ctx, rect.width * dpr, rect.height * dpr, dpr, scroll.current);
    const x = (e.clientX - rect.left) * dpr;
    const y = (e.clientY - rect.top) * dpr;
    if (y < geo.headerH || x < geo.numW) return null;
    const row = geo.top + Math.floor((y - geo.headerH) / geo.ch);
    const chars = (x - geo.numW) / geo.cw + geo.scrollX;
    const col = ctx.cols.find((c) => chars >= c.x && chars < c.x + c.width + 1);
    if (!col) return null;
    const local = chars - col.x;
    let fi = col.fields.findIndex((f) => local >= f.x && local < f.x + f.w);
    if (fi < 0)
      fi = col.fields.reduce(
        (best, f, i) => (Math.abs(f.x - local) < Math.abs(col.fields[best].x - local) ? i : best),
        0,
      );
    return { trackId: col.track.id, field: fi, row };
  };

  return (
    <canvas
      ref={ref}
      className="block h-full w-full"
      data-testid="tracker-pattern"
      data-hint="tracker.pattern"
      onMouseDown={(e) => {
        const h = hit(e);
        if (h) clickCursor(h.trackId, h.field, h.row, e.shiftKey);
      }}
      onWheel={(e) => moveRows(Math.sign(e.deltaY) * (e.shiftKey ? 16 : 1), false, false)}
    />
  );
}

/** A field box in the top panel: a label, a value and ▲▼ (FT2's). */
function FtField({
  label,
  value,
  onUp,
  onDown,
  hint,
  title,
  testId,
}: {
  label: string;
  value: string;
  onUp: () => void;
  onDown: () => void;
  hint: string;
  title: string;
  testId?: string;
}) {
  return (
    <div className="ft-row" data-hint={hint} title={title}>
      <span className="ft-label">{label}</span>
      <span className="ft-value" data-testid={testId}>
        {value}
      </span>
      <button className="ft-btn" tabIndex={-1} onClick={onUp} aria-label={`${label} up`}>
        ▲
      </button>
      <button className="ft-btn" tabIndex={-1} onClick={onDown} aria-label={`${label} down`}>
        ▼
      </button>
    </div>
  );
}

function TopPanel() {
  const project = useStore((s) => s.project);
  const editSlotId = useStore((s) => s.editSlotId);
  const follow = useStore((s) => s.follow);
  const edit = useTracker((s) => s.edit);
  const settings = { ...trackerSettings(), ...useSettings((s) => s.tracker) };
  const ctx = trackerContext();
  const slotIndex = Math.max(
    0,
    project.slots.findIndex((x) => x.id === editSlotId),
  );
  const pattern = ctx.pattern;
  const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
  const goSection = (d: number) => {
    const s = project.slots[slotIndex + d];
    if (s) useStore.getState().setUi({ editSlotId: s.id });
  };
  const setLength = (n: number) =>
    useStore.getState().commit((p) => {
      p.patterns[pattern.id].stepCount = Math.max(1, Math.min(128, n));
    }, "trk-length");
  const setStep = (d: number) => {
    const i = STEP_SIZES.indexOf(pattern.stepSize);
    const next = STEP_SIZES[Math.max(0, Math.min(STEP_SIZES.length - 1, i + d))] as StepSize;
    useStore.getState().commit((p) => {
      p.patterns[pattern.id].stepSize = next;
    });
  };
  const bpm = Math.round(clock.tempoNow());
  return (
    <div className="ft-top" data-testid="tracker-top">
      <div className="ft-box">
        <FtField
          label="Pos"
          value={hex(slotIndex)}
          onUp={() => goSection(1)}
          onDown={() => goSection(-1)}
          hint="tracker.pos"
          title="The section (Mod+← / Mod+→)"
          testId="tracker-pos"
        />
        <div className="ft-row" data-hint="tracker.patt" title="The section's pattern">
          <span className="ft-label">Patt</span>
          <span className="ft-value ft-wide">{pattern.name}</span>
        </div>
        <FtField
          label="Len"
          value={hex(pattern.stepCount)}
          onUp={() => setLength(pattern.stepCount + 1)}
          onDown={() => setLength(pattern.stepCount - 1)}
          hint="tracker.len"
          title={`${pattern.stepCount} steps (Mod+Alt+↑ / ↓)`}
          testId="tracker-len"
        />
      </div>
      <div className="ft-box">
        <FtField
          label="Octave"
          value={String(settings.octave)}
          onUp={() => setOctave(1)}
          onDown={() => setOctave(-1)}
          hint="tracker.octave"
          title="The note keys' octave (Alt+[ / Alt+])"
          testId="tracker-octave"
        />
        <FtField
          label="Step"
          value={pattern.stepSize}
          onUp={() => setStep(1)}
          onDown={() => setStep(-1)}
          hint="tracker.step"
          title="The pattern's step size"
        />
        <FtField
          label="BPM"
          value={String(bpm)}
          onUp={() => setTempo(bpm + 1)}
          onDown={() => setTempo(bpm - 1)}
          hint="tracker.bpm"
          title="The tempo"
        />
      </div>
      <div className="ft-box">
        <FtField
          label="Add"
          value={String(settings.add)}
          onUp={() => setTrackerSettings({ add: Math.min(9, settings.add + 1) })}
          onDown={() => setTrackerSettings({ add: Math.max(0, settings.add - 1) })}
          hint="tracker.add"
          title="Rows the cursor moves down after a note (Alt+0–9)"
          testId="tracker-add"
        />
        <FtField
          label="Rows"
          value={settings.rows === "auto" ? `Auto ${ctx.n}` : `×${settings.rows}`}
          onUp={cycleRows}
          onDown={cycleRows}
          hint="tracker.rows"
          title="Rows per step: Auto fits every track (Alt+R)"
          testId="tracker-rows"
        />
        <div className="ft-row">
          <button
            className="ft-lamp"
            data-on={edit}
            tabIndex={-1}
            onClick={toggleEdit}
            data-hint="tracker.edit"
            data-testid="tracker-edit"
            title="Edit mode (Esc)"
          >
            Edit
          </button>
          <button
            className="ft-lamp"
            data-on={follow}
            tabIndex={-1}
            onClick={() => useStore.getState().setUi({ follow: !follow })}
            data-hint="tracker.follow"
            title="Follow the playhead (Scroll Lock, Alt+F)"
          >
            Follow
          </button>
          <button
            className="ft-btn"
            tabIndex={-1}
            onClick={() => zoom(1)}
            title="Bigger text (Alt+=)"
            aria-label="Bigger text"
          >
            +
          </button>
          <button
            className="ft-btn"
            tabIndex={-1}
            onClick={() => zoom(-1)}
            title="Smaller text (Alt+-)"
            aria-label="Smaller text"
          >
            −
          </button>
        </div>
      </div>
      <div className="ft-box ft-scopes" data-hint="tracker.scopes">
        {project.tracks.map((track) => (
          <div
            key={track.id}
            className="ft-scope"
            data-muted={track.mute}
            data-solo={track.solo}
            title={`${track.name}: click to mute, right-click to solo`}
            onClick={() =>
              useStore.getState().commit((p) => {
                const x = p.tracks.find((q) => q.id === track.id);
                if (x) x.mute = !x.mute;
              })
            }
            onContextMenu={(e) => {
              e.preventDefault();
              useStore.getState().commit((p) => {
                const x = p.tracks.find((q) => q.id === track.id);
                if (x) x.solo = !x.solo;
              });
            }}
          >
            <Scope trackId={track.id} color={track.color} meter={false} />
            <span className="ft-scope-name">{track.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusLine() {
  const message = useTracker((s) => s.message);
  const edit = useTracker((s) => s.edit);
  useTracker((s) => s.cursor);
  useStore((s) => s.project);
  const text = message ?? describeCursor();
  return (
    <div className="ft-status" data-testid="tracker-status" aria-live="polite">
      <span className="ft-mode" data-on={edit}>
        {edit ? "EDIT" : "PLAY"}
      </span>
      <span className="min-w-0 flex-1 truncate" data-error={!!message}>
        {text}
      </span>
      <span className="hidden text-dim @[560px]:inline">
        Esc: edit · Tab: track · Enter: hear the row
      </span>
    </div>
  );
}

export function TrackerPanel(_: PanelProps) {
  const root = useRef<HTMLDivElement>(null);
  const compact = useSettings((s) => s.tracker?.compact ?? false);
  const [, repaint] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onThemeChange(repaint), []);
  const pal = trackerPalette();
  useTrackerKeys(root);
  usePlayhead();
  useEffect(() => {
    // start on the selected track
    const sel = useStore.getState().selectedTrackId;
    if (!useTracker.getState().cursor.trackId && sel)
      useTracker.setState({ cursor: { trackId: sel, field: 0, row: 0 } });
  }, []);
  const style = {
    "--ft-chrome": pal.chrome,
    "--ft-light": pal.light,
    "--ft-dark": pal.dark,
    "--ft-pattern": pal.pattern,
    "--ft-text": pal.chromeText,
    "--ft-dim": pal.chromeDim,
    "--ft-value": pal.text,
    "--ft-on": pal.fx,
  } as React.CSSProperties;
  return (
    <div
      ref={root}
      className="tracker @container flex h-full flex-col outline-none"
      style={style}
      tabIndex={0}
      data-scope="tracker"
      data-testid="tracker"
      onFocus={() => useTracker.setState({ focused: true })}
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node))
          useTracker.setState({ focused: false });
      }}
      onMouseDown={() => root.current?.focus()}
    >
      {!compact && <TopPanel />}
      <div className="ft-pattern-wrap min-h-0 flex-1">
        <PatternView />
      </div>
      <StatusLine />
    </div>
  );
}
