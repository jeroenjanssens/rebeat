import { useShell } from "../../app/shell";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Dices, MoreHorizontal, RotateCcw, Save } from "lucide-react";
import { create } from "zustand";
import { contextMenu, dropdown } from "../../components/Menu";
import { AutoMark } from "../../components/AutoMark";
import { switchName } from "../../model/patchSwitches";
import { automateItems, controlItems } from "../../state/automationKnob";
import { RANDOM_GROUPS, randomizePatch } from "../../model/randomize";
import { SYNTH_EXT, exportSynth, importSynth } from "../../library/rbsynth";
import { platform } from "../../platform";
import { Encoder } from "../../components/Encoder";
import { Keyboard } from "../../components/Keyboard";
import { toast } from "../../components/Toast";
import * as engine from "../../engine/engine";
import { soundChanged } from "../../model/tracks";
import { SYNTH_PRESETS, patchOf, voiceSound } from "../../engine/instruments";
import { Scope } from "../../components/Scope";
import {
  editPatch,
  macroKey,
  resetMacros,
  macroValues,
  setSynthParam,
} from "../../library/synthTrack";
import { useSettings } from "../../state/settings";
import * as Tone from "tone";
import type { WorkletSynth } from "../../engine/synth/node";
import {
  endLibraryEdit,
  libraryEditSound,
  librarySoundVoice,
  resumeLibraryEdit,
  undoLibrarySound,
  updateLibrarySound,
  useLibraryEdits,
} from "../../library/libraryEdit";
import { dock } from "../../app/shell";
import { synthEditorTitle } from "../../app/openers";
import { saveLayout } from "../../app/layouts";
import { EnvelopeView, H, LfoView, W } from "./pictures";
import { HoldButton, ResonatorPicture, TablePicture } from "./wavetable";
import { useDeviceWheels, useHeard, type KeysOwner } from "./heard";
import { useMidi } from "../../audio-io/midi";
import { FACTORY_TABLES, tableName } from "../../model/wavetables";
import { useWavetables } from "../../library/wavetables";
import { useLibrary } from "../../library/library";
import { wavetableFromFile, wavetableFromSample } from "../../app/WavetableDialog";
import { factorySynth } from "../../library/synths";
import { saveInstrument, userEntry, useUserInstruments } from "../../library/userInstruments";
import { CATALOG } from "../../library/instruments";
import {
  INIT_PATCH,
  TABLE_SLOTS,
  applyMacros,
  clone,
  numberAt,
  refreshMacros,
  withMacroValues,
  MOD_DESTS,
  type ModDest,
  type SynthPatch,
} from "../../model/synth";
import type { Track } from "../../model/types";
import { useSelectedTrack, useStore } from "../../state/store";
import { noteOn as keysNoteOn, registerKeysEditor } from "../../state/keys";
import { playInstrumentOn, setSound, soundLabel } from "../../state/trackActions";
import { Basic } from "./basic";
import { Macros, Matrix, pathHint } from "./matrix";
import { Box, Choice, Group, SwitchSelect, Toggle } from "./switches";

/** A/B compare: per track, which side is playing and the other side's patch (this session). */
const useAB = create<{ ab: Record<string, { side: "A" | "B"; other: SynthPatch }> }>(() => ({
  ab: {},
}));
import {
  KNOB_OF_DEST,
  SECTIONS,
  fromKnob,
  knobDef,
  modRanges,
  modulated,
  paramName,
  paramOf,
  toKnob,
  type PatchParam,
} from "../../model/patchParams";

/** What the editor works on: a track in the project, or a library sound (D91). */
interface EditTarget {
  library: boolean;
  update(fn: (t: Track) => void, key?: string): void;
  synth(): Pick<WorkletSynth, "monitor" | "modulation" | "control"> | undefined;
  /** Start a held note; returns how to let go. */
  hold(pitch: number, velocity: number): () => void;
  /** Play it once (the wave picture); returns for how long. */
  once(): number;
  /** Its own undo (library sounds aren't in the project's history). */
  undo?(redo: boolean): void;
  /** What the keys play into when they play this synth (its piano lights their notes). */
  owner: KeysOwner;
}

const trackTarget = (
  track: Track,
  commit: ReturnType<typeof useStore.getState>["commit"],
): EditTarget => ({
  library: false,
  update: (fn, key) =>
    commit((pr) => {
      const t = pr.tracks.find((x) => x.id === track.id);
      if (t) fn(t);
    }, key),
  synth: () => engine.editorSynth(track),
  // route through keys.ts so the live voice is used and notes are recorded (D126)
  hold: (pitch, velocity) => keysNoteOn(pitch, velocity, "screen"),
  once: () => engine.playOnce(track),
  owner: { trackId: track.id },
});

const libraryTarget = (key: string, track: Track): EditTarget => ({
  library: true,
  owner: { panelId: `synth-editor:lib:${key}` },
  update: (fn, undoKey) => updateLibrarySound(key, fn, undoKey),
  undo: (redo) => undoLibrarySound(key, redo),
  synth: () => librarySoundVoice(key)?.synth,
  hold: (pitch, velocity) => {
    const release = librarySoundVoice(key)?.hold?.(pitch, velocity, Tone.now());
    return () => release?.(Tone.now());
  },
  once: () => {
    librarySoundVoice(key)?.play(
      [{ pitch: track.category === "bass" ? 36 : 60, length: 6, velocity: 0.8 }],
      Tone.now() + 0.01,
      0.125,
    );
    return 0.75;
  },
});

/** A library sound in the synth editor (no track, D91): saved to Your sounds as you go. */
function LibrarySoundEditor({ libraryKey, sound }: { libraryKey: string; sound?: string }) {
  const track = useLibraryEdits((s) => s.entries[libraryKey]?.track);
  const name = track?.sound?.name ?? track?.name;
  const panelId = `synth-editor:lib:${libraryKey}`;
  // a tab restored after a reload: open its sound again (yours once they're loaded)
  const yours = useUserInstruments((s) => s.list);
  const saved = sound?.startsWith("user:")
    ? yours.find((r) => `user:${r.id}` === sound)
    : undefined;
  const entry = saved ? userEntry(saved) : CATALOG.find((c) => c.id === sound);
  useEffect(() => {
    if (!track && entry) resumeLibraryEdit(libraryKey, entry);
  }, [track, entry, libraryKey]);
  // the tab remembers what it edits now (a factory synth's first change makes it your copy)
  const now = track ? libraryEditSound(track) : undefined;
  useEffect(() => {
    const api = dock.api;
    if (!api || !now || now === sound) return;
    api.getPanel(panelId)?.api.updateParameters({ library: libraryKey, sound: now });
    // parameters alone don't change the layout: save it, so a reload opens the copy
    saveLayout(api);
  }, [now, sound, panelId, libraryKey]);
  useEffect(() => {
    if (name) dock.api?.getPanel(`synth-editor:lib:${libraryKey}`)?.api.setTitle(`${name} · synth`);
  }, [libraryKey, name]);
  useEffect(() => () => endLibraryEdit(libraryKey), [libraryKey]);
  // the keys can follow this editor (D132): it plays the library sound's own voice
  useEffect(() => {
    if (!name) return;
    return registerKeysEditor({
      panelId: `synth-editor:lib:${libraryKey}`,
      name,
      hold: (pitch, velocity) => {
        const release = librarySoundVoice(libraryKey)?.hold?.(pitch, velocity, Tone.now());
        return () => release?.(Tone.now());
      },
      control: (n, v) => librarySoundVoice(libraryKey)?.synth?.control(n, v),
    });
  }, [libraryKey, name]);
  if (!track)
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-[12px] text-faint">
        {sound?.startsWith("user:") && !saved
          ? "Opening your synth…"
          : sound && !entry
            ? "This synth isn't in the library any more."
            : "Double-click a synth in the library to edit it here."}
      </div>
    );
  return <Editor track={track} target={libraryTarget(libraryKey, track)} />;
}

