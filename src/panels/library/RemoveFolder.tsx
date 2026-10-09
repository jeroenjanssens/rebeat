/**
 * Removing a folder from the library (D100), such as a kit you added from Online kits: a
 * confirmation that says how many samples go, and which stay because a project plays them.
 */
import { useEffect, useState } from "react";
import { create } from "zustand";
import { Dialog } from "../../components/Dialog";
import { toast } from "../../components/Toast";
import { inFolder, parentOf } from "../../library/folders";
import { removeFolder, samplesInUse, useLibrary } from "../../library/library";

export const useRemoveFolder = create<{ path: string | null }>()(() => ({ path: null }));

/** Ask to remove a library folder. */
export const askRemoveFolder = (path: string) => useRemoveFolder.setState({ path });

export function RemoveFolderDialog({ onRemoved }: { onRemoved: (path: string) => void }) {
  const path = useRemoveFolder((s) => s.path);
  const samples = useLibrary((s) => s.samples);
  // which samples projects use, for the folder it was checked for
  const [checked, setChecked] = useState<{ path: string; ids: Set<string> } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (path) void samplesInUse().then((ids) => setChecked({ path, ids }));
  }, [path]);
  const inUse = checked?.path === path ? checked.ids : null;
  const close = () => useRemoveFolder.setState({ path: null });
  if (!path) return null;
  const inside = samples.filter((s) => inFolder(s.folder, path));
  const kept = inUse ? inside.filter((s) => inUse.has(s.id)).length : 0;
  const name = path.split("/").pop();
  const parent = parentOf(path) || "the top of the library";
  return (
    <Dialog open onOpenChange={(o) => !o && close()} title="Remove from the library" width={420}>
      <div className="flex flex-col gap-3 p-4 text-[12.5px]" data-testid="remove-folder">
        <p>
          Remove “{name}” and its {inside.length} sample{inside.length === 1 ? "" : "s"} from the
          library? This can't be undone.
        </p>
        {inUse === null ? (
          <p className="text-faint">Checking which samples your projects use…</p>
        ) : kept ? (
          <p className="text-dim" data-testid="remove-folder-kept">
            {kept} of them {kept === 1 ? "is" : "are"} used by your projects and stay
            {kept === 1 ? "s" : ""} (moved to {parent}).
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button className="tool-btn border border-line" onClick={close}>
            Cancel
          </button>
          <button
            className="tool-btn border border-line !text-[#ef4444]"
            disabled={busy || inUse === null}
            data-testid="remove-folder-confirm"
            onClick={async () => {
              setBusy(true);
              const { removed, kept } = await removeFolder(path);
              setBusy(false);
              close();
              onRemoved(path);
              toast(
                `Removed ${removed} sample${removed === 1 ? "" : "s"}` +
                  (kept ? ` (${kept} kept: your projects use them)` : ""),
              );
            }}
          >
            Remove
          </button>
        </div>
      </div>
    </Dialog>
  );
}
