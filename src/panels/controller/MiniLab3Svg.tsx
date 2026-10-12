/**
 * Top-down SVG of the Arturia MiniLab 3.
 *
 * Coordinates are the pixels of Arturia's top-down product photo (968 × 968, the white MiniLab 3:
 * saintmaxmusic.fr/app/uploads/2022/11/produit-arturia-minilab3-wh.jpg), measured on it; the
 * viewBox is the body within it (x 8–962, y 190–778), so the photo laid under the drawing lines
 * up with it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { onControllerEvent, type ControllerEvent } from "../../midi/controllerEvents";
import { useDisplay } from "../../midi/display";
import { SHIFT_PAD_COLORS } from "../../midi/padColors";
import { inKey, noteName, type Key } from "../../model/notes";
import { CHORD_PADS } from "../../model/padChords";
import { onFrame } from "../../render/raf";
import { audioNow } from "../../engine/engine";
import { onKeysLight } from "../../state/keys";

// ── Layout (photo pixels) ──────────────────────────────────────────────────

const VB_X = 8;
const VB_Y = 190;
const W = 954;
const H = 588;
const BODY_R = 22;

// Body colors: the device always looks like itself, whatever the theme
const BODY_FILL = "#e9e9eb";
const BODY_STROKE = "#c4c4c8";
const PANEL_FILL = "#141416"; // the black panel (screen + encoder)
const BTN_DARK_FILL = "#1e1e22"; // Shift's face
const SHIFT_BEZEL = "#8c8c92";
const BTN_WHITE_FILL = "#f7f7f5"; // Hold / Oct faces
const BTN_WHITE_TEXT = "#26262a";
const BTN_DARK_TEXT = "#e8e8ec";
const BTN_EDGE = "#b8b8bd";
const STRIP_FILL = "#e2e2e5";
const STRIP_STROKE = "#cdcdd1";
const KNOB_BASE = "#d4d4d8"; // the knob's skirt, around the cap
const KNOB_CAP = "#fafafa";
const KNOB_CAP_EDGE = "#c9c9ce";
const ENC_BASE = "#26262a";
const ENC_CAP = "#3a3a40";
const FADER_SLOT = "#141416";
const FADER_CAP_FILL = "#f4f4f2";
const FADER_CAP_LINE = "#141416";
const KEY_BED = "#38383c";
const KEY_LIP = "#d9d9dc";
const WHITE_KEY = "#fbfbfb";
const BLACK_KEY = "#1a1a1d";
const KEY_STROKE = "#c4c4c8";
const TEXT_DIM = "#8a8a92";
const TEXT_PRINT = "#3a3a40"; // the printed numbers
const TEXT_BRAND = "#1c1c20";
const PAD_FACE = "#1d1c23";
const PAD_UNLIT = "#55555c";
const OLED_TEXT = "#f2f2f2";

// ── Left column: Shift, Hold, Oct, the touch strips ───────────────────────
const SHIFT = { x: 76.5, y: 233, w: 41, h: 24 };
const HOLD = { x: 136, y: 232, w: 41, h: 26 };
const OCTM = { x: 77, y: 276, w: 41, h: 25 };
const OCTP = { x: 136, y: 276, w: 41, h: 25 };
const STRIP_LX = 73;
const STRIP_RX = 139;
const STRIP_Y = 321;
const STRIP_W = 43;
const STRIP_H = 144;

// ── Black panel, screen, main encoder ─────────────────────────────────────
const PANEL = { x: 203, y: 203, w: 103, h: 182 };
const OLED = { x: 214, y: 232, w: 82, h: 36 };
const ENC_X = 253;
const ENC_Y = 342;
const ENC_R = 21;

// ── Knobs (2 rows of 4) ───────────────────────────────────────────────────
const KNOB_CXS = [341, 428, 517, 605];
const KNOB_CYS = [249, 337];
const KNOB_R = 21; // the skirt
const KNOB_CAP_R = 17.5; // the heptagon cap
const KNOB_NUM_DY = 40; // the printed number, below the center
/** Degrees a relative knob's drawing turns per step it sends. */
const DEG_PER_STEP = 12;

// ── Faders (4) ────────────────────────────────────────────────────────────
const FADER_CXS = [692, 751, 809, 867];
const FADER_SLOT_Y = 243;
const FADER_SLOT_H = 104;
const FADER_SLOT_W = 7;
const FADER_CAP_W = 46;
const FADER_CAP_H = 22;
/** The cap's top at the fader's top (1) and how far it travels down to 0. */
const FADER_TOP = 238;
const FADER_TRAVEL = 92;
const FADER_LABEL_Y = 376;

// ── Pads (8 in a row) ──────────────────────────────────────────────────────
const PAD_X0 = 222;
const PAD_STEP = 87.6;
const PAD_Y = 400;
const PAD_SIZE = 66;
const PAD_INSET = 5;
/** What's printed on the pads: their Shift functions (Arp, Pad, Prog, loop, stop, play, rec, tap). */
const PAD_LABELS = ["Arp", "Pad", "Prog", "⇄", "■", "▶", "●", "Tap"] as const;

/**
 * A key the keys play for you (a chord's other notes, D137): lit in a secondary color, a paler
 * accent, next to the full accent of the keys you press.
 */
const generatedFill = (white: boolean) =>
  `color-mix(in oklab, var(--accent) 38%, ${white ? WHITE_KEY : BLACK_KEY})`;

