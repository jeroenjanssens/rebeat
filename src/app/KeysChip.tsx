import { useRef } from "react";
import { Keyboard } from "lucide-react";
import { toast } from "../components/Toast";
import { dropdown, type MenuItem } from "../components/Menu";
import {
  addKeysSoundAsTrack,
  keysDescription,
  keysEditor,
  keysTrack,
  setKeysTarget,
  useKeys,
} from "../state/keys";
import { focusPanel, openSampleEditor, openSynthEditor } from "./openers";
import { sampleOf } from "../model/tracks";
import { useSettings } from "../state/settings";
import { useStore } from "../state/store";
import { FAMILIES, type Family } from "../library/instruments";
import { allInstruments, findInstrument } from "../library/userInstruments";
import { useLibrary } from "../library/library";

/**
 * The keys chip: what the keys play (D126), and a menu to change it. In the top bar, and in the
 * Keys panel's header (so a maximized panel can change it too).
 */
export function KeysChip({
  className = "inline-flex",
  testId = "keys-chip",
}: {
  className?: string;
  testId?: string;
}) {
  const chipRef = useRef<HTMLButtonElement>(null);
  useKeys((s) => s.target);
  const keysStatus = useKeys((s) => s.status);
  // the name follows the synth editor in focus, and what the editors edit (D132)
  useKeys((s) => s.focused);
  useKeys((s) => s.editors);
  useSettings((s) => s.keysFollowEditor);
  const tracks = useStore((s) => s.project.tracks);
  useStore((s) => s.selectedTrackId);

  const playing = keysDescription();
  const isLoading = keysStatus === "loading";

  const openMenu = () => {
    const notesTracks = tracks.filter((t) => t.mode === "notes");
    // read now, not from the last render: the menu opens right after a change
    const followEditor = useSettings.getState().keysFollowEditor;
    const { target: keysTarget, recent } = useKeys.getState();
    const playing = keysDescription();
    // following the synth editor, it's the only choice that's checked (D132)
    const usual = !followEditor;
    const items: MenuItem[] = [
      // what plays now, exactly, and from where
      {
        render: () => (
          <div className="px-3 py-1.5 text-[11px]" data-testid="keys-now">
            <div className="label">Playing</div>
            <div className="text-ink">{playing.name}</div>
            {playing.from && <div className="text-dim">{playing.from}</div>}
          </div>
        ),
      },
      editSoundItem(),
      { separator: true },
      {
        label: "Follow the synth editor in focus",
        checked: followEditor,
        onSelect: () => useSettings.getState().set({ keysFollowEditor: !followEditor }),
      },
      {
        label: "Follow selected track",
        checked: usual && keysTarget.kind === "selected",
        onSelect: () => setKeysTarget({ kind: "selected" }),
      },
    ];
    if (notesTracks.length > 0) {
      items.push({ separator: true });
      for (const t of notesTracks) {
        items.push({
          label: t.name,
          checked: usual && keysTarget.kind === "track" && keysTarget.id === t.id,
          onSelect: () => setKeysTarget({ kind: "track", id: t.id }),
        });
      }
    }
    if (recent.length > 0) {
      items.push({ separator: true });
      for (const r of recent) {
        items.push({
          label: r.name,
          checked: usual && keysTarget.kind === "sound" && keysTarget.id === r.id,
          onSelect: () => setKeysTarget(r),
        });
      }
    }
    // the library, by family (D167): any sound straight onto the keys
    items.push({ separator: true });
    items.push({ label: "Library ▸", onSelect: () => later(openLibrary) });
    if (keysTarget.kind === "sound" && usual) {
      items.push({ separator: true });
      items.push({ label: "Add as a track", onSelect: () => addKeysSoundAsTrack() });
    }
    dropdown(chipRef.current!, items);
  };

  /** Open another menu in the chip's place, once this one has closed. */
  const later = (fn: () => void) => setTimeout(fn, 0);

  /** The library's families, and the samples. */
  const openLibrary = () => {
    const back: MenuItem = { label: "← Back", onSelect: () => later(openMenu) };
    const families = FAMILIES.filter((f) => allInstruments().some((c) => c.family === f));
    dropdown(chipRef.current!, [
      back,
      { separator: true },
      ...families.map((f) => ({ label: `${f} ▸`, onSelect: () => later(() => openFamily(f)) })),
      { label: "Samples ▸", onSelect: () => later(openSamples) },
    ]);
  };

  /** A family's sounds, under their groups. */
  const openFamily = (family: Family) => {
    const { target } = useKeys.getState();
    const entries = allInstruments().filter((c) => c.family === family);
    const items: MenuItem[] = [{ label: "← Back", onSelect: () => later(openLibrary) }];
    let group = "";
    for (const c of entries) {
      if (c.group !== group) {
        group = c.group;
        // its own copy: the heading is drawn after the loop has moved on
        const heading = group;
        items.push({ render: () => <div className="label px-3 pt-2 pb-0.5">{heading}</div> });
      }
      items.push({
        label: c.name,
        checked: target.kind === "sound" && target.id === c.id,
        onSelect: () => setKeysTarget({ kind: "sound", source: "catalog", id: c.id, name: c.name }),
      });
    }
    dropdown(chipRef.current!, items);
  };

  /** The library's samples, by folder. */
  const openSamples = () => {
    const { target } = useKeys.getState();
    const samples = [...useLibrary.getState().samples].sort(
      (a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name),
    );
    const items: MenuItem[] = [{ label: "← Back", onSelect: () => later(openLibrary) }];
    if (!samples.length) items.push({ label: "No samples yet", disabled: true });
    let folder: string | null = null;
    for (const smp of samples) {
      if (smp.folder !== folder) {
        folder = smp.folder;
        const name = folder || "Samples";
        items.push({ render: () => <div className="label px-3 pt-2 pb-0.5">{name}</div> });
      }
      items.push({
        label: smp.name,
        checked: target.kind === "sound" && target.id === smp.id,
        onSelect: () =>
          setKeysTarget({ kind: "sound", source: "sample", id: smp.id, name: smp.name }),
      });
    }
    dropdown(chipRef.current!, items);
  };

  return (
    <button
      ref={chipRef}
      className={`field ${className}`}
      title={`Keys: ${playing.name}${playing.from ? ` (${playing.from})` : ""}`}
      data-hint="transport.keys"
      data-testid={testId}
      onClick={openMenu}
    >
      <Keyboard size={11} />
      <span className="label">{playing.editor ? "Keys · Editor" : "Keys"}</span>
      <span className="num max-w-[110px] truncate" style={{ opacity: isLoading ? 0.5 : 1 }}>
        {isLoading ? "Loading…" : playing.name}
      </span>
    </button>
  );
}

