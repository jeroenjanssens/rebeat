/**
 * Explain mode (D71): detailed hover cards for buttons. Elements carry `data-hint="<id>"`;
 * the texts live here, one file per area of the app.
 */
import type { Hint, Hints } from "./types";

export type { Hint, Hints } from "./types";

const modules = import.meta.glob<Hints>(["./*.ts", "!./index.ts", "!./types.ts", "!./*.test.ts"], {
  import: "default",
  eager: true,
});

export const HINTS: Hints = Object.assign({}, ...Object.values(modules));

export const hintFor = (id: string): Hint | undefined => HINTS[id];
