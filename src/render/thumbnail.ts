import type { Project } from "../model/project";
import { alpha } from "./theme";

/** A small picture of a project's first page, for the project browser. */
export function projectThumbnail(project: Project, w = 240, h = 120): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#0b0c0e";
  ctx.fillRect(0, 0, w, h);
  const slot = project.slots[0];
  const pattern = slot && project.patterns[slot.patternId];
  if (!pattern || project.tracks.length === 0) return canvas.toDataURL("image/png");
  const rows = project.tracks.length;
  const rh = (h - 8) / rows;
  const n = pattern.stepCount;
  const cw = (w - 8) / n;
  project.tracks.forEach((t, r) => {
    const lane = pattern.lanes[t.id];
    const y = 4 + r * rh;
    if (!lane) return;
    if (lane.kind === "clip") {
      ctx.fillStyle = alpha(t.color, lane.active ? 0.7 : 0.15);
      ctx.fillRect(4, y + rh * 0.2, w - 8, rh * 0.6);
      return;
    }
    const len = lane.stepCountOverride ?? n;
    for (let i = 0; i < n; i++) {
      const s = lane.steps[i % len];
      ctx.fillStyle = s.on ? alpha(t.color, 0.45 + s.velocity * 0.55) : alpha(t.color, 0.1);
      ctx.fillRect(4 + i * cw + 0.5, y + 0.5, Math.max(1, cw - 1.5), Math.max(1, rh - 1.5));
    }
  });
  return canvas.toDataURL("image/png");
}
