/**
 * The Controller panel's Play row (D149–D153): how the keys play, in every pad mode. Strum, Slop,
 * the arpeggiator, a pattern, Latch and Balance, each on its own and all of them together.
 */
import { ChevronDown, Minus, Plus } from "lucide-react";
import { dropdown } from "../../components/Menu";
import {
  ARP_MODES,
  ARP_RATES,
  PATTERNS,
  PATTERN_GROUPS,
  STRUM_TIMES,
  patternById,
  sanitizePlayStyle,
  type ArpMode,
  type ChordPattern,
} from "../../model/perform";
import { setPlayStyle, toggleLatch, useKeys } from "../../state/keys";
import { useSettings } from "../../state/settings";

const ARP_MODE_NAMES: Record<ArpMode, string> = {
  up: "Up",
  down: "Down",
  updown: "Up-down",
  random: "Random",
  played: "As played",
};

/** − value + (click the value: `reset`). */
export function Stepper({
  value,
  onStep,
  onReset,
  testId,
  hint,
  title,
}: {
  value: string;
  onStep: (dir: -1 | 1) => void;
  onReset?: () => void;
  testId: string;
  hint?: string;
  title?: string;
}) {
  return (
    <div className="flex items-center" data-testid={testId} data-hint={hint}>
      <button className="tool-btn !h-6" aria-label="Less" onClick={() => onStep(-1)}>
        <Minus size={12} />
      </button>
      <button
        className="num min-w-8 px-0.5 text-center text-[12px] text-ink"
        title={title}
        data-testid={`${testId}-value`}
        onClick={onReset}
      >
        {value}
      </button>
      <button className="tool-btn !h-6" aria-label="More" onClick={() => onStep(1)}>
        <Plus size={12} />
      </button>
    </div>
  );
}

/** A style's on/off button. */
function Toggle({
  on,
  label,
  onClick,
  testId,
  hint,
  lit,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  testId: string;
  hint: string;
  lit?: boolean;
}) {
  return (
    <div className="segmented" data-hint={hint}>
      <button data-active={on} data-testid={testId} aria-pressed={on} onClick={onClick}>
        {label}
        {lit && <span className="ml-1 inline-block size-1.5 rounded-full bg-accent" />}
      </button>
    </div>
  );
}

/** A value with a menu of choices. */
function Choice<T>({
  value,
  choices,
  name,
  onPick,
  testId,
}: {
  value: T;
  choices: readonly T[];
  name: (v: T) => string;
  onPick: (v: T) => void;
  testId: string;
}) {
  return (
    <button
      className="tool-btn !h-6 gap-0.5"
      data-testid={testId}
      onClick={(e) =>
        dropdown(
          e.currentTarget,
          choices.map((c) => ({ label: name(c), checked: c === value, onSelect: () => onPick(c) })),
        )
      }
    >
      <span className="num text-[12px] text-ink">{name(value)}</span>
      <ChevronDown size={11} />
    </button>
  );
}

const step = <T,>(all: readonly T[], v: T, dir: -1 | 1) =>
  all[Math.max(0, Math.min(all.length - 1, all.indexOf(v) + dir))];

/** The Play row. */
export function PlayStylesRow() {
  const style = sanitizePlayStyle(useSettings((s) => s.playStyle));
  const latched = useKeys((s) => s.latched);
  const { strum, slop, arp, pattern } = style;
  const nearestStrum = STRUM_TIMES.reduce((b, t) =>
    Math.abs(t - strum.time) < Math.abs(b - strum.time) ? t : b,
  );
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 px-1" data-testid="play-styles-row">
      <span className="label">Play</span>

      <Toggle
        on={strum.on}
        label="Strum"
        testId="play-strum"
        hint="controller.play.strum"
        onClick={() => setPlayStyle({ strum: { on: !strum.on } })}
      />
      {strum.on && (
        <>
          <Stepper
            testId="strum-time"
            hint="controller.play.strum"
            value={`${Math.round(strum.time * 1000)} ms`}
            onStep={(d) => setPlayStyle({ strum: { time: step(STRUM_TIMES, nearestStrum, d) } })}
          />
          <div
            className="segmented"
            data-testid="strum-direction"
            data-hint="controller.play.strum"
          >
            {(["up", "down", "alternate"] as const).map((d) => (
              <button
                key={d}
                data-active={strum.direction === d}
                onClick={() => setPlayStyle({ strum: { direction: d } })}
              >
                {d === "up" ? "Up" : d === "down" ? "Down" : "Alt"}
              </button>
            ))}
          </div>
        </>
      )}

      <Toggle
        on={slop.on}
        label="Slop"
        testId="play-slop"
        hint="controller.play.slop"
        onClick={() => setPlayStyle({ slop: { on: !slop.on } })}
      />
      {slop.on && (
        <Stepper
          testId="slop-amount"
          hint="controller.play.slop"
          value={`${Math.round(slop.amount * 100)}%`}
          onStep={(d) =>
            setPlayStyle({ slop: { amount: Math.max(0.1, Math.min(1, slop.amount + d * 0.1)) } })
          }
        />
      )}

      <Toggle
        on={arp.on}
        label="Arp"
        testId="play-arp"
        hint="controller.play.arp"
        onClick={() => setPlayStyle({ arp: { on: !arp.on } })}
      />
      {arp.on && (
        <>
          <Choice
            testId="arp-mode"
            value={arp.mode}
            choices={ARP_MODES}
            name={(m) => ARP_MODE_NAMES[m]}
            onPick={(m) => setPlayStyle({ arp: { mode: m } })}
          />
          <Choice
            testId="arp-rate"
            value={arp.rate}
            choices={ARP_RATES}
            name={(r) => r}
            onPick={(r) => setPlayStyle({ arp: { rate: r } })}
          />
          <Stepper
            testId="arp-octaves"
            hint="controller.play.arp"
            title="Octaves"
            value={`${arp.octaves} oct`}
            onStep={(d) =>
              setPlayStyle({ arp: { octaves: Math.max(1, Math.min(4, arp.octaves + d)) } })
            }
          />
          <Stepper
            testId="arp-gate"
            hint="controller.play.arp"
            title="Gate"
            value={`${Math.round(arp.gate * 100)}%`}
            onStep={(d) =>
              setPlayStyle({ arp: { gate: Math.max(0.1, Math.min(1, arp.gate + d * 0.1)) } })
            }
          />
        </>
      )}

      <Toggle
        on={pattern.on}
        label="Pattern"
        testId="play-pattern"
        hint="controller.play.pattern"
        onClick={() => setPlayStyle({ pattern: { on: !pattern.on } })}
      />
      {pattern.on && <PatternPicker id={pattern.id} />}

      <Toggle
        on={style.latch}
        label="Latch"
        testId="play-latch"
        hint="controller.play.latch"
        lit={latched}
        onClick={toggleLatch}
      />

      <span className="label">Balance</span>
      <Stepper
        testId="balance"
        hint="controller.play.balance"
        title="Even"
        value={`${Math.round(style.balance * 100)}%`}
        onStep={(d) =>
          setPlayStyle({
            balance: Math.max(0, Math.min(1, Math.round(style.balance * 10 + d) / 10)),
          })
        }
        onReset={() => setPlayStyle({ balance: 0 })}
      />
    </div>
  );
}

