import { useRef } from "react";
import { Search } from "lucide-react";
import { dropdown } from "../../components/Menu";
import { useLibrary } from "../../library/library";
import { NATURAL_DIR, sortLabel, type SortBy } from "../../library/sort";
import type { Filters, Length, TypeFilter } from "./items";

/** Search, filter and sort for the library list. */
export function FilterBar({
  filters,
  set,
  tags,
}: {
  filters: Filters;
  set: (f: Partial<Filters>) => void;
  tags: string[];
}) {
  const filterRef = useRef<HTMLButtonElement>(null);
  const sortRef = useRef<HTMLButtonElement>(null);
  const sort = useLibrary((s) => s.sort);
  const setSort = (next: typeof sort) => useLibrary.getState().set({ sort: next });
  const { query, type, tag, length } = filters;
  return (
    <>
      <label
        className="field order-first min-w-[140px] flex-1 basis-full @[420px]:order-none @[420px]:basis-0"
        data-hint="library.search"
      >
        <Search size={12} className="shrink-0 text-dim" />
        <input
          className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-faint"
          placeholder="Search"
          value={query}
          onChange={(e) => set({ query: e.target.value })}
          data-testid="library-search"
        />
      </label>
      <button
        ref={filterRef}
        className="tool-btn shrink-0"
        data-active={type !== "all" || !!tag || length !== "any"}
        title="Filter"
        data-hint="library.filter"
        onClick={() =>
          dropdown(filterRef.current!, [
            ...(["all", "loops", "oneshots"] as TypeFilter[]).map((t) => ({
              label: t === "all" ? "All types" : t === "loops" ? "Loops (with tempo)" : "One-shots",
              checked: type === t,
              onSelect: () => set({ type: t }),
            })),
            { separator: true },
            ...(["any", "short", "medium", "long"] as Length[]).map((l) => ({
              label:
                l === "any"
                  ? "Any length"
                  : l === "short"
                    ? "Short (< 1 s)"
                    : l === "medium"
                      ? "Medium (1–5 s)"
                      : "Long (> 5 s)",
              checked: length === l,
              onSelect: () => set({ length: l }),
            })),
            { separator: true },
            { label: "Any tag", checked: !tag, onSelect: () => set({ tag: null }) },
            ...tags.map((t) => ({
              label: `#${t}`,
              checked: tag === t,
              onSelect: () => set({ tag: t }),
            })),
          ])
        }
      >
        <span className="label !text-inherit">Filter</span>
      </button>
      <button
        ref={sortRef}
        className="tool-btn shrink-0"
        title="Sort"
        data-hint="library.sort"
        onClick={() =>
          dropdown(sortRef.current!, [
            ...(["name", "duration", "recent"] as SortBy[]).map((by) => ({
              label: by === "recent" ? "Date added" : by === "name" ? "Name" : "Duration",
              checked: sort.by === by,
              onSelect: () => setSort({ by, dir: NATURAL_DIR[by] }),
            })),
            { separator: true },
            ...(["asc", "desc"] as const).map((dir) => ({
              label:
                sort.by === "recent"
                  ? dir === "asc"
                    ? "Oldest first"
                    : "Newest first"
                  : sort.by === "name"
                    ? dir === "asc"
                      ? "A → Z"
                      : "Z → A"
                    : dir === "asc"
                      ? "Shortest first"
                      : "Longest first",
              checked: sort.dir === dir,
              onSelect: () => setSort({ ...sort, dir }),
            })),
          ])
        }
        data-testid="library-sort"
      >
        <span className="label !text-inherit">{sortLabel(sort)}</span>
      </button>
    </>
  );
}
