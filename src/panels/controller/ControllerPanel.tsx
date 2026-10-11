/**
 * Controller panel (WS-D): a live top-down picture of the connected MIDI controller.
 * For the Arturia MiniLab 3 it shows an SVG of the device; for other maps it shows a generic
 * slot list; with no controller connected it shows a "Plug in a controller" prompt.
 */
import { useCallback, useEffect, useState } from "react";
import { Plug } from "lucide-react";
import { useMidi, targetContext, connectedController } from "../../audio-io/midi";
import { mapById } from "../../midi/controllers";
import { resolveTarget, readTarget } from "../../midi/mapping";
import { soundDefs } from "../../library/synthTrack";
import { useStore } from "../../state/store";
import { useSettings } from "../../state/settings";
import { chordPadDown, chordPadUp, noteOn, setPadMode, useKeys } from "../../state/keys";
import { padInput } from "../../state/input";
import * as engine from "../../engine/engine";
import { MiniLab3Svg } from "./MiniLab3Svg";
import { GenericControllerView } from "./GenericControllerView";
import { onControllerEvent } from "../../midi/controllerEvents";
import { chordName } from "../../model/chords";
import { noteName } from "../../model/notes";
import { CHORD_PADS } from "../../model/padChords";

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

/** What you're playing as an equation (D135): "A3 + C4 + E4 = Am". */
function NotesEquation({ sounding }: { sounding: Sounding }) {
  const notes = sounding.map((n) => n.pitch);
  const chord = chordName(notes);
  return (
    <div
      className="num flex h-7 shrink-0 items-center justify-center gap-2 text-[15px]"
      data-testid="controller-notes"
      data-hint="controller.notes"
    >
      {sounding.map(({ pitch, added }, i) => (
        <span key={pitch} className="flex items-center gap-2">
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
) {
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

// ── Pad mode (D137) ──────────────────────────────────────────────────────

/** Drum (pads 1–8 play tracks 1–8) or Chord (they're the Orchid-style chord pads). */
function PadModeSwitch() {
  const padMode = useSettings((s) => s.padMode);
  return (
    <div className="segmented" data-testid="pad-mode">
      {(["drum", "chord"] as const).map((m) => (
        <button
          key={m}
          data-active={padMode === m}
          data-hint={m === "drum" ? "controller.padMode.drum" : "controller.padMode.chord"}
          onClick={() => setPadMode(m)}
        >
          {m === "drum" ? "Drum" : "Chord"}
        </button>
      ))}
    </div>
  );
}

/** The chord pads as a row, for controllers without a picture: which ones are held. */
function ChordPadsRow() {
  const pads = useKeys((s) => s.pads);
  return (
    <div className="flex shrink-0 items-center justify-center gap-1" data-testid="chord-pads">
      {CHORD_PADS.map((label, i) => (
        <span
          key={label}
          data-hint={`controller.chordpad.${i}`}
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

  const kLabels = knobLabels(project, selectedTrackId);
  const fLabels = [0, 1, 2, 3].map((i) => {
    const v = faderValue(i, project);
    return {
      name: ["Level", "Reverb", "Delay", "Master"][i],
      value: v !== null ? `${Math.round(v * 100)}%` : "—",
      ...(v !== null ? { pos: v } : {}),
    };
  });

  const padMode = useSettings((s) => s.padMode);
  const [held, changeHeld] = useHeldNotes();
  const sounding = useSounding(held);
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
      if (padMode !== "chord") return playPad(index);
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
        <span className="label">Pads</span>
        <PadModeSwitch />
      </div>

      {/* Device picture or generic slots */}
      <div className="min-h-0 flex-1 overflow-hidden" data-hint="controller.picture">
        {isMiniLab ? (
          <MiniLab3Svg
            labels={{ knobs: kLabels, faders: fLabels, encoder: "Browse" }}
            onKeyDown={handleKeyDown}
            onPadDown={handlePadDown}
            chordPads={padMode === "chord"}
            generated={sounding.filter((n) => n.added).map((n) => n.pitch)}
          />
        ) : (
          <GenericControllerView map={activeMap} />
        )}
      </div>
      {!isMiniLab && padMode === "chord" && <ChordPadsRow />}
      <NotesEquation sounding={sounding} />
    </div>
  );
}