/** What the Edit button next to the keys opens for what they play now (D173), and why not. */
function editTarget():
  | { label: string; open: () => void; synth?: boolean }
  | { label: string; open: null; synth?: boolean } {
  const ed = keysEditor();
  if (ed) return { label: "The keys play the synth editor in focus", open: null };
  const { target } = useKeys.getState();
  if (target.kind === "sound") {
    if (target.source === "sample")
      return {
        label: `Edit ${target.name} in the sample editor`,
        open: () => openSampleEditor(target.id),
      };
    const entry = findInstrument(target.id);
    if (entry?.source.source === "synth")
      return {
        label: `Edit ${entry.name} in the synth editor`,
        open: () => void import("../panels/library/open").then((m) => m.openInstrument(entry)),
        synth: true,
      };
    if (entry?.source.source === "sample" && entry.source.sampleId)
      return {
        label: `Edit ${entry.name} in the sample editor`,
        open: () => openSampleEditor(entry.source.sampleId!),
      };
    return {
      label: `${target.name} has no editor of its own: put it on a track to shape it with its SOUND knobs`,
      open: null,
    };
  }
  const track = keysTrack();
  if (!track) return { label: "The keys play nothing to edit", open: null };
  if (track.sound?.source === "synth")
    return {
      label: `Edit ${track.name}'s synth in the synth editor`,
      open: () => openSynthEditor(track.id),
      synth: true,
    };
  const sample = sampleOf(track);
  if (track.sound?.source === "sample" && sample)
    return { label: `Edit ${track.name}'s sample`, open: () => openSampleEditor(sample) };
  return {
    label: `Shape ${track.name} with its SOUND knobs in the Inspector`,
    open: () => {
      useStore.getState().setUi({ selectedTrackId: track.id });
      focusPanel("inspector");
    },
  };
}

/**
 * Edit sound (D173), in the Keys menu: the editor for what the keys play: the synth editor for a
 * synth (a library one, yours, or a track's), the sample editor for a sample, the Inspector for a
 * track's sampled instrument; greyed out with the reason otherwise. Opening a synth editor makes
 * the keys follow it (D219): you hear the patch you're editing.
 */
function editSoundItem(): MenuItem {
  const t = editTarget();
  return {
    label: t.open ? t.label : `Edit sound: ${t.label}`,
    disabled: !t.open,
    onSelect: () => {
      t.open?.();
      if (!t.synth || useSettings.getState().keysFollowEditor) return;
      useSettings.getState().set({ keysFollowEditor: true });
      toast("The keys now follow the synth editor (change it in the Keys menu)");
    },
  };
}
