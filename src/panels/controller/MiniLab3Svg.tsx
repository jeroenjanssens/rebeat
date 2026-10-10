/**
 * Top-down SVG of the Arturia MiniLab 3.
 *
 * Layout reference: Arturia MiniLab 3 Quick Start Guide (1.0.5) and product images.
 * From left to right: SHIFT, HOLD, OCT− and OCT+ with the Pitch and Mod touch strips under
 * them; the screen and the main encoder, the 8 knobs (two rows of 4) beside them and the 8 pads
 * (one row) below; the 4 faders on the right. 25 slim keys run across the bottom. To check
 * against the device (PLAN §0.6j step H).
 *
 * Coordinate system: the SVG viewBox is 600×236. The device body is a rounded rect inside that.
 */
import { useCallback, useEffect, useRef } from "react";
import { onControllerEvent, type ControllerEvent } from "../../midi/controllerEvents";
import { useDisplay } from "../../midi/display";
import { onFrame } from "../../render/raf";

// ── Layout constants (all in SVG user units) ───────────────────────────────

const W = 600;
const H = 236;
const BODY_X = 8;
const BODY_Y = 8;
const BODY_W = W - 16;
const BODY_H = H - 16;
const BODY_R = 10;

// Keys along the bottom, the whole width
const KEYS_Y = 146;
const KEYS_H = 80;
const KEY_COUNT = 25;
const KEY_WHITES = 15; // white keys in 25 (C D E F G A B × 2 + C)
const KEYS_X = BODY_X + 8;
const WHITE_W = (BODY_W - 16) / KEY_WHITES;

// Top section (controls above keys)
const CTRL_Y = BODY_Y + 10;

// Left column: SHIFT, HOLD, OCT−, OCT+ (2 × 2), the touch strips under them
const BTN_X = BODY_X + 8;
const BTN_W = 22;
const BTN_H = 12;
const BTN_GAP = 4;
const STRIP_X = BTN_X + 3;
const STRIP_Y = CTRL_Y + 2 * BTN_H + BTN_GAP + 8;
const STRIP_W = 16;
const STRIP_H = KEYS_Y - 16 - STRIP_Y;
const STRIP_GAP = 10;

// Middle: the screen and the main encoder, the 8 knobs (2 × 4) beside them, the 8 pads below
const MID_X = BODY_X + 70;
const SCREEN_X = MID_X;
const SCREEN_W = 72;
const SCREEN_H = 34;
const SCREEN_Y = CTRL_Y + 6;
const ENC_X = SCREEN_X + SCREEN_W + 20;
const ENC_R = 13;
const ENC_Y = SCREEN_Y + SCREEN_H / 2;
const KNOB_START_X = ENC_X + ENC_R + 22;
const KNOB_R = 10;
const KNOB_COL_W = 58;
const KNOB_ROW_H = 36;
const PAD_X = MID_X;
const PAD_Y = CTRL_Y + 2 * KNOB_ROW_H + 6;
const PAD_GAP = 6;
const PAD_W = (KNOB_START_X + 3 * KNOB_COL_W + 2 * KNOB_R - PAD_X - 7 * PAD_GAP) / 8;
const PAD_H = KEYS_Y - 12 - PAD_Y;

// Right: 4 faders
const FADER_START_X = KNOB_START_X + 3 * KNOB_COL_W + 2 * KNOB_R + 24;
const FADER_W = 12;
const FADER_GAP = (BODY_X + BODY_W - 12 - FADER_START_X - 4 * FADER_W) / 3;
const FADER_Y = CTRL_Y + 4;
const FADER_TRACK_H = KEYS_Y - 30 - FADER_Y;

// ── Keyboard helpers ────────────────────────────────────────────────────────

// 25 keys starting at C2 (MIDI 36)
const FIRST_KEY = 36;
const KEY_PATTERN = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0]; // 0=white, 1=black per semitone in octave
type KeyLayout = { midi: number; white: boolean; x: number; w: number; isFirst?: boolean };

