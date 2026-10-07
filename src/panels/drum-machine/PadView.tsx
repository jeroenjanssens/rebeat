import { useEffect, useRef, type CSSProperties } from "react";
import { Scope } from "../../components/Scope";
import * as engine from "../../mock/engine";
import { onStep } from "../../mock/clock";
import { KEY_ROOT, SCALE_MINOR, noteName } from "../../model/notes";
import { STEP_COUNT_PRESETS, STEP_SIZE_QUARTERS, type Track } from "../../model/types";
import { applyHeld, setStep } from "../../state/actions";
import { useEditPattern, useSelectedTrack, useStore } from "../../state/store";
import { geometry, type SizeClass } from "./layout";
import { StepsArea } from "./StepsArea";

function flash(el: Element | null | undefined) {
  if (!el) return;
  el.classList.remove("trig");
  void (el as HTMLElement).offsetWidth;
  el.classList.add("trig");
}

/** Hit a pad: velocity from the vertical position; with REPEAT held it retriggers at the repeat rate. */
function usePadHit() {
  const repeatTimer = useRef<number | null>(null);
  const stopRepeat = () => {
    if (repeatTimer.current) clearInterval(repeatTimer.current);
    repeatTimer.current = null;
  };
  useEffect(() => stopRepeat, []);

  const hit = (e: React.PointerEvent<HTMLElement>, track: Track, notes?: number[]) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const s = useStore.getState();
    const velocity = s.accentMode
      ? 1
      : Math.min(1, Math.max(0.2, 1 - (e.clientY - r.top) / r.height + 0.25));
    const fire = () => {
      engine.trigger(track, velocity, {
        now: performance.now(),
        notes,
        lengthSteps: notes ? 2 : undefined,
        stepMs: 120,
      });
      flash(el);
    };
    fire();
    if (s.held === "repeat") {
      useStore.getState().setUi({ heldUsed: true });
      const ms = (60000 / s.project.bpm) * STEP_SIZE_QUARTERS[s.repeatRate];
      stopRepeat();
      repeatTimer.current = window.setInterval(fire, ms);
    }
  };
  return { hit, stopRepeat };
}

