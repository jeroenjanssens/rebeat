/**
 * The Keys panel's settings cards (D213): a title that folds the card (remembered), and a
 * way for the picture's knob labels to point at one (it unfolds, scrolls into view and flashes).
 */
import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { create } from "zustand";
import { useSettings } from "../../state/settings";

const useReveal = create<{ id: string | null; n: number }>(() => ({ id: null, n: 0 }));

/** Unfold a card, bring it into view and flash it. */
export const revealCard = (id: string) => useReveal.setState((s) => ({ id, n: s.n + 1 }));

export function Card({
  id,
  title,
  children,
  right,
}: {
  id: string;
  title: string;
  children: ReactNode;
  /** Shown in the title row (a summary while folded). */
  right?: ReactNode;
}) {
  const folded = useSettings((s) => !!s.controllerFolds[id]);
  const reveal = useReveal();
  const ref = useRef<HTMLElement>(null);
  // the card flashes once per reveal: a new key replays its animation
  const flash = reveal.id === id ? reveal.n : 0;
  const setFolded = (f: boolean) =>
    useSettings.getState().set({
      controllerFolds: { ...useSettings.getState().controllerFolds, [id]: f },
    });
  useEffect(() => {
    if (reveal.id !== id || !reveal.n) return;
    if (useSettings.getState().controllerFolds[id]) setFolded(false);
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reveal.id/ref are stable; only scroll when reveal counter increments
  }, [reveal.n]);
  return (
    <section
      ref={ref}
      key={flash}
      className={`shrink-0 rounded-md border border-line bg-surface/50 ${flash ? "card-flash" : ""}`}
      data-testid={`controller-card-${id}`}
      data-folded={folded || undefined}
    >
      <div className="flex h-7 items-center gap-1 px-1.5">
        <button
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
          data-hint={`controller.card.${id}`}
          aria-expanded={!folded}
          onClick={() => setFolded(!folded)}
        >
          {folded ? (
            <ChevronRight size={12} className="shrink-0 text-dim" />
          ) : (
            <ChevronDown size={12} className="shrink-0 text-dim" />
          )}
          <span className="label !text-ink">{title}</span>
        </button>
        {right}
      </div>
      {!folded && <div className="flex flex-col gap-1.5 px-2 pb-2">{children}</div>}
    </section>
  );
}

/** One line in a card: a label, then its controls (they wrap under it when narrow). */
export function Line({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[26px] flex-wrap items-center gap-1.5">
      {label !== undefined && <span className="label w-[62px] shrink-0">{label}</span>}
      {children}
    </div>
  );
}
