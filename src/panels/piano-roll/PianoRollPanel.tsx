import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { MousePointer2, Pencil } from "lucide-react";
import { contextMenu } from "../../components/Menu";
import * as engine from "../../engine/engine";
import { onStep } from "../../engine/transport";
import {
  addNote,
  getNote,
  listNotes,
  moveNotes,
  noteKey,
  parseNoteKey,
  removeNote,
  resizeNotes,
  type NoteRef,
} from "../../model/noteOps";
import { inKey, keyName, keyUsesFlats, noteName, snapToKey } from "../../model/notes";
import { pageKey, slotPattern, type Project } from "../../model/project";
import { STEP_SIZE_QUARTERS, type Note, type StepLane, type Track } from "../../model/types";
import { token } from "../../render/theme";
import { useCanvas } from "../../render/useCanvas";
import { useEditPattern, useSelectedTrack, useStore } from "../../state/store";

const LOW = 24; // C1
const HIGH = 96; // C7
const KEYS_W = 46;
const VEL_H = 56;
const BLACK = new Set([1, 3, 6, 8, 10]);

type Gesture =
  | { kind: "move"; x: number; y: number; orig: NoteRef[]; cur: NoteRef[]; key: string }
  | { kind: "resize"; x: number; orig: Map<string, number>; refs: NoteRef[]; key: string }
  | { kind: "draw"; step: number; pitch: number; key: string }
  | { kind: "marquee"; x: number; y: number; additive: boolean }
  | { kind: "velocity"; key: string };

function useSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 600, h: 300 });
  useEffect(() => {
    let raf = 0;
    const ro = new ResizeObserver(([e]) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        setSize({ w: e.contentRect.width, h: e.contentRect.height }),
      );
    });
    ro.observe(ref.current!);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [ref]);
  return size;
}

