import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "../../components/Toast";
import { audition } from "../../library/audition";
import {
  TYPE_ORDER,
  downloadKit,
  fetchKitIndex,
  machineName,
  typeCategory,
  typeName,
  type OnlineKit,
} from "../../library/onlineKits";
import { addSampleTracks } from "../../state/trackActions";

/** Browse and load drum machines from the online tidal-drum-machines collection. */
export function OnlineKits() {
  const [kits, setKits] = useState<OnlineKit[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchKitIndex().then(setKits, (e) => setError(String(e.message ?? e)));
  }, []);

  const list = useMemo(
    () =>
      (kits ?? []).filter((k) =>
        machineName(k.machine).toLowerCase().includes(query.toLowerCase()),
      ),
    [kits, query],
  );

  const load = async (kit: OnlineKit) => {
    setBusy(kit.machine);
    try {
      const sounds = await downloadKit(kit);
      addSampleTracks(
        sounds.map(([, id]) => id),
        undefined,
        sounds.map(([t]) => typeCategory(t)),
      );
      toast(`Loaded ${machineName(kit.machine)}: ${sounds.length} tracks`);
    } catch (e) {
      toast(`Couldn't load the kit: ${e}`, "error");
    }
    setBusy(null);
  };

  const preview = async (kit: OnlineKit, type: string, variant: number) => {
    setBusy(`${kit.machine}:${type}`);
    try {
      const [[, id]] = await downloadKit(kit, { types: [type], variant });
      await audition(id);
    } catch {
      toast("Couldn't download that sound", "error");
    }
    setBusy(null);
  };

  if (error)
    return <div className="p-4 text-[12px] text-faint">Online kits are unavailable: {error}</div>;
  if (!kits)
    return (
      <div className="flex items-center gap-2 p-4 text-[12px] text-faint">
        <Loader2 size={13} className="animate-spin" /> Loading the kit index…
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-line px-2.5 py-1.5">
        <label className="field w-full">
          <Search size={12} className="text-dim" />
          <input
            className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-faint"
            placeholder={`Search ${kits.length} drum machines`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <p className="mt-1.5 text-[10px] leading-snug text-faint">
          From the community “tidal-drum-machines” collection, downloaded on demand into your
          library. The sounds come from many sources: check their licensing before publishing music
          made with them.
        </p>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto p-1.5">
        {list.map((kit) => {
          const types = TYPE_ORDER.filter((t) => kit.sounds[t]).concat(
            Object.keys(kit.sounds).filter((t) => !TYPE_ORDER.includes(t)),
          );
          const isOpen = open === kit.machine;
          return (
            <div key={kit.machine} className="rounded-md">
              <div className="flex h-8 items-center gap-2 rounded-md px-1.5 hover:bg-surface">
                <button
                  className="min-w-0 flex-1 truncate text-left text-[12px]"
                  onClick={() => setOpen(isOpen ? null : kit.machine)}
                >
                  {machineName(kit.machine)}
                  <span className="ml-1.5 text-[10px] text-faint">{types.length} sounds</span>
                </button>
                <button
                  className="tool-btn !h-6 shrink-0 border border-line !text-[10.5px]"
                  disabled={!!busy}
                  onClick={() => load(kit)}
                >
                  {busy === kit.machine ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    "Load as tracks"
                  )}
                </button>
              </div>
              {isOpen && (
                <div className="flex flex-wrap gap-1 px-1.5 pb-2">
                  {types.map((t) =>
                    kit.sounds[t].slice(0, 4).map((_, v) => (
                      <button
                        key={`${t}${v}`}
                        className="tool-btn !h-6 border border-line !text-[10.5px]"
                        disabled={!!busy}
                        title="Download and preview"
                        onClick={() => preview(kit, t, v)}
                      >
                        {typeName(t)}
                        {kit.sounds[t].length > 1 ? ` ${v + 1}` : ""}
                      </button>
                    )),
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
