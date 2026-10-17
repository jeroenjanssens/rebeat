/**
 * Real modules (opt in): `XM_DIR=/path/to/xm pnpm vitest run real` parses and converts every
 * `.xm` in the folder and prints what came out. The files aren't in the repository (their licenses
 * are their authors'); without XM_DIR this test is skipped.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { convertXm } from "./convert";
import { parseXm } from "./parse";

const dir = process.env.XM_DIR;
const files = dir ? readdirSync(dir).filter((f) => /\.xm$/i.test(f)) : [];

describe.skipIf(!dir)("real modules", () => {
  for (const f of files)
    it(f, () => {
      const bytes = readFileSync(join(dir!, f));
      const t0 = performance.now();
      const mod = parseXm(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      );
      const t1 = performance.now();
      const { project, samples, notes } = convertXm(mod, f);
      const t2 = performance.now();
      const allNotes = Object.values(project.patterns).flatMap((p) =>
        Object.values(p.lanes).flatMap((l) => l.steps.flatMap((s) => s.notes ?? [])),
      );
      const hits = Object.values(project.patterns).reduce(
        (n, p) =>
          n +
          Object.values(p.lanes).reduce(
            (m, l) => m + l.steps.filter((s) => s.on && !s.notes?.length).length,
            0,
          ),
        0,
      );
      const bends: Record<string, number> = {};
      for (const n of allNotes) if (n.bend) bends[n.bend.shape] = (bends[n.bend.shape] ?? 0) + 1;
      const mb =
        samples.reduce((a, s) => a + s.channels.length * s.channels[0].length * 2, 0) / 1e6;
      console.log(
        JSON.stringify({
          file: f,
          name: mod.name,
          tracker: mod.tracker,
          channels: mod.channels,
          speed: mod.speed,
          bpm: mod.bpm,
          orders: mod.orders.length,
          patterns: mod.patterns.length,
          instruments: mod.instruments.length,
          tracks: project.tracks.map((t) => `${t.name}:${t.mode[0]}`),
          sections: project.slots.length,
          tempoChanges: project.tempo?.length ?? 0,
          notes: allNotes.length,
          hits,
          bends,
          lanes: project.automation?.length ?? 0,
          sampleMB: Math.round(mb * 10) / 10,
          ms: { parse: Math.round(t1 - t0), convert: Math.round(t2 - t1) },
          notPlayed: notes,
        }),
      );
      expect(project.tracks.length).toBeGreaterThan(0);
      expect(project.slots.length).toBeGreaterThan(0);
    });
});
