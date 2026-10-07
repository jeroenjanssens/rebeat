import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { tapTempo } from "../../app/TransportBar";
import { Encoder } from "../../components/Encoder";
import { contextMenu } from "../../components/Menu";
import { useScratch } from "../../components/useScratch";
import * as engine from "../../engine/engine";
import {
  setCrossfader,
  setFilter,
  setRepeat,
  setThrow,
  tapeStop,
  toggleMuteGroup,
  usePerf,
} from "../../engine/perf";
import { onStep } from "../../engine/transport";
import { STEP_SIZE_QUARTERS, type Track } from "../../model/types";
import { startMidiLearn } from "../../midi/learn";
import { padInput } from "../../state/input";
import { useStore } from "../../state/store";

function flash(el: Element | null | undefined) {
  if (!el) return;
  el.classList.remove("trig");
  void (el as HTMLElement).offsetWidth;
  el.classList.add("trig");
}

function Box({
  title,
  children,
  className = "",
  right,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  right?: ReactNode;
}) {
  return (
    <section
      className={`flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-surface/40 p-2.5 ${className}`}
    >
      <div className="flex items-center gap-2">
        <span className="label">{title}</span>
        <span className="flex-1" />
        {right}
      </div>
      {children}
    </section>
  );
}

/** A button that is on while held (pointer or touch). */
function HoldButton({
  label,
  on,
  onChange,
  title,
  color,
  hint,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
  title?: string;
  color?: string;
  hint?: string;
}) {
  return (
    <button
      className="hw-btn !min-h-[44px] flex-1 touch-none"
      data-lit={on}
      style={on && color ? { color, borderColor: color } : undefined}
      title={title}
      data-hint={hint}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onChange(true);
      }}
      onPointerUp={() => onChange(false)}
      onPointerCancel={() => onChange(false)}
    >
      {label}
    </button>
  );
}

