import { useEffect, useReducer } from "react";
import * as engine from "../engine/engine";
import { Scope, type ScopeSource } from "../components/Scope";
import { onThemeChange, token } from "../render/theme";
import { useStore } from "../state/store";

/** A scope tile's narrowest width in the top bar, and the gap between tiles. */
export const SCOPE_MIN = 40;
export const SCOPE_GAP = 3;

// the scope's glow needs #rrggbb (as the master scope panel does)
const hex = (color: string, fallback: string) => (color.startsWith("#") ? color : fallback);

function peak(w: Float32Array | null) {
  let p = 0;
  if (w) for (let i = 0; i < w.length; i += 2) p = Math.max(p, Math.abs(w[i]));
  return Math.min(1, p);
}

// module constants, so the scopes' frame callbacks stay registered across renders
const MASTER: ScopeSource = {
  wave: () => engine.masterMono(),
  level: () => Math.max(...engine.masterLevel()),
};
const KEYS: ScopeSource = {
  wave: () => engine.keysWaveform(),
  level: () => peak(engine.keysWaveform()),
};

/** How many tiles the strip shows: the master, the keys and every track. */
export function useScopeCount(): number {
  return useStore((s) => s.project.tracks.length) + 2;
}

/** The width the strip needs for `count` tiles at their narrowest. */
export function scopesWidth(count: number): number {
  return count * SCOPE_MIN + (count - 1) * SCOPE_GAP;
}

function Tile({
  label,
  title,
  selected,
  onClick,
  children,
}: {
  label: string;
  title: string;
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative h-full min-w-[40px] max-w-[120px] flex-1 overflow-hidden rounded ${
        onClick ? "cursor-pointer" : ""
      } ${selected ? "ring-1 ring-accent" : ""}`}
      title={title}
      onClick={onClick}
      data-testid="top-scope"
    >
      {children}
      <span className="pointer-events-none absolute left-1 top-0 max-w-[calc(100%-12px)] truncate text-[8.5px] font-semibold uppercase leading-[12px] text-dim">
        {label}
      </span>
    </div>
  );
}

/**
 * The scopes in the top bar (or on the row under it): the master, the keys, then one per track
 * in the drum machine's order. A track's tile selects it.
 */
export function ScopeStrip({ wrap = false }: { wrap?: boolean }) {
  const tracks = useStore((s) => s.project.tracks);
  const selectedTrackId = useStore((s) => s.selectedTrackId);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onThemeChange(redraw), []);
  const master = hex(token("accent"), "#7dd3fc");
  const keys = hex(token("lit"), "#fbbf24");

  return (
    <div
      className={`flex min-w-0 ${wrap ? "flex-wrap [&>*]:h-8" : "h-full w-full justify-center"}`}
      style={{ gap: SCOPE_GAP }}
      data-hint="transport.scopes"
      data-testid="top-scopes"
    >
      <Tile label="Master" title="The master output">
        <Scope source={MASTER} color={master} meter={false} />
      </Tile>
      <Tile label="Keys" title="What the keys play">
        <Scope source={KEYS} color={keys} meter={false} />
      </Tile>
      {tracks.map((t) => (
        <Tile
          key={t.id}
          label={t.name}
          title={`${t.name}: click to select the track`}
          selected={t.id === selectedTrackId}
          onClick={() => useStore.getState().setUi({ selectedTrackId: t.id })}
        >
          <Scope trackId={t.id} color={t.color} meter={false} />
        </Tile>
      ))}
    </div>
  );
}
