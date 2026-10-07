/**
 * Explain mode: a hover card over anything with `data-hint` (or, failing that, a `title`).
 * Plain DOM so it works the same in pop-out windows (D71).
 */
import { hintFor, type Hint } from "../help/hints";
import { useSettings } from "../state/settings";
import { allCommands, formatKeys, keysFor } from "./commands";

const DELAY = 250;

let hovered: Hint | null = null;

/** The hint under the pointer, for F1 → the matching guide section. */
export const hoveredHint = () => hovered;

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function cardHtml(h: Hint): string {
  const cmd = h.command ? allCommands().find((c) => c.id === h.command) : undefined;
  const keys = cmd ? keysFor(cmd) : [];
  const kbd = keys.map((k) => `<kbd>${esc(formatKeys(k))}</kbd>`).join(" ");
  return [
    `<div class="hint-head"><span class="hint-title">${esc(h.title)}</span>${kbd ? `<span class="hint-keys">${kbd}</span>` : ""}</div>`,
    h.text ? `<div class="hint-text">${esc(h.text)}</div>` : "",
    h.keys ? `<div class="hint-extra">${esc(h.keys)}</div>` : "",
    h.guide ? `<div class="hint-more"><kbd>F1</kbd> more in the guide</div>` : "",
  ].join("");
}

/** A hint for an element: its data-hint entry, or its title as a plain card. */
function hintAt(target: EventTarget | null): { el: HTMLElement; hint: Hint } | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>("[data-hint], [title], [data-hint-title]");
  if (!el) return null;
  const id = el.dataset.hint;
  const known = id ? hintFor(id) : undefined;
  if (known) return { el, hint: known };
  const title = el.getAttribute("title") ?? el.dataset.hintTitle;
  if (title) return { el, hint: { title, text: "" } };
  // an unknown data-hint inside something with a title
  return el.parentElement ? hintAt(el.parentElement) : null;
}

export function installHints(win: Window): () => void {
  const doc = win.document;
  let card: HTMLDivElement | null = null;
  let current: HTMLElement | null = null;
  let timer = 0;

  // while explaining, native title tooltips would double up: park them in data-hint-title
  const parkTitle = (el: HTMLElement) => {
    const t = el.getAttribute("title");
    if (t !== null) {
      el.dataset.hintTitle = t;
      el.removeAttribute("title");
    }
  };
  const restoreTitle = (el: HTMLElement) => {
    const t = el.dataset.hintTitle;
    if (t !== undefined && !el.hasAttribute("title")) el.setAttribute("title", t);
    delete el.dataset.hintTitle;
  };

  const hide = () => {
    win.clearTimeout(timer);
    card?.remove();
    card = null;
    if (current) restoreTitle(current);
    current = null;
    hovered = null;
  };

  const show = (el: HTMLElement, hint: Hint) => {
    card?.remove();
    card = doc.createElement("div");
    card.className = "hint-card";
    card.setAttribute("role", "tooltip");
    card.dataset.testid = "hint-card";
    card.innerHTML = cardHtml(hint);
    (doc.fullscreenElement ?? doc.body).appendChild(card);
    const r = el.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const vw = doc.documentElement.clientWidth;
    const vh = doc.documentElement.clientHeight;
    const below = r.bottom + 8 + c.height <= vh || r.top - 8 - c.height < 0;
    const top = below ? r.bottom + 8 : r.top - 8 - c.height;
    const left = Math.max(8, Math.min(vw - c.width - 8, r.left + r.width / 2 - c.width / 2));
    card.style.top = `${Math.max(8, top)}px`;
    card.style.left = `${left}px`;
  };

  const onOver = (e: PointerEvent) => {
    if (!useSettings.getState().explain || e.pointerType === "touch") return;
    const found = hintAt(e.target);
    if (found?.el === current) return;
    hide();
    if (!found) return;
    current = found.el;
    hovered = found.hint;
    parkTitle(found.el);
    timer = win.setTimeout(() => show(found.el, found.hint), DELAY);
  };
  const onOut = (e: PointerEvent) => {
    if (!current) return;
    const to = e.relatedTarget;
    if (to instanceof Node && current.contains(to)) return;
    hide();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") hide();
  };

  doc.addEventListener("pointerover", onOver, true);
  doc.addEventListener("pointerout", onOut, true);
  doc.addEventListener("pointerdown", hide, true);
  doc.addEventListener("wheel", hide, { capture: true, passive: true });
  doc.addEventListener("keydown", onKey, true);
  const off = useSettings.subscribe((s, prev) => {
    if (s.explain !== prev.explain && !s.explain) hide();
  });
  return () => {
    hide();
    off();
    doc.removeEventListener("pointerover", onOver, true);
    doc.removeEventListener("pointerout", onOut, true);
    doc.removeEventListener("pointerdown", hide, true);
    doc.removeEventListener("wheel", hide, true);
    doc.removeEventListener("keydown", onKey, true);
  };
}
