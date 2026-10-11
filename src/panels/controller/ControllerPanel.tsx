/**
 * Controller panel (WS-D): a live top-down picture of the connected MIDI controller.
 * For the Arturia MiniLab 3 it shows an SVG of the device; for other maps it shows a generic
 * slot list; with no controller connected it shows a "Plug in a controller" prompt.
 */
import { useCallback } from "react";
import { Plug } from "lucide-react";
import { useMidi, targetContext, connectedController } from "../../audio-io/midi";
import { mapById } from "../../midi/controllers";
import { resolveTarget, readTarget } from "../../midi/mapping";
import { soundDefs } from "../../library/synthTrack";
import { useStore } from "../../state/store";
import { useSettings } from "../../state/settings";
import { noteOn } from "../../state/keys";
import { padInput } from "../../state/input";
import * as engine from "../../engine/engine";
import { MiniLab3Svg } from "./MiniLab3Svg";
import { GenericControllerView } from "./GenericControllerView";

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

  const handleKeyDown = useCallback((midi: number, velocity: number): (() => void) => {
    return noteOn(midi, velocity, "screen");
  }, []);

  const handlePadDown = useCallback((index: number): (() => void) => {
    return playPad(index);
  }, []);

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
      </div>

      {/* Device picture or generic slots */}
      <div className="min-h-0 flex-1 overflow-hidden" data-hint="controller.picture">
        {isMiniLab ? (
          <MiniLab3Svg
            labels={{ knobs: kLabels, faders: fLabels, encoder: "Browse" }}
            onKeyDown={handleKeyDown}
            onPadDown={handlePadDown}
          />
        ) : (
          <GenericControllerView map={activeMap} />
        )}
      </div>
    </div>
  );
}
