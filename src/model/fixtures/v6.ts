/**
 * Projects as schema version 6 saved them (before step tracks, D93): every example song and
 * template, for migration tests (unit) and the golden levels (e2e). Node only.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

/** A saved project file ("example-night-drive", "template-808"…), parsed. */
export function v6Project(name: string): { schemaVersion: number; project: Record<string, never> } {
  const file = new URL(`./v6/${name}.json.gz`, import.meta.url);
  return JSON.parse(gunzipSync(readFileSync(file)).toString());
}