function buildKeys(): KeyLayout[] {
  const keys: KeyLayout[] = [];
  let wx = 0; // white key index
  for (let i = 0; i < KEY_COUNT; i++) {
    const semitone = (FIRST_KEY + i) % 12;
    const white = KEY_PATTERN[semitone] === 0;
    if (white) {
      keys.push({ midi: FIRST_KEY + i, white: true, x: wx, w: 1 });
      wx += 1;
    } else {
      // black key sits over the boundary of the previous/next white key
      keys.push({ midi: FIRST_KEY + i, white: false, x: wx - 0.3, w: 0.6 });
    }
  }
  return keys;
}

const KEY_LAYOUT = buildKeys();

// ── State shared between event handler and frame loop ──────────────────────

interface LiveState {
  // keys: velocity 0..127, 0 = up
  keyVel: Uint8Array; // 128 entries
  // pads: velocity 0..127
  padVel: Uint8Array; // 16
  // knob positions 0..1
  knobPos: Float32Array; // 8
  // fader positions 0..1
  faderPos: Float32Array; // 4
  // strip positions 0..1
  stripPos: Float32Array; // 2
  // encoder position 0..1
  encoderPos: number;
  /** Semitones between the drawn keys and the notes they play (the device's octave buttons). */
  shift: number;
  dirty: boolean;
}

function makeLiveState(): LiveState {
  return {
    keyVel: new Uint8Array(128),
    padVel: new Uint8Array(16),
    knobPos: new Float32Array(8).fill(0.5),
    faderPos: new Float32Array(4).fill(0.5),
    stripPos: new Float32Array(2).fill(0.5),
    encoderPos: 0.5,
    // the MiniLab's keys start at C3 (MIDI 48) at octave 0
    shift: 12,
    dirty: true,
  };
}

// ── Component types ────────────────────────────────────────────────────────

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
  /** Called when the user clicks / presses a key. Returns a release function. */
  onKeyDown?: (midi: number, velocity: number) => () => void;
  /** Called when a pad is pressed. */
  onPadDown?: (index: number) => () => void;
}

const FADER_LABELS = ["Level", "Reverb", "Delay", "Master"];
const BTN_LABELS = ["SHIFT", "HOLD", "OCT−", "OCT+"];

// the device's own colors (it looks like a MiniLab in every theme)
const DEVICE_DARK = "#2a2a2e";
const WHITE_KEY = "#f4f4f5";
const BLACK_KEY = "#18181b";

// ── The SVG ────────────────────────────────────────────────────────────────

