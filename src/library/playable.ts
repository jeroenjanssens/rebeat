/**
 * Playable (D126, WS-E): every sound the keys can play, in one list (synths, sampled instruments,
 * Your sounds, pitched samples), so the library's Playable view and a controller's encoder
 * browse the same list, also while the Library panel is closed.
 *
 * Ordering: Synths → Sampled instruments → Your sounds → Samples (non-drum by default; with
 * `allSamples` the drum-only samples are appended).
 *
 * Wrap behaviour: browsePlayable wraps from the last item back to the first and vice versa.
 */
import type { KeysTarget } from "../state/keys";
import { CATALOG } from "./instruments";
import { useUserInstruments, userEntry } from "./userInstruments";
import { useLibrary } from "./library";
import { guessCategory } from "./analysis";
import { showOnDisplay } from "../midi/display";
import { useKeys } from "../state/keys";

export interface PlayableItem {
  /** The library item's id (a catalog id or a sample id). */
  id: string;
  name: string;
  family: "synth" | "instrument" | "sample";
  /** The section heading ("Synths", "Sampled instruments", "Your sounds", "Samples"). */
  section: string;
  target: Extract<KeysTarget, { kind: "sound" }>;
}

/** Categories that indicate a sample is a drum/perc sound (not pitched). */
const DRUM_CATEGORIES = new Set(["kick", "snare", "clap", "hat", "perc", "tom"]);

/** True when a sample record is drum/percussion (not a pitched sound). */
function isDrum(s: { name: string; key?: string; tags?: string[]; id?: string }): boolean {
  // kit samples are always drums
  if (s.id?.startsWith("kit:")) return true;
  // a detected key means it's pitched
  if (s.key) return false;
  // guess from the name
  const cat = guessCategory(s.name);
  return DRUM_CATEGORIES.has(cat);
}

/** The list, in order: every sample by default (D133); `allSamples: false` leaves out drums and
 * noises (the Pitched only chip). */
export function playableList(opts: { allSamples?: boolean } = {}): PlayableItem[] {
  const items: PlayableItem[] = [];

  // 1. Synths (from the built-in catalog)
  for (const c of CATALOG) {
    if (c.family !== "Synths") continue;
    items.push({
      id: c.id,
      name: c.name,
      family: "synth",
      section: "Synths",
      target: { kind: "sound", source: "catalog", id: c.id, name: c.name },
    });
  }

  // 2. Sampled instruments (catalog entries that are not Synths and not "Your sounds")
  for (const c of CATALOG) {
    if (c.family === "Synths" || c.family === "Your sounds") continue;
    items.push({
      id: c.id,
      name: c.name,
      family: "instrument",
      section: "Sampled instruments",
      target: { kind: "sound", source: "catalog", id: c.id, name: c.name },
    });
  }

  // 3. Your sounds (user instruments)
  const mine = useUserInstruments.getState().list;
  for (const r of mine) {
    const c = userEntry(r);
    items.push({
      id: c.id,
      name: c.name,
      family: c.source.source === "synth" ? "synth" : "instrument",
      section: "Your sounds",
      target: { kind: "sound", source: "catalog", id: c.id, name: c.name },
    });
  }

  // 4. Samples from the library
  const samples = useLibrary.getState().samples;
  for (const s of samples) {
    if (!(opts.allSamples ?? true) && isDrum(s)) continue;
    items.push({
      id: s.id,
      name: s.name,
      family: "sample",
      section: "Samples",
      target: { kind: "sound", source: "sample", id: s.id, name: s.name },
    });
  }

  return items;
}

// ── browse state ─────────────────────────────────────────────────────────────

/** The current index into the last-computed playable list. -1 = nothing selected yet. */
let browseIndex = -1;
/** The list at the time of the last browse call (recomputed when `browsePlayable` is called). */
let browseListCache: PlayableItem[] = [];
/** Whether `allSamples` was set on the last browse call. */
let browseAllSamples = true;

/** Debounce timer for putting the item on the keys (so fast scrolling doesn't load 40 instruments). */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 150;

/**
 * Callback set by the library panel so `browsePlayable` can scroll it; cleared on unmount.
 * (id: string) → void
 */
