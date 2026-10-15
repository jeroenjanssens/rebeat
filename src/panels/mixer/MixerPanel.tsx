import { useRef, type ReactNode } from "react";
import { useElementSize } from "../../render/useElementSize";
import { focusPanel } from "../../app/openers";
import { EffectEditor } from "../../components/EffectEditor";
import { Encoder } from "../../components/Encoder";
import { ROLES } from "../../midi/mapping";
import { Fader } from "../../components/Fader";
import { contextMenu, useMenu } from "../../components/Menu";
import { chainMenu } from "../../components/fxMenus";
import { VMeter } from "../../components/VMeter";
import * as engine from "../../engine/engine";
import type { Bus } from "../../model/effects";
import { EFFECT_GROUPS, EFFECT_SHORT, MIX_PARAMS, VOLUME_FORMAT } from "../../model/params";
import type { Effect, Track } from "../../model/types";
import { accepts, addEffect, type FxTarget } from "../../state/effectActions";
import { useStore } from "../../state/store";
import { setKeysMix, useKeys } from "../../state/keys";
import { useSettings } from "../../state/settings";

const PAN = MIX_PARAMS.find((p) => p.id === "pan")!;
/**
 * A strip's effects in its narrow FX button: one or two short names ("Comp", "Dly·Rev"), or the
 * first and how many more ("EQ +2"), or "FX" for none. The tooltip has the whole chain.
 */
function fxLabel(effects: { name: string }[]) {
  const names = effects.map((f) => EFFECT_SHORT[f.name] ?? f.name.slice(0, 4));
  if (!names.length) return "FX";
  return names.length > 2 ? `${names[0]} +${names.length - 1}` : names.join("·");
}

const SEND_A = MIX_PARAMS.find((p) => p.id === "sendA")!;
const SEND_B = MIX_PARAMS.find((p) => p.id === "sendB")!;

/** Open an effect chain editor as a popover under an element. */
function chainPopover(
  el: HTMLElement,
  target: FxTarget,
  title: string,
  effects: Effect[],
  color?: string,
  removable = true,
) {
  const r = el.getBoundingClientRect();
  useMenu.getState().show(r.left, r.bottom + 4, [
    {
      render: () => (
        <ChainEditor
          target={target}
          title={title}
          color={color}
          removable={removable}
          initial={effects}
        />
      ),
    },
  ]);
}

const NO_FX: Effect[] = [];

