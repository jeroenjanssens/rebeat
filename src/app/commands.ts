/**
 * Command registry: every action that has a shortcut or appears in the command palette.
 * Shortcuts are strings like "Mod+Shift+F" (Mod = ⌘ on macOS, Ctrl elsewhere) and can be
 * rebound in the settings.
 */
import { useSyncExternalStore } from "react";
import { useSettings } from "../state/settings";

export interface Command {
  id: string;
  title: string;
  category: string;
  /** Default shortcut(s). */
  keys?: string[];
  run: () => void;
  /** For held commands (e.g. hold M to mute tracks): called on key release. */
  release?: () => void;
  enabled?: () => boolean;
  /** Not listed in the command palette (still triggered by its shortcut). */
  hidden?: boolean;
  /** Also fires while typing in an input. */
  global?: boolean;
}

const registry = new Map<string, Command>();
let version = 0;
const listeners = new Set<() => void>();

function changed() {
  version += 1;
  for (const fn of listeners) fn();
}

export function registerCommands(list: Command[]): () => void {
  for (const c of list) registry.set(c.id, c);
  changed();
  return () => {
    for (const c of list) if (registry.get(c.id) === c) registry.delete(c.id);
    changed();
  };
}

export function allCommands(): Command[] {
  return [...registry.values()];
}

export function useCommands(): Command[] {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => version,
  );
  return allCommands();
}

export function runCommand(id: string) {
  const c = registry.get(id);
  if (c && (c.enabled?.() ?? true)) c.run();
}

/** The active shortcuts of a command (user overrides win over defaults). */
export function keysFor(c: Command, overrides = useSettings.getState().shortcuts): string[] {
  const o = overrides[c.id];
  if (o !== undefined) return o ? o.split(" | ") : [];
  return c.keys ?? [];
}

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const CODE_NAMES: Record<string, string> = {
  Space: "Space",
  Enter: "Enter",
  NumpadEnter: "Enter",
  Escape: "Escape",
  Backspace: "Backspace",
  Delete: "Delete",
  Tab: "Tab",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  ArrowDown: "Down",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  Backquote: "`",
};

/** The key part of a shortcut, from the physical key (layout-independent for letters/digits). */
export function keyName(e: KeyboardEvent): string | null {
  const { code } = e;
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad") && /\d$/.test(code)) return code.slice(6);
  if (/^F\d+$/.test(code)) return code;
  return CODE_NAMES[code] ?? null;
}

/** Normalized shortcut string for a key event, e.g. "Mod+Shift+F". */
export function eventShortcut(e: KeyboardEvent): string | null {
  const key = keyName(e);
  if (!key) return null;
  const parts: string[] = [];
  if (isMac ? e.metaKey : e.ctrlKey) parts.push("Mod");
  if (isMac && e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

const SYMBOLS: Record<string, string> = isMac
  ? { Mod: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Enter: "↩", Backspace: "⌫", Escape: "Esc" }
  : { Mod: "Ctrl+", Ctrl: "Ctrl+", Alt: "Alt+", Shift: "Shift+", Backspace: "⌫", Escape: "Esc" };

/** A shortcut for display, e.g. "⌘⇧F". */
export function formatKeys(keys: string): string {
  return keys
    .split("+")
    .map(
      (p) =>
        SYMBOLS[p] ??
        (p === "Left" ? "←" : p === "Right" ? "→" : p === "Up" ? "↑" : p === "Down" ? "↓" : p),
    )
    .join("");
}

/** Find the command bound to a shortcut. */
export function commandForShortcut(shortcut: string): Command | undefined {
  const overrides = useSettings.getState().shortcuts;
  for (const c of registry.values()) if (keysFor(c, overrides).includes(shortcut)) return c;
  return undefined;
}

type KeyHook = (e: KeyboardEvent, down: boolean) => boolean;
const hooks: KeyHook[] = [];

/** Handle raw keys before shortcuts (e.g. keyboard pads). Return true when the key was used. */
export function addKeyHook(fn: KeyHook): () => void {
  hooks.push(fn);
  return () => {
    hooks.splice(hooks.indexOf(fn), 1);
  };
}

/** Listen for shortcuts on a window (the main window, or a Dockview pop-out). */
export function installKeyboard(win: Window = window): () => void {
  const held = new Map<string, Command>();
  const typing = (e: KeyboardEvent) =>
    (e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]");

  const down = (e: KeyboardEvent) => {
    const isTyping = !!typing(e);
    if (!isTyping) for (const h of hooks) if (h(e, true)) return e.preventDefault();
    const shortcut = eventShortcut(e);
    if (!shortcut) return;
    const c = commandForShortcut(shortcut);
    if (!c || (isTyping && !c.global)) return;
    if (c.enabled && !c.enabled()) return;
    e.preventDefault();
    if (e.repeat) return;
    if (c.release) held.set(e.code, c);
    c.run();
  };
  const up = (e: KeyboardEvent) => {
    for (const h of hooks) if (h(e, false)) return;
    const c = held.get(e.code);
    if (c) {
      held.delete(e.code);
      c.release?.();
    }
  };
  const blur = () => {
    for (const c of held.values()) c.release?.();
    held.clear();
  };
  win.addEventListener("keydown", down);
  win.addEventListener("keyup", up);
  win.addEventListener("blur", blur);
  return () => {
    win.removeEventListener("keydown", down);
    win.removeEventListener("keyup", up);
    win.removeEventListener("blur", blur);
  };
}
