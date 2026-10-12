/**
 * The synth wizard's result (D170): its answers as a library synth, to try (a preview) and to
 * keep (a new synth in Your sounds).
 */
import { wizardPatch, type WizardAnswers } from "../model/synthWizard";
import type { SynthGroup } from "./synths";
import { COLLECTIONS, type CatalogInstrument } from "./instruments";
import { trackForInstrument } from "./soundTrack";
import { saveInstrument } from "./userInstruments";

const GROUPS: Record<string, SynthGroup> = {
  bass: "Bass",
  lead: "Leads",
  pad: "Pads",
  keys: "Keys",
  pluck: "Plucks & stabs",
  fx: "FX",
};

/** The answers as a catalog entry (the same answers: the same id, so a preview is kept). */
export function wizardEntry(answers: WizardAnswers, name: string): CatalogInstrument {
  const patch = wizardPatch(answers);
  return {
    id: `wizard:${JSON.stringify(answers)}`,
    name,
    family: "Synths",
    group: GROUPS[answers.role ?? "lead"] ?? "Leads",
    source: { source: "synth", preset: "init", patch, name },
    streamed: false,
    collection: COLLECTIONS.user,
    low: answers.role === "bass",
  };
}

/** Save the answers as a new synth in Your sounds; returns its library entry. */
export async function createWizardSynth(
  answers: WizardAnswers,
  name: string,
): Promise<CatalogInstrument> {
  const track = trackForInstrument(wizardEntry(answers, name));
  return saveInstrument(track, name);
}