/** Full note editor for the selected instrument track on the page being edited. */
export function PianoRollPanel() {
  const track = useSelectedTrack();
  const tracks = useStore((s) => s.project.tracks);
  const setUi = useStore((s) => s.setUi);
  if (!track || track.kind !== "instrument") {
    const instruments = tracks.filter((t) => t.kind === "instrument");
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-[12px] text-faint">Select an instrument track to edit its notes.</div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {instruments.map((t) => (
            <button
              key={t.id}
              className="tool-btn border border-line"
              data-hint="roll.trackPick"
              onClick={() => setUi({ selectedTrackId: t.id })}
            >
              <span className="h-2.5 w-1.5 rounded-sm" style={{ background: t.color }} />
              {t.name}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return <PianoRoll track={track} />;
}

function PianoRoll({ track }: { track: Track }) {
  const pattern = useEditPattern();
  const lane = pattern.lanes[track.id] as StepLane;
  const project = useStore((s) => s.project);
  const commit = useStore((s) => s.commit);
  const scaleLock = useStore((s) => s.scaleLock);
  const key = pageKey(project, pattern);
  const flats = keyUsesFlats(key);
  const length = lane.stepCountOverride ?? pattern.stepCount;
  const body = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const size = useSize(body);
  const [tool, setTool] = useState<"draw" | "select">("draw");
  const [noteLen, setNoteLen] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const [zoom, setZoom] = useState(1);
  const gesture = useRef<Gesture | null>(null);
  const clipboard = useRef<{ dStep: number; pitch: number; note: Note }[]>([]);

  const rowH = size.h > 420 ? 16 : 13;
  const rows = HIGH - LOW + 1;
  const colW = Math.max(14, Math.min(64, ((size.w - KEYS_W - 16) / length) * zoom));
  const gridW = length * colW;
  const gridH = rows * rowH;
  const spb = Math.max(1, Math.round(1 / STEP_SIZE_QUARTERS[pattern.stepSize]));
  const notes = useMemo(() => listNotes(lane, length), [lane, length]);

  // start scrolled to the notes (or around C4), once the panel has a size
  const scrolledFor = useRef("");
  useEffect(() => {
    const el = scroller.current;
    const id = `${track.id}:${pattern.id}:${rowH}`;
    if (!el || el.clientHeight === 0 || scrolledFor.current === id) return;
    scrolledFor.current = id;
    const pitches = notes.map((n) => n.pitch);
    const center = pitches.length ? (Math.max(...pitches) + Math.min(...pitches)) / 2 : 60;
    el.scrollTop = (HIGH - center) * rowH - el.clientHeight / 2;
  }, [track.id, pattern.id, notes, rowH, size.h]);

  // playhead, straight on the DOM
  useEffect(
    () =>
      onStep((e) => {
        const el = head.current;
        if (!el) return;
        if (e.pageStep < 0 || e.patternId !== pattern.id) return void (el.style.opacity = "0");
        const i = e.laneSteps.get(track.id) ?? e.pageStep % length;
        el.style.opacity = "1";
        el.style.transform = `translateX(${i * colW}px)`;
      }),
    [pattern.id, track.id, length, colW],
  );

  const { ref: gridRef } = useCanvas(
    (ctx, { width: w, height: h }) => {
      ctx.clearRect(0, 0, w, h);
      for (let p = LOW; p <= HIGH; p++) {
        const y = (HIGH - p) * rowH;
        const black = BLACK.has(p % 12);
        ctx.fillStyle = black ? token("panel") : token("surface");
        ctx.fillRect(0, y, w, rowH);
        if (!inKey(p, key)) {
          ctx.fillStyle = "rgba(0,0,0,0.18)";
          ctx.fillRect(0, y, w, rowH);
        }
        if (p % 12 === key.root) {
          ctx.fillStyle = "rgba(125,211,252,0.06)";
          ctx.fillRect(0, y, w, rowH);
        }
        ctx.fillStyle = token("border");
        ctx.fillRect(0, y + rowH - 0.5, w, 0.5);
      }
      for (let i = 0; i <= length; i++) {
        const bar = i % (spb * project.timeSignature[0]) === 0;
        const beat = i % spb === 0;
        ctx.fillStyle = bar ? token("border-strong") : token("border");
        ctx.globalAlpha = bar ? 1 : beat ? 0.8 : 0.35;
        ctx.fillRect(i * colW - (bar ? 0.5 : 0), 0, bar ? 1.5 : 1, h);
      }
      ctx.globalAlpha = 1;
    },
    [rowH, colW, length, key.root, key.scale, spb, project.timeSignature[0]],
  );

  // ---------- editing ----------

  const edit = (fn: (l: StepLane, p: Project) => void, k?: string) =>
    commit((p) => {
      const l = slotPattern(p as Project, useStore.getState().editSlotId).lanes[track.id];
      if (l?.kind === "steps") fn(l, p as Project);
    }, k);

  const at = (e: { clientX: number; clientY: number }) => {
    const r = gridRef.current!.getBoundingClientRect();
    const step = Math.floor((e.clientX - r.left) / colW);
    let pitch = HIGH - Math.floor((e.clientY - r.top) / rowH);
    if (scaleLock) pitch = snapToKey(pitch, key);
    return {
      step: Math.max(0, Math.min(length - 1, step)),
      pitch: Math.max(LOW, Math.min(HIGH, pitch)),
      x: e.clientX,
      y: e.clientY,
    };
  };

  const audition = (pitch: number, velocity = 0.8) =>
    engine.trigger(track, velocity, { notes: [{ pitch, length: 1, velocity }], stepDur: 0.2 });

  const selRefs = () => [...selected].map(parseNoteKey);

  const onGridDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    body.current?.focus();
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-note]");
    const g = `pr-${performance.now()}`;
    if (target) {
      const ref = parseNoteKey(target.dataset.note!);
      const k = noteKey(ref);
      if (e.altKey) return edit((l) => void removeNote(l, ref), g);
      let sel = selected;
      if (!selected.has(k)) {
        sel = e.shiftKey ? new Set([...selected, k]) : new Set([k]);
        setSelected(sel);
      }
      const refs = [...sel].map(parseNoteKey);
      e.currentTarget.setPointerCapture(e.pointerId);
      if ((e.target as HTMLElement).dataset.edge !== undefined) {
        const orig = new Map(refs.map((r) => [noteKey(r), getNote(lane, r)?.length ?? 1]));
        gesture.current = { kind: "resize", x: e.clientX, orig, refs, key: g };
      } else {
        gesture.current = {
          kind: "move",
          x: e.clientX,
          y: e.clientY,
          orig: refs,
          cur: refs,
          key: g,
        };
        audition(ref.pitch, getNote(lane, ref)?.velocity);
      }
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    if (tool === "select" || e.shiftKey) {
      gesture.current = { kind: "marquee", x: e.clientX, y: e.clientY, additive: e.shiftKey };
      if (!e.shiftKey) setSelected(new Set());
      return;
    }
    edit((l) => addNote(l, p.step, { pitch: p.pitch, length: noteLen, velocity: 0.8 }), g);
    setSelected(new Set([noteKey(p)]));
    gesture.current = { kind: "draw", step: p.step, pitch: p.pitch, key: g };
    audition(p.pitch);
  };

  const onGridMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "draw") {
      // drag while drawing sets the length
      const p = at(e);
      const len = Math.max(1, p.step - g.step + 1);
      edit((l) => resizeNotes(l, [{ step: g.step, pitch: g.pitch }], () => len), g.key);
    } else if (g.kind === "move") {
      const dStep = Math.round((e.clientX - g.x) / colW);
      let dPitch = -Math.round((e.clientY - g.y) / rowH);
      if (scaleLock && g.orig.length)
        dPitch = snapToKey(g.orig[0].pitch + dPitch, key) - g.orig[0].pitch;
      const cur = g.cur;
      let next: NoteRef[] = [];
      edit((l) => {
        // put the notes back where the drag started, then move them by the whole delta,
        // so the drag stays one undo step and never drifts
        cur.forEach((c, i) => {
          const n = removeNote(l, c);
          if (n) addNote(l, g.orig[i].step, { ...n, pitch: g.orig[i].pitch });
        });
        next = moveNotes(l, g.orig, dStep, dPitch, length);
      }, g.key);
      if (next.length) {
        if (next[0].pitch !== cur[0]?.pitch) audition(next[0].pitch);
        g.cur = next;
        setSelected(new Set(next.map(noteKey)));
      }
    } else if (g.kind === "resize") {
      const d = Math.round((e.clientX - g.x) / colW);
      edit((l) => {
        for (const r of g.refs) {
          const n = getNote(l, r);
          if (n) n.length = Math.max(1, (g.orig.get(noteKey(r)) ?? 1) + d);
        }
      }, g.key);
    } else if (g.kind === "marquee") {
      const rect = {
        x: Math.min(g.x, e.clientX),
        y: Math.min(g.y, e.clientY),
        w: Math.abs(e.clientX - g.x),
        h: Math.abs(e.clientY - g.y),
      };
      setMarquee(rect);
      const r = gridRef.current!.getBoundingClientRect();
      const s0 = (rect.x - r.left) / colW;
      const s1 = (rect.x + rect.w - r.left) / colW;
      const p0 = HIGH - (rect.y + rect.h - r.top) / rowH;
      const p1 = HIGH - (rect.y - r.top) / rowH;
      const hit = notes.filter(
        (n) => n.step + n.note.length > s0 && n.step < s1 && n.pitch + 1 > p0 && n.pitch < p1,
      );
      setSelected(new Set([...(g.additive ? selected : []), ...hit.map(noteKey)]));
    }
  };

  const onGridUp = () => {
    const g = gesture.current;
    if (g?.kind === "draw") {
      const n = getNote(
        useStore.getState().project.patterns[pattern.id].lanes[track.id] as StepLane,
        g,
      );
      if (n) setNoteLen(n.length);
    }
    gesture.current = null;
    setMarquee(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const refs = selRefs();
    const mod = e.metaKey || e.ctrlKey;
    const k = `pr-key-${e.key}`;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if ((e.key === "Backspace" || e.key === "Delete") && refs.length) {
      handled();
      edit((l) => refs.forEach((r) => removeNote(l, r)));
      setSelected(new Set());
    } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && refs.length) {
      handled();
      const d = (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 12 : 1);
      let next: NoteRef[] = [];
      edit((l) => void (next = moveNotes(l, refs, 0, d, length)), k);
      setSelected(new Set(next.map(noteKey)));
      if (next[0]) audition(next[0].pitch);
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && refs.length) {
      handled();
      const d = e.key === "ArrowRight" ? 1 : -1;
      let next: NoteRef[] = [];
      edit((l) => void (next = moveNotes(l, refs, d, 0, length)), k);
      setSelected(new Set(next.map(noteKey)));
    } else if (mod && e.key.toLowerCase() === "a") {
      handled();
      setSelected(new Set(notes.map(noteKey)));
    } else if (mod && e.key.toLowerCase() === "c" && refs.length) {
      handled();
      const first = Math.min(...refs.map((r) => r.step));
      clipboard.current = refs.map((r) => ({
        dStep: r.step - first,
        pitch: r.pitch,
        note: { ...getNote(lane, r)! },
      }));
    } else if (mod && e.key.toLowerCase() === "v" && clipboard.current.length) {
      handled();
      // paste after the selection (or at the start)
      const start = refs.length
        ? Math.max(...refs.map((r) => r.step + (getNote(lane, r)?.length ?? 1)))
        : 0;
      const placed: NoteRef[] = [];
      edit((l) => {
        for (const c of clipboard.current) {
          const step = start + c.dStep;
          if (step >= length) continue;
          addNote(l, step, { ...c.note });
          placed.push({ step, pitch: c.pitch });
        }
      });
      setSelected(new Set(placed.map(noteKey)));
    } else if (e.key === "Escape") {
      handled();
      setSelected(new Set());
    }
  };

  // on a selected note, the menu acts on every selected note
  const noteMenu = (e: React.MouseEvent, ref: NoteRef) => {
    const refs = selected.has(noteKey(ref)) ? selRefs() : [ref];
    const notes = refs.flatMap((r) => getNote(lane, r) ?? []);
    if (!notes.length) return;
    const many = refs.length > 1;
    const allSlide = notes.every((n) => n.slide);
    const each = (fn: (n: Note) => void) =>
      edit((l) => {
        for (const r of refs) {
          const n = getNote(l, r);
          if (n) fn(n);
        }
      });
    contextMenu(e, [
      ...(many
        ? [{ render: () => <div className="label px-2 pt-1">{refs.length} selected notes</div> }]
        : []),
      {
        label: allSlide ? "Remove slide" : many ? "Slide into these notes" : "Slide into this note",
        onSelect: () => each((n) => void (n.slide = !allSlide)),
      },
      ...[1, 2, 4, 8].map((len) => ({
        label: `Length ${len}`,
        checked: notes.every((n) => n.length === len),
        onSelect: () => each((n) => void (n.length = len)),
      })),
      { separator: true },
      {
        label: many ? `Delete ${refs.length} notes` : "Delete",
        shortcut: "⌫",
        onSelect: () => {
          edit((l) => refs.forEach((r) => void removeNote(l, r)));
          setSelected(new Set());
        },
      },
    ]);
  };

  // velocity lane: drag over the bars to set them
  const velAt = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    const step = Math.floor(
      (e.clientX - r.left + (scroller.current?.scrollLeft ?? 0) - KEYS_W) / colW,
    );
    const v = Math.max(0.02, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    return { step, v };
  };
  const setVelocity = (e: React.PointerEvent, g: string) => {
    const { step, v } = velAt(e);
    const sel = selRefs();
    edit((l) => {
      const at = l.steps[step]?.notes ?? [];
      const targets = at.filter(
        (n) => !sel.length || selected.has(noteKey({ step, pitch: n.pitch })),
      );
      for (const n of targets.length ? targets : at) n.velocity = v;
      if (at.length) l.steps[step].velocity = Math.max(...at.map((n) => n.velocity));
    }, g);
  };

  const keyClick = (pitch: number) => audition(pitch);

  return (
    <div className="flex h-full flex-col" data-testid="piano-roll">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-2 py-1.5">
        <span className="h-3 w-1.5 rounded-sm" style={{ background: track.color }} />
        <span className="label !text-ink">{track.name}</span>
        <span className="text-[11px] text-faint">{pattern.name}</span>
        <div className="flex items-center gap-0.5">
          <button
            className="tool-btn"
            data-active={tool === "draw"}
            onClick={() => setTool("draw")}
            title="Draw notes (drag to set the length)"
            data-hint="roll.tool.draw"
          >
            <Pencil size={13} />
          </button>
          <button
            className="tool-btn"
            data-active={tool === "select"}
            onClick={() => setTool("select")}
            title="Select (or Shift+drag)"
            data-hint="roll.tool.select"
          >
            <MousePointer2 size={13} />
          </button>
        </div>
        <select
          className="input !h-6 !text-[11px]"
          value={noteLen}
          onChange={(e) => setNoteLen(Number(e.target.value))}
          title="Length of new notes"
          data-hint="roll.noteLen"
        >
          {[1, 2, 3, 4, 6, 8, 16].map((n) => (
            <option key={n} value={n}>
              {n} step{n > 1 ? "s" : ""}
            </option>
          ))}
        </select>
        <button
          className="tool-btn border border-line !text-[10.5px]"
          data-active={scaleLock}
          onClick={() => useStore.getState().setUi({ scaleLock: !scaleLock })}
          title="Snap notes to the key"
          data-hint="roll.scaleLock"
        >
          Scale lock
        </button>
        <span className="text-[11px] text-dim">{keyName(key)}</span>
        <span className="flex-1" />
        <span className="text-[10.5px] text-faint">
          {selected.size ? `${selected.size} selected` : `${notes.length} notes`}
        </span>
        <button
          className="tool-btn"
          onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}
          title="Zoom out"
          data-hint="roll.zoomOut"
        >
          −
        </button>
        <button
          className="tool-btn"
          onClick={() => setZoom((z) => Math.min(4, z * 1.25))}
          title="Zoom in"
          data-hint="roll.zoomIn"
        >
          +
        </button>
      </div>

      <div
        ref={body}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="relative min-h-0 flex-1 outline-none"
      >
        <div
          ref={scroller}
          className="scroll-thin absolute inset-0 overflow-auto"
          style={{ bottom: VEL_H }}
        >
          <div className="relative flex" style={{ width: KEYS_W + gridW, height: gridH }}>
            {/* keyboard */}
            <div
              className="sticky left-0 z-[3] shrink-0 border-r border-line bg-panel"
              style={{ width: KEYS_W, height: gridH }}
              data-hint="roll.keys"
            >
              {Array.from({ length: rows }, (_, i) => {
                const p = HIGH - i;
                const black = BLACK.has(p % 12);
                return (
                  <button
                    key={p}
                    className="num flex w-full items-center justify-end pr-1 text-[8.5px]"
                    style={{
                      height: rowH,
                      background: black ? "var(--display)" : "var(--raised)",
                      color: p % 12 === 0 ? "var(--text)" : "var(--text-faint)",
                      borderBottom: "1px solid var(--border)",
                      opacity: inKey(p, key) ? 1 : 0.6,
                    }}
                    onPointerDown={() => keyClick(p)}
                  >
                    {p % 12 === 0 || rowH >= 16 ? noteName(p, flats) : ""}
                  </button>
                );
              })}
            </div>
            {/* grid + notes */}
            <div
              className="relative"
              style={{
                width: gridW,
                height: gridH,
                cursor: tool === "draw" ? "crosshair" : "default",
              }}
              data-hint="roll.grid"
              onPointerDown={onGridDown}
              onPointerMove={onGridMove}
              onPointerUp={onGridUp}
              onPointerCancel={onGridUp}
              onDoubleClick={(e) => {
                const t = (e.target as HTMLElement).closest<HTMLElement>("[data-note]");
                if (t) edit((l) => void removeNote(l, parseNoteKey(t.dataset.note!)));
              }}
            >
              <canvas ref={gridRef} className="absolute inset-0 block h-full w-full" />
              {notes.map((n) => {
                const k = noteKey(n);
                const sel = selected.has(k);
                return (
                  <div
                    key={k}
                    data-note={k}
                    data-hint="roll.note"
                    className="absolute rounded-[3px]"
                    style={
                      {
                        left: n.step * colW + 1,
                        top: (HIGH - n.pitch) * rowH + 1,
                        width: Math.max(4, n.note.length * colW - 2),
                        height: rowH - 2,
                        background: `color-mix(in oklab, ${track.color} ${40 + n.note.velocity * 60}%, var(--pad-bg))`,
                        boxShadow: sel
                          ? "0 0 0 1.5px var(--select)"
                          : `0 0 6px color-mix(in oklab, ${track.color} 40%, transparent)`,
                        zIndex: sel ? 2 : 1,
                      } as CSSProperties
                    }
                    onContextMenu={(e) => noteMenu(e, n)}
                    title={`${noteName(n.pitch, flats)} · ${n.note.length} step${n.note.length > 1 ? "s" : ""} · vel ${Math.round(n.note.velocity * 127)}`}
                  >
                    {n.note.slide && (
                      <span className="absolute left-0.5 top-0 text-[8px] text-black/70">╱</span>
                    )}
                    <span
                      data-edge=""
                      className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize"
                    />
                  </div>
                );
              })}
              <div
                ref={head}
                className="pointer-events-none absolute inset-y-0 left-0 z-[2] w-0.5 bg-ink/60 opacity-0"
                style={{ width: Math.max(2, colW), background: "var(--head)" }}
              />
            </div>
          </div>
        </div>

        {/* velocity lane */}
        <div
          className="absolute inset-x-0 bottom-0 cursor-ns-resize touch-none overflow-hidden border-t border-line bg-panel"
          style={{ height: VEL_H }}
          data-hint="roll.velocity"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            gesture.current = { kind: "velocity", key: `vel-${performance.now()}` };
            setVelocity(e, (gesture.current as { key: string }).key);
          }}
          onPointerMove={(e) =>
            gesture.current?.kind === "velocity" && setVelocity(e, gesture.current.key)
          }
          onPointerUp={() => (gesture.current = null)}
          title="Velocity: drag over the bars"
        >
          <span className="label absolute left-1.5 top-1">Vel</span>
          <VelocityBars
            notes={notes}
            colW={colW}
            color={track.color}
            selected={selected}
            scroller={scroller}
          />
        </div>
      </div>
      {marquee && (
        <div
          className="pointer-events-none fixed z-40 rounded-sm border border-accent"
          style={{
            left: marquee.x,
            top: marquee.y,
            width: marquee.w,
            height: marquee.h,
            background: "color-mix(in oklab, var(--accent) 12%, transparent)",
          }}
        />
      )}
    </div>
  );
}

function VelocityBars({
  notes,
  colW,
  color,
  selected,
  scroller,
}: {
  notes: ReturnType<typeof listNotes>;
  colW: number;
  color: string;
  selected: Set<string>;
  scroller: React.RefObject<HTMLDivElement | null>;
}) {
  const [scroll, setScroll] = useState(0);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const on = () => setScroll(el.scrollLeft);
    el.addEventListener("scroll", on);
    return () => el.removeEventListener("scroll", on);
  }, [scroller]);
  return (
    <div className="absolute inset-y-1" style={{ left: KEYS_W - scroll }}>
      {notes.map((n) => (
        <div
          key={noteKey(n)}
          className="absolute bottom-0 rounded-t-sm"
          style={{
            left: n.step * colW + colW / 2 - 2,
            width: 4,
            height: `${n.note.velocity * 100}%`,
            background: selected.has(noteKey(n)) ? "var(--select)" : color,
          }}
        />
      ))}
    </div>
  );
}
