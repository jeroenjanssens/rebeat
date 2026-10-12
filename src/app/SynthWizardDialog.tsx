/**
 * The synth wizard (D170): a new synth from a few plain questions, one at a time (a decision tree:
 * later questions follow earlier answers), with ▶ Try it to hear it so far. At the end it's saved
 * to Your sounds, put on the keys and opened in the synth editor's Advanced view, where every
 * setting it chose can be seen and changed.
 */
import { useMemo, useState } from "react";
import { Dialog } from "../components/Dialog";
import { toast } from "../components/Toast";
import { wizardName, wizardSteps, type WizardAnswers } from "../model/synthWizard";
import { useShell } from "./shell";

export function SynthWizardDialog() {
  const open = useShell((s) => s.wizardOpen);
  const set = useShell((s) => s.set);
  const [answers, setAnswers] = useState<WizardAnswers>({});
  const [step, setStep] = useState(0);
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const steps = useMemo(() => wizardSteps(answers), [answers]);
  const naming = step >= steps.length;
  const q = naming ? null : steps[step];
  const chosen = q ? (answers[q.id] ?? q.defaultAnswer(answers)) : null;

  const close = (o: boolean) => {
    set({ wizardOpen: o });
    if (!o) {
      setAnswers({});
      setStep(0);
      setName(null);
      void import("../library/audition").then((a) => a.stopPreview());
    }
  };
  // every question up to here answered (an unanswered one: its default)
  const full = (): WizardAnswers => {
    const a: WizardAnswers = { ...answers };
    for (const s of wizardSteps(a)) a[s.id] ??= s.defaultAnswer(a);
    return a;
  };
  const tryIt = async () => {
    const { previewInstrument } = await import("../library/audition");
    const { wizardEntry } = await import("../library/wizardSynth");
    void previewInstrument(wizardEntry(full(), "Wizard synth"));
  };
  const create = async () => {
    setBusy(true);
    try {
      const a = full();
      const n = (name ?? wizardName(a)).trim() || wizardName(a);
      const { createWizardSynth } = await import("../library/wizardSynth");
      const entry = await createWizardSynth(a, n);
      const { setKeysTarget } = await import("../state/keys");
      setKeysTarget({ kind: "sound", source: "catalog", id: entry.id, name: entry.name });
      const { useSettings } = await import("../state/settings");
      useSettings.getState().set({ synthView: "advanced" });
      const { openInstrument } = await import("../panels/library/open");
      openInstrument(entry);
      toast(`${entry.name} is in Your sounds, on the keys and in the synth editor`);
      close(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close} title="New synth: the wizard" width={560}>
      <div className="flex flex-col gap-3 p-4" data-testid="synth-wizard">
        <div className="flex items-center text-[11px] text-dim">
          <span>{naming ? "Last step" : `Question ${step + 1} of ${steps.length}`}</span>
          <span className="ml-auto">You can change everything afterwards.</span>
        </div>
        {q && (
          <>
            <div className="text-[15px] font-semibold text-ink" data-testid="wizard-question">
              {q.title}
            </div>
            <div className="flex flex-col gap-1.5" role="radiogroup">
              {q.answers(answers).map((a) => (
                <button
                  key={a.id}
                  role="radio"
                  aria-checked={chosen === a.id}
                  data-testid="wizard-answer"
                  data-answer={a.id}
                  className={`rounded-md border px-3 py-2 text-left ${
                    chosen === a.id ? "border-accent bg-raised" : "border-line hover:bg-raised"
                  }`}
                  onClick={() => setAnswers({ ...answers, [q.id]: a.id })}
                  onDoubleClick={() => {
                    setAnswers({ ...answers, [q.id]: a.id });
                    setStep(step + 1);
                  }}
                >
                  <div className="text-[13px] text-ink">{a.label}</div>
                  <div className="text-[11px] text-dim">{a.help}</div>
                </button>
              ))}
            </div>
          </>
        )}
        {naming && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[15px] font-semibold text-ink">Name it</span>
            <input
              className="field !h-8 text-[13px]"
              data-testid="wizard-name"
              value={name ?? wizardName(full())}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <span className="text-[11px] text-dim">
              It goes to Your sounds, onto the keys, and opens in the synth editor's Advanced view.
            </span>
          </label>
        )}
        <div className="flex items-center gap-2 pt-1">
          <button className="tool-btn border border-line" data-testid="wizard-try" onClick={tryIt}>
            ▶ Try it
          </button>
          <span className="flex-1" />
          <button
            className="tool-btn border border-line"
            disabled={step === 0}
            data-testid="wizard-back"
            onClick={() => setStep(Math.max(0, step - 1))}
          >
            Back
          </button>
          {naming ? (
            <button
              className="tool-btn border border-accent text-accent"
              disabled={busy}
              data-testid="wizard-create"
              onClick={create}
            >
              Create synth
            </button>
          ) : (
            <button
              className="tool-btn border border-accent text-accent"
              data-testid="wizard-next"
              onClick={() => {
                if (q) setAnswers({ ...answers, [q.id]: chosen! });
                setStep(step + 1);
              }}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
