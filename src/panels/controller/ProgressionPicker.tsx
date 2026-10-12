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
import {
  AUTO_EVERY,
  autoUnit,
  chordHistory,
  keysTrack,
  setNextProgression,
  suggestionKey,
  toggleAuto,
  useKeys,
} from "../../state/keys";
import { audioNow } from "../../engine/engine";
import {
  addPages,
  checkTake,
  fitPage,
  makeCopies,
  takeSixteenths,
  unroll,
} from "../../model/takePlan";
import { useStore } from "../../state/store";
import { useSettings } from "../../state/settings";

export function ProgressionPicker() {
  const id = useSettings((s) => s.nextProgression);
  const auto = useKeys((s) => s.auto);
  const every = useSettings((s) => s.autoEvery);
  const loop = useSettings((s) => s.autoLoop);
  const sync = useSettings((s) => s.autoSync);
  useSettings((s) => s.playStyle);
  const unit = autoUnit();
  const unitName = (n: number) =>
    unit.pattern ? (n === 1 ? "pattern" : "patterns") : n === 1 ? "bar" : "bars";
  const set = useSettings.getState().set;
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
              className="num relative overflow-hidden rounded px-1 text-[11px]"
              data-next={i === at || undefined}
              style={
                i === at
                  ? { background: ROLE_COLORS[c.role], color: "#fff" }
                  : { color: "var(--text-dim)" }
              }
              title={c.roman}
            >
              {c.name}
              {/* Auto: how far it is to this chord's change */}
              {i === at && auto.running && auto.nextAt !== null && (
                <span
                  key={auto.nextAt}
                  className="auto-progress"
                  style={{ animationDuration: `${Math.max(0.05, auto.nextAt - audioNow())}s` }}
                />
              )}
            </span>
          ))}
        </span>
      )}
      {/* Auto (D162): the progression plays itself */}
      <div className="segmented" data-hint="controller.auto">
        <button
          data-testid="auto"
          data-active={auto.running || auto.armed}
          data-armed={auto.armed || undefined}
          aria-pressed={auto.running || auto.armed}
          className={auto.armed && !auto.running ? "auto-armed" : undefined}
          onClick={toggleAuto}
        >
          {auto.running ? "■ Stop" : auto.armed ? "● Starts with Play" : "▶ Auto"}
        </button>
      </div>
      <span className="label">Every</span>
      <div className="flex items-center" data-testid="auto-every" data-hint="controller.auto.every">
        <button
          className="tool-btn !h-6"
          aria-label="Less often"
          onClick={() => {
            const i = AUTO_EVERY.indexOf(every as (typeof AUTO_EVERY)[number]);
            set({ autoEvery: AUTO_EVERY[Math.max(0, i - 1)] });
          }}
        >
          −
        </button>
        <span className="num px-1 text-[12px] text-ink" data-testid="auto-every-value">
          {every} {unitName(every)}
        </span>
        <button
          className="tool-btn !h-6"
          aria-label="More often"
          onClick={() => {
            const i = AUTO_EVERY.indexOf(every as (typeof AUTO_EVERY)[number]);
            set({ autoEvery: AUTO_EVERY[Math.min(AUTO_EVERY.length - 1, i + 1)] });
          }}
        >
          +
        </button>
      </div>
      <div className="segmented" data-hint="controller.auto.options">
        <button data-active={loop} aria-pressed={loop} onClick={() => set({ autoLoop: !loop })}>
          Loop
        </button>
        <button
          data-active={sync}
          aria-pressed={sync}
          data-testid="auto-sync"
          title="Tied to the song: armed while it's stopped (it starts with Play, after the count-in), on its next bar while it plays, stopping with it. Off: Auto plays on its own."
          onClick={() => set({ autoSync: !sync })}
        >
          Sync to song
        </button>
      </div>
      {fits && <TakeRoom chords={chords.length} every={every} unit={unit.steps} />}
    </div>
  );
}

/**
 * Whether the take has room (D163, D164): the page (loop mode) or the song from this page on (song
 * mode), in bars, with the fixes: make the page longer, spread over new pages, add pages, make
 * clones copies, unroll repeats. Each fix is one undo step.
 */
function TakeRoom({ chords, every, unit }: { chords: number; every: number; unit: number }) {
  const project = useStore((s) => s.project);
  const slotId = useStore((s) => (s.playing ? s.playSlotId : s.editSlotId));
  const bassTrack = useSettings((s) => s.bassTrack);
  const needs = takeSixteenths(chords, every, unit);
  const check = checkTake(project, slotId, needs);
  const [beats, value] = project.timeSignature;
  const bar = (beats * 16) / value;
  const bars = (n: number) => {
    const b = Math.round((n / bar) * 10) / 10;
    return `${b} ${b === 1 ? "bar" : "bars"}`;
  };
  const empty = [keysTrack()?.id, bassTrack].filter((x): x is string => !!x);
  const commit = (fn: (p: typeof project) => void) => useStore.getState().commit(fn);
  const song = project.playMode === "song";
  const short = check.has < needs;
  if (!short && !check.clones.length && !check.repeats.length) return null;
  return (
    <span
      className="flex items-center gap-1.5 text-[11px]"
      data-testid="take-room"
      data-hint="controller.auto.room"
    >
      {short && (
        <span className="text-faint">
          Takes {bars(needs)}; {song ? "the song has" : "the page has"} {bars(check.has)}
          {song ? " from here" : ""}
        </span>
      )}
      {short && !song && (
        <>
          <button
            className="tool-btn !h-6"
            data-testid="fit-page"
            onClick={() => commit((p) => fitPage(p, slotId, needs))}
          >
            Fit the page
          </button>
          <button
            className="tool-btn !h-6"
            data-testid="spread-pages"
            onClick={() =>
              commit((p) => {
                p.playMode = "song";
                addPages(p, slotId, needs, empty);
              })
            }
          >
            Spread over pages
          </button>
        </>
      )}
      {short && song && (
        <button
          className="tool-btn !h-6"
          data-testid="add-pages"
          onClick={() => commit((p) => void addPages(p, slotId, needs, empty))}
        >
          Add pages
        </button>
      )}
      {song && check.clones.length > 0 && (
        <button
          className="tool-btn !h-6"
          data-testid="make-copies"
          title="Pages that share a pattern would get each other's chords"
          onClick={() => commit((p) => makeCopies(p, check.clones))}
        >
          Make copies
        </button>
      )}
      {song && check.repeats.length > 0 && (
        <button
          className="tool-btn !h-6"
          data-testid="unroll"
          title="A page that plays more than once would get its chords written over each other"
          onClick={() => commit((p) => check.repeats.forEach((id) => unroll(p, id)))}
        >
          Unroll repeats
        </button>
      )}
    </span>
  );
}