/** Shape a track's synth (D81, D83), or a library synth's (D91); built-ins never change. */
export function SynthEditorPanel({ params }: { params?: Record<string, unknown> }) {
  const library = params?.library as string | undefined;
  if (library)
    return <LibrarySoundEditor libraryKey={library} sound={params?.sound as string | undefined} />;
  return <TrackSynthEditor own={params?.trackId as string | undefined} />;
}

function TrackSynthEditor({ own }: { own?: string }) {
  const commit = useStore((s) => s.commit);
  const selected = useSelectedTrack();
  // a tab of its own track (openSynthEditor), or the one that follows the selection
  const owned = useStore((s) => (own ? s.project.tracks.find((t) => t.id === own) : undefined));
  const track = own ? owned : selected;
  const name = track?.name;
  useEffect(() => {
    if (own && name) dock.api?.getPanel(`synth-editor:${own}`)?.api.setTitle(synthEditorTitle(own));
  }, [own, name]);
  const src = track && track.mode !== "clip" ? voiceSound(track) : null;
  // the keys can follow this editor (D132): it plays its track
  const trackId = src?.source === "synth" ? track?.id : undefined;
  useEffect(() => {
    if (!trackId || !name) return;
    return registerKeysEditor({
      panelId: own ? `synth-editor:${own}` : "synth-editor",
      name,
      trackId,
    });
  }, [own, trackId, name]);
  if (own && !track)
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-[12px] text-faint">
        This track isn't in the project (any more).
      </div>
    );
  if (!track || !src || src.source !== "synth")
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-[12px] text-faint">
        <p>
          {own
            ? `${track?.name} doesn't play a synth now.`
            : "Select a step track that plays a synth to shape its sound here."}
        </p>
        {track && track.mode !== "clip" && (
          <button
            className="tool-btn border border-line"
            onClick={() => setSound(track.id, { source: "synth", preset: "init" })}
          >
            Make {track.name} a synth
          </button>
        )}
      </div>
    );
  return <Editor key={track.id} track={track} target={trackTarget(track, commit)} />;
}

/**
 * The editor draws hundreds of knobs: it only redraws when what it shows changes (the track's
 * sound, SOUND knobs, name or color), not when a fader moves the track's level or sends.
 */
const Editor = memo(
  EditorView,
  (a, b) =>
    a.track === b.track ||
    (a.track.id === b.track.id &&
      a.track.name === b.track.name &&
      a.track.color === b.track.color &&
      !soundChanged(a.track, b.track)),
);

