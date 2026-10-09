import { useState } from "react";
import { Dialog } from "../../components/Dialog";
import { toast } from "../../components/Toast";
import { useStore } from "../../state/store";
import { BEATBOX_CLASSES, CLASS_INFO, type BeatboxClass } from "../../library/beatbox/classes";
import { recordSounds, recordTake } from "../../library/beatbox/record";

const PACES = [
  { id: "slow", label: "Slow", interval: 1.1 },
  { id: "normal", label: "Normal", interval: 0.8 },
  { id: "fast", label: "Fast", interval: 0.55 },
];

/** Record single sounds (teach the model one class) or a take (a beat to convert). */
export function RecordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [kind, setKind] = useState<"sounds" | "take">("sounds");
  const [label, setLabel] = useState<BeatboxClass>("kick");
  const [count, setCount] = useState(8);
  const [pace, setPace] = useState("normal");
  const [soundClicks, setSoundClicks] = useState(false);
  const [mode, setMode] = useState<"metronome" | "free">("metronome");
  const [bars, setBars] = useState(4);
  const [takeClicks, setTakeClicks] = useState(true);
  const bpm = useStore((s) => s.project.bpm);

  const start = () => {
    onOpenChange(false);
    const run =
      kind === "sounds"
        ? recordSounds(label, count, PACES.find((p) => p.id === pace)!.interval, soundClicks)
        : recordTake(mode, bars, takeClicks);
    run.catch((e: Error) =>
      toast(
        e?.name === "NotAllowedError"
          ? "Rebeat needs the microphone to record. Allow it in your browser's settings."
          : (e?.message ?? String(e)),
        "error",
        4000,
      ),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Record" width={460}>
      <div className="flex flex-col gap-4 p-4 text-[12px]" data-testid="beatbox-record-dialog">
        <div className="segmented self-start" data-hint="beatbox.record.kind">
          <button data-active={kind === "sounds"} onClick={() => setKind("sounds")}>
            Single sounds
          </button>
          <button data-active={kind === "take"} onClick={() => setKind("take")}>
            A take
          </button>
        </div>

        {kind === "sounds" ? (
          <>
            <p className="text-dim">
              Make one sound, again and again: each time the light flashes. Rebeat finds every hit
              and labels it, and the model learns what your {CLASS_INFO[label].name.toLowerCase()}{" "}
              sounds like.
            </p>
            <div className="flex flex-wrap gap-1" data-hint="beatbox.record.class">
              {BEATBOX_CLASSES.map((c) => (
                <button
                  key={c}
                  className="tool-btn border border-line"
                  data-active={label === c}
                  data-testid={`beatbox-record-class-${c}`}
                  onClick={() => setLabel(c)}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: CLASS_INFO[c].color }}
                  />
                  {CLASS_INFO[c].name}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2" data-hint="beatbox.record.count">
                <span className="label">Times</span>
                <select
                  className="input !h-7"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  data-testid="beatbox-record-count"
                >
                  {[4, 8, 12, 16, 24].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <div className="segmented" data-hint="beatbox.record.pace">
                {PACES.map((p) => (
                  <button key={p.id} data-active={pace === p.id} onClick={() => setPace(p.id)}>
                    {p.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5" data-hint="beatbox.record.click">
                <input
                  type="checkbox"
                  checked={soundClicks}
                  onChange={(e) => setSoundClicks(e.target.checked)}
                />
                Click too
              </label>
            </div>
          </>
        ) : (
          <>
            <p className="text-dim">
              Beatbox a pattern, ideally a few times over: repetitions help Rebeat clean up the
              result. To the metronome, the take lines up with the project's grid ({bpm} BPM); free,
              Rebeat finds the tempo.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="segmented" data-hint="beatbox.record.mode">
                <button data-active={mode === "metronome"} onClick={() => setMode("metronome")}>
                  To the metronome
                </button>
                <button data-active={mode === "free"} onClick={() => setMode("free")}>
                  Free
                </button>
              </div>
              {mode === "metronome" && (
                <>
                  <label className="flex items-center gap-2" data-hint="beatbox.record.bars">
                    <span className="label">Bars</span>
                    <select
                      className="input !h-7"
                      value={bars}
                      onChange={(e) => setBars(Number(e.target.value))}
                      data-testid="beatbox-record-bars"
                    >
                      {[1, 2, 4, 8, 16].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5" data-hint="beatbox.record.click">
                    <input
                      type="checkbox"
                      checked={takeClicks}
                      onChange={(e) => setTakeClicks(e.target.checked)}
                    />
                    Click during the take
                  </label>
                </>
              )}
            </div>
          </>
        )}
        <p className="text-[11px] text-faint">
          With speakers, the microphone hears the clicks too; headphones keep them out.
        </p>
        <div className="flex justify-end gap-2">
          <button className="tool-btn border border-line" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            className="tool-btn border border-line !text-ink"
            onClick={start}
            data-testid="beatbox-record-start"
          >
            Start
          </button>
        </div>
      </div>
    </Dialog>
  );
}