function DrumPads({ size }: { size: SizeClass }) {
  const tracks = useStore((s) => s.project.tracks);
  const selectedTrackId = useStore((s) => s.selectedTrackId);
  const setUi = useStore((s) => s.setUi);
  const ref = useRef<HTMLDivElement>(null);
  const { hit, stopRepeat } = usePadHit();

  useEffect(
    () =>
      onStep((e) => {
        for (const id of e.triggered) flash(ref.current?.querySelector(`[data-pad-track="${id}"]`));
      }),
    [],
  );

  // pad 1 bottom-left, like hardware
  const cells = Array.from({ length: 16 }, (_, i) => {
    const row = 3 - Math.floor(i / 4);
    return row * 4 + (i % 4);
  });
  const padSize = size === "large" ? 96 : size === "compact" ? 52 : 74;

  return (
    <div
      ref={ref}
      className="grid shrink-0 grid-cols-4 gap-2"
      style={{ gridAutoRows: padSize, width: padSize * 4 + 24 }}
    >
      {cells.map((ti) => {
        const t = tracks[ti];
        if (!t) return <div key={ti} className="rounded-lg border border-dashed border-line" />;
        return (
          <button
            key={t.id}
            data-pad-track={t.id}
            className="perf-pad flex touch-none flex-col justify-between p-1.5 text-left"
            data-selected={t.id === selectedTrackId}
            style={{ "--c": t.color } as CSSProperties}
            onPointerDown={(e) => {
              if (applyHeld({ trackId: t.id })) return;
              setUi({ selectedTrackId: t.id });
              if (!t.mute) hit(e, t);
            }}
            onPointerUp={stopRepeat}
            onPointerLeave={stopRepeat}
          >
            <span className="num text-[9px] text-black/50">{String(ti + 1).padStart(2, "0")}</span>
            <span
              className={`truncate text-[10px] font-bold uppercase tracking-wide ${t.mute ? "text-faint line-through" : "text-ink"}`}
            >
              {t.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** In-key note layout: rows go up by a fourth (3 scale degrees), the root is highlighted. */
function NotePads({ track, size }: { track: Track; size: SizeClass }) {
  const { hit, stopRepeat } = usePadHit();
  const padSize = size === "large" ? 64 : size === "compact" ? 36 : 50;
  const base = track.category === "bass" ? 36 : 48;
  const rows = 4;
  const cols = 8;
  const pads = [];
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = 0; c < cols; c++) {
      const degree = r * 3 + c;
      const midi = base + KEY_ROOT + Math.floor(degree / 7) * 12 + SCALE_MINOR[degree % 7];
      pads.push({ midi, root: degree % 7 === 0 });
    }
  }
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${padSize}px)`,
          gridAutoRows: padSize * 0.8,
        }}
      >
        {pads.map((p, i) => (
          <button
            key={i}
            className={`perf-pad num touch-none text-[10px] font-semibold text-ink ${p.root ? "root" : ""}`}
            style={{ "--c": track.color } as CSSProperties}
            onPointerDown={(e) => hit(e, track, [p.midi])}
            onPointerUp={stopRepeat}
            onPointerLeave={stopRepeat}
          >
            {noteName(p.midi, true)}
          </button>
        ))}
      </div>
      <div className="label">C minor · in key · root highlighted</div>
    </div>
  );
}

export function PadView({ sizeClass, width }: { sizeClass: SizeClass; width: number }) {
  const track = useSelectedTrack();
  const pattern = useEditPattern();
  const { commit, selectedSteps, setUi } = useStore();
  const stepsRef = useRef<HTMLDivElement>(null);
  const lane = pattern.lanes[track.id];
  const length =
    lane?.kind === "steps" ? (lane.stepCountOverride ?? pattern.stepCount) : pattern.stepCount;
  const paint = useRef<{ on: boolean; key: string } | null>(null);

  useEffect(() => {
    let head: Element | null = null;
    return onStep((e) => {
      head?.classList.remove("head");
      head = null;
      if (e.pageStep < 0 || e.patternId !== pattern.id) return;
      const el = stepsRef.current?.querySelector(`[data-i="${e.pageStep % length}"]`);
      if (!el) return;
      head = el;
      el.classList.add("head");
      if (e.triggered.has(track.id)) flash(el);
    });
  }, [pattern.id, length, track.id]);

  const padsW = sizeClass === "large" ? 430 : sizeClass === "compact" ? 240 : 330;
  const rowSteps = 16;
  const full = geometry(0, pattern, sizeClass, 1);
  const available = Math.max(320, width - padsW - 110);
  const rowPattern = { ...pattern, stepCount: Math.min(rowSteps, pattern.stepCount) };
  const geo = geometry(available + full.headerW + full.scopeW + 40, rowPattern, sizeClass, 1);
  const rows = Math.ceil(pattern.stepCount / rowSteps);

  const selected = new Set(
    Object.keys(selectedSteps)
      .filter((k) => k.startsWith(`${track.id}:`))
      .map((k) => Number(k.split(":")[1])),
  );

  const padAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-pad]");
    return el ? Number(el.dataset.i) : null;
  };

  return (
    <div className="scroll-thin flex min-h-0 flex-1 gap-6 overflow-auto p-4">
      <div className="flex flex-col gap-3">
        <div className="label">
          {track.kind === "instrument" ? `Notes · ${track.name}` : "Pads · one per track"}
        </div>
        {track.kind === "instrument" ? (
          <NotePads track={track} size={sizeClass} />
        ) : (
          <DrumPads size={sizeClass} />
        )}
        {track.kind === "instrument" && (
          <button
            className="tool-btn self-start border border-line"
            onClick={() => setUi({ selectedTrackId: useStore.getState().project.tracks[0].id })}
          >
            ← Back to drum pads
          </button>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-1.5 rounded-sm" style={{ background: track.color }} />
          <span className="label !text-ink">Steps · {track.name}</span>
          <div className="ml-auto h-8 w-28">
            <Scope trackId={track.id} color={track.color} />
          </div>
        </div>
        {lane?.kind === "steps" ? (
          <div
            ref={stepsRef}
            className="flex touch-none flex-col gap-2 rounded-lg border border-line bg-surface/50 p-3"
            style={
              {
                "--pad-w": `${geo.padW}px`,
                "--pad-h": `${geo.padH + 8}px`,
                "--pad-r": `${geo.radius}px`,
              } as CSSProperties
            }
            onPointerDown={(e) => {
              const i = padAt(e.clientX, e.clientY);
              if (i === null || i >= length) return;
              if (applyHeld({ trackId: track.id, stepIndex: i })) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              const on = !lane.steps[i].on;
              paint.current = { on, key: `pv-${performance.now()}` };
              setStep(track.id, i, on, paint.current.key);
            }}
            onPointerMove={(e) => {
              if (!paint.current) return;
              const i = padAt(e.clientX, e.clientY);
              if (i !== null && i < length)
                setStep(track.id, i, paint.current.on, paint.current.key);
            }}
            onPointerUp={() => (paint.current = null)}
          >
            {Array.from({ length: rows }, (_, r) => {
              const groups = full.groups
                .filter((g) => g.indices[0] >= r * rowSteps && g.indices[0] < (r + 1) * rowSteps)
                .map((g) => ({ ...g, barStart: false }));
              return (
                <div key={r} className="flex items-center gap-3">
                  <span className="num w-10 text-right text-[10px] text-faint">
                    {r * rowSteps + 1}–{Math.min(pattern.stepCount, (r + 1) * rowSteps)}
                  </span>
                  <StepsArea
                    track={track}
                    lane={lane}
                    length={length}
                    geo={{ ...geo, groups }}
                    selected={selected}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-line p-6 text-[12px] text-dim">
            Audio tracks play a clip; switch to the grid to see its waveform.
          </div>
        )}
        {lane?.kind === "steps" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="label mr-1">Steps (track)</span>
            {STEP_COUNT_PRESETS.map((n) => (
              <button
                key={n}
                className="hw-btn !min-h-[26px] min-w-[38px]"
                data-lit={length === n}
                onClick={() =>
                  commit((p) => {
                    const l = p.patterns[pattern.id].lanes[track.id];
                    if (l.kind !== "steps") return;
                    l.stepCountOverride = n === pattern.stepCount ? undefined : n;
                  })
                }
              >
                {n}
              </button>
            ))}
            <span className="ml-2 text-[10.5px] text-faint">
              Page has {pattern.stepCount} steps; shorter tracks loop inside it.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