function Pads() {
  const tracks = useStore((s) => s.project.tracks);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      onStep((e) => {
        for (const id of e.triggered) flash(ref.current?.querySelector(`[data-perf-pad="${id}"]`));
      }),
    [],
  );
  const cells = Array.from({ length: 16 }, (_, i) => (3 - Math.floor(i / 4)) * 4 + (i % 4));
  return (
    <div ref={ref} className="grid aspect-square w-full max-w-[360px] grid-cols-4 gap-2">
      {cells.map((ti) => {
        const t = tracks[ti];
        if (!t || t.kind === "audio")
          return <div key={ti} className="rounded-lg border border-dashed border-line" />;
        return (
          <button
            key={t.id}
            data-perf-pad={t.id}
            className="perf-pad flex touch-none flex-col justify-end p-2 text-left"
            style={{ "--c": t.color } as CSSProperties}
            data-hint="perf.pad"
            onPointerDown={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const v = Math.min(1, Math.max(0.25, 1 - (e.clientY - r.top) / r.height + 0.3));
              engine.trigger(t, v, {
                stepDur: 0.12,
                notes:
                  t.kind === "instrument" ? [{ pitch: 48, length: 2, velocity: v }] : undefined,
              });
              padInput(t, v, t.kind === "instrument" ? [48] : undefined);
              flash(e.currentTarget);
            }}
          >
            <span
              className={`truncate text-[11px] font-bold uppercase ${t.mute ? "text-faint line-through" : "text-ink"}`}
            >
              {t.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PageLauncher() {
  const { project, playSlotId, queuedSlotId, playing, setUi } = useStore();
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1.5">
      {project.slots.map((slot, i) => {
        const p = project.patterns[slot.patternId];
        const isPlay = playing && slot.id === playSlotId;
        return (
          <button
            key={slot.id}
            className={`hw-btn !min-h-[48px] !items-start !px-2 ${slot.id === queuedSlotId ? "queued" : ""}`}
            data-lit={isPlay}
            style={{ borderLeft: `3px solid ${p.linkColor}` }}
            data-hint="perf.page"
            onClick={() => {
              setUi({ editSlotId: slot.id });
              if (playing && slot.id !== playSlotId) setUi({ queuedSlotId: slot.id });
              else if (!playing) setUi({ playSlotId: slot.id });
            }}
          >
            <span className="primary">
              {i + 1} {p.name}
            </span>
            <span className="secondary">{slot.repeats > 1 ? `×${slot.repeats}` : ""}</span>
          </button>
        );
      })}
    </div>
  );
}

function Mutes() {
  const tracks = useStore((s) => s.project.tracks);
  const perf = useStore((s) => s.project.perf);
  const commit = useStore((s) => s.commit);
  const queued = usePerf((s) => s.queuedMutes);
  const pending = usePerf((s) => s.pending);
  const groupMenu = (e: React.MouseEvent, gi: number) =>
    contextMenu(e, [
      ...tracks.map((t) => ({
        label: t.name,
        checked: perf.muteGroups[gi].tracks.includes(t.id),
        onSelect: () =>
          commit((p) => {
            const g = p.perf.muteGroups[gi];
            g.tracks = g.tracks.includes(t.id)
              ? g.tracks.filter((x) => x !== t.id)
              : [...g.tracks, t.id];
          }),
      })),
    ]);
  const sideMenu = (e: React.MouseEvent, t: Track) =>
    contextMenu(e, [
      ...(["A", "B", undefined] as const).map((side) => ({
        label: side ? `Crossfader side ${side}` : "Not on the crossfader",
        checked: perf.crossfade[t.id] === side,
        onSelect: () =>
          commit((p) => {
            if (side) p.perf.crossfade[t.id] = side;
            else delete p.perf.crossfade[t.id];
          }),
      })),
    ]);
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {tracks.map((t) => (
          <button
            key={t.id}
            className="hw-btn !min-h-[40px] min-w-[64px] flex-1"
            style={{
              borderBottom: `3px solid ${t.mute ? "var(--border)" : t.color}`,
              opacity: t.mute ? 0.55 : 1,
            }}
            data-lit={t.solo}
            data-hint="perf.mute"
            title="Click = mute · Shift+click = solo · right-click = crossfader side"
            onClick={(e) =>
              commit((p) => {
                const x = p.tracks.find((y) => y.id === t.id)!;
                if (e.shiftKey) x.solo = !x.solo;
                else x.mute = !x.mute;
              })
            }
            onContextMenu={(e) => sideMenu(e, t)}
          >
            <span className="primary truncate">{t.name}</span>
            <span className="secondary">
              {perf.crossfade[t.id] ? `XF ${perf.crossfade[t.id]}` : t.mute ? "muted" : ""}
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {perf.muteGroups.map((g, gi) => (
          <button
            key={gi}
            className={`hw-btn !min-h-[36px] flex-1 ${pending.includes(gi) ? "queued" : ""}`}
            title="Toggle the group · right-click to choose its tracks"
            data-hint="perf.muteGroup"
            onClick={() => toggleMuteGroup(gi)}
            onContextMenu={(e) => groupMenu(e, gi)}
          >
            <span className="primary">{g.name}</span>
            <span className="secondary">{g.tracks.length} tracks</span>
          </button>
        ))}
        <button
          className="tool-btn border border-line !text-[10.5px]"
          data-active={queued}
          onClick={() => usePerf.setState({ queuedMutes: !queued })}
          title="Mute changes wait for the next bar"
          data-hint="perf.queueBar"
        >
          Queue to bar
        </button>
      </div>
    </>
  );
}

function Platter() {
  const all = useStore((s) => s.project.tracks);
  const tracks = useMemo(() => all.filter((t) => t.kind === "audio" && t.sampleId), [all]);
  const [id, setId] = useState<string | null>(null);
  const track = tracks.find((t) => t.id === id) ?? tracks[0];
  if (!track)
    return (
      <div className="text-[11.5px] text-faint">
        Record or load a clip on an audio track to scratch it.
      </div>
    );
  return <PlatterFor key={track.id} track={track} tracks={tracks} onPick={setId} />;
}

function PlatterFor({
  track,
  tracks,
  onPick,
}: {
  track: Track;
  tracks: Track[];
  onPick: (id: string) => void;
}) {
  const [keep, setKeep] = useState(false);
  const [cut, setCut] = useState(false);
  // 33⅓ rpm = 200° per second is normal speed
  const s = useScratch(track, 200, keep);
  const svg = useRef<SVGSVGElement>(null);
  const rot = useRef<HTMLDivElement>(null);
  const angle = useRef(0);
  const lastA = useRef(0);

  // the label turns with playback when not touched
  useEffect(() => {
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      if (!s.active() && engine.clipPosition(track.id) !== null)
        angle.current += ((now - prev) / 1000) * 200;
      prev = now;
      if (rot.current) rot.current.style.transform = `rotate(${angle.current}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [track.id, s]);

  const angleAt = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return (
      (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) /
      Math.PI
    );
  };
  // unwrap angles so a full turn keeps counting
  const unwrap = (a: number) => {
    let d = a - lastA.current;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    lastA.current = a;
    angle.current += d;
    return angle.current;
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <select
        className="input !h-6 w-full !text-[11px]"
        value={track.id}
        onChange={(e) => onPick(e.target.value)}
        data-hint="perf.scratch.track"
      >
        {tracks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <div className="relative aspect-square w-full max-w-[240px]">
        <svg
          ref={svg}
          viewBox="0 0 100 100"
          className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            lastA.current = angleAt(e);
            s.begin(angle.current);
          }}
          onPointerMove={(e) => s.active() && s.move(unwrap(angleAt(e)))}
          onPointerUp={s.end}
          onPointerCancel={s.end}
          onContextMenu={(e) =>
            contextMenu(e, [
              {
                label: "MIDI learn: jog wheel",
                onSelect: () => startMidiLearn("perf:jog", "Jog wheel"),
              },
            ])
          }
          data-testid="platter"
          data-hint="perf.scratch.platter"
        >
          <circle cx={50} cy={50} r={49} fill="var(--display)" stroke="var(--border-strong)" />
          {[44, 38, 32, 26].map((r) => (
            <circle
              key={r}
              cx={50}
              cy={50}
              r={r}
              fill="none"
              stroke="var(--border)"
              strokeWidth={0.4}
            />
          ))}
        </svg>
        <div
          ref={rot}
          className="pointer-events-none absolute inset-[30%] rounded-full"
          style={{ background: track.color }}
        >
          <div className="absolute left-1/2 top-1 h-[30%] w-[6%] -translate-x-1/2 rounded bg-black/50" />
        </div>
      </div>
      <div className="flex w-full gap-1.5">
        <HoldButton
          label="Cut"
          on={cut}
          onChange={(v) => (setCut(v), s.cut(v))}
          title="Hold to cut the sound"
          hint="perf.scratch.cut"
        />
        <button
          className="hw-btn flex-1"
          data-lit={keep}
          onClick={() => setKeep(!keep)}
          title="Off: snap back to the beat on release · On: carry on from where you let go"
          data-hint="perf.scratch.sync"
        >
          {keep ? "Keep pos" : "Sync"}
        </button>
      </div>
    </div>
  );
}

function MasterFx() {
  const perf = usePerf();
  const bpm = useStore((s) => s.project.bpm);
  const pattern = useStore(
    (s) => s.project.patterns[s.project.slots.find((x) => x.id === s.playSlotId)?.patternId ?? ""],
  );
  const commit = useStore((s) => s.commit);
  const stepsFor = (q: number) =>
    Math.max(1, Math.round(q / STEP_SIZE_QUARTERS[pattern?.stepSize ?? "1/16"]));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Encoder
          def={{
            id: "filter",
            label: "Filter",
            bipolar: true,
            default: 0.5,
            format: (v) => (Math.abs(v - 0.5) < 0.01 ? "Open" : v < 0.5 ? "LP" : "HP"),
          }}
          value={perf.filter}
          onChange={setFilter}
          size={64}
          hint="perf.filter"
          midiTarget="perf:filter"
        />
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <div className="flex gap-1.5">
            {[
              ["1/4", 1],
              ["1/8", 0.5],
              ["1/16", 0.25],
              ["1/32", 0.125],
            ].map(([label, q]) => (
              <HoldButton
                key={label}
                label={`Rpt ${label}`}
                on={perf.repeat === stepsFor(q as number)}
                onChange={(on) => setRepeat(on ? stepsFor(q as number) : null)}
                title="Beat repeat while held"
                hint={`perf.rpt.${(label as string).replace("/", "_")}`}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            <HoldButton
              label="Throw verb"
              on={perf.throwA}
              onChange={(on) => setThrow("A", on)}
              hint="perf.throwVerb"
            />
            <HoldButton
              label="Throw delay"
              on={perf.throwB}
              onChange={(on) => setThrow("B", on)}
              hint="perf.throwDelay"
            />
            <button
              className="hw-btn !min-h-[44px] flex-1"
              data-lit={perf.tapeStopping}
              onClick={() => tapeStop()}
              title="Slow down to a stop"
              data-hint="perf.tapeStop"
            >
              Tape stop
            </button>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="label w-4">A</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.005}
          value={perf.crossfader}
          onChange={(e) => setCrossfader(Number(e.target.value))}
          onDoubleClick={() => setCrossfader(0.5)}
          className="flex-1 accent-[var(--accent)]"
          title="Crossfader (assign tracks with a right-click on their mute buttons)"
          data-testid="crossfader"
          data-hint="perf.crossfader"
        />
        <span className="label w-4">B</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button className="hw-btn flex-1" onClick={tapTempo} data-hint="perf.tap">
          Tap
        </button>
        <button
          className="hw-btn"
          data-hint="perf.bpmDown"
          onClick={() => commit((p) => void (p.bpm = Math.max(20, p.bpm - 1)), "bpm")}
        >
          −
        </button>
        <span className="num w-16 text-center text-[14px] text-lit">{bpm.toFixed(1)}</span>
        <button
          className="hw-btn"
          data-hint="perf.bpmUp"
          onClick={() => commit((p) => void (p.bpm = Math.min(300, p.bpm + 1)), "bpm")}
        >
          +
        </button>
      </div>
    </div>
  );
}

/** Everything for playing live: pads, pages, mutes, a platter, master FX and a crossfader. */
export function PerformancePanel() {
  return (
    <div
      className="scroll-thin grid h-full auto-rows-min grid-cols-1 items-start gap-2 overflow-auto p-2 @[720px]:grid-cols-2 @[1100px]:grid-cols-3"
      data-testid="performance"
    >
      <Box title="Pads">
        <Pads />
      </Box>
      <Box title="Pages" className="@[1100px]:col-span-2">
        <PageLauncher />
      </Box>
      <Box title="Mutes" className="@[720px]:col-span-2">
        <Mutes />
      </Box>
      <Box title="Scratch">
        <Platter />
      </Box>
      <Box title="Master FX" className="@[720px]:col-span-2 @[1100px]:col-span-1">
        <MasterFx />
      </Box>
    </div>
  );
}
