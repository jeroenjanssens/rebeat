/**
 * Top-down SVG of the Arturia MiniLab 3.
 *
 * Coordinate system: viewBox 0 0 1158 715, body at (0,0) 1158×715.
 * All layout constants are body-relative, measured from the product photo
 * (photo body: x 62–1220, y 285–1000; so body_x = photo_x − 62, body_y = photo_y − 285).
 */
import { useCallback, useEffect, useRef } from "react";
import { onControllerEvent, type ControllerEvent } from "../../midi/controllerEvents";
import { useDisplay } from "../../midi/display";
import { onFrame } from "../../render/raf";

// ── Layout constants (all in SVG user units = body pixels) ─────────────────

const W = 1158;
const H = 715;
const BODY_R = 25;

// Body colors — the device always looks like itself, theme-independent
const BODY_FILL = "#e6e6e8";
const BODY_STROKE = "#c0c0c4";
const PANEL_FILL = "#18181b"; // black panel (encoder + OLED)
const BTN_DARK_FILL = "#1e1e22"; // Shift button face
const BTN_WHITE_FILL = "#f4f4f2"; // Hold / Oct button face
const BTN_WHITE_TEXT = "#18181b";
const BTN_DARK_TEXT = "#e8e8ec";
const BTN_BEZEL = "#d0d0d4";
const STRIP_FILL = "#f4f4f2"; // touch strip face
const STRIP_STROKE = "#c8c8cc";
const KNOB_EDGE = "#c4c4c8"; // outer ring (shadow)
const KNOB_FACE = "#eeeeec"; // knob face
const KNOB_INDICATOR = "#2a2a2e"; // needle
const FADER_SLOT = "#1a1a1e";
const FADER_CAP_FILL = "#f4f4f2";
const FADER_CAP_LINE = "#1a1a1e";
const KEY_BED = "#b0b0b4";
const WHITE_KEY = "#f4f4f5";
const BLACK_KEY = "#18181b";
const KEY_STROKE = "#c0c0c4";
const TEXT_DIM = "#888890";
const TEXT_BRAND = "#1a1a1e";

// ── Left column: Shift, Hold, Oct ──────────────────────────────────────────
const SHIFT_X = 78,
  SHIFT_Y = 48,
  SHIFT_W = 62,
  SHIFT_H = 37;
const HOLD_X = 158,
  HOLD_Y = 55,
  HOLD_W = 48,
  HOLD_H = 25;
const OCTM_X = 86,
  OCTM_Y = 108,
  OCTM_W = 50,
  OCTM_H = 27;
const OCTP_X = 158,
  OCTP_Y = 108,
  OCTP_W = 48,
  OCTP_H = 27;

// ── Touch strips (body-relative) ─────────────────────────────────────────
// Left (Pitch): x 78–133, y 162–332  →  w=55, h=170
// Right (Mod):  x 158–211, y 162–332 →  w=53, h=170
const STRIP_LX = 78;
const STRIP_RX = 158;
const STRIP_Y = 162;
const STRIP_W = 55;
const STRIP_H = 170; // used in live update

// ── Black panel ───────────────────────────────────────────────────────────
const PANEL_X = 238,
  PANEL_Y = 19,
  PANEL_W = 122,
  PANEL_H = 218;

// ── OLED ─────────────────────────────────────────────────────────────────
const OLED_X = 256,
  OLED_Y = 60,
  OLED_W = 87,
  OLED_H = 27;

// ── Main encoder ──────────────────────────────────────────────────────────
const ENC_X = 298,
  ENC_Y = 181,
  ENC_R = 22;

// ── Knobs (2 rows of 4) ───────────────────────────────────────────────────
const KNOB_CXS = [405, 512, 618, 724];
const KNOB_CYS = [72, 181];
const KNOB_R = 20;

// ── Faders (4) ────────────────────────────────────────────────────────────
const FADER_CXS = [835, 900, 972, 1041];
// The cap travels from FADER_Y (top) to FADER_Y + FADER_TRACK_H (bottom of travel).
const FADER_Y = 67; // used in live update
const FADER_TRACK_H = 125; // cap travel distance; used in live update
const FADER_SLOT_H = FADER_TRACK_H + 14; // visual slot = travel + cap height
const FADER_SLOT_W = 4;
const FADER_CAP_W = 46;
const FADER_CAP_H = 14;
const FADER_LABEL_Y = 220;

