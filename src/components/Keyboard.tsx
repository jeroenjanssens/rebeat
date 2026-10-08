import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** The computer keyboard as a piano: the A row plays white keys, the row above the black ones. */
export const KEY_NOTES: Record<string, number> = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
  KeyK: 12,
  KeyO: 13,
  KeyL: 14,
};
const LETTERS = Object.fromEntries(
  Object.entries(KEY_NOTES).map(([code, semi]) => [semi, code.slice(3)]),
);

const BLACK = [1, 3, 6, 8, 10];
const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

/**
 * A playable piano keyboard: hold a key (mouse, touch, or the computer keys A–L while it has
 * focus) and the note sounds until you let go. Higher on a key is softer, lower louder.
 */
export function Keyboard({
  low,
  octaves = 2,
  onOctave,
  play,
  scope,
}: {
  /** The lowest note (a C). */
  low: number;
  octaves?: number;
  onOctave: (delta: number) => void;
  /** Start a note; returns how to release it. */
  play: (pitch: number, velocity: number) => () => void;
  /** Where typing plays the keyboard (default: the keyboard itself). */
  scope?: React.RefObject<HTMLElement | null>;
}) {
  const [down, setDown] = useState<Set<number>>(new Set());
  const releases = useRef(new Map<string, () => void>());
  const root = useRef<HTMLDivElement>(null);

  const press = (key: string, pitch: number, velocity: number) => {
    if (releases.current.has(key)) return;
    releases.current.set(key, play(pitch, velocity));
    setDown((d) => new Set(d).add(pitch));
  };
  const lift = (key: string, pitch: number) => {
    releases.current.get(key)?.();
    releases.current.delete(key);
    setDown((d) => {
      const n = new Set(d);
      n.delete(pitch);
      return n;
    });
  };

  // let go of everything when unmounted (or the octave changes under a held key)
  useEffect(() => {
    const map = releases.current;
    return () => {
      for (const r of map.values()) r();
      map.clear();
    };
  }, []);

  const onKey = (e: KeyboardEvent, isDown: boolean) => {
    if ((e.target as HTMLElement).closest("input, select")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isDown && (e.code === "KeyZ" || e.code === "KeyX")) {
      onOctave(e.code === "KeyX" ? 1 : -1);
    } else if (KEY_NOTES[e.code] !== undefined) {
      const pitch = low + 12 + KEY_NOTES[e.code];
      if (isDown) {
        if (!e.repeat) press(e.code, pitch, 0.8);
      } else lift(e.code, pitch);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  // typing anywhere in the scope plays it
  const onKeyRef = useRef(onKey);
  useLayoutEffect(() => {
    onKeyRef.current = onKey;
  });
  useEffect(() => {
    const el = scope?.current ?? root.current;
    if (!el) return;
    const dn = (e: KeyboardEvent) => onKeyRef.current(e, true);
    const up = (e: KeyboardEvent) => onKeyRef.current(e, false);
    el.addEventListener("keydown", dn);
    el.addEventListener("keyup", up);
    return () => {
      el.removeEventListener("keydown", dn);
      el.removeEventListener("keyup", up);
    };
  }, [scope]);

  const notes = Array.from({ length: octaves * 12 + 1 }, (_, i) => low + i);
  const whites = notes.filter((n) => !BLACK.includes(n % 12));
  const w = 100 / whites.length;
  const key = (n: number) => {
    const black = BLACK.includes(n % 12);
    const x = whites.filter((x) => x < n).length * w;
    const letter = n - low - 12 >= 0 ? LETTERS[n - low - 12] : undefined;
    const pointer = `p${n}`;
    return (
      <div
        key={n}
        data-key={n}
        className={`absolute touch-none select-none rounded-b-[3px] border border-black/40 ${black ? "z-[1] h-[60%] bg-[#1c1c1f]" : "h-full bg-[#f4f4f5]"}`}
        style={{
          left: black ? `calc(${x}% - ${w * 0.32}%)` : `${x}%`,
          width: black ? `${w * 0.64}%` : `${w}%`,
          background: down.has(n) ? "var(--accent)" : undefined,
        }}
        onPointerDown={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          const r = e.currentTarget.getBoundingClientRect();
          const velocity = Math.min(1, Math.max(0.15, (e.clientY - r.top) / r.height));
          press(pointer, n, velocity);
        }}
        onPointerEnter={(e) => e.buttons === 1 && press(pointer, n, 0.7)}
        onPointerUp={() => lift(pointer, n)}
        onPointerLeave={() => lift(pointer, n)}
        title={`${NAMES[n % 12]}${Math.floor(n / 12) - 1}${letter ? ` (${letter})` : ""}`}
      >
        {letter && (
          <span
            className={`absolute bottom-1 left-0 right-0 text-center text-[9px] ${black ? "text-white/50" : "text-black/40"}`}
          >
            {letter}
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      ref={root}
      tabIndex={0}
      className="flex items-stretch gap-1.5 outline-none"
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        for (const [k, r] of releases.current) {
          r();
          releases.current.delete(k);
        }
        setDown(new Set());
      }}
      data-testid="keyboard"
      data-hint="synth.keyboard"
    >
      <div className="flex flex-col justify-center gap-1">
        <button
          className="tool-btn !h-6 !w-6 !p-0"
          onClick={() => onOctave(1)}
          title="Octave up (X)"
        >
          +
        </button>
        <span className="num text-center text-[9.5px] text-faint">C{Math.floor(low / 12) - 1}</span>
        <button
          className="tool-btn !h-6 !w-6 !p-0"
          onClick={() => onOctave(-1)}
          title="Octave down (Z)"
        >
          −
        </button>
      </div>
      <div className="relative h-full min-h-[56px] flex-1">{notes.map(key)}</div>
    </div>
  );
}
