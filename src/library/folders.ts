/**
 * Removing a folder from the library (D100), such as an imported kit ("Kits/TR808"): which
 * samples go, and which stay because a project plays them. Pure, for tests.
 */

/** Whether a sample in `folder` lies in `path` (the folder itself or one inside it). */
export const inFolder = (folder: string, path: string) =>
  folder === path || folder.startsWith(`${path}/`);

/** The folder above `path` ("Kits/TR808" → "Kits", "Drums" → ""). */
export const parentOf = (path: string) => path.split("/").slice(0, -1).join("/");

/**
 * What removing `path` does: samples in use stay (moved to the folder above, so the folder goes
 * away), the rest are removed.
 */
export function planRemoval(
  samples: { id: string; folder: string }[],
  path: string,
  inUse: Set<string>,
) {
  const inside = samples.filter((s) => inFolder(s.folder, path));
  return {
    remove: inside.filter((s) => !inUse.has(s.id)).map((s) => s.id),
    keep: inside.filter((s) => inUse.has(s.id)).map((s) => s.id),
    parent: parentOf(path),
  };
}
