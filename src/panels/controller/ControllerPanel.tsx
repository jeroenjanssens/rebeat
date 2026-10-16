/**
 * Keys panel (WS-D): a live top-down picture of the connected MIDI controller.
 * For the Arturia MiniLab 3 it shows an SVG of the device; for other maps it shows a generic
 * slot list; with no controller connected it shows a "Plug in a controller" prompt.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Minus, Plug, Plus } from "lucide-react";
import { useMidi, targetContext, connectedController, turnKeysKnob } from "../../audio-io/midi";
import { mapById } from "../../midi/controllers";
import { resolveTarget, readTarget } from "../../midi/mapping";
import { soundDefs } from "../../library/synthTrack";
import { useSettings } from "../../state/settings";
import {
  chordPadDown,
  chordPadUp,
  noteOn,
  playSuggestion,
  refreshSuggestions,
  setSuggest,
  setSuggestAdventure,
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
import { ROLE_COLORS, ROLE_NAMES } from "../../model/suggest";
import { PlayStylesCard } from "./PlayStyles";
import { BendCard } from "./BendCard";
import { Card, Line, revealCard } from "./Card";
import { CONTROLLER_MAPS } from "../../midi/controllers";
import { chooseControllerMap } from "../../app/MidiSettings";
import { useShell } from "../../app/shell";
import { ProgressionPicker } from "./ProgressionPicker";
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
  // what the keys play from MIDI and the picture, and Auto's chord (D162: no key is down for it)
  const mine = sounding.filter(
    (k) => k.source === "midi" || k.source === "screen" || k.source === "auto",
  );
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
            className={added ? "font-semibold text-accent-2" : "font-semibold text-ink"}
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
  { id: "next", label: "Next", hint: "controller.padMode.next" },
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

/** Key mode's key: a chip with a menu of roots and scales, "Use the pattern's key", and how the
 * black knob changes the key (D138: at once, or on its press). */
function KeyModeChip() {
  const ref = useRef<HTMLButtonElement>(null);
  const key = useSettings((s) => s.keyModeKey);
  const dial = useSettings((s) => s.keyDial);
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
      label: `Use the pattern's key (${keyName(pageKey(project, pattern))})`,
      onSelect: () => setKeyModeKey(keyModeKeyFrom(pageKey(project, pattern))),
    },
    { separator: true },
    { heading: "The black knob changes the key" },
    {
      label: "At once, as you turn it",
      checked: dial === "instant",
      onSelect: () => setKeyDial("instant"),
    },
    {
      label: "When you press it (turning picks the next key)",
      checked: dial === "press",
      onSelect: () => setKeyDial("press"),
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

/** In Key mode with "on press": the key a press of the black knob would select. */
function PendingKey() {
  const dial = useSettings((s) => s.keyDial);
  const pending = useKeys((s) => s.pendingKey);
  if (dial !== "press" || !pending) return null;
  return (
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
  );
}

const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);

/** The Chords card (D140, D148, D154): voicing, smooth voicing, transpose. */
function ChordsCard() {
  const voicing = useSettings((s) => s.chordVoicing);
  const smooth = useSettings((s) => s.smoothVoicing);
  const voicingUsed = useKeys((s) => s.voicingUsed);
  const transpose = useKeys((s) => s.transpose);
  return (
    <Card id="chords" title="Chords">
      <Line label="Voicing">
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
            {signed(voicing)}
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
            title={smooth && voicingUsed !== null ? `Playing ${signed(voicingUsed)}` : undefined}
            onClick={() => setSmoothVoicing(!smooth)}
          >
            Smooth
            {smooth && voicingUsed !== null && (
              <span className="num ml-1 text-faint">{signed(voicingUsed)}</span>
            )}
          </button>
        </div>
      </Line>
      <Line label="Transpose">
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
            {signed(transpose)}
          </button>
          <button className="tool-btn !h-6" onClick={() => setTranspose(transpose + 1)}>
            <Plus size={12} />
          </button>
        </div>
      </Line>
    </Card>
  );
}

/** The Bass card (D139, D148, D155): octaves down, its own sound, a split. */
function BassCard() {
  const bass = useSettings((s) => s.bassOctaves);
  const bassTrack = useSettings((s) => s.bassTrack);
  const bassMode = useSettings((s) => s.bassMode);
  const bassSplit = useSettings((s) => s.bassSplit);
  const tracks = useStore((s) => s.project.tracks);
  const notesTracks = tracks.filter((t) => t.mode === "notes");
  const bassTrackName = tracks.find((t) => t.id === bassTrack)?.name ?? null;
  return (
    <Card
      id="bass"
      title="Bass"
      right={<span className="num text-[10.5px] text-dim">{bass ? `−${bass}` : "Off"}</span>}
    >
      <Line label="Octaves">
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
      </Line>
      <Line label="Sound">
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
      </Line>
    </Card>
  );
}

