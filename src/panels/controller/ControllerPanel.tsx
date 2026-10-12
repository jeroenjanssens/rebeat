/**
 * Controller panel (WS-D): a live top-down picture of the connected MIDI controller.
 * For the Arturia MiniLab 3 it shows an SVG of the device; for other maps it shows a generic
 * slot list; with no controller connected it shows a "Plug in a controller" prompt.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Minus, Plug, Plus } from "lucide-react";
import { useMidi, targetContext, connectedController } from "../../audio-io/midi";
import { mapById } from "../../midi/controllers";
import { resolveTarget, readTarget } from "../../midi/mapping";
import { soundDefs } from "../../library/synthTrack";
import { useSettings } from "../../state/settings";
import {
  chordPadDown,
  chordPadUp,
  noteOn,
  selectPendingKey,
  setBassOctaves,
  setChordVoicing,
  setSmoothVoicing,
  setBassTrack,
  setBassMode,
  setKeyDial,
  setKeyModeKey,
  setPadMode,
  setTranspose,
  useKeys,
} from "../../state/keys";
import { useEditPattern, useStore } from "../../state/store";
import { dropdown, type MenuItem } from "../../components/Menu";
import { padInput } from "../../state/input";
import * as engine from "../../engine/engine";
import { MiniLab3Svg } from "./MiniLab3Svg";
import { PlayStylesRow } from "./PlayStylesRow";
import { PATTERNS, patternById, sanitizePlayStyle } from "../../model/perform";
import { KeysChip } from "../../app/KeysChip";
import { padColors } from "../../midi/padColors";
import { GenericControllerView } from "./GenericControllerView";
import { onControllerEvent } from "../../midi/controllerEvents";
import { chordName } from "../../model/chords";
import { keyName, noteName, pitchClassName, SCALES } from "../../model/notes";
import { pageKey } from "../../model/project";
import { BASS_OCTAVES, CHORD_PADS } from "../../model/padChords";
import { KEY_MODE_SCALES, keyModeKeyFrom } from "../../model/keyMode";

/** The notes held down: the device's keys, and keys clicked in the picture. */
function useHeldNotes() {
  const [held, setHeld] = useState<number[]>([]);
  const change = useCallback(
    (note: number, down: boolean) =>
      setHeld((h) =>
        down
          ? h.includes(note)
            ? h
            : [...h, note].sort((a, b) => a - b)
          : h.filter((n) => n !== note),
      ),
    [],
  );
  useEffect(
    () =>
      onControllerEvent((e) => {
        if (e.control.kind === "key") change(e.control.index, !!e.down);
      }),
    [change],
  );
  return [held, change] as const;
}

/** What sounds from the keys, low to high; `added`: a chord's note no key pressed (D137). */
type Sounding = { pitch: number; added: boolean }[];

/**
 * What the keys play now: every note of the keys that went through the keys (a chord's added
 * notes too), plus keys that are down but play elsewhere (pads by position), as they are.
 * A key a newer chord took over plays nothing, so it isn't in the sum.
 */
function useSounding(held: number[]): Sounding {
  const sounding = useKeys((s) => s.sounding);
  const mine = sounding.filter((k) => k.source === "midi" || k.source === "screen");
  const keyed = new Set(mine.map((k) => k.key));
  const all = new Set([...mine.flatMap((k) => k.notes), ...held.filter((n) => !keyed.has(n))]);
  return [...all].sort((a, b) => a - b).map((pitch) => ({ pitch, added: !held.includes(pitch) }));
}

/** What you're playing as an equation (D135): "A3 + C4 + E4 = Am", at the size of the note
 * names on the keys (D138). */
function NotesEquation({ sounding, size }: { sounding: Sounding; size: number }) {
  const notes = sounding.map((n) => n.pitch);
  const chord = chordName(notes);
  return (
    <div
      className="num flex shrink-0 items-center justify-center gap-[0.4em] leading-tight"
      style={{ fontSize: `${size}px`, minHeight: `${Math.round(size * 1.4)}px` }}
      data-testid="controller-notes"
      data-hint="controller.notes"
    >
      {sounding.map(({ pitch, added }, i) => (
        <span key={pitch} className="flex items-center gap-[0.4em]">
          {i > 0 && <span className="text-faint">+</span>}
          <span
            className={added ? "font-semibold text-accent opacity-60" : "font-semibold text-ink"}
            data-added={added || undefined}
          >
            {noteName(pitch)}
          </span>
        </span>
      ))}
      {chord && (
        <>
          <span className="text-faint">=</span>
          <span className="font-semibold text-accent" data-testid="controller-chord">
            {chord}
          </span>
        </>
      )}
    </div>
  );
}

