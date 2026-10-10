/**
 * Display feed (WS-E, D126): keeps the MiniLab 3's OLED screen (and the Controller panel's
 * mirrored display) current with what Rebeat is doing:
 *
 *  - When the keys target changes → show the track/sound name.
 *  - When the selected track changes → show its name and sound.
 *  - When a mapped knob turns → show its name and value briefly (transient, ~1.5 s),
 *    then restore the last non-transient text.
 *
 * Also auto-starts the MiniLab 3 display writer when the MiniLab 3 map is active and
 * "Show names on the MiniLab display" is on.
 *
 * Start with `startDisplayFeed()` from engine/context.ts (after audio is up).
 * This module imports only pure modules at the top level; browser-facing modules are
 * lazy-imported inside functions so unit-test-imported code never pulls them in.
 */
import { showOnDisplay, useDisplay, type DisplayText } from "./display";
import { useKeys, keysTargetName } from "../state/keys";
import { useStore } from "../state/store";
import { useSettings } from "../state/settings";
import { onControllerEvent } from "./controllerEvents";
import { soundDefs } from "../library/synthTrack";

let started = false;

/** Start the display feed. Idempotent — call once from engine/context.ts after audio starts. */
export function startDisplayFeed(): void {
  if (started) return;
  started = true;

  // ── 1. Keys target changes ────────────────────────────────────────────────
  useKeys.subscribe((state, prev) => {
    if (state.target === prev.target) return;
    const name = keysTargetName();
    showLastingText({ line1: name, line2: "Keys" });
  });

  // ── 2. Selected track changes ─────────────────────────────────────────────
  let lastTrackId: string | null = null;
  useStore.subscribe((state) => {
    const id = state.selectedTrackId;
    if (id === lastTrackId) return;
    lastTrackId = id;
    const track = id ? state.project.tracks.find((t) => t.id === id) : undefined;
    if (!track) return;
    showLastingText({ line1: track.name, line2: track.source ?? "" });
  });

  // ── 3. Controller knob turns → transient display ─────────────────────────
  let transientTimer: ReturnType<typeof setTimeout> | null = null;
  let lastingText: DisplayText = { line1: "Rebeat", line2: "" };

  // Keep lastingText in sync with non-transient display updates.
  useDisplay.subscribe((state) => {
    if (!state.text.transient) lastingText = state.text;
  });

  function showLastingText(text: DisplayText) {
    if (!useSettings.getState().midiShowDisplayNames) return;
    showOnDisplay(text);
  }

  onControllerEvent((e) => {
    if (!useSettings.getState().midiShowDisplayNames) return;
    if (e.targetValue === undefined || !e.target) return;

    // Only show for knob/encoder controls with a resolved target.
    if (e.control.kind !== "knob" && e.control.kind !== "encoder") return;

    // Find the parameter name from the target string.
    const paramLabel = resolveParamLabel(e.target);
    if (!paramLabel) return;

    const pct = `${Math.round(e.targetValue * 100)}%`;
    showOnDisplay({ line1: paramLabel, line2: pct, transient: true });

    if (transientTimer !== null) clearTimeout(transientTimer);
    transientTimer = setTimeout(() => {
      transientTimer = null;
      // Restore the lasting text if the current text is still transient.
      if (useDisplay.getState().text.transient) showOnDisplay(lastingText);
    }, 1500);
  });

  // ── 4. Auto-start the MiniLab 3 display writer ───────────────────────────
  void maybeStartMiniLabDisplay();
  useSettings.subscribe((s, prev) => {
    if (
      s.midiShowDisplayNames !== prev.midiShowDisplayNames ||
      s.midiController !== prev.midiController
    ) {
      void maybeStartMiniLabDisplay();
    }
  });
}

async function maybeStartMiniLabDisplay() {
  const { midiController, midiShowDisplayNames } = useSettings.getState();
  if (!midiShowDisplayNames) {
    const { stopMiniLab3Display } = await import("../audio-io/controllers/minilab3");
    stopMiniLab3Display();
    return;
  }
  if (midiController !== "minilab3") return;
  const { startMiniLab3Display } = await import("../audio-io/controllers/minilab3");
  await startMiniLab3Display();
}

/** Resolve a MIDI target string to a human-readable parameter label. */
function resolveParamLabel(target: string): string | null {
  if (target === "master:volume") return "Master volume";

  // "bus:<id>:volume" → bus name + " level"
  if (target.startsWith("bus:") && target.endsWith(":volume")) {
    const busId = target.split(":")[1];
    const project = useStore.getState().project;
    const bus = (project.buses as Array<{ id: string; name: string }> | undefined)?.find(
      (b) => b.id === busId,
    );
    return bus ? `${bus.name} level` : "Bus level";
  }

  // "track:<id>:volume"
  if (target.startsWith("track:") && target.endsWith(":volume")) {
    const trackId = target.split(":")[1];
    const track = useStore.getState().project.tracks.find((t) => t.id === trackId);
    return track ? `${track.name} level` : "Track level";
  }

  // "track:<id>:sound.<param>"
  const soundMatch = /^track:([^:]+):sound\.(.+)$/.exec(target);
  if (soundMatch) {
    const trackId = soundMatch[1];
    const paramId = soundMatch[2];
    const track = useStore.getState().project.tracks.find((t) => t.id === trackId);
    if (track) {
      const defs = soundDefs(track);
      const def = defs.find((d) => d.id === paramId);
      return def ? def.label : paramId;
    }
  }

  // "track:<id>:fx:<fxId>:<param>" — just the param part
  const fxMatch = /^track:[^:]+:fx:[^:]+:(.+)$/.exec(target);
  if (fxMatch) return fxMatch[1];

  return null;
}
