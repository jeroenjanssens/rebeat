import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEMES } from "../state/settings";

/** Every theme's tokens, from the stylesheet. */
const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
const blocks = new Map(
  [...css.matchAll(/\[data-theme="([^"]+)"\] \{([^}]*)\}/g)].map((m) => [
    m[1],
    Object.fromEntries([...m[2].matchAll(/--([a-z-]+):\s*([^;]+);/g)].map((t) => [t[1], t[2]])),
  ]),
);

const TOKENS = [
  "bg",
  "panel",
  "surface",
  "raised",
  "display",
  "pad-bg",
  "border",
  "border-strong",
  "text",
  "text-dim",
  "text-faint",
  "accent",
  "select",
  "lit",
  "pad-off-mix",
  "pad-on-min",
  "head",
  "hatch",
  "scope-idle",
  "scope-bg",
  "shadow",
];

/** WCAG contrast ratio of two #rrggbb colors. */
function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("themes (D102)", () => {
  it("has 20, 7 of them light", () => {
    expect(THEMES).toHaveLength(20);
    expect(THEMES.filter((t) => !t.dark)).toHaveLength(7);
  });

  it.each(THEMES.map((t) => [t.label, t] as const))("%s defines every token", (_, t) => {
    const tokens = blocks.get(t.id);
    expect(tokens, t.id).toBeTruthy();
    for (const k of TOKENS) expect(tokens![k], `${t.id} --${k}`).toBeTruthy();
    expect(css).toContain(
      `[data-theme="${t.id}"] {\n  color-scheme: ${t.dark ? "dark" : "light"};`,
    );
  });

  it.each(THEMES.map((t) => [t.label, t] as const))("%s is readable", (_, t) => {
    const k = blocks.get(t.id)!;
    expect(contrast(k.text, k.panel), "text").toBeGreaterThanOrEqual(7);
    expect(contrast(k["text-dim"], k.panel), "dim text").toBeGreaterThanOrEqual(4.5);
    // faint text is meant to be quiet (hints, disabled labels)
    expect(contrast(k["text-faint"], k.panel), "faint text").toBeGreaterThanOrEqual(2.2);
    expect(contrast(k.accent, k.panel), "accent").toBeGreaterThanOrEqual(3);
    // the display stays dark in every theme, with white text on it
    expect(contrast("#ffffff", k.display), "display").toBeGreaterThanOrEqual(12);
  });
});