// ── Pads (8 in a row) ──────────────────────────────────────────────────────
const PAD_START_X = 261;
const PAD_STEP = 106.5;
const PAD_Y = 258;
const PAD_W = 77;
const PAD_H = 78;
const PAD_RIM = 5; // rim width in pixels
const PAD_COLORS = [
  "#00aaff", // 0 Arp   — blue
  "#00aaff", // 1 Pad   — blue
  "#00aaff", // 2 Prog  — blue
  "#ff8800", // 3 Loop  — orange
  "#00aaff", // 4 Stop  — blue
  "#00cc44", // 5 Play  — green
  "#ff2828", // 6 Rec   — red
  "#ffcc00", // 7 Tap   — yellow
] as const;
const PAD_LABELS = ["Arp", "Pad", "Prog", "↺", "■", "▶", "●", "Tap"] as const;

// ── Keys ──────────────────────────────────────────────────────────────────
const KEYS_Y = 393;
const KEYS_X = 63;
const KEYS_W = 1035;
const KEYS_H = 317;
const KEY_COUNT = 25;
const KEY_WHITES = 15;
const WHITE_W = KEYS_W / KEY_WHITES; // 69
const BLACK_KEY_H = Math.round(KEYS_H * 0.57); // ~181

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
      keys.push({ midi: FIRST_KEY + i, white: false, x: wx - 0.3, w: 0.6 });
    }
  }
  return keys;
}

const KEY_LAYOUT = buildKeys();

// ── Live state ────────────────────────────────────────────────────────────

interface LiveState {
  keyVel: Uint8Array; // 128
  padVel: Uint8Array; // 16
  knobPos: Float32Array; // 8  (0..1)
  faderPos: Float32Array; // 4  (0..1)
  stripPos: Float32Array; // 2  (0..1)
  encoderPos: number;
  shift: number;
  dirty: boolean;
}

function makeLiveState(): LiveState {
  return {
    keyVel: new Uint8Array(128),
    padVel: new Uint8Array(16),
    knobPos: new Float32Array(8).fill(0.5),
    faderPos: new Float32Array(4).fill(0.5),
    // strips start empty; live events fill them when touched
    stripPos: new Float32Array(2).fill(0.0),
    encoderPos: 0.5,
    shift: 12, // MiniLab's keys start at C3 (MIDI 48) at octave 0
    dirty: true,
  };
}

// ── Component types ───────────────────────────────────────────────────────

interface KnobLabel {
  name: string;
  value: string;
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
}

// ── Component ─────────────────────────────────────────────────────────────

