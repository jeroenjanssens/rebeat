/**
 * The Keys panel's Bend card (D222): a bend for every note the keys play, in one of seven
 * shapes, each with its own amount, time, delay and curve; which notes bend, how many, how much
 * harder notes bend; and what the MiniLab's pitch strip bends (D225). Synths and samples (D285).
 */
import type { ReactNode } from "react";
import { Music } from "lucide-react";
import { contextMenu } from "../../components/Menu";
import { EASE_LABEL } from "../../model/ease";
import { BEND_EASES, sanitizePlayStyle, type BendNotes } from "../../model/perform";
import { BEND_SHAPES, type BendShape } from "../../model/types";
import {
  BEND_QUARTERS,
  BEND_SECONDS,
  amountRange,
  bendTimeLabel,
  nearest,
  resetBendValue,
  setBend,
  setBendSync,
  setBendValues,
  stepIn,
} from "../../state/bendControls";
import { keysDescription, keysPlaySynth, useKeys } from "../../state/keys";
import { useSettings } from "../../state/settings";
import { useStore } from "../../state/store";
import { Card, Line } from "./Card";
import { Stepper } from "./PlayStyles";

export const SHAPE_NAMES: Record<BendShape, string> = {
  scoop: "Scoop",
  fall: "Fall",
  doit: "Doit",
  dip: "Dip",
  rise: "Rise",
  next: "Next",
  shake: "Shake",
};

const NOTES: [BendNotes, string][] = [
  ["all", "All"],
  ["top", "Top"],
  ["bass", "Bass"],
  ["newest", "Newest"],
];

/** A control's menu: MIDI learn for it, in every project (the card is a setting, not the song). */
const learn = (e: React.MouseEvent, id: string, label: string) =>
  contextMenu(e, [
    {
      label: `MIDI learn: Bend ${label}`,
      onSelect: () =>
        void import("../../audio-io/midi").then((m) =>
          m.startLearn(`bend:${id}`, `Bend · ${label}`, "global"),
        ),
    },
  ]);

/** A control that can be MIDI-learned (right-click). */
function Learn({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <span className="contents" onContextMenu={(e) => learn(e, id, label)}>
      {children}
    </span>
  );
}