/** The Suggest card (D158–D161): the next chord, how bold, and in Next mode the progression and
 * Auto. */
function SuggestCard() {
  const suggest = useSettings((s) => s.suggest);
  const adventure = useSettings((s) => s.suggestAdventure);
  const padMode = useSettings((s) => s.padMode);
  const next = padMode === "next";
  return (
    <Card id="suggest" title={next ? "Suggest and Auto" : "Suggest"}>
      <Line>
        <div className="segmented" data-hint="controller.suggest">
          <button
            data-active={suggest}
            aria-pressed={suggest}
            data-testid="suggest"
            onClick={() => setSuggest(!suggest)}
          >
            Suggest
          </button>
        </div>
        {(suggest || next) && (
          <div
            className="segmented"
            data-testid="suggest-adventure"
            data-hint="controller.suggest.adventure"
          >
            {(["Safe", "Common", "Bold"] as const).map((label, level) => (
              <button
                key={label}
                data-active={adventure === level}
                onClick={() => setSuggestAdventure(level as 0 | 1 | 2)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </Line>
      {next && <ProgressionPicker />}
    </Card>
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

/** Next mode on a controller without a picture (D159): the suggestions on pads 1–8. */
function NextPadsRow() {
  const suggestions = useKeys((s) => s.suggestions);
  return (
    <div className="flex shrink-0 items-center justify-center gap-1" data-testid="next-pads">
      {Array.from({ length: 8 }, (_, i) => {
        const s = suggestions[i];
        return (
          <button
            key={i}
            data-hint={`controller.nextpad.${i}`}
            className="num rounded border px-2 py-0.5 text-[11px]"
            style={s ? { borderColor: ROLE_COLORS[s.role], color: ROLE_COLORS[s.role] } : undefined}
            title={s?.why}
            onPointerDown={() => {
              const up = playSuggestion(i, 0.8, "screen");
              window.addEventListener("pointerup", up, { once: true });
            }}
          >
            {s?.name ?? "—"}
          </button>
        );
      })}
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
  // the next chords (D158, D159): markers on the keys, the pads in Next mode
  const suggestions = useKeys((s) => s.suggestions);
  const lastKey = useKeys((s) => s.lastKey);
  const autoQueued = useKeys((s) => s.auto.queued);
  const suggestOn = useSettings((s) => s.suggest);
  const projectKey = useStore((s) => s.project.key);
  useEffect(() => refreshSuggestions(), [padMode, suggestOn, keyModeKey, projectKey]);
  const showMarks = suggestOn && padMode !== "drum";
  const near = lastKey ?? 60;
  const marks = showMarks
    ? suggestions.slice(0, 3).map((s, rank) => {
        // the key with the chord's root closest to the last one played: the hand moves least
        const pitch = near - 6 + ((((s.root - (near - 6)) % 12) + 12) % 12);
        const pads = padMode === "chord" ? s.pads : s.keyPads;
        const how = pads.length ? ` + ${pads.map((p) => CHORD_PADS[p]).join(" + ")}` : "";
        return {
          pitch,
          rank,
          name: s.name,
          color: ROLE_COLORS[s.role],
          title: `${s.name} (${s.roman}, ${ROLE_NAMES[s.role]}): ${s.why}. Press ${noteName(pitch)}${how}.`,
        };
      })
    : [];
  // the best one's pads, marked on the pads (Chord and Key mode)
  const best = showMarks && padMode !== "next" ? suggestions[0] : undefined;
  const padMarks = best
    ? (padMode === "chord" ? best.pads : best.keyPads).map((i) => ({
        index: i,
        color: ROLE_COLORS[best.role],
      }))
    : [];
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
      if (padMode === "next") return playSuggestion(index, 0.8, "screen");
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

  const chordModes = padMode !== "drum";
  const keyModes = padMode === "key" || padMode === "next";
  return (
    <div
      className="flex h-full flex-col gap-1.5 overflow-hidden p-2"
      data-testid="controller-panel"
    >
      {/* one header row (D213): the map, the pads, the key, the keys */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-1">
        <MapMenu name={activeMap.name} detected={detected} activeId={activeMap.id} />
        <span className="label">Pads</span>
        <PadModeSwitch />
        {keyModes && <KeyModeChip />}
        {keyModes && <PendingKey />}
        <span className="flex-1" />
        <KeysChip testId="controller-keys-chip" />
      </div>

      {/* the picture and the settings column: beside it when wide, under it when narrow */}
      <div className="@container min-h-0 flex-1">
        <div className="flex h-full flex-col gap-2 @[880px]:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
            <div className="min-h-0 flex-1 overflow-hidden" data-hint="controller.picture">
              {isMiniLab ? (
                <MiniLab3Svg
                  labels={{
                    knobs: kLabels,
                    faders: fLabels,
                    encoder: keyModes ? "Key" : "Browse",
                  }}
                  onKeyDown={handleKeyDown}
                  onPadDown={handlePadDown}
                  onKnobClick={chordModes ? (i) => revealCard(KNOB_CARDS[i]) : undefined}
                  onKnobTurn={(i, steps) => turnKnob(i, steps, chordModes)}
                  padMode={padMode}
                  padColors={padColors(
                    project.tracks,
                    padMode,
                    suggestions.map((s) => ROLE_COLORS[s.role]),
                  )}
                  scaleKey={keyModes ? keyModeKey : null}
                  nextLabels={padMode === "next" ? suggestions.map((s) => s.name) : undefined}
                  marks={marks}
                  padMarks={padMarks}
                  queuedPad={padMode === "next" ? autoQueued : null}
                  onLabelPx={setLabelPx}
                  holdLit={playStyle.latch}
                />
              ) : (
                <GenericControllerView map={activeMap} />
              )}
            </div>
            {!isMiniLab && padMode === "next" && <NextPadsRow />}
            {!isMiniLab && chordModes && padMode !== "next" && (
              <ChordPadsRow keyMode={padMode === "key"} />
            )}
            <NotesEquation sounding={sounding} size={isMiniLab ? Math.max(15, labelPx) : 22} />
          </div>
          <aside
            className="scroll-thin flex max-h-[45%] shrink-0 flex-col gap-1.5 overflow-y-auto @[880px]:max-h-none @[880px]:w-[330px]"
            data-testid="controller-settings"
          >
            {chordModes && <ChordsCard />}
            {chordModes && <BassCard />}
            {chordModes && <SuggestCard />}
            <PlayStylesCard />
            <BendCard minilab={isMiniLab} />
          </aside>
        </div>
      </div>
    </div>
  );
}

/** Which card each knob's setting is in, in Chord, Key and Next mode (D140, D148, D150–D153). */
const KNOB_CARDS = ["chords", "chords", "play", "play", "bass", "play", "play", "play"];

/** Turn a knob in the picture: the keys' setting it is (Chord, Key, Next), or the selected
 * track's SOUND knob (Drum). */
function turnKnob(i: number, steps: number, chordModes: boolean) {
  if (chordModes) return turnKeysKnob(i, steps);
  const { project, selectedTrackId, commit } = useStore.getState();
  const track = project.tracks.find((t) => t.id === selectedTrackId);
  const def = track && soundDefs(track)[i];
  if (!track || !def) return;
  const key = `sound.${def.id}`;
  const by = def.steps ? 1 / (def.steps - 1) : 0.02;
  commit((p) => {
    const t = p.tracks.find((x) => x.id === track.id);
    if (t) t.params[key] = Math.max(0, Math.min(1, (t.params[key] ?? def.default) + steps * by));
  }, `ctl-knob-${track.id}-${def.id}`);
}

/** The map's name, with a menu: another map, or the MIDI settings. */
function MapMenu({
  name,
  detected,
  activeId,
}: {
  name: string;
  detected: ReturnType<typeof connectedController>;
  activeId: string;
}) {
  return (
    <button
      className="field"
      data-testid="controller-map"
      data-hint="controller.map"
      title={
        detected && detected.id !== activeId
          ? `The map is ${name}; ${detected.name} is connected`
          : undefined
      }
      onClick={(e) =>
        dropdown(e.currentTarget, [
          ...CONTROLLER_MAPS.map((m) => ({
            label: m.name,
            checked: m.id === activeId,
            onSelect: () => chooseControllerMap(m.id),
          })),
          { separator: true },
          {
            label: "MIDI settings…",
            onSelect: () => useShell.getState().set({ settingsOpen: true }),
          },
        ])
      }
    >
      <span className="label !text-ink">{name}</span>
      {detected && detected.id !== activeId && <span className="text-[10px] text-lit">≠</span>}
      <ChevronDown size={12} className="text-dim" />
    </button>
  );
}