// ── Label helpers ────────────────────────────────────────────────────────

/** What fader `index` controls now (0..1), if it can be read. */
function faderValue(
  index: number,
  project: ReturnType<typeof useStore.getState>["project"],
): number | null {
  const targets = ["selected:volume", "selected:mix.sendA", "selected:mix.sendB", "master:volume"];
  const resolved = resolveTarget(targets[index], targetContext());
  return resolved ? readTarget(resolved, project) : null;
}

// ── Knob labels: the selected track's SOUND knob names ──────────────────

function knobLabels(
  project: ReturnType<typeof useStore.getState>["project"],
  selectedTrackId: string | null | undefined,
): { name: string; value: string; pos?: number }[] {
  const track = project.tracks.find((t) => t.id === selectedTrackId);
  if (!track) return Array.from({ length: 8 }, (_, i) => ({ name: `Knob ${i + 1}`, value: "" }));
  const defs = soundDefs(track);
  return Array.from({ length: 8 }, (_, i) => {
    const def = defs[i];
    if (!def) return { name: `—`, value: "" };
    const key = `sound.${def.id}`;
    const raw = track.params[key] ?? def.default;
    return {
      name: def.label,
      value: def.format ? def.format(raw) : `${Math.round(raw * 100)}%`,
      pos: raw,
    };
  });
}

// ── Pad mode (D137, D138) ────────────────────────────────────────────────

const PAD_MODES = [
  { id: "drum", label: "Drum", hint: "controller.padMode.drum" },
  { id: "chord", label: "Chord", hint: "controller.padMode.chord" },
  { id: "key", label: "Key", hint: "controller.padMode.key" },
] as const;