function EditorView({ track, target }: { track: Track; target: EditTarget }) {
  const src = voiceSound(track);
  const patch = patchOf(src);
  // what you hear: the macros where the track's SOUND knobs have them
  const values = macroValues(track, patch);
  const shown = applyMacros(withMacroValues(patch, values));
  const view = useSettings((s) => s.synthView);
  const bpm = useStore((s) => s.project.bpm);
  const factory = factorySynth(src.preset ?? "");
  const defaults = factory?.patch ?? INIT_PATCH;
  const edited = !!src.patch;
  // your copy of a factory synth (made by the first edit, D90), kept in Your sounds
  const copy = useUserInstruments((s) =>
    src.from ? s.list.find((r) => `user:${r.id}` === src.from && r.copyOf) : undefined,
  );
  const [saving, setSaving] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  // the keyboard's lowest C: two octaves around the track's range
  const [low, setLow] = useState(track.category === "bass" ? 24 : 48);
  // Hold (D247): a note held while you scrub a picture; the last key played (C4 at first)
  const [held, setHeld] = useState(false);
  const holding = useRef<(() => void) | null>(null);
  const lastKey = useRef(track.category === "bass" ? 36 : 60);
  const letGo = () => {
    holding.current?.();
    holding.current = null;
    setHeld(false);
  };
  const toggleHold = () => {
    if (holding.current) return letGo();
    holding.current = target.hold(lastKey.current, 0.8);
    setHeld(true);
  };
  useEffect(() => () => holding.current?.(), []);
  // what the keys play into this synth (the MiniLab 3, any MIDI keyboard, the play styles):
  // lit on the piano, which follows the octave you play in
  const heard = useHeard(target.owner);
  const [seen, setSeen] = useState(heard);
  if (seen !== heard) {
    setSeen(heard);
    // a note below or above the two octaves moves them there (the C below it, or so it's in
    // the upper octave)
    const out = [...heard.keys()].filter((n) => n < low || n > low + 24);
    const n = out[out.length - 1];
    if (n !== undefined)
      setLow(Math.max(12, Math.min(84, n < low ? n - (n % 12) : n - (n % 12) - 12)));
  }
  // the keyboard and wheels: always, or only while no MIDI keyboard is connected
  const keysSetting = useSettings((s) => s.synthKeyboard);
  const midiIn = useMidi((s) => s.inputs.length > 0);
  const showKeys = keysSetting === "always" || !midiIn;
  // Stop lets it go too (a stop silences everything, D99)
  useEffect(
    () =>
      useStore.subscribe((st, prev) => {
        if (prev.playing && !st.playing && holding.current) {
          holding.current();
          holding.current = null;
          setHeld(false);
        }
      }),
    [],
  );

  /** Change the patch: the first edit of a factory synth makes your copy (editPatch). */
  const onTrack = target.update;
  const edit = (fn: (p: SynthPatch) => void, key?: string) => onTrack((t) => editPatch(t, fn), key);
  // values that macros move keep the macros' place (setThroughMacros)
  const set = (path: string, v: unknown) =>
    onTrack((t) => setSynthParam(t, path, v), `syn-${track.id}-${path}`);
  /** Paste a copied block's settings at `prefix` ("osc.1"); macros keep their place. */
  const paste =
    (prefix: string, skip: string[] = []) =>
    (data: Record<string, unknown>) =>
      onTrack((t) => {
        for (const [k, v] of Object.entries(data))
          if (!skip.includes(k)) setSynthParam(t, `${prefix}.${k}`, v);
      }, `paste-${prefix}-${performance.now()}`);

  // A/B: the other side waits here; B starts as a copy of A
  const ab = useAB((s) => s.ab[track.id]);
  const side = ab?.side ?? "A";
  const pickSide = (to: "A" | "B") => {
    if (to === side) return;
    const current = clone(patch);
    const next = clone(ab?.other ?? patch);
    onTrack((t) => editPatch(t, (p) => Object.assign(p, next)));
    useAB.setState((s) => ({ ab: { ...s.ab, [track.id]: { side: to, other: current } } }));
  };
  const name = src.name ?? factory?.name ?? "Synth";
  const more = (el: HTMLElement) =>
    dropdown(el, [
      {
        label: "New synth with the wizard…",
        onSelect: () => useShell.getState().set({ wizardOpen: true }),
      },
      { separator: true },
      {
        label: "Init patch",
        onSelect: () =>
          onTrack((t) => {
            editPatch(t, (p) => Object.assign(p, clone(INIT_PATCH)));
            resetMacros(t);
          }),
      },
      {
        render: (close) => (
          <RandomizeMenu
            onRandomize={(amount, locked) => {
              onTrack((t) =>
                editPatch(t, (p) =>
                  Object.assign(p, randomizePatch(p, amount, locked, macroValues(t, p))),
                ),
              );
              close();
            }}
          />
        ),
      },
      { separator: true },
      {
        label: `Export ${SYNTH_EXT}…`,
        onSelect: () => void exportSynth(track, name),
      },
      {
        label: `Import ${SYNTH_EXT}…`,
        // onto a track (a library sound is already in the library)
        disabled: target.library,
        onSelect: async () => {
          const [f] = await platform.files.open({ accept: [SYNTH_EXT] });
          if (!f) return;
          try {
            const entry = await importSynth(f);
            playInstrumentOn(track.id, entry);
            toast(`Imported “${entry.name}” into Your sounds`);
          } catch (e) {
            toast(`Couldn't read ${f.name}: ${e instanceof Error ? e.message : e}`, "error");
          }
        },
      },
    ]);
  const setMacro = (i: number, v: number) =>
    onTrack((t) => void (t.params[macroKey(i)] = v), `syn-${track.id}-macro${i}`);

  // modulation: the range the matrix can move each knob, and where it is now (live)
  const synth = target.synth();
  useEffect(() => {
    synth?.monitor(true);
    return () => synth?.monitor(false);
  }, [synth]);
  const ranges = modRanges(shown);
  const DESTS = Object.keys(MOD_DESTS) as ModDest[];
  const knob = (d: PatchParam) => {
    const value = numberAt(shown, d.path);
    const r = ranges.get(d.path);
    const octaves = r ? KNOB_OF_DEST[r.dest]?.octaves : false;
    const toK = (v: number) => toKnob(d, Math.min(d.max, Math.max(d.min, v)));
    return (
      <Encoder
        key={d.path}
        def={knobDef(d, numberAt(defaults, d.path))}
        value={toKnob(d, value)}
        onChange={(k) => set(d.path, fromKnob(d, k))}
        color={track.color}
        size={34}
        // room for the longer names (Hardness, Stiffness, Structure)
        width={d.label.length > 7 ? 66 : undefined}
        hint={pathHint(d.path)}
        midiTarget={target.library ? undefined : `track:${track.id}:synth:${d.path}`}
        learnLabel={`${track.name} · ${paramName(d.path)}`}
        modRange={
          r
            ? [toK(modulated(value, r.lo, octaves)), toK(modulated(value, r.hi, octaves))]
            : undefined
        }
        live={
          r && synth
            ? () => {
                const m = synth.modulation();
                return m ? toK(modulated(value, m[DESTS.indexOf(r.dest)], octaves)) : null;
              }
            : undefined
        }
      />
    );
  };
  const knobs = (id: string, skip: (path: string) => boolean = () => false) => (
    <div className="flex flex-wrap gap-1">
      {SECTIONS.find((s) => s.id === id)!
        .params.filter((d) => !skip(d.path))
        .map(knob)}
    </div>
  );

  // switches (D231): MIDI learn and Automate in their menus, an A when automated, and while the
  // song plays they show their lane's choice
  const sw = (path: string) => ({
    path,
    target: target.library ? undefined : `track:${track.id}:synth:${path}`,
    learnLabel: `${track.name} · ${switchName(path)}`,
  });
  const choice = <T extends string | number>(
    value: T,
    options: [T, string][],
    onPick: (v: T) => void,
    hint: string,
    path: string,
  ) => <Choice value={value} options={options} onPick={onPick} hint={hint} {...sw(path)} />;
  const toggle = (
    on: boolean,
    label: string,
    onFlip: (v: boolean) => void,
    hint: string,
    path: string,
  ) => <Toggle on={on} label={label} onFlip={onFlip} hint={hint} {...sw(path)} />;

  /** A knob's live value from the matrix (0..1 knobs only), for a picture's dot. */
  const liveOf = (path: string, lo = 0, hi = 1) => {
    const r = ranges.get(path);
    if (!r || !synth) return undefined;
    const value = numberAt(shown, path);
    return () => {
      const m = synth.modulation();
      return m ? Math.min(hi, Math.max(lo, value + m[DESTS.indexOf(r.dest)])) : null;
    };
  };
  /** Change the source or an oscillator's type: default macros refit the new sound (D257). */
  const reshape = (fn: (p: SynthPatch) => void) =>
    onTrack((t) => {
      let changed: number[] = [];
      editPatch(t, (p) => {
        fn(p);
        changed = refreshMacros(p);
      });
      for (const i of changed) delete t.params[macroKey(i)];
    });
  const userTables = useWavetables((s) => s.list);
  const selectedSample = useLibrary((s) => s.selectedId);
  const sampleNameOf = useLibrary((s) =>
    s.selectedId ? s.samples.find((x) => x.id === s.selectedId)?.name : undefined,
  );
  /** The table menu (D246): factory tables by group, yours, making one, the slots (D248). */
  const tableMenu = (el: HTMLElement, i: number) => {
    const o = shown.osc[i];
    const pick = (id: string) => set(`osc.${i}.table`, id);
    const groups = [...new Set(FACTORY_TABLES.map((t) => t.group))];
    const made = (id: string) => pick(id);
    dropdown(el, [
      ...groups.flatMap((g) => [
        { heading: g },
        ...FACTORY_TABLES.filter((t) => t.group === g).map((t) => ({
          label: t.name,
          checked: o.table === t.id,
          onSelect: () => pick(t.id),
        })),
      ]),
      { heading: "Your tables" },
      ...(userTables.length
        ? userTables.map((t) => ({
            label: t.name,
            checked: o.table === t.id,
            onSelect: () => pick(t.id),
          }))
        : [{ label: "None yet: make one from a sample", disabled: true }]),
      { separator: true },
      {
        label: sampleNameOf
          ? `From the selected sample (${sampleNameOf})…`
          : "From a sample (select one in the library)…",
        disabled: !sampleNameOf || !selectedSample,
        onSelect: () =>
          selectedSample && void wavetableFromSample(selectedSample, sampleNameOf ?? "Table", made),
      },
      {
        label: "Import a file…",
        onSelect: async () => {
          const [f] = await platform.files.open({
            accept: [".wav", ".aif", ".aiff", ".mp3", ".flac", ".ogg"],
          });
          if (f) void wavetableFromFile(f, made);
        },
      },
      { separator: true },
      {
        label:
          o.tables.length < TABLE_SLOTS - 1
            ? `Add ${tableName(o.table)} to a new slot, then pick another`
            : "All 8 slots are used",
        disabled: o.tables.length >= TABLE_SLOTS - 1,
        onSelect: () =>
          edit((p) => {
            const x = p.osc[i];
            x.tables.push(x.table);
            x.slot = 0;
          }),
      },
    ]);
  };

  const oscBox = (i: 0 | 1 | 2) => {
    const o = shown.osc[i];
    const wt = o.type === "wavetable";
    const t = `track:${track.id}:synth:osc.${i}`;
    return (
      <Box
        key={`o${i}`}
        title={`Oscillator ${i + 1}`}
        on={o.on}
        onToggle={(v) => set(`osc.${i}.on`, v)}
        hint="synth.osc.on"
        toggleSwitch={sw(`osc.${i}.on`)}
        clip={{ kind: "osc", data: o, paste: paste(`osc.${i}`, i === 0 ? ["sync"] : []) }}
      >
        <div className="flex flex-wrap gap-1.5">
          <Choice
            value={o.type}
            options={[
              ["analog", "Analog"],
              ["wavetable", "Wavetable"],
            ]}
            onPick={(v) => reshape((p) => void (p.osc[i].type = v))}
            hint="synth.osc.type"
            {...sw(`osc.${i}.type`)}
          />
          {toggle(
            o.retrigger,
            "Retrigger",
            (v) => set(`osc.${i}.retrigger`, v),
            "synth.osc.retrigger",
            `osc.${i}.retrigger`,
          )}
          {i > 0 &&
            toggle(
              o.sync,
              "Sync to 1",
              (v) => set(`osc.${i}.sync`, v),
              "synth.osc.sync",
              `osc.${i}.sync`,
            )}
        </div>
        {wt ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                className="input !h-6 min-w-0 max-w-[150px] truncate text-left"
                onClick={(e) => tableMenu(e.currentTarget, i)}
                data-hint="synth.wt.table"
                data-testid={`wt-table-${i}`}
                title="Pick a wavetable"
              >
                {tableName(o.table)} ▾
              </button>
              <SwitchSelect
                value={o.warp}
                onPick={(v) =>
                  edit((p) => {
                    p.osc[i].warp = v as SynthPatch["osc"][number]["warp"];
                    // Bend is straight at the middle
                    if (v === "bend" && p.osc[i].warpAmount === 0) p.osc[i].warpAmount = 0.5;
                  })
                }
                hint="synth.osc.warp"
                {...sw(`osc.${i}.warp`)}
              />
              {toggle(
                o.smooth,
                "Smooth",
                (v) => set(`osc.${i}.smooth`, v),
                "synth.osc.smooth",
                `osc.${i}.smooth`,
              )}
              <HoldButton on={held} onToggle={toggleHold} />
            </div>
            <TablePicture
              tableId={o.slot > 0 ? (o.tables[o.slot - 1] ?? o.table) : o.table}
              name={tableName(o.table)}
              position={o.position}
              live={liveOf(`osc.${i}.position`)}
              target={target.library ? undefined : `${t}.position`}
              color={track.color}
              onChange={(v) => set(`osc.${i}.position`, v)}
              onReset={() => set(`osc.${i}.position`, defaults.osc[i].position ?? 0)}
              onDropFile={(f) => void wavetableFromFile(f, (id) => set(`osc.${i}.table`, id))}
              onMenu={
                target.library
                  ? undefined
                  : (e) =>
                      contextMenu(
                        e,
                        controlItems(
                          `${t}.position`,
                          `${track.name} · ${paramName(`osc.${i}.position`)}`,
                        ),
                      )
              }
            />
            {o.tables.length > 0 && (
              <div
                className="flex flex-wrap items-center gap-1"
                data-hint="synth.wt.slots"
                data-testid={`wt-slots-${i}`}
              >
                <span className="label !text-[9px]">Slots</span>
                {[o.table, ...o.tables].map((id, k) => (
                  <span key={k} className="inline-flex items-center">
                    <button
                      className="tool-btn !h-5 border border-line !px-1.5 !text-[10px]"
                      data-active={o.slot === k}
                      onClick={() => set(`osc.${i}.slot`, k)}
                      title={`Slot ${k + 1}: ${tableName(id)}`}
                    >
                      {k + 1} {tableName(id)}
                    </button>
                    {k > 0 && (
                      <button
                        className="tool-btn !h-5 !px-0.5 text-faint"
                        title={`Remove slot ${k + 1}`}
                        onClick={() =>
                          edit((p) => {
                            p.osc[i].tables.splice(k - 1, 1);
                            if (p.osc[i].slot >= k) p.osc[i].slot = Math.max(0, p.osc[i].slot - 1);
                          })
                        }
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                <AutoMark target={target.library ? undefined : `${t}.slot`} />
              </div>
            )}
          </>
        ) : (
          <ShapePicker
            shape={o.shape}
            pw={o.pw}
            color={track.color}
            onPick={(v) => set(`osc.${i}.shape`, v)}
            onMenu={
              target.library
                ? undefined
                : (e) => {
                    const name = `${track.name} · ${paramName(`osc.${i}.shape`)}`;
                    const steps = automateItems(`${t}.shape~steps`).map((m) =>
                      "label" in m && m.label === "Automate"
                        ? { ...m, label: "Automate as steps" }
                        : "label" in m && m.label === "Show its automation"
                          ? { ...m, label: "Show its automation as steps" }
                          : m,
                    );
                    contextMenu(e, [...controlItems(`${t}.shape`, name), ...steps.slice(1)]);
                  }
            }
          />
        )}
        {knobs(`osc${i}`, (p) =>
          wt
            ? p.endsWith(".shape") ||
              p.endsWith(".pw") ||
              (p.endsWith(".warpAmount") && o.warp === "none") ||
              (p.endsWith(".phase") && !o.retrigger)
            : p.endsWith(".shape") ||
              p.endsWith(".position") ||
              p.endsWith(".warpAmount") ||
              (p.endsWith(".pw") && o.shape < 2.5) ||
              (p.endsWith(".phase") && !o.retrigger),
        )}
      </Box>
    );
  };

  const phys = shown.physical;
  const physical = shown.source === "physical";
  const pt = `track:${track.id}:synth:physical`;
  const physicalBoxes = () => [
    <Box key="ex" title="Exciter">
      <div className="flex flex-wrap gap-1.5">
        <SwitchSelect
          value={phys.exciter.type}
          onPick={(v) => set("physical.exciter.type", v)}
          hint="synth.phys.exciter"
          {...sw("physical.exciter.type")}
        />
        <HoldButton on={held} onToggle={toggleHold} />
      </div>
      {knobs(
        "exciter",
        // pressure is for bowing, blowing and noise
        (p) => p.endsWith(".pressure") && !["bow", "blow", "noise"].includes(phys.exciter.type),
      )}
    </Box>,
    <Box key="res" title="Resonator">
      <div className="flex flex-wrap gap-1.5">
        <SwitchSelect
          value={phys.resonator.model}
          onPick={(v) =>
            reshape((p) => void (p.physical.resonator.model = v as typeof phys.resonator.model))
          }
          hint="synth.phys.model"
          {...sw("physical.resonator.model")}
        />
        {phys.resonator.model === "tube"
          ? choice(
              phys.resonator.end,
              [
                ["closed", "Closed"],
                ["open", "Open"],
              ],
              (v) => set("physical.resonator.end", v),
              "synth.phys.end",
              "physical.resonator.end",
            )
          : phys.resonator.model !== "string" &&
            choice(
              phys.resonator.modes,
              [
                [8, "8"],
                [16, "16"],
                [32, "32 partials"],
              ],
              (v) => set("physical.resonator.modes", v),
              "synth.phys.modes",
              "physical.resonator.modes",
            )}
      </div>
      <ResonatorPicture
        model={phys.resonator.model}
        position={phys.exciter.position}
        pickup={phys.resonator.pickup}
        livePosition={liveOf("physical.exciter.position", 0.02, 0.98)}
        livePickup={liveOf("physical.resonator.pickup", 0.02, 0.98)}
        targets={
          target.library
            ? undefined
            : { position: `${pt}.exciter.position`, pickup: `${pt}.resonator.pickup` }
        }
        color={track.color}
        onPosition={(v) => set("physical.exciter.position", v)}
        onPickup={(v) => set("physical.resonator.pickup", v)}
        onResetPosition={() => set("physical.exciter.position", defaults.physical.exciter.position)}
        onResetPickup={() => set("physical.resonator.pickup", defaults.physical.resonator.pickup)}
        onMenu={
          target.library
            ? undefined
            : (which, e) => {
                const path =
                  which === "position" ? "physical.exciter.position" : "physical.resonator.pickup";
                contextMenu(
                  e,
                  controlItems(
                    `track:${track.id}:synth:${path}`,
                    `${track.name} · ${paramName(path)}`,
                  ),
                );
              }
        }
      />
      {knobs("resonator", (p) =>
        p.endsWith(".structure")
          ? phys.resonator.model === "string" || phys.resonator.model === "tube"
          : false,
      )}
    </Box>,
    <Box key="body" title="Body">
      <div className="flex flex-wrap gap-1.5">
        <SwitchSelect
          value={phys.body.type}
          onPick={(v) => set("physical.body.type", v)}
          hint="synth.phys.body"
          {...sw("physical.body.type")}
        />
      </div>
      {phys.body.type !== "none" && knobs("body")}
    </Box>,
  ];

  const filterBox = (i: 0 | 1) => {
    const f = shown.filters[i];
    return (
      <Box
        key={`f${i}`}
        title={`Filter ${i + 1}`}
        on={f.on}
        onToggle={(v) => set(`filters.${i}.on`, v)}
        hint="synth.filter.on"
        toggleSwitch={sw(`filters.${i}.on`)}
        clip={{ kind: "filter", data: f, paste: paste(`filters.${i}`) }}
      >
        <div className="flex flex-wrap gap-1.5">
          {choice(
            f.model,
            [
              ["ladder", "Ladder"],
              ["svf", "SVF"],
            ],
            (v) => set(`filters.${i}.model`, v),
            "synth.filter.model",
            `filters.${i}.model`,
          )}
          {(f.model === "svf" || f.type !== "lp") &&
            choice(
              f.type,
              [
                ["lp", "LP"],
                ["hp", "HP"],
                ["bp", "BP"],
                ["notch", "Notch"],
              ],
              (v) => set(`filters.${i}.type`, v),
              "synth.filter.type",
              `filters.${i}.type`,
            )}
          {i === 1 &&
            choice(
              patch.routing,
              [
                ["serial", "After 1"],
                ["parallel", "Beside 1"],
              ],
              (v) => set("routing", v),
              "synth.filter.routing",
              "routing",
            )}
        </div>
        {knobs(`filter${i}`)}
      </Box>
    );
  };

  const envBox = (i: 0 | 1 | 2, title: string) => {
    const e = shown.envs[i];
    return (
      <Box key={`e${i}`} title={title} clip={{ kind: "env", data: e, paste: paste(`envs.${i}`) }}>
        <EnvelopeView
          env={e}
          color={track.color}
          onChange={(next, key) =>
            onTrack((t) => {
              for (const [k, v] of Object.entries(next)) setSynthParam(t, `envs.${i}.${k}`, v);
            }, key)
          }
          hint="synth.env.view"
        />
        <div className="flex flex-wrap gap-1.5">
          {toggle(
            e.loop,
            "Loop",
            (v) => set(`envs.${i}.loop`, v),
            "synth.env.loop",
            `envs.${i}.loop`,
          )}
        </div>
        {knobs(`env${i}`)}
      </Box>
    );
  };

  const lfoBox = (i: 0 | 1 | 2) => {
    const l = shown.lfos[i];
    return (
      <Box
        key={`l${i}`}
        title={`LFO ${i + 1}`}
        clip={{ kind: "lfo", data: l, paste: paste(`lfos.${i}`) }}
      >
        <div className="flex flex-wrap gap-1.5">
          <SwitchSelect
            value={l.shape}
            onPick={(v) => set(`lfos.${i}.shape`, v)}
            hint="synth.lfo.shape"
            {...sw(`lfos.${i}.shape`)}
          />
          <SwitchSelect
            value={l.sync}
            onPick={(v) => set(`lfos.${i}.sync`, v)}
            hint="synth.lfo.sync"
            {...sw(`lfos.${i}.sync`)}
          />
          {choice(
            l.mode,
            [
              ["voice", "Per note"],
              ["global", "Global"],
            ],
            (v) => set(`lfos.${i}.mode`, v),
            "synth.lfo.mode",
            `lfos.${i}.mode`,
          )}
          {toggle(
            l.unipolar,
            "0..1",
            (v) => set(`lfos.${i}.unipolar`, v),
            "synth.lfo.unipolar",
            `lfos.${i}.unipolar`,
          )}
        </div>
        <LfoView lfo={l} color={track.color} bpm={bpm} />
        {knobs(`lfo${i}`, (p) => p.endsWith(".rate") && !!l.sync)}
      </Box>
    );
  };

  const save = async (name: string) => {
    const entry = await saveInstrument(
      useStore.getState().project.tracks.find((t) => t.id === track.id)!,
      name,
    );
    // the track now plays the saved instrument
    setSound(track.id, entry.source);
    toast(`Saved “${name}” to Your sounds`);
    setSaving(null);
  };

  return (
    <div
      ref={root}
      className="flex h-full min-h-0 flex-col outline-none"
      tabIndex={0}
      data-testid="synth-editor"
      data-library={target.library || undefined}
      onKeyDown={(e) => {
        // a library sound's own undo, instead of the project's
        if (!target.undo || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
        if ((e.target as HTMLElement).closest("input")) return;
        e.preventDefault();
        e.stopPropagation();
        target.undo(e.shiftKey);
      }}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
        <span className="h-3 w-1 rounded" style={{ background: track.color }} />
        {target.library ? (
          <>
            <span className="label !text-ink">{name}</span>
            <span className="text-[10.5px] text-faint" data-testid="synth-library-note">
              {src.from
                ? "in Your sounds: saved as you go"
                : "a factory synth: your first change makes your own copy"}
            </span>
          </>
        ) : (
          <span className="label !text-ink">{track.name}</span>
        )}
        {!target.library && (
          <select
            className="input !h-6 max-w-[220px]"
            value={src.from ? "" : src.preset}
            onChange={(e) => setSound(track.id, { source: "synth", preset: e.target.value })}
            title="Start from a factory synth"
            data-hint="synth.start"
            data-testid="synth-start"
          >
            {src.from && <option value="">{soundLabel(track)}</option>}
            {[...new Set(SYNTH_PRESETS.map((p) => p.group))].map((g) => (
              <optgroup key={g} label={g}>
                {SYNTH_PRESETS.filter((p) => p.group === g).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
        {!target.library && edited && !src.from && (
          <span className="text-[10.5px] text-lit">edited</span>
        )}
        {!target.library && copy && factory && (
          <span className="text-[10.5px] text-faint" data-testid="synth-copy-note">
            your copy of {factory.name}, in Your sounds
          </span>
        )}
        <span className="flex-1" />
        <div className="segmented" data-hint="synth.ab" data-testid="synth-ab">
          {(["A", "B"] as const).map((s) => (
            <button key={s} data-active={side === s} onClick={() => pickSide(s)}>
              {s}
            </button>
          ))}
        </div>
        <button
          className="tool-btn"
          title="Init, randomize, export, import"
          data-hint="synth.more"
          data-testid="synth-more"
          onClick={(e) => more(e.currentTarget)}
        >
          <MoreHorizontal size={14} />
        </button>
        <div className="segmented" data-hint="synth.view" data-testid="synth-view">
          {(
            [
              ["basic", "Basic"],
              ["advanced", "Advanced"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              data-active={view === v}
              onClick={() => useSettings.getState().set({ synthView: v })}
            >
              {label}
            </button>
          ))}
        </div>
        {!target.library && edited && (!src.from || copy) && factory && (
          <button
            className="tool-btn"
            title={`Back to the factory “${factory.name}”`}
            data-hint="synth.revert"
            onClick={() => setSound(track.id, { source: "synth", preset: src.preset })}
          >
            <RotateCcw size={13} />
          </button>
        )}
        {target.library ? null : saving === null ? (
          <button
            className="tool-btn border border-line"
            data-hint="synth.save"
            data-testid="synth-save"
            onClick={() => setSaving(src.name ?? `${factory?.name ?? "Synth"} (mine)`)}
          >
            <Save size={13} /> Save to library
          </button>
        ) : (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (saving.trim()) void save(saving.trim());
            }}
          >
            <input
              autoFocus
              className="input !h-6 w-44"
              value={saving}
              onChange={(e) => setSaving(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setSaving(null)}
              data-testid="synth-save-name"
            />
            <button className="hw-btn !min-h-[24px]" type="submit" data-testid="synth-save-ok">
              Save
            </button>
          </form>
        )}
      </div>
      {view === "basic" ? (
        <Basic
          track={track}
          patch={shown}
          values={values}
          setMacro={setMacro}
          set={set}
          glide={knob(paramOf("voice.glide")!)}
          learn={!target.library}
        />
      ) : (
        <>
          <div className="flex shrink-0 items-center border-b border-line">
            <SignalFlow patch={shown} color={track.color} onPlay={() => target.once()} />
            {/* a library sound has no track to watch (it plays through the preview) */}
            {!target.library && (
              <div className="flex shrink-0 gap-1.5 px-2">
                <div className="h-[40px] w-[120px]" data-hint="synth.scope">
                  <Scope
                    trackId={track.id}
                    color={track.color}
                    meter={false}
                    className="h-full w-full"
                  />
                </div>
                <div className="h-[40px] w-[120px]" data-hint="synth.spectrum">
                  <Scope
                    trackId={track.id}
                    color={track.color}
                    meter={false}
                    mode="spectrum"
                    className="h-full w-full"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2">
            <Group id="osc" title={physical ? "Physical model" : "Oscillators"}>
              <div className="col-span-full flex flex-wrap items-center gap-2">
                <span className="label">Source</span>
                <Choice
                  value={shown.source}
                  options={[
                    ["oscillators", "Oscillators"],
                    ["physical", "Physical model"],
                  ]}
                  onPick={(v) =>
                    reshape((p) => {
                      p.source = v;
                      // a physical model decays by itself: the amp envelope only shapes the ends
                      if (v === "physical") {
                        const a = p.envs[0];
                        a.attack = Math.min(a.attack, 0.005);
                        a.sustain = 1;
                        a.release = Math.max(a.release, 1);
                      }
                    })
                  }
                  hint="synth.source"
                  {...sw("source")}
                />
                {physical && (
                  <span className="text-[10.5px] text-faint">
                    {phys.exciter.type === "oscillators"
                      ? "The oscillators below play into the resonator."
                      : "It decays by itself: set Decay in the resonator."}
                  </span>
                )}
              </div>
              {physical && physicalBoxes()}
              {(!physical || phys.exciter.type === "oscillators") && (
                <>
                  {oscBox(0)}
                  {oscBox(1)}
                  {oscBox(2)}
                  <Box title="Sub · noise · ring · FM">
                    <div className="flex flex-wrap gap-1.5">
                      {choice(
                        patch.sub.octave,
                        [
                          [-1, "Sub −1"],
                          [-2, "−2"],
                        ],
                        (v) => set("sub.octave", v),
                        "synth.sub.octave",
                        "sub.octave",
                      )}
                      {choice(
                        patch.sub.shape,
                        [
                          ["sine", "Sine"],
                          ["square", "Square"],
                        ],
                        (v) => set("sub.shape", v),
                        "synth.sub.shape",
                        "sub.shape",
                      )}
                      {choice(
                        patch.noise.color,
                        [
                          ["white", "White"],
                          ["pink", "Pink"],
                        ],
                        (v) => set("noise.color", v),
                        "synth.noise.color",
                        "noise.color",
                      )}
                      {choice(
                        patch.fm.route,
                        [
                          ["2>1", "FM 2→1"],
                          ["3>1", "3→1"],
                          ["3>2", "3→2"],
                          ["1>1", "1→1"],
                        ],
                        (v) => set("fm.route", v),
                        "synth.fm.route",
                        "fm.route",
                      )}
                    </div>
                    {knobs("extra")}
                  </Box>
                </>
              )}
            </Group>
            <Group id="filters" title="Filters">
              {filterBox(0)}
              {filterBox(1)}
            </Group>
            <Group id="envs" title="Envelopes">
              {envBox(0, "Amp envelope")}
              {envBox(1, "Filter envelope")}
              {envBox(2, "Mod envelope")}
            </Group>
            <Group id="lfos" title="LFOs">
              {lfoBox(0)}
              {lfoBox(1)}
              {lfoBox(2)}
            </Group>
            <Group id="matrix" title="Matrix · macros">
              <Box title="Mod matrix" wide>
                <Matrix
                  patch={patch}
                  onChange={(fn) => edit(fn)}
                  color={track.color}
                  target={target.library ? undefined : `track:${track.id}:synth:`}
                  name={track.name}
                />
              </Box>
              <Box title="Macros" wide>
                <Macros
                  track={track}
                  patch={patch}
                  values={values}
                  setMacro={setMacro}
                  onChange={(fn, key) => edit(fn, key)}
                  learn={!target.library}
                />
              </Box>
            </Group>
            <Group id="voice" title="Voice · output">
              <Box title="Voice">
                <div className="flex flex-wrap gap-1.5">
                  {choice(
                    patch.voice.mode,
                    [
                      ["poly", "Poly"],
                      ["mono", "Mono"],
                      ["legato", "Legato"],
                    ],
                    (v) => set("voice.mode", v),
                    "synth.voice.mode",
                    "voice.mode",
                  )}
                  {choice(
                    patch.voice.glideMode,
                    [
                      ["always", "Glide always"],
                      ["legato", "Overlapping"],
                    ],
                    (v) => set("voice.glideMode", v),
                    "synth.voice.glideMode",
                    "voice.glideMode",
                  )}
                  {choice(
                    patch.voice.steal,
                    [
                      ["oldest", "Steal oldest"],
                      ["quietest", "Quietest"],
                    ],
                    (v) => set("voice.steal", v),
                    "synth.voice.steal",
                    "voice.steal",
                  )}
                </div>
                {knobs("voice")}
              </Box>
              <Box title="Output">{knobs("output")}</Box>
            </Group>
          </div>
        </>
      )}
      {showKeys && (
        <div className="flex h-[74px] shrink-0 gap-2 border-t border-line px-2 py-1.5">
          <Wheels synth={target.synth} owner={target.owner} />
          <div className="min-w-0 flex-1">
            <Keyboard
              low={low}
              scope={root}
              lit={heard}
              onOctave={(d) => setLow((l) => Math.max(12, Math.min(84, l + 12 * d)))}
              play={(pitch, velocity) => {
                // a key you play takes over from Hold
                lastKey.current = pitch;
                if (holding.current) letGo();
                return target.hold(pitch, velocity);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Pitch bend and mod wheel, like the ones beside a keyboard: bend springs back to the middle
 * when you let go; the mod wheel stays where you leave it.
 */
function Wheels({ synth, owner }: { synth: EditTarget["synth"]; owner: KeysOwner }) {
  const [bend, setBend] = useState(0);
  const [mod, setMod] = useState(0);
  // the device's wheels (the MiniLab's touch strips) move these too
  useDeviceWheels(owner, (name, value) => (name === "pitchbend" ? setBend(value) : setMod(value)));
  const send = (name: "pitchbend" | "modwheel", v: number) => synth()?.control(name, v);
  const wheel = (
    label: string,
    value: number,
    bipolar: boolean,
    onValue: (v: number) => void,
    onRelease: (() => void) | null,
    hint: string,
    testid: string,
  ) => {
    const at = (e: React.PointerEvent) => {
      const r = e.currentTarget.getBoundingClientRect();
      const k = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      onValue(bipolar ? k * 2 - 1 : k);
    };
    const pos = bipolar ? (value + 1) / 2 : value;
    return (
      <div className="flex flex-col items-center gap-0.5" data-hint={hint}>
        <div
          className="relative w-5 flex-1 cursor-ns-resize touch-none rounded bg-display"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            at(e);
          }}
          onPointerMove={(e) => e.buttons && at(e)}
          onPointerUp={() => onRelease?.()}
          data-testid={testid}
        >
          <div
            className="absolute inset-x-0.5 h-1.5 rounded-sm bg-[var(--lit)]"
            style={{ bottom: `calc(${pos * 100}% - 3px)` }}
          />
        </div>
        <span className="label !text-[8.5px]">{label}</span>
      </div>
    );
  };
  return (
    <div className="flex gap-1.5">
      {wheel(
        "Bend",
        bend,
        true,
        (v) => {
          setBend(v);
          send("pitchbend", v);
        },
        () => {
          setBend(0);
          send("pitchbend", 0);
        },
        "synth.wheel.bend",
        "bend-wheel",
      )}
      {wheel(
        "Mod",
        mod,
        false,
        (v) => {
          setMod(v);
          send("modwheel", v);
        },
        null,
        "synth.wheel.mod",
        "mod-wheel",
      )}
    </div>
  );
}

const SHAPE_NAMES = ["Sine", "Triangle", "Saw", "Pulse"];
/** The shapes to pick: the four, and halfway between each. */
const SHAPE_STOPS = [0, 0.5, 1, 1.5, 2, 2.5, 3];
const stopName = (k: number) =>
  Number.isInteger(k)
    ? SHAPE_NAMES[k]
    : `Between ${SHAPE_NAMES[Math.floor(k)].toLowerCase()} and ${SHAPE_NAMES[Math.ceil(k)].toLowerCase()}`;

/** One cycle of a shape (morphing as the engine does) as an SVG path in a w × h box. */
function shapePath(shape: number, pw: number, w: number, h: number) {
  const basic = (k: number, t: number) =>
    k === 0
      ? Math.sin(t * 2 * Math.PI)
      : k === 1
        ? 1 - 4 * Math.abs(t - 0.5)
        : k === 2
          ? 2 * t - 1
          : t < pw
            ? 1
            : -1;
  const a = Math.min(2, Math.floor(shape));
  const f = shape - a;
  const y = (v: number) => h / 2 - v * (h / 2 - 2);
  const n = 48;
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    // a hair before and after the pulse's edges, so they draw upright
    const t = Math.min(0.9999, i / n);
    return `${t * w},${y(basic(a, t) * (1 - f) + basic(a + 1, t) * f)}`;
  });
  return `M${pts.join(" L")}`;
}

/**
 * The oscillator's shape as pictures, always in view: one click picks one. The four shapes and
 * halfway between each (the engine morphs smoothly; macros and the matrix can go anywhere, and
 * the nearest pictures light up as much as they're heard).
 */
function ShapePicker({
  shape,
  pw,
  color,
  onPick,
  onMenu,
}: {
  shape: number;
  pw: number;
  color: string;
  onPick: (shape: number) => void;
  /** MIDI learn, Automate (the morph) and Automate as steps (D231). */
  onMenu?: (e: React.MouseEvent) => void;
}) {
  const w = 22;
  const h = 14;
  // Cache the SVG paths: they only depend on pw (not on the active shape or color).
  const paths = useMemo(() => SHAPE_STOPS.map((k) => shapePath(k, pw, w, h)), [pw]);
  return (
    <div
      className="flex gap-0.5"
      role="radiogroup"
      aria-label="Shape"
      data-hint="synth.osc.shape"
      onContextMenu={onMenu}
    >
      {SHAPE_STOPS.map((k, idx) => {
        // how much of this picture you hear (1 when it's exactly this one)
        const amount = Math.max(0, 1 - Math.abs(shape - k) * 2);
        const active = Math.abs(shape - k) < 0.125;
        return (
          <button
            key={k}
            role="radio"
            aria-checked={active}
            aria-label={stopName(k)}
            title={stopName(k)}
            data-active={active}
            data-shape={k}
            className="rounded border p-0.5"
            style={{
              borderColor: active ? color : "var(--line)",
              background: `color-mix(in oklab, ${color} ${Math.round(amount * 22)}%, transparent)`,
            }}
            onClick={() => onPick(k)}
          >
            <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
              <path
                d={paths[idx]}
                fill="none"
                stroke={amount > 0 ? color : "currentColor"}
                strokeWidth={1.3}
                opacity={0.45 + amount * 0.55}
              />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

/** Randomize: how far, and which sections stay as they are (remembered). */
function RandomizeMenu({
  onRandomize,
}: {
  onRandomize: (amount: number, locked: string[]) => void;
}) {
  const { amount, locked } = useSettings((s) => s.synthRandom);
  const set = (next: Partial<{ amount: number; locked: string[] }>) =>
    useSettings.getState().set({ synthRandom: { amount, locked, ...next } });
  return (
    <div className="flex w-[220px] flex-col gap-2 px-2 py-1.5" data-testid="randomize">
      <div className="flex items-center gap-2 text-[11px]" data-hint="synth.random.amount">
        <span className="text-dim">Amount</span>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={amount}
          onChange={(e) => set({ amount: Number(e.target.value) })}
          className="flex-1"
          aria-label="Randomize amount"
        />
        <span className="num w-8 text-right">{Math.round(amount * 100)}%</span>
      </div>
      <div className="flex flex-wrap gap-1" data-hint="synth.random.lock">
        {RANDOM_GROUPS.map((g) => {
          const on = !locked.includes(g.id);
          return (
            <button
              key={g.id}
              className="tool-btn !h-6 border border-line !text-[10.5px]"
              data-active={on}
              aria-pressed={on}
              onClick={() =>
                set({ locked: on ? [...locked, g.id] : locked.filter((x) => x !== g.id) })
              }
            >
              {g.label}
            </button>
          );
        })}
      </div>
      <button
        className="hw-btn !min-h-[26px]"
        onClick={() => onRandomize(amount, locked)}
        data-hint="synth.random.go"
      >
        <Dices size={13} /> Randomize
      </button>
    </div>
  );
}
/** One cycle of what the oscillators make together. */
function WavePreview({ patch, color }: { patch: SynthPatch; color: string }) {
  const basic = (k: number, t: number, pw: number) =>
    k <= 0
      ? Math.sin(t * 2 * Math.PI)
      : k === 1
        ? 1 - 4 * Math.abs(t - 0.5)
        : k === 2
          ? 2 * t - 1
          : t < pw
            ? 1
            : -1;
  const wave = (o: SynthPatch["osc"][number], x: number) => {
    const t = (x * Math.pow(2, o.octave + o.semi / 12)) % 1;
    const a = Math.floor(o.shape);
    const f = o.shape - a;
    return a >= 3 ? basic(3, t, o.pw) : basic(a, t, o.pw) * (1 - f) + basic(a + 1, t, o.pw) * f;
  };
  // Cache the 201-point polyline; only recompute when the patch's oscillators change.
  const pts = useMemo(() => {
    const n = 200;
    const ys = Array.from({ length: n + 1 }, (_, i) => {
      const x = i / n;
      let y = patch.sub.level * Math.sin(x * Math.PI);
      for (const o of patch.osc) if (o.on) y += o.level * wave(o, x);
      return y;
    });
    const peak = Math.max(...ys.map(Math.abs));
    return ys.map((y, i) => `${(i / n) * W},${H / 2 - (y / (peak || 1)) * (H / 2 - 3)}`);
  }, [patch]); // eslint-disable-line react-hooks/exhaustive-deps -- wave/W/H are stable module-level imports
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      className="rounded bg-display"
      data-hint="synth.wave.view"
    >
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgba(255,255,255,0.1)" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

/** The path the sound takes, left to right; the envelopes, LFOs and matrix steer it. */
function SignalFlow({
  patch,
  color,
  onPlay,
}: {
  patch: SynthPatch;
  color: string;
  onPlay: () => void;
}) {
  const oscs = [
    ...patch.osc.flatMap((o, i) =>
      o.on && o.level > 0
        ? [o.type === "wavetable" ? `Osc ${i + 1} (${tableName(o.table)})` : `Osc ${i + 1}`]
        : [],
    ),
    patch.sub.level > 0 && "Sub",
    patch.noise.level > 0 && "Noise",
    patch.ring > 0 && "Ring",
  ].filter(Boolean);
  // a physical model: what excites what (D249)
  const ex = patch.physical.exciter.type;
  const sources =
    patch.source === "physical"
      ? [
          `${ex === "oscillators" ? oscs.join(" + ") || "Silence" : ex[0].toUpperCase() + ex.slice(1)} → ${patch.physical.resonator.model}${patch.physical.body.type !== "none" ? ` · ${patch.physical.body.type} body` : ""}`,
        ]
      : oscs;
  const name = (f: SynthPatch["filters"][number]) =>
    f.model === "ladder" && f.type === "lp" ? "Ladder" : `SVF ${f.type.toUpperCase()}`;
  const filters = patch.filters.filter((f) => f.on).map(name);
  const step = (label: string, sub?: string) => (
    <span className="flex flex-col items-center rounded border border-line bg-surface px-2 py-0.5">
      <span className="text-[11px] text-ink">{label}</span>
      {sub && <span className="text-[9.5px] text-faint">{sub}</span>}
    </span>
  );
  const arrow = <span className="text-faint">→</span>;
  const mods = patch.matrix.filter((m) => m.source && m.dest && m.amount !== 0).length;
  return (
    <div
      className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 px-3 py-1.5"
      data-hint="synth.flow"
    >
      <button
        className="w-[140px]"
        onClick={onPlay}
        title="Click to hear it"
        data-testid="synth-wave"
      >
        <WavePreview patch={patch} color={color} />
      </button>
      {step(
        sources.join(" + ") || "Silence",
        patch.fm.amount > 0 ? `FM ${patch.fm.route.replace(">", "→")}` : undefined,
      )}
      {arrow}
      {step(
        filters.length ? filters.join(patch.routing === "parallel" ? " ∥ " : " → ") : "No filter",
        filters.length ? "filter envelope" : undefined,
      )}
      {arrow}
      {step("Amp", "amp envelope")}
      {arrow}
      {step(patch.output.drive > 0.01 ? "Drive · out" : "Out")}
      {mods > 0 && (
        <span className="text-[10.5px] text-faint">
          · {mods} modulation{mods > 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}
