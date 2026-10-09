import { useRef } from "react";
import { ChevronDown, Folder, Globe, Heart, Library, Star } from "lucide-react";
import { PLACE_ICONS, SOUND_ICONS } from "../../components/soundIcons";
import type { Family } from "../../library/instruments";
import { dropdown } from "../../components/Menu";
import { KITS } from "../../engine/kits";
import { updateSample } from "../../library/library";
import { SAMPLE_MIME } from "../../state/trackActions";
import { sameLoc, type Location } from "./items";

const INSTRUMENT_FAMILIES: Family[] = [
  "Synths",
  "Pianos & keys",
  "Orchestral",
  "Mallets",
  "Double bass",
  "General MIDI",
];

interface Entry {
  loc: Location;
  icon: typeof Folder;
  label: string;
  depth?: number;
  /** A heading above this entry in the sidebar. */
  group?: string;
}

export function locLabel(l: Location) {
  return l.kind === "everything"
    ? "All"
    : l.kind === "all"
      ? "All samples"
      : l.kind === "favorites"
        ? "Favorites"
        : l.kind === "used"
          ? "Used in project"
          : l.kind === "folder"
            ? l.path
            : l.kind === "kit"
              ? `${l.kit} kit`
              : l.kind === "instruments"
                ? l.family
                : "Online kits";
}

function entries(folders: string[]): Entry[] {
  const own: Entry[] = folders
    .filter((f) => f !== "Recordings")
    .map((f) => ({
      loc: { kind: "folder", path: f },
      icon: Folder,
      label: f.split("/").pop()!,
      depth: f.split("/").length - 1,
    }));
  const kits: Entry[] = KITS.map((k) => ({
    loc: { kind: "kit", kit: k },
    icon: PLACE_ICONS.kit,
    label: `${k} kit`,
  }));
  // instruments in the order you'd look for them (D95); Your sounds sits at the top
  const families = INSTRUMENT_FAMILIES.map((family, i): Entry => ({
    loc: { kind: "instruments", family },
    icon: family === "Synths" ? SOUND_ICONS.synth : SOUND_ICONS.instrument,
    label: family,
    group: i === 0 ? "Instruments" : undefined,
  }));
  return [
    { loc: { kind: "everything" }, icon: Library, label: "All" },
    { loc: { kind: "favorites" }, icon: Heart, label: "Favorites" },
    { loc: { kind: "used" }, icon: Star, label: "Used in project" },
    {
      loc: { kind: "instruments", family: "Your sounds" },
      icon: PLACE_ICONS.yours,
      label: "Your sounds",
    },
    {
      loc: { kind: "folder", path: "Recordings" },
      icon: PLACE_ICONS.recording,
      label: "Recordings",
    },
    ...families,
    { loc: { kind: "all" }, icon: SOUND_ICONS.oneshot, label: "All samples", group: "Samples" },
    ...own,
    ...kits.map((e, i) => (i === 0 ? { ...e, group: "Kits" } : e)),
    { loc: { kind: "online" }, icon: Globe, label: "Online kits" },
  ];
}

/** The library's locations: a sidebar when there's room, else a dropdown. */
export function Locations({
  folders,
  loc,
  setLoc,
  sidebar,
}: {
  folders: string[];
  loc: Location;
  setLoc: (l: Location) => void;
  sidebar: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const list = entries(folders);
  if (!sidebar)
    return (
      <button
        ref={ref}
        className="field mr-auto max-w-[60%] shrink-0"
        data-hint="library.location"
        onClick={() =>
          dropdown(
            ref.current!,
            list.map((l) => ({
              label: `${"  ".repeat(l.depth ?? 0)}${l.label}`,
              checked: sameLoc(l.loc, loc),
              onSelect: () => setLoc(l.loc),
            })),
          )
        }
      >
        <span className="truncate">{locLabel(loc)}</span>
        <ChevronDown size={12} className="shrink-0 text-dim" />
      </button>
    );
  return (
    <nav className="scroll-thin w-[150px] shrink-0 overflow-auto border-r border-line p-1.5">
      {list.map((l) => {
        const Icon = l.icon;
        return (
          <div key={JSON.stringify(l.loc)}>
            {l.group && <div className="label mx-1.5 mb-0.5 mt-2.5">{l.group}</div>}
            <button
              className="tool-btn w-full !justify-start !text-[11.5px]"
              style={{ paddingLeft: 7 + (l.depth ?? 0) * 10 }}
              data-active={sameLoc(l.loc, loc)}
              data-hint="library.sidebar"
              onClick={() => setLoc(l.loc)}
              onDragOver={(e) =>
                l.loc.kind === "folder" &&
                [...e.dataTransfer.types].includes(SAMPLE_MIME) &&
                e.preventDefault()
              }
              onDrop={(e) => {
                const id = e.dataTransfer.getData(SAMPLE_MIME);
                if (id && l.loc.kind === "folder") updateSample(id, { folder: l.loc.path });
              }}
            >
              <Icon size={12} className="shrink-0" />
              <span className="truncate">{l.label}</span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}