/** Drum (pads 1–8 play tracks 1–8), Chord (the Orchid-style chord pads) or Key (Key mode). */
function PadModeSwitch() {
  const padMode = useSettings((s) => s.padMode);
  return (
    <div className="segmented" data-testid="pad-mode">
      {PAD_MODES.map((m) => (
        <button
          key={m.id}
          data-active={padMode === m.id}
          data-hint={m.hint}
          onClick={() => setPadMode(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/** Key mode's key: a chip with a menu of roots and scales, and "Use the page's key". */
function KeyModeChip() {
  const ref = useRef<HTMLButtonElement>(null);
  const key = useSettings((s) => s.keyModeKey);
  const project = useStore((s) => s.project);
  const pattern = useEditPattern();
  const items = (): MenuItem[] => [
    {
      render: (close) => (
        <div className="px-2 py-1.5">
          <div className="label mb-1.5">Root</div>
          <div className="grid grid-cols-6 gap-1">
            {Array.from({ length: 12 }, (_, i) => (
              <button
                key={i}
                className="tool-btn !h-6 border border-line"
                data-active={key.root === i}
                onClick={() => {
                  setKeyModeKey({ ...key, root: i });
                  close();
                }}
              >
                {pitchClassName(i, true)}
              </button>
            ))}
          </div>
        </div>
      ),
    },
    { separator: true },
    ...KEY_MODE_SCALES.map((id) => ({
      label: SCALES[id].name,
      checked: key.scale === id,
      onSelect: () => setKeyModeKey({ ...key, scale: id }),
    })),
    { separator: true },
    {
      label: `Use the page's key (${keyName(pageKey(project, pattern))})`,
      onSelect: () => setKeyModeKey(keyModeKeyFrom(pageKey(project, pattern))),
    },
  ];
  return (
    <button
      ref={ref}
      className="field"
      data-testid="key-mode-key"
      data-hint="controller.keyMode.key"
      onClick={() => dropdown(ref.current!, items())}
    >
      <span className="label">Key</span>
      <span className="num text-ink">{keyName(key)}</span>
      <ChevronDown size={12} className="text-dim" />
    </button>
  );
}

/** The row for the pads' Chord and Key modes: in Key mode the active key and the one a press
 * would select, and how the knob turns (D138); the bass (D139) and the transpose in both. */
function PadChordsRow({ keyMode }: { keyMode: boolean }) {
  const dial = useSettings((s) => s.keyDial);
  const bass = useSettings((s) => s.bassOctaves);
  const voicing = useSettings((s) => s.chordVoicing);
  const smooth = useSettings((s) => s.smoothVoicing);
  const voicingUsed = useKeys((s) => s.voicingUsed);
  const bassTrack = useSettings((s) => s.bassTrack);
  const bassMode = useSettings((s) => s.bassMode);
  const bassSplit = useSettings((s) => s.bassSplit);
  const tracks = useStore((s) => s.project.tracks);
  const notesTracks = tracks.filter((t) => t.mode === "notes");
  const bassTrackName = tracks.find((t) => t.id === bassTrack)?.name ?? null;
  const pending = useKeys((s) => s.pendingKey);
  const transpose = useKeys((s) => s.transpose);
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 px-1" data-testid="pad-chords-row">
      {keyMode && <KeyModeChip />}
      {keyMode && dial === "press" && pending && (
        <button
          className="tool-btn !h-6 gap-1 border border-dashed border-accent"
          data-testid="key-mode-pending"
          data-hint="controller.keyMode.pending"
          onClick={selectPendingKey}
        >
          <span className="text-faint">→</span>
          <span className="num text-accent">{keyName(pending)}</span>
          <span className="text-faint text-[11px]">press the knob</span>
        </button>
      )}
      <span className="flex-1" />
      {keyMode && (
        <>
          <span className="label">Knob</span>
          <div className="segmented" data-testid="key-dial">
            {(["instant", "press"] as const).map((m) => (
              <button
                key={m}
                data-active={dial === m}
                data-hint={
                  m === "instant" ? "controller.keyDial.instant" : "controller.keyDial.press"
                }
                onClick={() => setKeyDial(m)}
              >
                {m === "instant" ? "At once" : "On press"}
              </button>
            ))}
          </div>
        </>
      )}
      <span className="label">Voicing</span>
      <div className="flex items-center" data-testid="voicing" data-hint="controller.voicing">
        <button className="tool-btn !h-6" onClick={() => setChordVoicing(voicing - 1)}>
          <Minus size={12} />
        </button>
        <button
          className="num w-8 text-center text-[12px] text-ink"
          title="Root position"
          data-testid="voicing-value"
          onClick={() => setChordVoicing(0)}
        >
          {voicing > 0 ? `+${voicing}` : voicing}
        </button>
        <button className="tool-btn !h-6" onClick={() => setChordVoicing(voicing + 1)}>
          <Plus size={12} />
        </button>
      </div>
      <div className="segmented" data-hint="controller.voicing.smooth">
        <button
          data-active={smooth}
          aria-pressed={smooth}
          data-testid="voicing-smooth"
          title={
            smooth && voicingUsed !== null
              ? `Playing ${voicingUsed > 0 ? "+" : ""}${voicingUsed}`
              : undefined
          }
          onClick={() => setSmoothVoicing(!smooth)}
        >
          Smooth
          {smooth && voicingUsed !== null && (
            <span className="num ml-1 text-faint">
              {voicingUsed > 0 ? `+${voicingUsed}` : voicingUsed}
            </span>
          )}
        </button>
      </div>
      <span className="label">Bass</span>
      <div className="flex items-center" data-testid="bass" data-hint="controller.bass">
        {/* − is deeper, + back toward Off */}
        <button
          className="tool-btn !h-6"
          aria-label="Deeper"
          onClick={() => setBassOctaves(bass + 1)}
        >
          <Minus size={12} />
        </button>
        <button
          className="num w-8 text-center text-[12px] text-ink"
          title="Off"
          data-testid="bass-value"
          onClick={() => setBassOctaves(0)}
        >
          {bass ? `−${bass}` : "Off"}
        </button>
        <button
          className="tool-btn !h-6"
          aria-label="Higher"
          onClick={() => setBassOctaves(bass - 1)}
        >
          <Plus size={12} />
        </button>
      </div>
      <button
        className="tool-btn !h-6 gap-0.5"
        data-testid="bass-sound"
        data-hint="controller.bass.sound"
        onClick={(e) =>
          dropdown(e.currentTarget, [
            {
              label: "Same as the chord",
              checked: !bassTrackName,
              onSelect: () => setBassTrack(null),
            },
            ...notesTracks.map((t) => ({
              label: t.name,
              checked: t.id === bassTrack,
              onSelect: () => setBassTrack(t.id),
            })),
          ])
        }
      >
        <span className="text-[12px] text-ink">{bassTrackName ?? "Chord's sound"}</span>
        <ChevronDown size={11} />
      </button>
      <div className="segmented" data-hint="controller.bass.split">
        <button
          data-active={bassMode === "split"}
          aria-pressed={bassMode === "split"}
          data-testid="bass-split"
          title={`Keys below ${noteName(bassSplit)} play the bass alone`}
          onClick={() => setBassMode(bassMode === "split" ? "auto" : "split")}
        >
          Split{bassMode === "split" ? ` < ${noteName(bassSplit)}` : ""}
        </button>
      </div>
      <span className="label">Transpose</span>
      <div className="flex items-center" data-testid="transpose" data-hint="controller.transpose">
        <button className="tool-btn !h-6" onClick={() => setTranspose(transpose - 1)}>
          <Minus size={12} />
        </button>
        <button
          className="num w-8 text-center text-[12px] text-ink"
          title="Back to 0"
          data-testid="transpose-value"
          onClick={() => setTranspose(0)}
        >
          {transpose > 0 ? `+${transpose}` : transpose}
        </button>
        <button className="tool-btn !h-6" onClick={() => setTranspose(transpose + 1)}>
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}

/** The chord pads as a row, for controllers without a picture: which ones are held. */
function ChordPadsRow({ keyMode }: { keyMode: boolean }) {
  const pads = useKeys((s) => s.pads);
  return (
    <div className="flex shrink-0 items-center justify-center gap-1" data-testid="chord-pads">
      {CHORD_PADS.map((label, i) => (
        <span
          key={label}
          data-hint={keyMode ? `controller.keypad.${i}` : `controller.chordpad.${i}`}
          data-active={pads.includes(i) || undefined}
          className={`num rounded border px-2 py-0.5 text-[11px] ${
            pads.includes(i) ? "border-accent text-accent" : "border-line text-dim"
          } ${i === 4 ? "ml-2" : ""}`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

// ── Pad play helper ──────────────────────────────────────────────────────

function playPad(index: number): () => void {
  const s = useStore.getState();
  const track = s.project.tracks[index];
  if (!track) return () => {};
  const velocity = 0.8;
  padInput(track, velocity);
  engine.trigger(track, velocity);
  return () => {};
}

// ── No-controller prompt ─────────────────────────────────────────────────

function NoController() {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center"
      data-hint="controller.none"
    >
      <Plug size={28} className="text-dim" />
      <p className="text-[13px] text-dim">No controller connected.</p>
      <p className="text-[12px] text-faint">
        Plug in a MIDI controller, then go to <strong>Settings → MIDI → Controller</strong> to pick
        its map.
      </p>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────

export function ControllerPanel() {
  const midiStatus = useMidi((s) => s.status);
  const midiController = useSettings((s) => s.midiController);
  const project = useStore((s) => s.project);
  const selectedTrackId = useStore((s) => s.selectedTrackId);

  // Which map is active
  const activeMap =
    midiController && midiController !== "none" && midiController !== "custom"
      ? mapById(midiController)
      : undefined;

  // Detect connected controller to offer its map
  const detected = connectedController();

  const isMiniLab = activeMap?.id === "minilab3";

  const padMode = useSettings((s) => s.padMode);
  const voicing = useSettings((s) => s.chordVoicing);
  const bassOctaves = useSettings((s) => s.bassOctaves);
  const keysTranspose = useKeys((s) => s.transpose);
  const playStyle = sanitizePlayStyle(useSettings((s) => s.playStyle));
  const kLabels = knobLabels(project, selectedTrackId);
  // Chord and Key mode (D140, D148, D150–D153): the knobs are the keys' settings
  if (padMode !== "drum") {
    const st = playStyle;
    kLabels[2] = {
      name: "Strum",
      value: st.strum.on ? `${Math.round(st.strum.time * 1000)} ms` : "Off",
      pos: st.strum.on ? st.strum.time / 0.25 : 0,
    };
    kLabels[3] = { name: "Arp", value: st.arp.on ? st.arp.rate : "Off" };
    kLabels[5] = {
      name: "Slop",
      value: st.slop.on ? `${Math.round(st.slop.amount * 100)}%` : "Off",
    };
    kLabels[6] = {
      name: "Pattern",
      value: st.pattern.on ? patternById(st.pattern.id).name : "Off",
      pos: st.pattern.on
        ? (PATTERNS.findIndex((p) => p.id === st.pattern.id) + 1) / PATTERNS.length
        : 0,
    };
    kLabels[7] = { name: "Balance", value: `${Math.round(st.balance * 100)}%`, pos: st.balance };
    kLabels[1] = {
      name: "Transpose",
      value: keysTranspose > 0 ? `+${keysTranspose}` : `${keysTranspose}`,
      pos: (keysTranspose + 12) / 24,
    };
    kLabels[0] = {
      name: "Voicing",
      value: voicing > 0 ? `+${voicing}` : `${voicing}`,
      pos: (voicing + 8) / 16,
    };
    kLabels[4] = {
      name: "Bass",
      value: bassOctaves ? `−${bassOctaves}` : "Off",
      pos: (BASS_OCTAVES - bassOctaves) / BASS_OCTAVES,
    };
  }
  const fLabels = [0, 1, 2, 3].map((i) => {
    const v = faderValue(i, project);
    return {
      name: ["Level", "Reverb", "Delay", "Master"][i],
      value: v !== null ? `${Math.round(v * 100)}%` : "—",
      ...(v !== null ? { pos: v } : {}),
    };
  });

  const keyModeKey = useSettings((s) => s.keyModeKey);
  const [held, changeHeld] = useHeldNotes();
  const sounding = useSounding(held);
  // the equation's size: the note names' on the keys (a fixed 22 px without a picture)
  const [labelPx, setLabelPx] = useState(22);
  const handleKeyDown = useCallback(
    (midi: number, velocity: number): (() => void) => {
      changeHeld(midi, true);
      const release = noteOn(midi, velocity, "screen");
      return () => {
        release();
        changeHeld(midi, false);
      };
    },
    [changeHeld],
  );

  const handlePadDown = useCallback(
    (index: number): (() => void) => {
      if (padMode === "drum") return playPad(index);
      chordPadDown(index);
      return () => chordPadUp(index);
    },
    [padMode],
  );

  // No MIDI or no controller map
  if (midiStatus === "off" || midiStatus === "denied") {
    return (
      <div className="flex h-full items-center justify-center p-4" data-testid="controller-panel">
        <NoController />
      </div>
    );
  }

  if (!activeMap) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center"
        data-testid="controller-panel"
      >
        <Plug size={28} className="text-dim" />
        <p className="text-[13px] text-dim">No controller map selected.</p>
        {detected && (
          <p className="text-[12px] text-faint">
            <strong>{detected.name}</strong> is connected. Go to{" "}
            <strong>Settings → MIDI → Controller</strong> to use its map.
          </p>
        )}
        {!detected && (
          <p className="text-[12px] text-faint">
            Go to <strong>Settings → MIDI → Controller</strong> to pick a map.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-1 overflow-hidden p-2" data-testid="controller-panel">
      {/* Map name header */}
      <div className="flex shrink-0 items-center gap-2 px-1">
        <span className="label">{activeMap.name}</span>
        {detected && detected.id !== activeMap.id && (
          <span className="text-faint text-[11px]">
            (map: {activeMap.name}, connected: {detected.name})
          </span>
        )}
        <span className="flex-1" />
        <KeysChip testId="controller-keys-chip" />
        <span className="label">Pads</span>
        <PadModeSwitch />
      </div>
      {padMode !== "drum" && <PadChordsRow keyMode={padMode === "key"} />}
      <PlayStylesRow />

      {/* Device picture or generic slots */}
      <div className="min-h-0 flex-1 overflow-hidden" data-hint="controller.picture">
        {isMiniLab ? (
          <MiniLab3Svg
            labels={{
              knobs: kLabels,
              faders: fLabels,
              encoder: padMode === "key" ? "Key" : "Browse",
            }}
            onKeyDown={handleKeyDown}
            onPadDown={handlePadDown}
            padMode={padMode}
            padColors={padColors(project.tracks, padMode)}
            scaleKey={padMode === "key" ? keyModeKey : null}
            onLabelPx={setLabelPx}
            holdLit={playStyle.latch}
          />
        ) : (
          <GenericControllerView map={activeMap} />
        )}
      </div>
      {!isMiniLab && padMode !== "drum" && <ChordPadsRow keyMode={padMode === "key"} />}
      <NotesEquation sounding={sounding} size={isMiniLab ? Math.max(15, labelPx) : 22} />
    </div>
  );
}
