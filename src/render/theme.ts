/** Read design tokens (CSS custom properties) for canvas drawing; cached until the theme changes. */
let cache: Record<string, string> = {};
let version = 0;
const listeners = new Set<() => void>();

export function token(name: string): string {
  if (!(name in cache)) {
    cache[name] = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  }
  return cache[name];
}

export function themeVersion() {
  return version;
}

export function onThemeChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function applyTheme(theme: string, accent: string | null = null) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (accent) root.style.setProperty("--accent", accent);
  else root.style.removeProperty("--accent");
  cache = {};
  version += 1;
  for (const fn of listeners) fn();
}

/** `#rrggbb` + alpha → rgba() */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
