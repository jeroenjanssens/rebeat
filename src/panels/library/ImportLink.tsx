import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog } from "../../components/Dialog";
import { toast } from "../../components/Toast";
import { useLibrary } from "../../library/library";
import { machineName } from "../../library/onlineKits";
import { resolveLink } from "../../library/onlineImport";
import { useSettings } from "../../state/settings";

/**
 * Import from a link (D74): audio files and zips go into the library; a strudel.json or a GitHub
 * repository becomes a source under Online kits, to browse before adding sounds.
 */
export function ImportLink({
  open,
  onClose,
  onSource,
}: {
  open: boolean;
  onClose: () => void;
  onSource: () => void;
}) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await resolveLink(link);
      if (r.kind === "files") {
        toast(`Imported ${r.ids.length} sample${r.ids.length > 1 ? "s" : ""}`);
        useLibrary.getState().set({ selectedId: r.ids[0] });
      } else {
        const src = r.kit.source!;
        const { sampleSources } = useSettings.getState();
        if (!sampleSources.includes(src))
          useSettings.getState().set({ sampleSources: [src, ...sampleSources] });
        const n = Object.values(r.kit.sounds).flat().length;
        toast(`Added ${machineName(r.kit.machine)} to Online kits: ${n} sounds`);
        onSource();
      }
      setLink("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Import from a link"
      width={500}
    >
      <form
        className="flex flex-col gap-3 p-4 text-[12px]"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <input
          autoFocus
          className="input"
          placeholder="https://github.com/user/repo"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          data-testid="import-link"
          data-hint="library.import.link.input"
        />
        <ul className="list-disc pl-4 text-[11px] leading-relaxed text-dim">
          <li>An audio file or a .zip: imported into your library right away.</li>
          <li>
            A <span className="num">strudel.json</span>, a GitHub repository (or{" "}
            <span className="num">github:user/repo</span>): added under <b>Online kits</b>, where
            you can listen to the sounds and add the ones you want.
          </li>
        </ul>
        {error && (
          <div
            className="text-[11.5px] text-[var(--danger,#ef4444)]"
            data-testid="import-link-error"
          >
            {error}
          </div>
        )}
        <div className="flex justify-end border-t border-line pt-3">
          <button
            type="submit"
            className="hw-btn"
            disabled={busy || !link.trim()}
            data-testid="import-link-run"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : "Import"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