export function BendCard({ minilab }: { minilab: boolean }) {
  const bend = sanitizePlayStyle(useSettings((s) => s.playStyle)).bend;
  // re-read what the keys play when it may have changed
  useKeys((s) => s.target);
  const synth = useStore(() => keysPlaySynth());
  const name = useStore(() => keysDescription().name);
  const v = bend.shapes[bend.shape];
  const synced = v.unit === "q";
  const times = synced ? BEND_QUARTERS : BEND_SECONDS;
  const next = bend.shape === "next";
  const amount = next
    ? `${v.amount > 0 ? "+" : ""}${v.amount} ${Math.abs(v.amount) === 1 ? "note" : "notes"}`
    : `${v.amount > 0 ? "+" : ""}${v.amount.toFixed(1)} st`;
  const r = amountRange(bend.shape);
  const amountStep = next ? 1 : bend.shape === "shake" ? 0.1 : 0.5;
  return (
    <Card
      id="bend"
      title="Bend"
      right={
        <span className="truncate text-[10.5px] text-dim">
          {bend.on ? `${SHAPE_NAMES[bend.shape]} ${amount}` : ""}
        </span>
      }
    >
      <div className="flex flex-col gap-1" data-testid="bend-card">
        <Line>
          <Learn id="on" label="On">
            <div className="segmented" data-hint="controller.bend.on">
              <button
                data-active={bend.on}
                aria-pressed={bend.on}
                data-testid="bend-on"
                onClick={() => setBend({ on: !bend.on })}
              >
                Bend
              </button>
            </div>
          </Learn>
          <Learn id="shape" label="Shape">
            <div
              className="segmented flex-wrap"
              data-testid="bend-shape"
              data-hint="controller.bend.shape"
            >
              {BEND_SHAPES.map((s) => (
                <button
                  key={s}
                  data-active={bend.shape === s}
                  data-shape={s}
                  onClick={() => setBend({ shape: s })}
                >
                  {SHAPE_NAMES[s]}
                </button>
              ))}
            </div>
          </Learn>
        </Line>
        <Line label="Amount">
          <Learn id="amount" label="Amount">
            <Stepper
              testId="bend-amount"
              hint="controller.bend.amount"
              title="Click: back to this shape's default"
              value={amount}
              onStep={(d) =>
                setBendValues({
                  amount: Math.max(
                    -r,
                    Math.min(r, Math.round((v.amount + d * amountStep) * 10) / 10),
                  ),
                })
              }
              onReset={() => resetBendValue("amount")}
            />
          </Learn>
        </Line>
        <Line label="Time">
          <Learn id="time" label="Time">
            <Stepper
              testId="bend-time"
              hint="controller.bend.time"
              value={bendTimeLabel(v.time, v.unit)}
              onStep={(d) => setBendValues({ time: stepIn(times, v.time, d) })}
              onReset={() => resetBendValue("time")}
            />
          </Learn>
          <button
            className="tool-btn !h-6"
            data-active={synced}
            aria-pressed={synced}
            title={
              synced
                ? "In beats, following the tempo (click: in seconds)"
                : "In seconds (click: in beats)"
            }
            data-testid="bend-sync"
            data-hint="controller.bend.sync"
            onClick={() => setBendSync(!synced)}
          >
            <Music size={12} />
          </button>
        </Line>
        <Line label="Delay">
          <Learn id="delay" label="Delay">
            <Stepper
              testId="bend-delay"
              hint="controller.bend.delay"
              value={bendTimeLabel(v.delay, v.unit)}
              onStep={(d) => {
                // none, then the times
                const list = [0, ...times];
                const i = v.delay <= 0 ? 0 : list.indexOf(nearest(times, v.delay));
                setBendValues({ delay: list[Math.max(0, Math.min(list.length - 1, i + d))] });
              }}
              onReset={() => setBendValues({ delay: 0 })}
            />
          </Learn>
        </Line>
        <Line label="Curve">
          <div className="segmented" data-testid="bend-curve" data-hint="controller.bend.curve">
            {BEND_EASES.map((e) => (
              <button key={e} data-active={v.ease === e} onClick={() => setBendValues({ ease: e })}>
                {e === "exponential" ? "Exp" : EASE_LABEL[e]}
              </button>
            ))}
          </div>
        </Line>
        {bend.shape === "shake" && (
          <Line label="Rate">
            <Stepper
              testId="bend-rate"
              hint="controller.bend.rate"
              value={synced ? `${v.rate}/beat` : `${v.rate.toFixed(1)} Hz`}
              onStep={(d) =>
                setBendValues({
                  rate: synced
                    ? Math.max(1, Math.min(8, Math.round(v.rate) + d))
                    : Math.max(0.5, Math.min(16, Math.round((v.rate + d * 0.5) * 10) / 10)),
                })
              }
              onReset={() => resetBendValue("rate")}
            />
          </Line>
        )}
        <Line label="Notes">
          <div className="segmented" data-testid="bend-notes" data-hint="controller.bend.notes">
            {NOTES.map(([id, label]) => (
              <button
                key={id}
                data-active={bend.notes === id}
                onClick={() => setBend({ notes: id })}
              >
                {label}
              </button>
            ))}
          </div>
        </Line>
        <Line label="Chance">
          <Learn id="chance" label="Chance">
            <Stepper
              testId="bend-chance"
              hint="controller.bend.chance"
              value={`${Math.round(bend.chance * 100)}%`}
              onStep={(d) =>
                setBend({
                  chance: Math.max(0.1, Math.min(1, Math.round(bend.chance * 10 + d) / 10)),
                })
              }
              onReset={() => setBend({ chance: 1 })}
            />
          </Learn>
          <span className="flex-1" />
          <span className="label">Velocity</span>
          <Learn id="velocity" label="Velocity">
            <Stepper
              testId="bend-velocity"
              hint="controller.bend.velocity"
              value={`${bend.velocity > 0 ? "+" : ""}${Math.round(bend.velocity * 100)}%`}
              onStep={(d) =>
                setBend({
                  velocity: Math.max(-1, Math.min(1, Math.round(bend.velocity * 4 + d) / 4)),
                })
              }
              onReset={() => setBend({ velocity: 0 })}
            />
          </Learn>
        </Line>
        {minilab && (
          <Line label="Strip">
            <div className="segmented" data-testid="bend-strip" data-hint="controller.bend.strip">
              <button
                data-active={bend.strip === "synth"}
                onClick={() => setBend({ strip: "synth" })}
              >
                Whole synth
              </button>
              <button
                data-active={bend.strip === "newest"}
                onClick={() => setBend({ strip: "newest" })}
              >
                Newest note
              </button>
            </div>
          </Line>
        )}
        {!synth && (
          <p className="text-[10.5px] leading-snug text-faint" data-testid="bend-synths-only">
            Bends play on synths and samples. The keys play {name} now: nothing bends.
          </p>
        )}
      </div>
    </Card>
  );
}
