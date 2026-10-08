import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EFFECT_PARAMS, MIX_PARAMS, SOUND_PARAMS, stepParams } from "../../model/params";
import type { TrackKind } from "../../model/types";
import { CHAPTERS } from "../guide";
import { HINTS } from "./index";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx?$/.test(f) && !f.endsWith(".test.ts") ? [p] : [];
  });
}

describe("explain-mode hints", () => {
  const anchors = new Set(CHAPTERS.flatMap((c) => c.sections.map((s) => s.id)));

  it("point at existing guide sections", () => {
    const bad = Object.entries(HINTS).filter(([, h]) => h.guide && !anchors.has(h.guide));
    expect(bad.map(([id, h]) => `${id} → ${h.guide}`)).toEqual([]);
  });

  it("have a title and text", () => {
    const bad = Object.entries(HINTS).filter(([, h]) => !h.title || !h.text);
    expect(bad.map(([id]) => id)).toEqual([]);
  });

  it("exist for every literal data-hint and hint prop", () => {
    const used = new Set<string>();
    for (const f of sources("src"))
      for (const m of readFileSync(f, "utf8").matchAll(
        /(?:data-hint|\shint)="([a-z][\w-]*(?:\.[\w-]+)+)"/g,
      ))
        used.add(m[1]);
    expect([...used].filter((id) => !HINTS[id])).toEqual([]);
  });

  it("exist for every knob parameter and effect", () => {
    const kinds = Object.keys(SOUND_PARAMS) as TrackKind[];
    const ids = [
      ...kinds.flatMap((k) => SOUND_PARAMS[k].map((d) => `param.sound.${d.id}`)),
      // a synth track's macros (soundHint)
      "param.sound.macro",
      ...MIX_PARAMS.map((d) => `param.mix.${d.id}`),
      ...kinds.flatMap((k) => stepParams(k, true).map((d) => `param.step.${d.id}`)),
      ...Object.entries(EFFECT_PARAMS).flatMap(([fx, defs]) => [
        `fx.${fx}`,
        ...defs.map((d) => `fx.${fx}.${d.id}`),
      ]),
    ];
    expect([...new Set(ids)].filter((id) => !HINTS[id])).toEqual([]);
  });
});
