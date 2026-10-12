import { useRef } from "react";
import { Keyboard } from "lucide-react";
import { dropdown, type MenuItem } from "../components/Menu";
import { addKeysSoundAsTrack, keysDescription, setKeysTarget, useKeys } from "../state/keys";
import { useSettings } from "../state/settings";
import { useStore } from "../state/store";

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
    if (keysTarget.kind === "sound" && usual) {
      items.push({ separator: true });
      items.push({ label: "Add as a track", onSelect: () => addKeysSoundAsTrack() });
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
