/** Read design tokens (CSS custom properties) for canvas drawing; cached until the theme changes. */
let cache: Record<string, string> = {};
const listeners = new Set<() => void>();

export function token(name: string): string {
  if (!(name in cache)) {
    cache[name] = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  }
  return cache[name];
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
  for (const fn of listeners) fn();
}

/** `#rrggbb` + alpha → rgba() */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** A CSS color (`#rgb`, `#rrggbb`, `rgb()`, `rgba()`) as [r, g, b, a] (0–255, a 0–1). */
export function parseColor(c: string): [number, number, number, number] {
  const s = c.trim();
  if (s.startsWith("#")) {
    const h = s.length === 4 ? [...s.slice(1)].map((x) => x + x).join("") : s.slice(1, 7);
    const n = parseInt(h, 16);
    const a = s.length === 9 ? parseInt(s.slice(7, 9), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (m) {
    const [r, g, b, a = "1"] = m[1].split(/[\s,/]+/).filter(Boolean);
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  return [128, 128, 128, 1];
}

/** Mix two colors (`t` of the way from `a` to `b`), as `#rrggbb` (alpha dropped). */
export function mixColor(a: string, b: string, t: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  const ch = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t);
  return `#${((1 << 24) | (ch(0) << 16) | (ch(1) << 8) | ch(2)).toString(16).slice(1)}`;
}