export function MiniLab3Svg({ labels, onKeyDown, onPadDown }: MiniLab3SvgProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const liveRef = useRef<LiveState>(makeLiveState());
  // held note release functions (by midi pitch)
  const heldKeys = useRef<Map<number, () => void>>(new Map());
  const heldPads = useRef<Map<number, () => void>>(new Map());

  // Subscribe to controller events and batch into liveRef
  useEffect(() => {
    const live = liveRef.current;
    return onControllerEvent((e: ControllerEvent) => {
      const { kind, index } = e.control;
      switch (kind) {
        case "key":
          if (index - live.shift < FIRST_KEY || index - live.shift >= FIRST_KEY + KEY_COUNT) {
            // the octave moved: follow it
            live.shift = 12 * Math.floor((index - FIRST_KEY) / 12);
            live.keyVel.fill(0);
          }
          live.keyVel[index - live.shift] = e.down ? e.value : 0;
          break;
        case "pad":
          // bank B (pads 9–16) lights the same pads
          live.padVel[index % 8] = e.down ? e.value : 0;
          break;
        case "knob":
          if (index >= 0 && index < 8) {
            live.knobPos[index] = e.targetValue ?? e.value / 127;
          }
          break;
        case "fader":
          if (index >= 0 && index < 4) {
            live.faderPos[index] = e.targetValue ?? e.value / 127;
          }
          break;
        case "encoder":
          // an endless encoder: turn the picture by the step it sent (offset 64)
          live.encoderPos = (live.encoderPos + (e.value - 64) / 24 + 1) % 1;
          break;
        case "strip":
          if (index >= 0 && index < 2) {
            live.stripPos[index] = e.value / 127;
          }
          break;
      }
      live.dirty = true;
    });
  }, []);

  // Animation frame: flush dirty state to DOM attributes
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    return onFrame(() => {
      const live = liveRef.current;
      if (!live.dirty) return;
      live.dirty = false;

      // Update keys
      for (let i = 0; i < KEY_LAYOUT.length; i++) {
        const k = KEY_LAYOUT[i];
        const vel = live.keyVel[k.midi];
        const el = svg.querySelector<SVGElement>(`[data-key="${k.midi}"]`);
        if (el) {
          if (vel > 0) {
            // pressed: the theme's accent, stronger the harder it was played
            el.style.fill = `color-mix(in oklab, var(--accent) ${Math.round(40 + (vel / 127) * 60)}%, ${k.white ? WHITE_KEY : BLACK_KEY})`;
          } else {
            el.style.fill = "";
          }
        }
      }

      // Update pads
      for (let i = 0; i < 8; i++) {
        const vel = live.padVel[i];
        const el = svg.querySelector<SVGElement>(`[data-pad="${i}"]`);
        if (el) {
          if (vel > 0) {
            // the pads light up (RGB on the device)
            el.style.fill = `color-mix(in oklab, var(--accent) ${Math.round(50 + (vel / 127) * 50)}%, ${DEVICE_DARK})`;
          } else {
            el.style.fill = "";
          }
        }
      }

      // Update knobs (rotate needle)
      for (let i = 0; i < 8; i++) {
        const pos = live.knobPos[i];
        const el = svg.querySelector<SVGElement>(`[data-knob-needle="${i}"]`);
        if (el) {
          const deg = -135 + pos * 270;
          el.setAttribute("transform", `rotate(${deg.toFixed(1)},0,0)`);
        }
      }

      // Update faders
      for (let i = 0; i < 4; i++) {
        const pos = live.faderPos[i];
        const el = svg.querySelector<SVGElement>(`[data-fader-thumb="${i}"]`);
        if (el) {
          const y = FADER_Y + FADER_TRACK_H * (1 - pos);
          el.setAttribute("y", y.toFixed(1));
        }
      }

      // Update encoder needle
      const encNeedle = svg.querySelector<SVGElement>("[data-enc-needle]");
      if (encNeedle) {
        const deg = live.encoderPos * 360;
        encNeedle.setAttribute("transform", `rotate(${deg.toFixed(1)},0,0)`);
      }

      // Update strips
      for (let i = 0; i < 2; i++) {
        const pos = live.stripPos[i];
        const el = svg.querySelector<SVGElement>(`[data-strip-fill="${i}"]`);
        if (el) {
          const h = (STRIP_H - 4) * pos;
          const y = STRIP_Y + STRIP_H - h;
          el.setAttribute("y", y.toFixed(1));
          el.setAttribute("height", h.toFixed(1));
        }
      }
    });
  }, []);

  // Key interaction helpers
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
    const rel = heldKeys.current.get(midi);
    if (rel) {
      rel();
      heldKeys.current.delete(midi);
    }
    liveRef.current.keyVel[midi] = 0;
    liveRef.current.dirty = true;
  }, []);

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
    const rel = heldPads.current.get(index);
    if (rel) {
      rel();
      heldPads.current.delete(index);
    }
    liveRef.current.padVel[index] = 0;
    liveRef.current.dirty = true;
  }, []);

  // Render white keys first, then black keys on top
  const whiteKeys = KEY_LAYOUT.filter((k) => k.white);
  const blackKeys = KEY_LAYOUT.filter((k) => !k.white);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "100%", display: "block" }}
      aria-label="MiniLab 3 controller"
    >
      {/* Body */}
      <rect
        x={BODY_X}
        y={BODY_Y}
        width={BODY_W}
        height={BODY_H}
        rx={BODY_R}
        fill="var(--raised)"
        stroke="var(--border-strong)"
        strokeWidth="1.5"
      />

      {/* ── Shift, Hold, Octave − and + ─────────────────────────── */}
      {BTN_LABELS.map((label, i) => {
        const x = BTN_X + (i % 2) * (BTN_W + BTN_GAP);
        const y = CTRL_Y + Math.floor(i / 2) * (BTN_H + BTN_GAP);
        return (
          <g key={label} data-hint={`controller.btn.${i}`}>
            <rect
              x={x}
              y={y}
              width={BTN_W}
              height={BTN_H}
              rx={3}
              fill={DEVICE_DARK}
              stroke="var(--border)"
              strokeWidth="0.6"
            />
            <text
              x={x + BTN_W / 2}
              y={y + BTN_H / 2 + 2}
              textAnchor="middle"
              fontSize="5"
              fill="#d4d4d8"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* ── Touch strips ────────────────────────────────────────── */}
      {["Pitch", "Mod"].map((name, i) => {
        const sx = STRIP_X + i * (STRIP_W + STRIP_GAP);
        return (
          <g key={name} data-hint={`controller.strip.${i}`}>
            <rect
              x={sx}
              y={STRIP_Y}
              width={STRIP_W}
              height={STRIP_H}
              rx={4}
              fill={DEVICE_DARK}
              stroke="var(--border)"
              strokeWidth="0.6"
            />
            <rect
              data-strip-fill={i}
              x={sx + 2}
              y={STRIP_Y + STRIP_H / 2}
              width={STRIP_W - 4}
              height={STRIP_H / 2 - 2}
              rx={3}
              fill="var(--accent)"
              opacity="0.55"
              style={{ pointerEvents: "none" }}
            />
            <text
              x={sx + STRIP_W / 2}
              y={STRIP_Y + STRIP_H + 8}
              textAnchor="middle"
              fontSize="5.5"
              fill="var(--text-dim)"
              style={{ userSelect: "none" }}
            >
              {name}
            </text>
          </g>
        );
      })}

      {/* ── Screen ─────────────────────────────────────────────── */}
      <g data-hint="controller.screen">
        <rect
          x={SCREEN_X}
          y={SCREEN_Y}
          width={SCREEN_W}
          height={SCREEN_H}
          rx={3}
          fill="#050505"
          stroke="var(--border-strong)"
          strokeWidth="0.8"
        />
        <ScreenText x={SCREEN_X} y={SCREEN_Y} w={SCREEN_W} h={SCREEN_H} />
      </g>

      {/* ── Main encoder ────────────────────────────────────────── */}
      <g data-hint="controller.encoder">
        <title>{labels.encoder}</title>
        <circle cx={ENC_X} cy={ENC_Y} r={ENC_R} fill="#111113" stroke="#000" strokeWidth="1" />
        <circle cx={ENC_X} cy={ENC_Y} r={ENC_R - 3} fill="#1f1f23" />
        <g transform={`translate(${ENC_X},${ENC_Y})`}>
          <line
            data-enc-needle
            x1="0"
            y1={-(ENC_R - 3)}
            x2="0"
            y2={-(ENC_R - 8)}
            stroke="#f4f4f5"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </g>
        <text
          x={ENC_X}
          y={ENC_Y + ENC_R + 9}
          textAnchor="middle"
          fontSize="5.5"
          fill="var(--text-dim)"
          style={{ userSelect: "none" }}
        >
          {labels.encoder}
        </text>
      </g>

      {/* ── Knobs ───────────────────────────────────────────────── */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const cx = KNOB_START_X + col * KNOB_COL_W + KNOB_R;
        const cy = CTRL_Y + row * KNOB_ROW_H + KNOB_R + 2;
        const label = labels.knobs[i];
        return (
          <g key={i} data-hint={`controller.knob.${i}`}>
            <title>
              {label?.name ?? `Knob ${i + 1}`}: {label?.value ?? ""}
            </title>
            <circle cx={cx} cy={cy} r={KNOB_R} fill="#111113" stroke="#000" strokeWidth="0.8" />
            <circle cx={cx} cy={cy} r={KNOB_R - 2.5} fill="#27272a" />
            <g transform={`translate(${cx},${cy})`}>
              <line
                data-knob-needle={i}
                x1="0"
                y1={-(KNOB_R - 2.5)}
                x2="0"
                y2={-(KNOB_R - 6)}
                stroke="#f4f4f5"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </g>
            <text
              x={cx}
              y={cy + KNOB_R + 8}
              textAnchor="middle"
              fontSize="5.5"
              fill="var(--text-dim)"
              style={{ userSelect: "none" }}
            >
              {label?.name ?? `Knob ${i + 1}`}
            </text>
          </g>
        );
      })}

      {/* ── Pads ────────────────────────────────────────────────── */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const px = PAD_X + i * (PAD_W + PAD_GAP);
        return (
          <g key={i} data-hint={`controller.pad.${i}`}>
            <rect
              data-pad={i}
              x={px}
              y={PAD_Y}
              width={PAD_W}
              height={PAD_H}
              rx={4}
              fill={DEVICE_DARK}
              stroke="#000"
              strokeWidth="0.6"
              style={{ cursor: onPadDown ? "pointer" : undefined }}
              onPointerDown={(e) => handlePadPointerDown(i, e)}
              onPointerUp={() => handlePadPointerUp(i)}
              onPointerLeave={() => handlePadPointerUp(i)}
            />
            <text
              x={px + 4}
              y={PAD_Y + 8}
              fontSize="5"
              fill="#a1a1aa"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {i + 1}
            </text>
          </g>
        );
      })}

      {/* ── Faders ──────────────────────────────────────────────── */}
      {[0, 1, 2, 3].map((i) => {
        const fx = FADER_START_X + i * (FADER_W + FADER_GAP);
        const label = FADER_LABELS[i];
        return (
          <g key={i} data-hint={`controller.fader.${i}`}>
            <title>
              {label}: {labels.faders[i]?.value ?? ""}
            </title>
            <rect
              x={fx + FADER_W / 2 - 1.5}
              y={FADER_Y}
              width={3}
              height={FADER_TRACK_H + 8}
              rx={1.5}
              fill="#000"
              opacity="0.7"
            />
            <rect
              data-fader-thumb={i}
              x={fx}
              y={FADER_Y + FADER_TRACK_H * 0.5}
              width={FADER_W}
              height={8}
              rx={2}
              fill="#27272a"
              stroke="#000"
              strokeWidth="0.8"
            />
            <text
              x={fx + FADER_W / 2}
              y={FADER_Y + FADER_TRACK_H + 18}
              textAnchor="middle"
              fontSize="5.5"
              fill="var(--text-dim)"
              style={{ userSelect: "none" }}
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* ── Keys ────────────────────────────────────────────────── */}
      <rect
        x={KEYS_X - 2}
        y={KEYS_Y - 3}
        width={KEY_WHITES * WHITE_W + 4}
        height={KEYS_H + 5}
        rx={3}
        fill={DEVICE_DARK}
      />
      {whiteKeys.map((k) => (
        <rect
          key={k.midi}
          data-key={k.midi}
          x={KEYS_X + k.x * WHITE_W + 0.5}
          y={KEYS_Y}
          width={WHITE_W - 1}
          height={KEYS_H}
          rx={2}
          fill={WHITE_KEY}
          stroke="#a1a1aa"
          strokeWidth="0.5"
          style={{ cursor: onKeyDown ? "pointer" : undefined }}
          onPointerDown={(e) => handleKeyPointerDown(k.midi, e)}
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
          height={KEYS_H * 0.6}
          rx={1.5}
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

function ScreenText({ x, y, h }: { x: number; y: number; w?: number; h: number }) {
  // Subscribe to display text changes by subscribing to the store
  // We use a ref + RAF approach to update text without re-renders
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
        x={x + 3}
        y={y + h / 2 - 1}
        fontSize="6"
        fill="#7dd3fc"
        fontFamily="monospace"
        style={{ userSelect: "none" }}
      >
        Rebeat
      </text>
      <text
        ref={line2Ref}
        x={x + 3}
        y={y + h / 2 + 9}
        fontSize="5"
        fill="#7dd3fc"
        fontFamily="monospace"
        opacity="0.7"
        style={{ userSelect: "none" }}
      ></text>
    </>
  );
}