/** Reads live data from the store so the popover updates while you turn knobs. */
function ChainEditor({
  target,
  title,
  color,
  removable,
}: {
  target: FxTarget;
  title: string;
  color?: string;
  removable: boolean;
  initial: Effect[];
}) {
  const projectFx = useStore((s) =>
    target === "master"
      ? s.project.master.effects
      : target === "keys"
        ? null
        : "track" in target
          ? (s.project.tracks.find((t) => t.id === target.track)?.effects ?? [])
          : (s.project.buses.find((b) => b.id === target.bus)?.effects ?? []),
  );
  // the Keys strip's effects are settings (D212)
  const keysFx = useSettings((s) => s.keysMix.effects);
  const effects = projectFx ?? keysFx ?? NO_FX;
  return (
    <div className="flex w-[300px] flex-col gap-1.5 p-2">
      <div className="flex items-center">
        <span className="label flex-1 !text-ink">{title}</span>
        {/* a select, not a dropdown menu: opening a menu would close this popover */}
        <select
          className="input !h-6 !text-[11px]"
          value=""
          onChange={(e) => e.target.value && addEffect(target, e.target.value)}
          data-hint="mixer.fx.add"
        >
          <option value="">+ Add effect</option>
          {EFFECT_GROUPS.map((g) => (
            <optgroup key={g.name} label={g.name}>
              {g.effects
                .filter((t) => accepts(target, t))
                .map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      {effects.map((fx, i) => (
        <EffectEditor
          key={fx.id ?? i}
          target={target}
          effect={fx}
          index={i}
          count={effects.length}
          color={color}
          removable={removable}
        />
      ))}
    </div>
  );
}

function Strip({
  name,
  color,
  children,
  fader,
  meter,
  footer,
  testId,
  selected,
  onSelect,
  hint,
}: {
  name: string;
  color: string;
  children?: ReactNode;
  fader: ReactNode;
  meter: ReactNode;
  footer?: ReactNode;
  testId?: string;
  selected?: boolean;
  onSelect?: () => void;
  hint?: string;
}) {
  return (
    <div
      className="flex w-[78px] shrink-0 flex-col items-center gap-1.5 rounded-md border bg-surface/50 px-1 py-1.5"
      style={{ borderColor: selected ? color : "var(--border)" }}
      data-testid={testId}
      data-hint={hint}
      onPointerDown={onSelect}
    >
      <div className="h-1 w-full rounded-full" style={{ background: color }} />
      <div
        className="w-full truncate text-center text-[10.5px] font-semibold uppercase tracking-wide"
        title={name}
      >
        {name}
      </div>
      {children}
      <div className="flex min-h-0 flex-1 items-stretch justify-center gap-1">
        {fader}
        {meter}
      </div>
      {footer}
    </div>
  );
}

function SmallButton({
  label,
  lit,
  color,
  onClick,
  title,
  hint,
}: {
  label: string;
  lit: boolean;
  color: string;
  onClick: () => void;
  title: string;
  hint?: string;
}) {
  return (
    <button
      className="num flex h-[18px] w-[22px] items-center justify-center rounded-[3px] border text-[9.5px] font-bold"
      style={{
        borderColor: lit ? color : "var(--border)",
        background: lit ? color : "var(--raised)",
        color: lit ? "#000" : "var(--text-dim)",
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      title={title}
      data-hint={hint}
    >
      {label}
    </button>
  );
}

function TrackStrip({
  track,
  index,
  faderH,
  compact,
}: {
  track: Track;
  index: number;
  faderH: number;
  compact: boolean;
}) {
  const commit = useStore((s) => s.commit);
  const selected = useStore((s) => s.selectedTrackId === track.id);
  const fxRef = useRef<HTMLButtonElement>(null);
  const update = (fn: (t: Track) => void, key?: string) =>
    commit((p) => {
      const t = p.tracks.find((x) => x.id === track.id);
      if (t) fn(t);
    }, key);
  return (
    <Strip
      name={track.name}
      color={track.color}
      testId="mixer-strip"
      selected={selected}
      onSelect={() => useStore.getState().setUi({ selectedTrackId: track.id })}
      hint="mixer.track.select"
      fader={
        <Fader
          value={track.volume}
          color={track.color}
          height={faderH}
          hint="param.mix.volume"
          onChange={(v) => update((t) => (t.volume = v), `mix-vol-${track.id}`)}
          midi={{
            target: `track:${track.id}:volume`,
            label: `${track.name} · Level`,
            global: { target: ROLES.trackVolume(index + 1), label: `Track ${index + 1} · Level` },
          }}
        />
      }
      meter={<VMeter read={() => engine.level(track.id)} height={faderH} />}
      footer={
        <>
          <span className="num text-[9.5px] text-dim">{VOLUME_FORMAT(track.volume)}</span>
          <div className="flex gap-0.5">
            <SmallButton
              label="M"
              lit={track.mute}
              color="#f59e0b"
              title="Mute"
              hint="mixer.track.mute"
              onClick={() => update((t) => (t.mute = !t.mute))}
            />
            <SmallButton
              label="S"
              lit={track.solo}
              color="#22d3ee"
              title="Solo"
              hint="mixer.track.solo"
              onClick={() => update((t) => (t.solo = !t.solo))}
            />
          </div>
          <span className="num text-[9px] text-faint">{String(index + 1).padStart(2, "0")}</span>
        </>
      }
    >
      <button
        ref={fxRef}
        className="num h-[18px] w-full truncate rounded-[3px] border border-line px-1 text-[9.5px] text-dim hover:text-ink"
        title={track.effects.map((f) => f.name).join(" → ") || "No insert effects"}
        data-hint="mixer.track.fx"
        onPointerDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => contextMenu(e, chainMenu({ track: track.id }, track.effects, e))}
        onClick={() =>
          chainPopover(
            fxRef.current!,
            { track: track.id },
            `${track.name} · inserts`,
            track.effects,
            track.color,
          )
        }
      >
        {fxLabel(track.effects)}
      </button>
      {!compact && (
        <>
          <div className="flex">
            {[SEND_A, SEND_B].map((def) => (
              <Encoder
                key={def.id}
                def={def}
                size={26}
                width={36}
                short
                color={track.color}
                value={track.params[`mix.${def.id}`] ?? 0}
                hint={`param.mix.${def.id}`}
                onChange={(v) =>
                  update((t) => (t.params[`mix.${def.id}`] = v), `mix-${def.id}-${track.id}`)
                }
                midiTarget={`track:${track.id}:mix.${def.id}`}
              />
            ))}
          </div>
          <Encoder
            def={PAN}
            size={26}
            color={track.color}
            value={track.params["mix.pan"] ?? 0.5}
            hint="param.mix.pan"
            onChange={(v) => update((t) => (t.params["mix.pan"] = v), `mix-pan-${track.id}`)}
            midiTarget={`track:${track.id}:mix.pan`}
          />
        </>
      )}
    </Strip>
  );
}

function BusStrip({ bus, faderH }: { bus: Bus; faderH: number }) {
  const commit = useStore((s) => s.commit);
  const fxRef = useRef<HTMLButtonElement>(null);
  const update = (fn: (b: Bus) => void, key?: string) =>
    commit((p) => {
      const b = p.buses.find((x) => x.id === bus.id);
      if (b) fn(b);
    }, key);
  return (
    <Strip
      name={bus.name}
      color="var(--accent)"
      testId="bus-strip"
      fader={
        <Fader
          value={bus.volume}
          height={faderH}
          hint="mixer.bus.fader"
          onChange={(v) => update((b) => (b.volume = v), `bus-vol-${bus.id}`)}
          midi={{
            target: `bus:${bus.id}`,
            label: `${bus.name} · Level`,
            global: { target: `bus:${bus.id}`, label: `${bus.name} · Level` },
          }}
        />
      }
      meter={<VMeter read={() => engine.busLevel(bus.id)} height={faderH} />}
      footer={
        <>
          <span className="num text-[9.5px] text-dim">{VOLUME_FORMAT(bus.volume)}</span>
          <SmallButton
            label="M"
            lit={bus.mute}
            color="#f59e0b"
            title="Mute the return"
            hint="mixer.bus.mute"
            onClick={() => update((b) => (b.mute = !b.mute))}
          />
          <span className="label !text-[8.5px]">Return {bus.id === "bus-a" ? "A" : "B"}</span>
        </>
      }
    >
      <button
        ref={fxRef}
        className="num h-[18px] w-full truncate rounded-[3px] border border-line px-1 text-[9.5px] text-dim hover:text-ink"
        data-hint="mixer.bus.fx"
        onContextMenu={(e) => contextMenu(e, chainMenu({ bus: bus.id }, bus.effects, e))}
        onClick={() =>
          chainPopover(fxRef.current!, { bus: bus.id }, `${bus.name} bus`, bus.effects)
        }
      >
        {fxLabel(bus.effects)}
      </button>
    </Strip>
  );
}

function MasterStrip({ faderH }: { faderH: number }) {
  const master = useStore((s) => s.project.master);
  const commit = useStore((s) => s.commit);
  const fxRef = useRef<HTMLButtonElement>(null);
  return (
    <Strip
      name="Master"
      color="var(--lit)"
      testId="master-strip"
      fader={
        <Fader
          value={master.volume}
          height={faderH}
          hint="mixer.master.fader"
          onChange={(v) => commit((p) => void (p.master.volume = v), "master-vol")}
          midi={{
            target: "master:volume",
            label: "Master · Level",
            global: { target: "master:volume", label: "Master · Level" },
          }}
        />
      }
      meter={<VMeter read={() => engine.masterLevel()} height={faderH} width={10} />}
      footer={
        <>
          <span className="num text-[9.5px] text-dim">{VOLUME_FORMAT(master.volume)}</span>
          <button
            className="label !text-[8.5px] hover:!text-ink"
            data-hint="mixer.master.scope"
            onClick={() => focusPanel("master-scope")}
          >
            Scope
          </button>
        </>
      }
    >
      <button
        ref={fxRef}
        className="num h-[18px] w-full truncate rounded-[3px] border border-line px-1 text-[9.5px] text-dim hover:text-ink"
        data-hint="mixer.master.fx"
        onContextMenu={(e) => contextMenu(e, chainMenu("master", master.effects, e))}
        onClick={() => chainPopover(fxRef.current!, "master", "Master chain", master.effects)}
        title={master.effects.map((f) => `${f.name}${f.bypass ? " (off)" : ""}`).join(" → ")}
      >
        {fxLabel(master.effects)}
      </button>
    </Strip>
  );
}

/**
 * The Keys strip (D126, D212): while the keys play a library sound that isn't on a track, its
 * channel, laid out as a track's: effects, sends, pan, level, mute. It's a live instrument: it
 * plays through the master but isn't in exports, and its settings are yours, not the project's.
 */
function KeysStrip({ faderH, compact }: { faderH: number; compact: boolean }) {
  const target = useKeys((s) => s.target);
  const mix = useSettings((s) => s.keysMix);
  const fxRef = useRef<HTMLButtonElement>(null);
  if (target.kind !== "sound") return null;
  const effects = mix.effects ?? NO_FX;
  const color = "var(--lit)";
  return (
    <Strip
      name={`Keys · ${target.name}`}
      color={color}
      testId="keys-strip"
      hint="mixer.keys"
      fader={
        <Fader
          value={mix.volume}
          height={faderH}
          hint="mixer.keys"
          onChange={(volume) => setKeysMix({ volume })}
          midi={{
            target: "keys:volume",
            label: "Keys · Level",
            global: { target: "keys:volume", label: "Keys · Level" },
          }}
        />
      }
      meter={<VMeter read={() => engine.keysLevel()} height={faderH} />}
      footer={
        <>
          <span className="num text-[9.5px] text-dim">{VOLUME_FORMAT(mix.volume)}</span>
          <div className="flex gap-0.5">
            <SmallButton
              label="M"
              lit={!!mix.mute}
              color="#f59e0b"
              title="Mute the keys"
              hint="mixer.keys.mute"
              onClick={() => setKeysMix({ mute: !mix.mute })}
            />
            {/* no solo for the keys: an empty slot keeps the strips lined up */}
            <span className="h-[18px] w-[22px]" />
          </div>
          <span className="num text-[9px] text-faint">K</span>
        </>
      }
    >
      <button
        ref={fxRef}
        className="num h-[18px] w-full truncate rounded-[3px] border border-line px-1 text-[9.5px] text-dim hover:text-ink"
        title={effects.map((f) => f.name).join(" → ") || "No insert effects"}
        data-hint="mixer.keys.fx"
        data-testid="keys-fx"
        onPointerDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => contextMenu(e, chainMenu("keys", effects, e))}
        onClick={() => chainPopover(fxRef.current!, "keys", "Keys · inserts", effects, color)}
      >
        {fxLabel(effects)}
      </button>
      {!compact && (
        <>
          <div className="flex">
            {[SEND_A, SEND_B].map((def) => (
              <Encoder
                key={def.id}
                def={def}
                size={26}
                width={36}
                short
                color={color}
                value={def.id === "sendA" ? mix.sendA : mix.sendB}
                hint={`param.mix.${def.id}`}
                onChange={(v) => setKeysMix(def.id === "sendA" ? { sendA: v } : { sendB: v })}
                midiTarget={`keys:mix.${def.id}`}
              />
            ))}
          </div>
          <Encoder
            def={PAN}
            size={26}
            color={color}
            value={mix.pan ?? 0.5}
            hint="param.mix.pan"
            onChange={(pan) => setKeysMix({ pan })}
            midiTarget="keys:mix.pan"
          />
        </>
      )}
    </Strip>
  );
}

/** Channel strips for every track, the send/return buses and the master. */
export function MixerPanel() {
  const tracks = useStore((s) => s.project.tracks);
  const buses = useStore((s) => s.project.buses);
  const root = useRef<HTMLDivElement>(null);
  const { height: h } = useElementSize(root);
  // short panels hide sends and pan (they're in the Inspector too)
  const compact = h < 360;
  // strip chrome above and below the fader: name, FX, sends, pan, labels, buttons
  const faderH = Math.max(50, h - (compact ? 130 : 270));
  return (
    <div
      ref={root}
      className="scroll-thin flex h-full gap-1.5 overflow-x-auto overflow-y-hidden p-2"
      data-testid="mixer"
    >
      {tracks.map((t, i) => (
        <TrackStrip key={t.id} track={t} index={i} faderH={faderH} compact={compact} />
      ))}
      <KeysStrip faderH={faderH} compact={compact} />
      <div className="mx-1 w-px shrink-0 bg-line" />
      {buses.map((b) => (
        <BusStrip key={b.id} bus={b} faderH={faderH + (compact ? 0 : 140)} />
      ))}
      <div className="mx-1 w-px shrink-0 bg-line" />
      <MasterStrip faderH={faderH + (compact ? 0 : 140)} />
    </div>
  );
}
