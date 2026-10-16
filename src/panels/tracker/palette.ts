/**
 * The tracker's colors (D267): Fast Tracker 2's layout and bevels in the current theme's colors.
 * The chrome is the theme's accent mixed into its raised surface; the bevels are that, lighter and
 * darker; the pattern area is the theme's darkest surface.
 */
import { mixColor, onThemeChange, parseColor, token } from "../../render/theme";
import { clearPixelFont } from "../../render/pixelFont";

export interface TrackerPalette {
  chrome: string;
  /** Text on the chrome (the header, the top panel). */
  chromeText: string;
  chromeDim: string;
  light: string;
  dark: string;
  pattern: string;
  text: string;
  dim: string;
  faint: string;
  volume: string;
  fx: string;
  lock: string;
  beat: string;
  bar: string;
  cursorBand: string;
  cursor: string;
  cursorText: string;
  playBand: string;
  select: string;
  shade: string;
}

let cached: TrackerPalette | null = null;

/** Relative luminance (WCAG) of a color. */
function luminance(c: string) {
  const [r, g, b] = parseColor(c).map((v, i) => {
    if (i > 2) return v;
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** The theme's text color where it reads on `bg`, else a light or dark one that does (a light
 * theme's darkest surface can be dark, with dark text). */
function textOn(bg: string, preferred: string) {
  if (contrast(bg, preferred) >= 4.5) return preferred;
  return luminance(bg) < 0.4 ? mixColor(bg, "#ffffff", 0.88) : mixColor(bg, "#000000", 0.85);
}
onThemeChange(() => {
  cached = null;
  clearPixelFont();
});

export function trackerPalette(): TrackerPalette {
  if (cached) return cached;
  const accent = token("accent") || "#7dd3fc";
  const lit = token("lit") || "#ffb547";
  const raised = token("raised") || "#1c1e23";
  const display = token("display") || "#0b0c0e";
  const chrome = mixColor(raised, accent, 0.3);
  const text = textOn(display, token("text") || "#e8eaef");
  const chromeText = textOn(chrome, token("text") || "#e8eaef");
  cached = {
    chrome,
    chromeText,
    chromeDim: mixColor(chromeText, chrome, 0.4),
    light: mixColor(chrome, "#ffffff", 0.35),
    dark: mixColor(chrome, "#000000", 0.45),
    pattern: display,
    text,
    dim: mixColor(text, display, 0.42),
    faint: mixColor(text, display, 0.68),
    volume: mixColor(text, accent, 0.45),
    fx: mixColor(text, lit, 0.45),
    lock: mixColor(mixColor(text, display, 0.3), accent, 0.3),
    beat: mixColor(display, text, 0.06),
    bar: mixColor(display, text, 0.12),
    cursorBand: mixColor(display, accent, 0.22),
    cursor: accent,
    cursorText: display,
    playBand: mixColor(display, lit, 0.2),
    select: mixColor(display, accent, 0.35),
    shade: mixColor(display, "#000000", 0.35),
  };
  return cached;
}