// ── Text row ───────────────────────────────────────────────────────────────
const TEXT_ROW_Y = 503;
const MIDI_CH_X0 = 247.5;
const MIDI_CH_STEP = 33;

// ── Keys ──────────────────────────────────────────────────────────────────
const KEYS_X = 63;
const KEYS_Y = 512;
const KEYS_W = 848;
const KEYS_H = 238;
const KEY_COUNT = 25;
const KEY_WHITES = 15;
const WHITE_W = KEYS_W / KEY_WHITES; // 56.5
const BLACK_W = 28 / WHITE_W; // in white keys
const BLACK_KEY_H = 150;
/**
 * Where a black key sits on the line between its white keys, in white keys (+ is right): as on a
 * piano, C♯ and F♯ lean left, D♯ and A♯ right, G♯ is in the middle. Measured on the photo.
 */
const BLACK_OFFSET: Record<number, number> = { 1: -0.1, 3: 0.09, 6: -0.16, 8: 0, 10: 0.14 };

// 25 keys starting at C2 (MIDI 36)
const FIRST_KEY = 36;
const KEY_PATTERN = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0]; // 0=white, 1=black per semitone
type KeyLayout = { midi: number; white: boolean; x: number; w: number };

function buildKeys(): KeyLayout[] {
  const keys: KeyLayout[] = [];
  let wx = 0;
  for (let i = 0; i < KEY_COUNT; i++) {
    const semitone = (FIRST_KEY + i) % 12;
    const white = KEY_PATTERN[semitone] === 0;
    if (white) {
      keys.push({ midi: FIRST_KEY + i, white: true, x: wx, w: 1 });
      wx += 1;
    } else {
      const center = wx + BLACK_OFFSET[semitone];
      keys.push({ midi: FIRST_KEY + i, white: false, x: center - BLACK_W / 2, w: BLACK_W });
    }
  }
  return keys;
}

const KEY_LAYOUT = buildKeys();

/** The size of the note names on the white keys (drawing units); the equation matches it. */
const KEY_LABEL_SIZE = 18;

