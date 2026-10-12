import { useRef } from "react";
import { Keyboard } from "lucide-react";
import { dropdown, type MenuItem } from "../components/Menu";
import { addKeysSoundAsTrack, keysDescription, setKeysTarget, useKeys } from "../state/keys";
import { useSettings } from "../state/settings";
import { useStore } from "../state/store";
import { FAMILIES, type Family } from "../library/instruments";
import { allInstruments } from "../library/userInstruments";
import { useLibrary } from "../library/library";

/**
 * The keys chip: what the keys play (D126), and a menu to change it. In the top bar, and in the
 * Controller panel's header (so a maximized panel can change it too).
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