export function MiniLab3Svg({ labels, onKeyDown, onPadDown }: MiniLab3SvgProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const liveRef = useRef<LiveState>(makeLiveState());
  const heldKeys = useRef<Map<number, () => void>>(new Map());
  const heldPads = useRef<Map<number, () => void>>(new Map());

  // Subscribe to controller events
  useEffect(() => {
    const live = liveRef.current;
    return onControllerEvent((e: ControllerEvent) => {
      const { kind, index } = e.control;
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
          if (index >= 0 && index < 8) live.knobPos[index] = e.targetValue ?? e.value / 127;
          break;
        case "fader":
          if (index >= 0 && index < 4) live.faderPos[index] = e.targetValue ?? e.value / 127;
          break;
        case "encoder":
          live.encoderPos = (live.encoderPos + (e.value - 64) / 24 + 1) % 1;
          break;
        case "strip":
          if (index >= 0 && index < 2) live.stripPos[index] = e.value / 127;
          break;
      }
      live.dirty = true;
    });
  }, []);

  // Flush dirty state to DOM per frame
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    return onFrame(() => {
      const live = liveRef.current;
      if (!live.dirty) return;
      live.dirty = false;

      // Keys
      for (let i = 0; i < KEY_LAYOUT.length; i++) {
        const k = KEY_LAYOUT[i];
        const vel = live.keyVel[k.midi];
        const el = svg.querySelector<SVGElement>(`[data-key="${k.midi}"]`);
        if (el) {
          el.style.fill =
            vel > 0
              ? `color-mix(in oklab, var(--accent) ${Math.round(40 + (vel / 127) * 60)}%, ${k.white ? WHITE_KEY : BLACK_KEY})`
              : "";
        }
      }

      // Pads — inner face brightens on hit (uses pad's own color)
      for (let i = 0; i < 8; i++) {
        const vel = live.padVel[i];
        const el = svg.querySelector<SVGElement>(`[data-pad="${i}"]`);
        if (el) {
          // hit: the face lights up in its color, brighter the harder
          el.style.fill =
            vel > 0
              ? `color-mix(in oklab, ${PAD_COLORS[i]} ${Math.round(45 + (vel / 127) * 50)}%, #0a0a10)`
              : "";
        }
      }

      // Knob needles
      for (let i = 0; i < 8; i++) {
        const pos = live.knobPos[i];
        const el = svg.querySelector<SVGElement>(`[data-knob-needle="${i}"]`);
        if (el) {
          const deg = -135 + pos * 270;
          el.setAttribute("transform", `rotate(${deg.toFixed(1)},0,0)`);
        }
      }

      // Fader caps (cap rect + center line move together)
      for (let i = 0; i < 4; i++) {
        const pos = live.faderPos[i];
        const y = FADER_Y + FADER_TRACK_H * (1 - pos);
        const cap = svg.querySelector<SVGElement>(`[data-fader-thumb="${i}"]`);
        if (cap) cap.setAttribute("y", y.toFixed(1));
        const line = svg.querySelector<SVGElement>(`[data-fader-line="${i}"]`);
        if (line) {
          const ly = (y + FADER_CAP_H / 2).toFixed(1);
          line.setAttribute("y1", ly);
          line.setAttribute("y2", ly);
        }
      }

      // Encoder needle
      const encNeedle = svg.querySelector<SVGElement>("[data-enc-needle]");
      if (encNeedle) {
        encNeedle.setAttribute("transform", `rotate(${(live.encoderPos * 360).toFixed(1)},0,0)`);
      }

      // Strip fills
      for (let i = 0; i < 2; i++) {
        const pos = live.stripPos[i];
        const el = svg.querySelector<SVGElement>(`[data-strip-fill="${i}"]`);
        if (el) {
          const h = (STRIP_H - 4) * pos;
          const sy = STRIP_Y + STRIP_H - h;
          el.setAttribute("y", sy.toFixed(1));
          el.setAttribute("height", h.toFixed(1));
        }
      }
    });
  }, []);

  // Key interaction
  const handleKeyPointerDown = useCallback(
    (midi: number, e: React.PointerEvent<SVGElement>) => {
      if (!onKeyDown) return;
      e.currentTarget.setPointerCapture(e.pointerId);
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

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "100%", display: "block" }}
      aria-label="MiniLab 3 controller"
    >
      <defs>
        <filter id="ml3-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>
      {/* ── Body ──────────────────────────────────────────────────────── */}
      <rect
        x={0}
        y={0}
        width={W}
        height={H}
        rx={BODY_R}
        fill={BODY_FILL}
        stroke={BODY_STROKE}
        strokeWidth="2"
      />

      {/* ── Left column: Shift, Hold, Oct ──────────────────────────────── */}

      {/* Shift: dark face with white text, inside a lighter bezel */}
      <g data-hint="controller.btn.0">
        <title>Shift: hold for secondary functions</title>
        <rect
          x={SHIFT_X - 3}
          y={SHIFT_Y - 3}
          width={SHIFT_W + 6}
          height={SHIFT_H + 6}
          rx={5}
          fill={BTN_BEZEL}
        />
        <rect
          x={SHIFT_X}
          y={SHIFT_Y}
          width={SHIFT_W}
          height={SHIFT_H}
          rx={4}
          fill={BTN_DARK_FILL}
        />
        <text
          x={SHIFT_X + SHIFT_W / 2}
          y={SHIFT_Y + SHIFT_H / 2 + 4}
          textAnchor="middle"
          fontSize="11"
          fontWeight="600"
          fill={BTN_DARK_TEXT}
          style={{ userSelect: "none", pointerEvents: "none" }}
        >
          Shift
        </text>
      </g>

      {/* Hold: white key, dark text */}
      <g data-hint="controller.btn.1">
        <title>Hold: sustain current notes</title>
        <rect
          x={HOLD_X}
          y={HOLD_Y}
          width={HOLD_W}
          height={HOLD_H}
          rx={4}
          fill={BTN_WHITE_FILL}
          stroke={BTN_BEZEL}
          strokeWidth="1"
        />
        <text
          x={HOLD_X + HOLD_W / 2}
          y={HOLD_Y + HOLD_H / 2 + 4}
          textAnchor="middle"
          fontSize="9"
          fill={BTN_WHITE_TEXT}
          style={{ userSelect: "none", pointerEvents: "none" }}
        >
          Hold
        </text>
        <text
          x={HOLD_X + HOLD_W / 2}
          y={HOLD_Y + HOLD_H + 12}
          textAnchor="middle"
          fontSize="8"
          fill={TEXT_DIM}
          style={{ userSelect: "none", pointerEvents: "none" }}
        >
          Chord
        </text>
      </g>

      {/* Oct − */}
      <g data-hint="controller.btn.2">
        <title>Octave −</title>
        <rect
          x={OCTM_X}
          y={OCTM_Y}
          width={OCTM_W}
          height={OCTM_H}
          rx={4}
          fill={BTN_WHITE_FILL}
          stroke={BTN_BEZEL}
          strokeWidth="1"
        />
        <text
          x={OCTM_X + OCTM_W / 2}
          y={OCTM_Y + OCTM_H / 2 + 4}
          textAnchor="middle"
          fontSize="9"
          fill={BTN_WHITE_TEXT}
          style={{ userSelect: "none", pointerEvents: "none" }}
        >
          Oct −
        </text>
      </g>

      {/* Oct + */}
      <g data-hint="controller.btn.3">
        <title>Octave +</title>
        <rect
          x={OCTP_X}
          y={OCTP_Y}
          width={OCTP_W}
          height={OCTP_H}
          rx={4}
          fill={BTN_WHITE_FILL}
          stroke={BTN_BEZEL}
          strokeWidth="1"
        />
        <text
          x={OCTP_X + OCTP_W / 2}
          y={OCTP_Y + OCTP_H / 2 + 4}
          textAnchor="middle"
          fontSize="9"
          fill={BTN_WHITE_TEXT}
          style={{ userSelect: "none", pointerEvents: "none" }}
        >
          Oct +
        </text>
      </g>

      {/* "← Transpose →" under oct buttons */}
      <text
        x={(OCTM_X + OCTM_W / 2 + OCTP_X + OCTP_W / 2) / 2}
        y={OCTM_Y + OCTM_H + 12}
        textAnchor="middle"
        fontSize="8"
        fill={TEXT_DIM}
        style={{ userSelect: "none" }}
      >
        ← Transpose →
      </text>

      {/* ── Touch strips ─────────────────────────────────────────────────── */}

      {/* Pitch strip (left) */}
      <g data-hint="controller.strip.0">
        <title>Pitch strip</title>
        <rect
          x={STRIP_LX}
          y={STRIP_Y}
          width={STRIP_W}
          height={STRIP_H}
          rx={6}
          fill={STRIP_FILL}
          stroke={STRIP_STROKE}
          strokeWidth="1.5"
        />
        {/* fill indicator (grows from bottom) */}
        <rect
          data-strip-fill={0}
          x={STRIP_LX + 4}
          y={STRIP_Y + STRIP_H / 2}
          width={STRIP_W - 8}
          height={0}
          rx={3}
          fill="var(--accent)"
          opacity="0.5"
          style={{ pointerEvents: "none" }}
        />
        {/* ↑ at top */}
        <text
          x={STRIP_LX + STRIP_W / 2}
          y={STRIP_Y + 16}
          textAnchor="middle"
          fontSize="12"
          fill={TEXT_DIM}
          style={{ userSelect: "none" }}
        >
          ↑
        </text>
        {/* center line */}
        <line
          x1={STRIP_LX + 10}
          y1={STRIP_Y + STRIP_H / 2}
          x2={STRIP_LX + STRIP_W - 10}
          y2={STRIP_Y + STRIP_H / 2}
          stroke={STRIP_STROKE}
          strokeWidth="1.5"
        />
        {/* ↓ at bottom */}
        <text
          x={STRIP_LX + STRIP_W / 2}
          y={STRIP_Y + STRIP_H - 6}
          textAnchor="middle"
          fontSize="12"
          fill={TEXT_DIM}
          style={{ userSelect: "none" }}
        >
          ↓
        </text>
      </g>

      {/* Mod strip (right) */}
      <g data-hint="controller.strip.1">
        <title>Mod strip</title>
        <rect
          x={STRIP_RX}
          y={STRIP_Y}
          width={STRIP_W}
          height={STRIP_H}
          rx={6}
          fill={STRIP_FILL}
          stroke={STRIP_STROKE}
          strokeWidth="1.5"
        />
        <rect
          data-strip-fill={1}
          x={STRIP_RX + 4}
          y={STRIP_Y + STRIP_H}
          width={STRIP_W - 8}
          height={0}
          rx={3}
          fill="var(--accent)"
          opacity="0.5"
          style={{ pointerEvents: "none" }}
        />
        {/* ↑ with bar below it — near the bottom (mod goes up from rest) */}
        <text
          x={STRIP_RX + STRIP_W / 2}
          y={STRIP_Y + STRIP_H - 20}
          textAnchor="middle"
          fontSize="12"
          fill={TEXT_DIM}
          style={{ userSelect: "none" }}
        >
          ↑
        </text>
        <line
          x1={STRIP_RX + 10}
          y1={STRIP_Y + STRIP_H - 8}
          x2={STRIP_RX + STRIP_W - 10}
          y2={STRIP_Y + STRIP_H - 8}
          stroke={STRIP_STROKE}
          strokeWidth="1.5"
        />
      </g>

      {/* ── Black panel (encoder + OLED) ────────────────────────────────── */}
      <rect x={PANEL_X} y={PANEL_Y} width={PANEL_W} height={PANEL_H} rx={8} fill={PANEL_FILL} />

      {/* OLED */}
      <g data-hint="controller.screen">
        <rect
          x={OLED_X}
          y={OLED_Y}
          width={OLED_W}
          height={OLED_H}
          rx={3}
          fill="#050507"
          stroke="#2a2a30"
          strokeWidth="1"
        />
        <ScreenText x={OLED_X} y={OLED_Y} w={OLED_W} h={OLED_H} />
      </g>

      {/* Main encoder */}
      <g data-hint="controller.encoder">
        <title>{labels.encoder}</title>
        <circle cx={ENC_X} cy={ENC_Y} r={ENC_R + 3} fill="#0a0a0e" />
        <circle cx={ENC_X} cy={ENC_Y} r={ENC_R} fill="#222226" />
        <circle cx={ENC_X} cy={ENC_Y} r={ENC_R - 4} fill="#2e2e34" />
        <g transform={`translate(${ENC_X},${ENC_Y})`}>
          <line
            data-enc-needle
            x1="0"
            y1={-(ENC_R - 4)}
            x2="0"
            y2={-(ENC_R - 10)}
            stroke="#e8e8ec"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </g>
        <text
          x={ENC_X}
          y={ENC_Y + ENC_R + 14}
          textAnchor="middle"
          fontSize="9"
          fill={TEXT_DIM}
          style={{ userSelect: "none" }}
        >
          {labels.encoder}
        </text>
      </g>

      {/* ── Knobs (2 × 4) ─────────────────────────────────────────────────── */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const cx = KNOB_CXS[col];
        const cy = KNOB_CYS[row];
        const num = i + 1;
        const label = labels.knobs[i];
        return (
          <g key={i} data-hint={`controller.knob.${i}`}>
            <title>
              {label?.name ?? `Knob ${num}`}: {label?.value ?? ""}
            </title>
            {/* outer ring (shadow/edge) */}
            <circle cx={cx} cy={cy} r={KNOB_R + 2} fill={KNOB_EDGE} />
            {/* knob face */}
            <circle cx={cx} cy={cy} r={KNOB_R} fill={KNOB_FACE} />
            {/* needle */}
            <g transform={`translate(${cx},${cy})`}>
              <line
                data-knob-needle={i}
                x1="0"
                y1={-(KNOB_R - 2)}
                x2="0"
                y2={-(KNOB_R - 8)}
                stroke={KNOB_INDICATOR}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </g>
            {/* device number */}
            <text
              x={cx}
              y={cy + KNOB_R + 14}
              textAnchor="middle"
              fontSize="9"
              fill={TEXT_DIM}
              style={{ userSelect: "none" }}
            >
              {num}
            </text>
            {/* mapping label (subtle, below number) */}
            {label?.name && (
              <text
                x={cx}
                y={cy + KNOB_R + 25}
                textAnchor="middle"
                fontSize="8"
                fill="var(--accent)"
                opacity="0.7"
                style={{ userSelect: "none" }}
              >
                {label.name}
              </text>
            )}
          </g>
        );
      })}

      {/* ── Pads (8 in a row) ─────────────────────────────────────────────── */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const px = PAD_START_X + i * PAD_STEP;
        const color = PAD_COLORS[i];
        const padLabel = PAD_LABELS[i];
        return (
          <g
            key={i}
            data-hint={`controller.pad.${i}`}
            style={{ cursor: onPadDown ? "pointer" : undefined }}
            onPointerDown={(e) => handlePadPointerDown(i, e)}
            onPointerUp={() => handlePadPointerUp(i)}
            onPointerLeave={() => handlePadPointerUp(i)}
          >
            {/* a light bezel, and the rim's colored glow (the pads are backlit) */}
            <rect x={px} y={PAD_Y} width={PAD_W} height={PAD_H} rx={6} fill="#d4d4d8" />
            <rect
              x={px + 1.5}
              y={PAD_Y + 1.5}
              width={PAD_W - 3}
              height={PAD_H - 3}
              rx={5}
              fill="none"
              stroke={color}
              strokeWidth={3}
              opacity={0.85}
              filter="url(#ml3-glow)"
            />
            {/* inner dark face (data-pad used for live brightness) */}
            <rect
              data-pad={i}
              x={px + PAD_RIM}
              y={PAD_Y + PAD_RIM}
              width={PAD_W - PAD_RIM * 2}
              height={PAD_H - PAD_RIM * 2}
              rx={3}
              fill="#0a0a10"
              style={{ pointerEvents: "none" }}
            />
            {/* pad label at bottom inside, in rim color */}
            <text
              x={px + PAD_W / 2}
              y={PAD_Y + PAD_H - 8}
              textAnchor="middle"
              fontSize="10"
              fontWeight="500"
              fill={color}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {padLabel}
            </text>
          </g>
        );
      })}

      {/* ── Faders (4) ──────────────────────────────────────────────────── */}
      {[0, 1, 2, 3].map((i) => {
        const cx = FADER_CXS[i];
        const faderLabel = labels.faders[i];
        const num = i + 1;
        return (
          <g key={i} data-hint={`controller.fader.${i}`}>
            <title>
              {faderLabel?.name ?? `Fader ${num}`}: {faderLabel?.value ?? ""}
            </title>
            {/* slot track */}
            <rect
              x={cx - FADER_SLOT_W / 2}
              y={FADER_Y}
              width={FADER_SLOT_W}
              height={FADER_SLOT_H}
              rx={2}
              fill={FADER_SLOT}
            />
            {/* cap */}
            <rect
              data-fader-thumb={i}
              x={cx - FADER_CAP_W / 2}
              y={FADER_Y + FADER_TRACK_H * 0.5}
              width={FADER_CAP_W}
              height={FADER_CAP_H}
              rx={3}
              fill={FADER_CAP_FILL}
              stroke={BTN_BEZEL}
              strokeWidth="1"
            />
            {/* cap center line — moves with the cap in the frame loop */}
            <line
              data-fader-line={i}
              x1={cx - FADER_CAP_W / 2 + 6}
              y1={FADER_Y + FADER_TRACK_H * 0.5 + FADER_CAP_H / 2}
              x2={cx + FADER_CAP_W / 2 - 6}
              y2={FADER_Y + FADER_TRACK_H * 0.5 + FADER_CAP_H / 2}
              stroke={FADER_CAP_LINE}
              strokeWidth="1.5"
              strokeLinecap="round"
              style={{ pointerEvents: "none" }}
            />
            {/* number */}
            <text
              x={cx}
              y={FADER_LABEL_Y}
              textAnchor="middle"
              fontSize="9"
              fill={TEXT_DIM}
              style={{ userSelect: "none" }}
            >
              {num}
            </text>
            {/* mapping label */}
            {faderLabel?.name && (
              <text
                x={cx}
                y={FADER_LABEL_Y + 12}
                textAnchor="middle"
                fontSize="8"
                fill="var(--accent)"
                opacity="0.7"
                style={{ userSelect: "none" }}
              >
                {faderLabel.name}
              </text>
            )}
          </g>
        );
      })}

      {/* ── Text row: MINILAB 3 / MIDI CH / ARTURIA ──────────────────────── */}
      {/* MINILAB 3 */}
      <text
        x={83}
        y={375}
        fontSize="14"
        fontWeight="700"
        fill={TEXT_BRAND}
        style={{ userSelect: "none" }}
      >
        MINI
        <tspan fontWeight="400">LAB</tspan>
        <tspan fontWeight="700"> 3</tspan>
      </text>

      {/* MIDI CH 1 2 … 16 */}
      <text x={248} y={375} fontSize="8" fill={TEXT_DIM} style={{ userSelect: "none" }}>
        MIDI CH
      </text>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((n) => (
        <text
          key={n}
          x={310 + (n - 1) * 38}
          y={375}
          textAnchor="middle"
          fontSize="8"
          fill={TEXT_DIM}
          style={{ userSelect: "none" }}
        >
          {n}
        </text>
      ))}

      {/* ARTURIA */}
      <text
        x={1075}
        y={375}
        textAnchor="end"
        fontSize="14"
        fontWeight="700"
        fill={TEXT_BRAND}
        style={{ userSelect: "none" }}
      >
        ARTURIA
      </text>

      {/* ── Keys ─────────────────────────────────────────────────────────── */}
      {/* Key bed */}
      <rect
        x={KEYS_X - 4}
        y={KEYS_Y - 5}
        width={KEYS_W + 8}
        height={KEYS_H + 5}
        rx={4}
        fill={KEY_BED}
      />
      {/* White keys */}
      {whiteKeys.map((k) => (
        <rect
          key={k.midi}
          data-key={k.midi}
          x={KEYS_X + k.x * WHITE_W + 0.5}
          y={KEYS_Y}
          width={WHITE_W - 1}
          height={KEYS_H}
          rx={3}
          fill={WHITE_KEY}
          stroke={KEY_STROKE}
          strokeWidth="0.8"
          style={{ cursor: onKeyDown ? "pointer" : undefined }}
          onPointerDown={(e) => handleKeyPointerDown(k.midi, e)}
          onPointerUp={() => handleKeyPointerUp(k.midi)}
          onPointerLeave={() => handleKeyPointerUp(k.midi)}
        />
      ))}
      {/* Black keys */}
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
          onPointerUp={() => handleKeyPointerUp(k.midi)}
          onPointerLeave={() => handleKeyPointerUp(k.midi)}
        />
      ))}
    </svg>
  );
}

// ── Inline screen display ─────────────────────────────────────────────────

function ScreenText({ x, y, w: _w, h }: { x: number; y: number; w: number; h: number }) {
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

  return (
    <>
      <text
        ref={line1Ref}
        x={x + 4}
        y={y + h / 2 - 1}
        fontSize="7"
        fill="#7dd3fc"
        fontFamily="monospace"
        style={{ userSelect: "none" }}
      >
        Rebeat
      </text>
      <text
        ref={line2Ref}
        x={x + 4}
        y={y + h / 2 + 8}
        fontSize="6"
        fill="#7dd3fc"
        fontFamily="monospace"
        opacity="0.7"
        style={{ userSelect: "none" }}
      ></text>
    </>
  );
}