/** Which lanes are bass notes (the preview's bottom row). */
const BASS_LANES = new Set([
  "bass",
  "root",
  "3",
  "5",
  "6",
  "b7",
  "7",
  "8",
  "bass5",
  "bass8",
  "walk",
]);

/** A pattern's rhythm in two rows of dots: the chord on top, the bass below (D178). */
function PatternPreview({ p }: { p: ChordPattern }) {
  const w = 3.2;
  const width = p.length * w;
  return (
    <svg width={Math.min(150, width)} height={12} viewBox={`0 0 ${width} 12`} aria-hidden>
      {p.steps.map((h, i) => {
        const bass = BASS_LANES.has(h.part);
        return (
          <rect
            key={i}
            x={h.at * w}
            y={bass ? 7 : 1}
            width={Math.max(1.4, h.length * w - 0.8)}
            height={h.vel >= 0.95 ? 4 : 3}
            rx={1}
            fill={bass ? "var(--text-dim)" : "var(--accent)"}
            opacity={0.4 + 0.6 * h.vel}
          />
        );
      })}
    </svg>
  );
}

/** The pattern: its groups, then their patterns, each with a line and its rhythm (D178). */
function PatternPicker({ id }: { id: string }) {
  const p = patternById(id);
  const later = (fn: () => void) => setTimeout(fn, 0);
  const openGroups = (el: HTMLElement) =>
    dropdown(el, [
      { render: () => <div className="label px-3 py-1">Patterns</div> },
      ...PATTERN_GROUPS.map((g) => ({
        label: `${g} (${PATTERNS.filter((x) => x.group === g).length}) ▸`,
        checked: p.group === g,
        onSelect: () => later(() => openGroup(el, g)),
      })),
    ]);
  const openGroup = (el: HTMLElement, group: string) =>
    dropdown(el, [
      { label: "← Groups", onSelect: () => later(() => openGroups(el)) },
      { separator: true },
      ...PATTERNS.filter((x) => x.group === group).map((x) => ({
        render: (close: () => void) => (
          <button
            className="progression-item"
            data-testid="pattern-option"
            data-pattern={x.id}
            data-checked={x.id === id || undefined}
            onClick={() => {
              setPlayStyle({ pattern: { on: true, id: x.id } });
              close();
            }}
          >
            <span className="flex items-center gap-2">
              <span
                className={x.id === id ? "font-semibold text-accent" : "font-semibold text-ink"}
              >
                {x.name}
              </span>
              {x.tag && <span className="num text-[10px] text-dim">{x.tag}</span>}
              <span className="ml-auto">
                <PatternPreview p={x} />
              </span>
            </span>
            <span className="block text-[11px] leading-snug text-faint">{x.about}</span>
          </button>
        ),
      })),
    ]);
  return (
    <button
      className="tool-btn !h-6 gap-1"
      data-testid="pattern-name"
      data-hint="controller.play.pattern"
      onClick={(e) => openGroups(e.currentTarget)}
    >
      <span className="text-[12px] text-ink">{p.name}</span>
      <span className="text-[10px] text-dim">· {p.group}</span>
      <ChevronDown size={11} />
    </button>
  );
}
