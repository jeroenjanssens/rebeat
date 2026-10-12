/**
 * Next mode's progression (D161): pick a famous progression and pad 1 holds its next chord. The
 * menu says what each one is (its chords as roman numerals, in the current key, and a line about
 * it); next to it, the progression's chords with the next one lit.
 */
import { ChevronDown } from "lucide-react";
import { dropdown, type MenuItem } from "../../components/Menu";
import {
  ROLE_COLORS,
  progressionById,
  progressionChords,
  progressionIndex,
  progressionsFor,
} from "../../model/suggest";
import { keyName } from "../../model/notes";
import { chordHistory, setNextProgression, suggestionKey, useKeys } from "../../state/keys";
import { useSettings } from "../../state/settings";

export function ProgressionPicker() {
  const id = useSettings((s) => s.nextProgression);
  useSettings((s) => s.keyModeKey);
  // the suggestions change after every chord: where we are in the progression too
  useKeys((s) => s.suggestions);
  const key = suggestionKey();
  const picked = progressionById(id);
  const fits = picked && progressionsFor(key).includes(picked) ? picked : null;
  const chords = fits ? progressionChords(fits, key) : [];
  const at = fits ? progressionIndex(fits, chordHistory(), key) : -1;

  const open = (el: HTMLElement) => {
    const row = (
      title: string,
      romans: string,
      names: string,
      about: string,
      checked: boolean,
      pick: () => void,
    ): MenuItem => ({
      render: (close) => (
        <button
          className="progression-item"
          data-testid="progression-option"
          data-checked={checked || undefined}
          onClick={() => {
            pick();
            close();
          }}
        >
          <span className="flex items-baseline gap-2">
            <span className={checked ? "font-semibold text-accent" : "font-semibold text-ink"}>
              {title}
            </span>
            {romans && <span className="num text-[11px] text-dim">{romans}</span>}
            {names && <span className="num ml-auto pl-3 text-[11px] text-ink">{names}</span>}
          </span>
          <span className="block text-[11px] leading-snug text-faint">{about}</span>
        </button>
      ),
    });
    dropdown(el, [
      { render: () => <div className="label px-3 py-1">Progressions in {keyName(key)}</div> },
      row("Free", "", "", "Pad 1 holds the best next chord, whatever you play.", !fits, () =>
        setNextProgression(null),
      ),
      { separator: true },
      ...progressionsFor(key).map((p) =>
        row(
          p.title,
          p.chords.join("–"),
          progressionChords(p, key)
            .map((c) => c.name)
            .join(" "),
          p.about,
          p.id === fits?.id,
          () => setNextProgression(p.id),
        ),
      ),
    ]);
  };

  return (
    <div className="flex items-center gap-1.5" data-hint="controller.progression">
      <span className="label">Pad 1</span>
      <button
        className="tool-btn !h-6 gap-0.5"
        data-testid="progression"
        onClick={(e) => open(e.currentTarget)}
      >
        <span className="text-[12px] text-ink">{fits ? fits.title : "Free"}</span>
        <ChevronDown size={11} />
      </button>
      {fits && (
        <span className="flex items-center gap-1" data-testid="progression-chords">
          {chords.map((c, i) => (
            <span
              key={i}
              className="num rounded px-1 text-[11px]"
              data-next={i === at || undefined}
              style={
                i === at
                  ? { background: ROLE_COLORS[c.role], color: "#fff" }
                  : { color: "var(--text-dim)" }
              }
              title={c.roman}
            >
              {c.name}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