let onBrowseSelect: ((id: string) => void) | null = null;

/** Register a callback from the Library panel that scrolls the Playable list to an item. */
export function setOnBrowseSelect(fn: ((id: string) => void) | null) {
  onBrowseSelect = fn;
}

/** Move the Playable selection by `delta` items (or sections with `bySection`) and put it on
 * the keys; returns the new item. Wraps at the ends of the list. */
export function browsePlayable(delta: number, bySection = false): PlayableItem | undefined {
  // Re-read the list on each call so newly imported sounds appear immediately.
  browseListCache = playableList({ allSamples: browseAllSamples });
  if (!browseListCache.length) return undefined;

  // Sync the index with the current keys target if it differs from our cached position.
  const keysTarget = useKeys.getState().target;
  if (keysTarget.kind === "sound") {
    const idx = browseListCache.findIndex((i) => i.id === keysTarget.id);
    if (idx >= 0 && idx !== browseIndex) browseIndex = idx;
  }

  // Start at 0 if nothing is selected yet.
  const start = browseIndex < 0 ? 0 : browseIndex;

  let next: number;
  if (!bySection) {
    next =
      (((start + delta) % browseListCache.length) + browseListCache.length) %
      browseListCache.length;
  } else {
    // Move to the next/previous section boundary.
    const currentSection = browseListCache[start]?.section ?? "";
    if (delta > 0) {
      // Find the first item in the next section.
      const idx = browseListCache.findIndex(
        (item, i) => i > start && item.section !== currentSection,
      );
      next = idx >= 0 ? idx : 0; // wrap to start
    } else {
      // Find the last item in the previous section (first item of the section before current).
      let sectionStart = start;
      while (sectionStart > 0 && browseListCache[sectionStart].section === currentSection)
        sectionStart--;
      if (browseListCache[sectionStart].section === currentSection) {
        // We're in the first section; wrap to the first item of the last section.
        const lastSection = browseListCache[browseListCache.length - 1].section;
        const idx = browseListCache.findIndex((item) => item.section === lastSection);
        next = idx >= 0 ? idx : browseListCache.length - 1;
      } else {
        // Go to the start of the previous section.
        while (
          sectionStart > 0 &&
          browseListCache[sectionStart - 1].section === browseListCache[sectionStart].section
        )
          sectionStart--;
        next = sectionStart;
      }
    }
  }

  browseIndex = next;
  const item = browseListCache[next];
  if (!item) return undefined;

  // Notify the library panel to scroll to this item.
  onBrowseSelect?.(item.id);

  // Show on display immediately (fast feedback); put on keys with a debounce (avoid loading many instruments).
  const total = browseListCache.length;
  const position = next + 1;
  const familyLabel =
    item.family === "synth" ? "Synth" : item.family === "instrument" ? "Instrument" : "Sample";
  showOnDisplay({ line1: item.name, line2: `${familyLabel} · ${position}/${total}` });

  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    // lazy import so this file stays importable in Node tests
    void import("../state/keys").then(({ setKeysTarget }) => {
      setKeysTarget(item.target);
      // Update display when loading finishes (for streamed instruments)
      void waitForKeysReady(item, position, total, familyLabel);
    });
  }, DEBOUNCE_MS);

  return item;
}

/** After putting item on the keys, wait for it to finish loading then update the display. */
async function waitForKeysReady(
  item: PlayableItem,
  position: number,
  total: number,
  familyLabel: string,
) {
  const { useKeys: keysStore } = await import("../state/keys");
  // wait up to 30 s
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const state = keysStore.getState();
    // Make sure target is still the same item
    if (state.target.kind !== "sound" || state.target.id !== item.id) return;
    if (state.status === "loading") {
      showOnDisplay({ line1: item.name, line2: "Loading…" });
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }
    showOnDisplay({ line1: item.name, line2: `${familyLabel} · ${position}/${total}` });
    return;
  }
}

/** Set the browse index directly (when the user selects an item in the Playable panel). */
export function setBrowseIndex(id: string, allSamples = true) {
  browseAllSamples = allSamples;
  browseListCache = playableList({ allSamples });
  const idx = browseListCache.findIndex((i) => i.id === id);
  if (idx >= 0) browseIndex = idx;
}
