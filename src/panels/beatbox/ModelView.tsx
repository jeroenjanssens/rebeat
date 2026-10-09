import { useMemo } from "react";
import { BEATBOX_CLASSES, CLASS_INFO, type BeatboxClass } from "../../library/beatbox/classes";
import { useModel } from "../../library/beatbox/model";
import { useBeatbox, voiceStats, type Guess } from "../../library/beatbox/store";

const DATASET_NAMES: Record<string, string> = {
  avp: "amateurs (AVP)",
  beatboxset1: "beatboxers (beatboxset1)",
  "synth-test": "takes of recordings of Jeroen's it never trained on",
};

/** Examples per class that make calibration worth it (D112). */
const ENOUGH = 10;

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`;

/**
 * How well the model knows the selected voice (D112): examples per class, accuracy on them
 * without and with calibration (each hit judged without its own label), and what to record next.
 */
export function ModelView({ guesses }: { guesses: Record<string, Guess | null> }) {
  const s = useBeatbox();
  const model = useModel();
  const stats = useMemo(
    () => voiceStats(s.voiceId, s),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.voiceId, s.hits, s.recordings, s.predictions, guesses],
  );
  const voice = s.voices.find((v) => v.id === s.voiceId);
  const need = BEATBOX_CLASSES.filter((c) => c !== "other" && stats.counts[c] < ENOUGH);
  const metrics = model.info?.metrics ?? {};

  return (
    <div
      className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3 text-[11.5px]"
      data-testid="beatbox-model"
    >
      <div className="grid max-w-3xl gap-4">
        <section data-hint="beatbox.model.voice">
          <h3 className="label mb-2">How well the model knows {voice?.name ?? "this voice"}</h3>
          <div className="mb-2 flex gap-6">
            <div>
              <div className="num text-[22px] text-ink" data-testid="beatbox-acc-plain">
                {pct(stats.plain)}
              </div>
              <div className="text-dim">the model alone</div>
            </div>
            <div>
              <div className="num text-[22px] text-accent" data-testid="beatbox-acc-calibrated">
                {pct(stats.calibrated)}
              </div>
              <div className="text-dim">calibrated to your voice</div>
            </div>
          </div>
          <p className="mb-2 text-dim">
            Of your labeled hits, how many the model gets right, each judged without its own label.
            Calibration compares hits with your own examples, so it improves as you label more.
          </p>
          <table className="w-full" data-testid="beatbox-class-table">
            <thead className="text-left text-faint">
              <tr>
                <th className="py-1 font-normal">Class</th>
                <th className="py-1 font-normal">Your examples</th>
                <th className="py-1 font-normal">Model alone</th>
                <th className="py-1 font-normal">Calibrated</th>
              </tr>
            </thead>
            <tbody>
              {BEATBOX_CLASSES.map((c: BeatboxClass) => {
                const n = stats.counts[c];
                const pc = stats.perClass[c];
                return (
                  <tr key={c} className="border-t border-line">
                    <td className="py-1">
                      <span
                        className="mr-1.5 inline-block h-2 w-2 rounded-full"
                        style={{ background: CLASS_INFO[c].color }}
                      />
                      {CLASS_INFO[c].name}
                    </td>
                    <td className="py-1">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 rounded bg-raised">
                          <div
                            className="h-full rounded"
                            style={{
                              width: `${Math.min(1, n / (ENOUGH * 2)) * 100}%`,
                              background: CLASS_INFO[c].color,
                            }}
                          />
                        </div>
                        <span className="num">{n}</span>
                      </div>
                    </td>
                    <td className="num py-1 text-dim">{pc.n ? pct(pc.plain / pc.n) : "—"}</td>
                    <td className="num py-1">{pc.n ? pct(pc.calibrated / pc.n) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {need.length > 0 && (
            <p className="mt-2 text-amber-300" data-testid="beatbox-advice">
              Record more:{" "}
              {need
                .map((c) => {
                  const n = ENOUGH - stats.counts[c];
                  const name = CLASS_INFO[c].name.toLowerCase();
                  return `${n} ${n === 1 ? name : name.endsWith("sh") ? `${name}es` : `${name}s`}`;
                })
                .join(", ")}
              . Ten of each is a good start.
            </p>
          )}
        </section>

        <section data-hint="beatbox.model.about">
          <h3 className="label mb-2">The model</h3>
          {model.info ? (
            <div className="space-y-1.5 text-dim">
              <p>
                Version {model.info.version}, trained on {model.info.trainedOn.join("; ")}.
              </p>
              <p>
                On voices it never heard (Kick, Snare and Closed hi-hat):{" "}
                {Object.entries(metrics)
                  // a handful of hits says nothing
                  .filter(([, m]) => (m.hits ?? 0) >= 50)
                  .map(
                    ([ds, m]) =>
                      `${DATASET_NAMES[ds] ?? ds}: ${pct(m.core_macro_f1)} alone, ${pct(m.calibrated_core_macro_f1)} calibrated`,
                  )
                  .join("; ")}{" "}
                (macro F1).
              </p>
              <p>
                Toms, claps and crashes are rare in its training data: it learns them from your
                examples. Export your recordings as a dataset to train the next model with them
                (Rebeat's repository, ml/).
              </p>
            </div>
          ) : (
            <p className="text-dim">
              {model.status === "error"
                ? `The model didn't load: ${model.error}`
                : "Loading the model…"}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