/** The points of a regular heptagon of radius r around 0,0, a corner on top. */
const heptagon = (r: number) =>
  Array.from({ length: 7 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 7;
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");

const NO_SELECT = { userSelect: "none", pointerEvents: "none" } as const;

/** What the knobs do in Chord and Key mode, in a line (the hover card says more). */
const KEYS_KNOB_TIPS = [
  "the chord's inversion: right is higher, left lower",
  "everything up or down a semitone a step",
  "the chord's notes one after another: right is a slower strum",
  "the notes held one at a time: right is faster",
  "the root an octave deeper per step to the left",
  "random timing and loudness: right is looser",
  "the chord on a rhythm: right steps through the patterns",
  "the middle notes softer: right brings out the bass and the top",
];

// ── Live state ────────────────────────────────────────────────────────────

interface LiveState {
  keyVel: Uint8Array; // 128
  padVel: Uint8Array; // 16
  /** The knobs' turn in degrees (an absolute knob: its position; a relative one: its steps). */
  knobAngle: Float32Array; // 8
  faderPos: Float32Array; // 4  (0..1)
  stripPos: Float32Array; // 2  (0..1)
  /**
   * Which faders (0–3) the device has sent: MIDI can't ask a controller where its controls are,
   * so until one moves it's drawn faint, at the value it controls.
   */
  seen: Uint8Array;
  encoderAngle: number;
  shift: number;
  /** How many of the keys' notes sound on each pitch (D156), and light changes still to come
   * (at their audio times). */
  audible: Map<number, number>;
  lightQueue: { pitch: number | null; on: boolean; at: number }[];
  dirty: boolean;
}

function makeLiveState(): LiveState {
  return {
    keyVel: new Uint8Array(128),
    padVel: new Uint8Array(16),
    knobAngle: new Float32Array(8),
    faderPos: new Float32Array(4).fill(0.5),
    // the pitch strip springs back to the middle; the mod strip starts at 0
    stripPos: new Float32Array([0.5, 0]),
    seen: new Uint8Array(4),
    encoderAngle: 0,
    shift: 12, // MiniLab's keys start at C3 (MIDI 48) at octave 0
    audible: new Map(),
    lightQueue: [],
    dirty: true,
  };
}

// ── Component types ───────────────────────────────────────────────────────

interface KnobLabel {
  name: string;
  value: string;
  /** Where what it controls is (0..1): drawn until the device sends where it is. */
  pos?: number;
}

interface ControlLabels {
  knobs: KnobLabel[];
  faders: KnobLabel[];
  encoder: string;
}

interface MiniLab3SvgProps {
  labels: ControlLabels;
  onKeyDown?: (midi: number, velocity: number) => () => void;
  onPadDown?: (index: number) => () => void;
  /** What the pads do: tracks (Drum), the chord pads (Chord, D137) or Key mode's pads (D138). */
  padMode?: "drum" | "chord" | "key";
  /** The pads' colors (D144): the tracks' in Drum mode, blue and purple for the chord pads. */
  padColors?: readonly (string | null)[];
  /** Key mode's key: the keys in it get a dot (the root a bigger one), D138. */
  scaleKey?: Key | null;
  /** The size the note names on the keys are drawn at, in CSS pixels, when it changes. */
  onLabelPx?: (px: number) => void;
  /** Latch is on (D151): the Hold button is drawn lit. */
  holdLit?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────

export function MiniLab3Svg({
  labels,
  onKeyDown,
  onPadDown,
  padMode = "drum",
  padColors = [],
  scaleKey = null,
  onLabelPx,
  holdLit = false,
}: MiniLab3SvgProps) {
  const chordPads = padMode !== "drum";
  // Shift held on the device: the pads show their second functions in the MiniLab's colors
  const [shiftHeld, setShiftHeld] = useState(false);
  const colors = shiftHeld ? SHIFT_PAD_COLORS : padColors;
  const colorsRef = useRef(colors);
  const svgRef = useRef<SVGSVGElement>(null);
  const liveRef = useRef<LiveState>(makeLiveState());
  // the labels (and the values they control) for the frame loop, which runs outside React
  const labelsRef = useRef(labels);
  const scaleKeyRef = useRef(scaleKey);
  useEffect(() => {
    labelsRef.current = labels;
    scaleKeyRef.current = scaleKey;
    colorsRef.current = colors;
    liveRef.current.dirty = true;
  });

  // the note names' size on screen (the drawing scales with the panel), for the equation
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !onLabelPx) return;
    const measure = () => {
      const r = svg.getBoundingClientRect();
      if (r.width > 0) onLabelPx(KEY_LABEL_SIZE * Math.min(r.width / W, r.height / H));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [onLabelPx]);
  const heldKeys = useRef<Map<number, () => void>>(new Map());
  const heldPads = useRef<Map<number, () => void>>(new Map());

  // A knob or the encoder being turned lights up in the accent for a moment, as keys do
  const flashTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const flash = useCallback((selector: string) => {
    const el = svgRef.current?.querySelector<SVGElement>(selector);
    if (!el) return;
    el.dataset.turning = "true";
    const timers = flashTimers.current;
    clearTimeout(timers.get(selector));
    timers.set(
      selector,
      setTimeout(() => delete el.dataset.turning, 260),
    );
  }, []);
  useEffect(() => {
    const timers = flashTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  // What the keys play, as it sounds (D156): a strum's notes one by one, an arpeggio's steps
  useEffect(() => {
    const live = liveRef.current;
    return onKeysLight((pitch, on, at) => {
      live.lightQueue.push({ pitch, on, at });
      live.dirty = true;
    });
  }, []);

  // Subscribe to controller events
  useEffect(() => {
    const live = liveRef.current;
    return onControllerEvent((e: ControllerEvent) => {
      const { kind, index, slot } = e.control;
      switch (kind) {
        case "key":
          if (index - live.shift < FIRST_KEY || index - live.shift >= FIRST_KEY + KEY_COUNT) {
            live.shift = 12 * Math.floor((index - FIRST_KEY) / 12);
            live.keyVel.fill(0);
          }
          live.keyVel[index - live.shift] = e.down ? e.value : 0;
          break;
        case "pad":
          live.padVel[index % 8] = e.down ? e.value : 0;
          break;
        case "knob":
          if (index >= 0 && index < 8) {
            // a relative knob turns by its steps; an absolute one points at its value
            live.knobAngle[index] =
              e.turn !== undefined
                ? live.knobAngle[index] + e.turn * DEG_PER_STEP
                : -135 + (e.targetValue ?? e.value / 127) * 270;
            flash(`[data-knob-cap="${index}"]`);
          }
          break;
        case "fader":
          if (index >= 0 && index < 4) {
            live.faderPos[index] = e.targetValue ?? e.value / 127;
            live.seen[index] = 1;
          }
          break;
        case "encoder":
          live.encoderAngle += (e.turn ?? e.value - 64) * DEG_PER_STEP;
          flash("[data-enc-cap]");
          break;
        case "strip":
          if (index >= 0 && index < 2) live.stripPos[index] = e.value / 127;
          break;
        case "button":
          if (slot === "shift") setShiftHeld(!!e.down);
          // Shift + pads 4–8 (CC 105–109 in DAW mode): light the pad as it's pressed
          else if (slot?.startsWith("shift-pad")) live.padVel[index] = e.down ? 100 : 0;
          break;
      }
      live.dirty = true;
    });
  }, [flash]);

  // Flush dirty state to DOM per frame
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    return onFrame(() => {
      const live = liveRef.current;
      if (!live.dirty) return;
      live.dirty = false;

      // the notes that started or stopped sounding by now (later ones wait for their time)
      if (live.lightQueue.length) {
        const now = audioNow();
        const due = live.lightQueue.filter((e) => e.at <= now + 0.004).sort((a, b) => a.at - b.at);
        live.lightQueue = live.lightQueue.filter((e) => e.at > now + 0.004);
        for (const e of due) {
          if (e.pitch === null) live.audible.clear();
          else {
            const n = (live.audible.get(e.pitch) ?? 0) + (e.on ? 1 : -1);
            if (n > 0) live.audible.set(e.pitch, n);
            else live.audible.delete(e.pitch);
          }
        }
        if (live.lightQueue.length) live.dirty = true; // keep looking until they're all due
      }

      // Keys: a key you hold that sounds in the accent, a note the keys add (a chord's, an
      // arpeggio's, a pattern's) in a paler accent while it sounds, a key you hold that doesn't
      // sound right now (its turn in a strum, between arp steps) faintly
      for (let i = 0; i < KEY_LAYOUT.length; i++) {
        const k = KEY_LAYOUT[i];
        const vel = live.keyVel[k.midi];
        const sounding = live.audible.has(k.midi + live.shift);
        const added = vel === 0 && sounding;
        const el = svg.querySelector<SVGElement>(`[data-key="${k.midi}"]`);
        if (el) {
          const under = k.white ? WHITE_KEY : BLACK_KEY;
          el.style.fill =
            vel > 0 && sounding
              ? `color-mix(in oklab, var(--accent) ${Math.round(40 + (vel / 127) * 60)}%, ${under})`
              : vel > 0
                ? `color-mix(in oklab, var(--accent) 18%, ${under})`
                : added
                  ? generatedFill(k.white)
                  : "";
          if (added) el.dataset.generated = "true";
          else delete el.dataset.generated;
          if (sounding) el.dataset.sounding = "true";
          else delete el.dataset.sounding;
        }
        // while a key sounds or is held: the note it plays (the device's octave included)
        const label = svg.querySelector<SVGTextElement>(`[data-key-note="${k.midi}"]`);
        if (label) label.textContent = vel > 0 || sounding ? noteName(k.midi + live.shift) : "";
        // Key mode: a dot on the keys in its key, a bigger one on the root
        const dot = svg.querySelector<SVGCircleElement>(`[data-key-dot="${k.midi}"]`);
        if (dot) {
          const key = scaleKeyRef.current;
          const note = k.midi + live.shift;
          const on = !!key && inKey(note, key);
          const root = on && (((note - key.root) % 12) + 12) % 12 === 0;
          dot.style.display = on ? "" : "none";
          dot.setAttribute("r", root ? "7" : "4.5");
          if (on) dot.dataset.inKey = root ? "root" : "true";
          else delete dot.dataset.inKey;
        }
      }

      // Pads: the face lights up in the pad's color on a hit, brighter the harder
      for (let i = 0; i < 8; i++) {
        const vel = live.padVel[i];
        const color = colorsRef.current[i] ?? PAD_UNLIT;
        const el = svg.querySelector<SVGElement>(`[data-pad="${i}"]`);
        if (el)
          el.style.fill =
            vel > 0
              ? `color-mix(in oklab, ${color} ${Math.round(45 + (vel / 127) * 50)}%, ${PAD_FACE})`
              : "";
        // its label turns white on the lit face, so it stays readable
        const text = svg.querySelector<SVGElement>(`[data-pad-label="${i}"]`);
        if (text) text.style.fill = vel > 0 ? "#ffffff" : "";
      }

      // Knob caps: the heptagon turns with the knob
      for (let i = 0; i < 8; i++) {
        const el = svg.querySelector<SVGElement>(`[data-knob-cap="${i}"]`);
        if (el) el.setAttribute("transform", `rotate(${live.knobAngle[i].toFixed(1)})`);
      }

      // Fader caps (faint, at the value they control, until the device sends one)
      const labels = labelsRef.current;
      for (let i = 0; i < 4; i++) {
        const seen = live.seen[i] === 1;
        const pos = seen ? live.faderPos[i] : (labels.faders[i]?.pos ?? 0.5);
        const y = FADER_TOP + FADER_TRAVEL * (1 - pos);
        const cap = svg.querySelector<SVGElement>(`[data-fader-thumb="${i}"]`);
        if (cap) {
          cap.setAttribute("transform", `translate(0,${y.toFixed(1)})`);
          cap.style.opacity = seen ? "1" : "0.45";
        }
      }

      const enc = svg.querySelector<SVGElement>("[data-enc-cap]");
      if (enc) enc.setAttribute("transform", `rotate(${live.encoderAngle.toFixed(1)})`);

      // Strip fills
      for (let i = 0; i < 2; i++) {
        const pos = live.stripPos[i];
        const el = svg.querySelector<SVGElement>(`[data-strip-fill="${i}"]`);
        if (el) {
          const h = (STRIP_H - 6) * pos;
          el.setAttribute("y", (STRIP_Y + STRIP_H - 3 - h).toFixed(1));
          el.setAttribute("height", h.toFixed(1));
        }
      }
    });
  }, []);

  // Key interaction: a press plays a key, and dragging with the button down plays every key the
  // pointer moves onto (a glissando), as the synth editor's keyboard does
  const handleKeyPointerDown = useCallback(
    (midi: number, e: React.PointerEvent<SVGElement>) => {
      if (!onKeyDown || heldKeys.current.has(midi)) return;
      // touch captures the pointer on the first key; let go so the others get it too
      e.currentTarget.releasePointerCapture(e.pointerId);
      const release = onKeyDown(midi + liveRef.current.shift, 100);
      heldKeys.current.set(midi, release);
      liveRef.current.keyVel[midi] = 100;
      liveRef.current.dirty = true;
    },
    [onKeyDown],
  );

  const handleKeyPointerUp = useCallback((midi: number) => {
    heldKeys.current.get(midi)?.();
    heldKeys.current.delete(midi);
    liveRef.current.keyVel[midi] = 0;
    liveRef.current.dirty = true;
  }, []);

  // Pad interaction
  const handlePadPointerDown = useCallback(
    (index: number, e: React.PointerEvent<SVGElement>) => {
      if (!onPadDown) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const release = onPadDown(index);
      heldPads.current.set(index, release);
      liveRef.current.padVel[index] = 100;
      liveRef.current.dirty = true;
    },
    [onPadDown],
  );

  const handlePadPointerUp = useCallback((index: number) => {
    heldPads.current.get(index)?.();
    heldPads.current.delete(index);
    liveRef.current.padVel[index] = 0;
    liveRef.current.dirty = true;
  }, []);

  const whiteKeys = KEY_LAYOUT.filter((k) => k.white);
  const blackKeys = KEY_LAYOUT.filter((k) => !k.white);

  const whiteButton = (
    b: { x: number; y: number; w: number; h: number },
    label: string,
    lit = false,
  ) => (
    <>
      <rect
        x={b.x}
        y={b.y}
        width={b.w}
        height={b.h}
        rx={4}
        fill={lit ? "color-mix(in oklab, var(--accent) 45%, white)" : BTN_WHITE_FILL}
        stroke={BTN_EDGE}
        strokeWidth="1"
      />
      <text
        x={b.x + b.w / 2}
        y={b.y + b.h / 2 + 3.2}
        textAnchor="middle"
        fontSize="9"
        fontWeight="600"
        fill={BTN_WHITE_TEXT}
        style={NO_SELECT}
      >
        {label}
      </text>
    </>
  );

  return (
    <svg
      ref={svgRef}
      viewBox={`${VB_X} ${VB_Y} ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "100%", display: "block" }}
      aria-label="MiniLab 3 controller"
    >
      <defs>
        <filter id="ml3-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
        <clipPath id="ml3-oled">
          <rect x={OLED.x} y={OLED.y} width={OLED.w} height={OLED.h} />
        </clipPath>
        <style>{`
          [data-knob-cap], [data-enc-cap] { transition: fill 0.25s ease-out; }
          [data-knob-cap][data-turning], [data-enc-cap][data-turning] {
            fill: var(--accent); transition: none;
          }
        `}</style>
      </defs>
      {/* ── Body ──────────────────────────────────────────────────────── */}
      <rect
        x={VB_X}
        y={VB_Y}
        width={W}
        height={H}
        rx={BODY_R}
        fill={BODY_FILL}
        stroke={BODY_STROKE}
        strokeWidth="1.5"
      />

      {/* ── Left column: Shift, Hold, Oct ──────────────────────────────── */}

      {/* Shift: a dark face with white text, in a grey bezel; lit while held */}
      <g data-hint="controller.btn.0" data-testid="ml3-shift" data-held={shiftHeld || undefined}>
        <title>Shift: hold for the pads' second functions</title>
        <rect
          x={SHIFT.x - 4.5}
          y={SHIFT.y - 4}
          width={SHIFT.w + 9}
          height={SHIFT.h + 8}
          rx={3}
          fill={SHIFT_BEZEL}
        />
        <rect
          x={SHIFT.x}
          y={SHIFT.y}
          width={SHIFT.w}
          height={SHIFT.h}
          rx={3}
          fill={shiftHeld ? "var(--accent)" : BTN_DARK_FILL}
          stroke="#f4f4f4"
          strokeWidth="1.5"
        />
        <text
          x={SHIFT.x + SHIFT.w / 2}
          y={SHIFT.y + SHIFT.h / 2 + 3.2}
          textAnchor="middle"
          fontSize="9"
          fontWeight="600"
          fill={BTN_DARK_TEXT}
          style={NO_SELECT}
        >
          Shift
        </text>
      </g>

      <g data-hint="controller.btn.1" data-testid="ml3-hold" data-lit={holdLit || undefined}>
        <title>Hold (lit: Latch is on)</title>
        {whiteButton(HOLD, "Hold", holdLit)}
        <text
          x={HOLD.x + HOLD.w / 2}
          y={HOLD.y + HOLD.h + 12}
          textAnchor="middle"
          fontSize="8.5"
          fill={TEXT_DIM}
          style={NO_SELECT}
        >
          Chord
        </text>
      </g>

      <g data-hint="controller.btn.2">
        <title>Octave −</title>
        {whiteButton(OCTM, "Oct −")}
      </g>

      <g data-hint="controller.btn.3">
        <title>Octave +</title>
        {whiteButton(OCTP, "Oct +")}
      </g>

      {/* "← Transpose →" under the Oct buttons */}
      <text x={95} y={314} textAnchor="middle" fontSize="9" fill={TEXT_DIM} style={NO_SELECT}>
        ←
      </text>
      <text x={127} y={314} textAnchor="middle" fontSize="8" fill={TEXT_DIM} style={NO_SELECT}>
        Transpose
      </text>
      <text x={158} y={314} textAnchor="middle" fontSize="9" fill={TEXT_DIM} style={NO_SELECT}>
        →
      </text>

      {/* ── Touch strips ─────────────────────────────────────────────────── */}

      <g data-hint="controller.strip.0">
        <title>Pitch strip</title>
        <rect
          x={STRIP_LX}
          y={STRIP_Y}
          width={STRIP_W}
          height={STRIP_H}
          rx={4}
          fill={STRIP_FILL}
          stroke={STRIP_STROKE}
          strokeWidth="1.2"
        />
        <rect
          data-strip-fill={0}
          x={STRIP_LX + 3}
          y={STRIP_Y + STRIP_H / 2}
          width={STRIP_W - 6}
          height={0}
          rx={3}
          fill="var(--accent)"
          opacity="0.5"
          style={{ pointerEvents: "none" }}
        />
        <text
          x={STRIP_LX + STRIP_W / 2}
          y={STRIP_Y + 18}
          textAnchor="middle"
          fontSize="12"
          fontWeight="700"
          fill={TEXT_BRAND}
          style={NO_SELECT}
        >
          ↑
        </text>
        <line
          x1={STRIP_LX + 13}
          y1={STRIP_Y + STRIP_H / 2 - 1}
          x2={STRIP_LX + STRIP_W - 13}
          y2={STRIP_Y + STRIP_H / 2 - 1}
          stroke={TEXT_BRAND}
          strokeWidth="1.3"
        />
        <text
          x={STRIP_LX + STRIP_W / 2}
          y={STRIP_Y + STRIP_H - 7}
          textAnchor="middle"
          fontSize="12"
          fontWeight="700"
          fill={TEXT_BRAND}
          style={NO_SELECT}
        >
          ↓
        </text>
      </g>

      <g data-hint="controller.strip.1">
        <title>Mod strip</title>
        <rect
          x={STRIP_RX}
          y={STRIP_Y}
          width={STRIP_W - 1}
          height={STRIP_H}
          rx={4}
          fill={STRIP_FILL}
          stroke={STRIP_STROKE}
          strokeWidth="1.2"
        />
        <rect
          data-strip-fill={1}
          x={STRIP_RX + 3}
          y={STRIP_Y + STRIP_H}
          width={STRIP_W - 7}
          height={0}
          rx={3}
          fill="var(--accent)"
          opacity="0.5"
          style={{ pointerEvents: "none" }}
        />
        {/* ↑ standing on a bar, near the bottom (mod goes up from rest) */}
        <text
          x={STRIP_RX + STRIP_W / 2 - 0.5}
          y={STRIP_Y + STRIP_H - 13}
          textAnchor="middle"
          fontSize="12"
          fontWeight="700"
          fill={TEXT_BRAND}
          style={NO_SELECT}
        >
          ↑
        </text>
        <line
          x1={STRIP_RX + 11}
          y1={STRIP_Y + STRIP_H - 9}
          x2={STRIP_RX + STRIP_W - 12}
          y2={STRIP_Y + STRIP_H - 9}
          stroke={TEXT_BRAND}
          strokeWidth="1.3"
        />
      </g>

      {/* ── Black panel (screen + encoder) ──────────────────────────────── */}
      <rect
        x={PANEL.x}
        y={PANEL.y}
        width={PANEL.w}
        height={PANEL.h}
        rx={4}
        fill={PANEL_FILL}
        stroke="#f4f4f4"
        strokeWidth="1.5"
      />

      <g data-hint="controller.screen">
        <rect x={OLED.x} y={OLED.y} width={OLED.w} height={OLED.h} rx={2} fill="#09090b" />
        <ScreenText />
      </g>

      {/* Main encoder: a dark heptagon cap that turns */}
      <g data-hint="controller.encoder">
        <title>{labels.encoder}</title>
        <circle cx={ENC_X} cy={ENC_Y} r={ENC_R} fill={ENC_BASE} />
        <g transform={`translate(${ENC_X},${ENC_Y})`}>
          <polygon
            data-enc-cap
            points={heptagon(ENC_R - 3)}
            fill={ENC_CAP}
            stroke="#4a4a52"
            strokeWidth="1"
          />
        </g>
        <text
          x={ENC_X}
          y={PANEL.y + PANEL.h - 7}
          textAnchor="middle"
          fontSize="7.5"
          fill={TEXT_DIM}
          style={NO_SELECT}
        >
          {labels.encoder}
        </text>
      </g>

      {/* ── Knobs (2 × 4): white heptagon caps that turn ───────────────── */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const cx = KNOB_CXS[i % 4];
        const cy = KNOB_CYS[Math.floor(i / 4)];
        const label = labels.knobs[i];
        return (
          <g key={i} data-hint={chordPads ? `controller.keysknob.${i}` : `controller.knob.${i}`}>
            <title>
              {label?.name ?? `Knob ${i + 1}`}: {label?.value ?? ""}
              {chordPads ? ` — ${KEYS_KNOB_TIPS[i]}` : ""}
            </title>
            <circle cx={cx} cy={cy} r={KNOB_R} fill={KNOB_BASE} />
            <g transform={`translate(${cx},${cy})`}>
              <polygon
                data-knob-cap={i}
                points={heptagon(KNOB_CAP_R)}
                fill={KNOB_CAP}
                stroke={KNOB_CAP_EDGE}
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </g>
            <text
              x={cx}
              y={cy + KNOB_NUM_DY}
              textAnchor="middle"
              fontSize="9"
              fontWeight="600"
              fill={TEXT_PRINT}
              style={NO_SELECT}
            >
              {i + 1}
            </text>
            {label?.name && (
              <text
                x={cx}
                y={cy + KNOB_NUM_DY + 11}
                textAnchor="middle"
                fontSize="8"
                fill="var(--accent)"
                style={NO_SELECT}
              >
                {label.name}
              </text>
            )}
          </g>
        );
      })}

      {/* ── Pads (8 in a row) ─────────────────────────────────────────────── */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const px = PAD_X0 + i * PAD_STEP;
        const lit = colors[i] ?? null;
        const color = lit ?? PAD_UNLIT;
        // what's printed on the pad, or the chord pad it is (Chord and Key mode, not under Shift)
        const chordLabel = chordPads && !shiftHeld;
        return (
          <g
            key={i}
            data-hint={
              padMode === "key"
                ? `controller.keypad.${i}`
                : padMode === "chord"
                  ? `controller.chordpad.${i}`
                  : `controller.pad.${i}`
            }
            data-pad-color={lit ?? "none"}
            style={{ cursor: onPadDown ? "pointer" : undefined }}
            onPointerDown={(e) => handlePadPointerDown(i, e)}
            onPointerUp={() => handlePadPointerUp(i)}
            onPointerLeave={() => handlePadPointerUp(i)}
          >
            {/* a light bezel, and the rim's colored glow (the pads are backlit) */}
            <rect x={px} y={PAD_Y} width={PAD_SIZE} height={PAD_SIZE} rx={7} fill="#f2f2f4" />
            {lit && (
              <rect
                x={px + 1.5}
                y={PAD_Y + 1.5}
                width={PAD_SIZE - 3}
                height={PAD_SIZE - 3}
                rx={6}
                fill="none"
                stroke={color}
                strokeWidth={4}
                opacity={0.9}
                filter="url(#ml3-glow)"
              />
            )}
            <rect
              x={px + 2}
              y={PAD_Y + 2}
              width={PAD_SIZE - 4}
              height={PAD_SIZE - 4}
              rx={5.5}
              fill="none"
              stroke={color}
              strokeWidth={lit ? 2.5 : 1.5}
              opacity={lit ? 1 : 0.6}
            />
            {/* the dark face (data-pad: lit on hits) */}
            <rect
              data-pad={i}
              x={px + PAD_INSET}
              y={PAD_Y + PAD_INSET}
              width={PAD_SIZE - PAD_INSET * 2}
              height={PAD_SIZE - PAD_INSET * 2}
              rx={3}
              fill={PAD_FACE}
              style={{ pointerEvents: "none" }}
            />
            <text
              data-pad-label={i}
              x={px + PAD_SIZE / 2}
              y={chordLabel ? PAD_Y + PAD_SIZE / 2 + 5 : PAD_Y + PAD_SIZE - 11}
              textAnchor="middle"
              fontSize={chordLabel ? 14 : 8.5}
              fontWeight={chordLabel ? 600 : 500}
              fill={color}
              style={NO_SELECT}
            >
              {chordLabel ? CHORD_PADS[i] : PAD_LABELS[i]}
            </text>
          </g>
        );
      })}

      {/* ── Faders (4) ──────────────────────────────────────────────────── */}
      {[0, 1, 2, 3].map((i) => {
        const cx = FADER_CXS[i];
        const faderLabel = labels.faders[i];
        return (
          <g key={i} data-hint={`controller.fader.${i}`}>
            <title>
              {faderLabel?.name ?? `Fader ${i + 1}`}: {faderLabel?.value ?? ""}
            </title>
            <rect
              x={cx - FADER_SLOT_W / 2}
              y={FADER_SLOT_Y}
              width={FADER_SLOT_W}
              height={FADER_SLOT_H}
              rx={FADER_SLOT_W / 2}
              fill={FADER_SLOT}
            />
            {/* the cap and its line move together (data-fader-thumb: translated per frame) */}
            <g data-fader-thumb={i} transform={`translate(0,${FADER_TOP + FADER_TRAVEL / 2})`}>
              <rect
                x={cx - FADER_CAP_W / 2}
                y={0}
                width={FADER_CAP_W}
                height={FADER_CAP_H}
                rx={4}
                fill={FADER_CAP_FILL}
                stroke={BTN_EDGE}
                strokeWidth="1"
              />
              <line
                x1={cx - FADER_CAP_W / 2 + 5}
                y1={8}
                x2={cx + FADER_CAP_W / 2 - 5}
                y2={8}
                stroke={FADER_CAP_LINE}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </g>
            <text
              x={cx}
              y={FADER_LABEL_Y}
              textAnchor="middle"
              fontSize="9"
              fontWeight="600"
              fill={TEXT_PRINT}
              style={NO_SELECT}
            >
              {i + 1}
            </text>
            {faderLabel?.name && (
              <text
                x={cx}
                y={FADER_LABEL_Y + 11}
                textAnchor="middle"
                fontSize="8"
                fill="var(--accent)"
                style={NO_SELECT}
              >
                {faderLabel.name}
              </text>
            )}
          </g>
        );
      })}

      {/* ── Text row: MINILAB 3 / MIDI CH / ARTURIA ──────────────────────── */}
      <text
        x={76}
        y={TEXT_ROW_Y}
        fontSize="17.5"
        letterSpacing="0.6"
        fill={TEXT_BRAND}
        style={NO_SELECT}
      >
        <tspan fontWeight="400">MINI</tspan>
        <tspan fontWeight="800">LAB</tspan>
        <tspan fontWeight="400"> 3</tspan>
      </text>
      <text x={209} y={TEXT_ROW_Y} fontSize="7" fontWeight="600" fill={TEXT_DIM} style={NO_SELECT}>
        MIDI CH
      </text>
      {Array.from({ length: 16 }, (_, n) => (
        <text
          key={n}
          x={MIDI_CH_X0 + n * MIDI_CH_STEP}
          y={TEXT_ROW_Y}
          textAnchor="middle"
          fontSize="7.5"
          fontWeight="600"
          fill={TEXT_DIM}
          style={NO_SELECT}
        >
          {n + 1}
        </text>
      ))}
      <text
        x={900}
        y={TEXT_ROW_Y}
        textAnchor="end"
        fontSize="17.5"
        fontWeight="800"
        letterSpacing="3.4"
        fill={TEXT_BRAND}
        style={NO_SELECT}
      >
        ARTURIA
      </text>

      {/* ── Keys ─────────────────────────────────────────────────────────── */}
      {/* the key bed behind the keys, and the lip below them */}
      <rect x={KEYS_X - 2} y={KEYS_Y - 2} width={KEYS_W + 4} height={KEYS_H + 4} fill={KEY_BED} />
      <rect
        x={KEYS_X - 2}
        y={KEYS_Y + KEYS_H + 2}
        width={KEYS_W + 4}
        height={22}
        rx={2}
        fill={KEY_LIP}
      />
      {whiteKeys.map((k) => (
        <rect
          key={k.midi}
          data-key={k.midi}
          x={KEYS_X + k.x * WHITE_W + 0.6}
          y={KEYS_Y}
          width={WHITE_W - 1.2}
          height={KEYS_H}
          rx={2.5}
          fill={WHITE_KEY}
          stroke={KEY_STROKE}
          strokeWidth="0.6"
          style={{ cursor: onKeyDown ? "pointer" : undefined }}
          onPointerDown={(e) => handleKeyPointerDown(k.midi, e)}
          onPointerEnter={(e) => e.buttons === 1 && handleKeyPointerDown(k.midi, e)}
          onPointerUp={() => handleKeyPointerUp(k.midi)}
          onPointerLeave={() => handleKeyPointerUp(k.midi)}
        />
      ))}
      {blackKeys.map((k) => (
        <rect
          key={k.midi}
          data-key={k.midi}
          x={KEYS_X + k.x * WHITE_W}
          y={KEYS_Y}
          width={k.w * WHITE_W}
          height={BLACK_KEY_H}
          rx={2}
          fill={BLACK_KEY}
          stroke="#000"
          strokeWidth="0.5"
          style={{ cursor: onKeyDown ? "pointer" : undefined }}
          onPointerDown={(e) => handleKeyPointerDown(k.midi, e)}
          onPointerEnter={(e) => e.buttons === 1 && handleKeyPointerDown(k.midi, e)}
          onPointerUp={() => handleKeyPointerUp(k.midi)}
          onPointerLeave={() => handleKeyPointerUp(k.midi)}
        />
      ))}
      {/* Key mode's in-key dots (shown by the frame loop) */}
      {KEY_LAYOUT.map((k) => (
        <circle
          key={k.midi}
          data-key-dot={k.midi}
          cx={KEYS_X + (k.x + k.w / 2) * WHITE_W}
          cy={k.white ? KEYS_Y + KEYS_H - 50 : KEYS_Y + BLACK_KEY_H - 38}
          r={4.5}
          fill="var(--accent)"
          opacity={0.75}
          style={{ display: "none", pointerEvents: "none" }}
        />
      ))}
      {/* The notes of the keys that are down (filled in by the frame loop) */}
      {KEY_LAYOUT.map((k) => (
        <text
          key={k.midi}
          data-key-note={k.midi}
          x={KEYS_X + (k.x + k.w / 2) * WHITE_W}
          y={k.white ? KEYS_Y + KEYS_H - 18 : KEYS_Y + BLACK_KEY_H - 14}
          textAnchor="middle"
          fontSize={k.white ? KEY_LABEL_SIZE : 12.5}
          fontWeight="600"
          fill="#ffffff"
          stroke="rgba(0,0,0,0.45)"
          strokeWidth={k.white ? 2.6 : 2}
          paintOrder="stroke"
          style={NO_SELECT}
        />
      ))}
    </svg>
  );
}

// ── The screen ────────────────────────────────────────────────────────────

/** The two lines of the MiniLab's screen, centered as the device shows them. */
function ScreenText() {
  const line1Ref = useRef<SVGTextElement>(null);
  const line2Ref = useRef<SVGTextElement>(null);

  useEffect(() => {
    const update = (text: { line1: string; line2: string }) => {
      if (line1Ref.current) line1Ref.current.textContent = text.line1;
      if (line2Ref.current) line2Ref.current.textContent = text.line2;
    };
    update(useDisplay.getState().text);
    return useDisplay.subscribe((s) => update(s.text));
  }, []);

  const cx = OLED.x + OLED.w / 2;
  const font = "ui-monospace, Menlo, Consolas, monospace";
  return (
    <g clipPath="url(#ml3-oled)" data-testid="ml3-screen">
      <text
        ref={line1Ref}
        data-testid="ml3-screen-line1"
        x={cx}
        y={OLED.y + OLED.h / 2 - 3}
        textAnchor="middle"
        fontSize="8.5"
        fill={OLED_TEXT}
        fontFamily={font}
        style={{ userSelect: "none" }}
      >
        Rebeat
      </text>
      <text
        ref={line2Ref}
        data-testid="ml3-screen-line2"
        x={cx}
        y={OLED.y + OLED.h / 2 + 9}
        textAnchor="middle"
        fontSize="8.5"
        fill={OLED_TEXT}
        fontFamily={font}
        style={{ userSelect: "none" }}
      />
    </g>
  );
}
