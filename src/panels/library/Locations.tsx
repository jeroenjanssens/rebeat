import { useRef } from "react";
import {
  ChevronDown,
  Disc3,
  Folder,
  Globe,
  Heart,
  Mic,
  Music,
  Piano,
  Star,
  User,
  Waves,
} from "lucide-react";
import { FAMILIES } from "../../library/instruments";
import { dropdown } from "../../components/Menu";
import { KITS } from "../../engine/kits";
import { updateSample } from "../../library/library";
import { SAMPLE_MIME } from "../../state/trackActions";
import { sameLoc, type Location } from "./items";

interface Entry {
  loc: Location;
  icon: typeof Folder;
  label: string;
  depth?: number;
  /** A heading above this entry in the sidebar. */
  group?: string;
}

export function locLabel(l: Location) {
  return l.kind === "all"
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
    icon: Disc3,
    label: `${k} kit`,
  }));
  return [
    { loc: { kind: "all" }, icon: Music, label: "All samples" },
    { loc: { kind: "favorites" }, icon: Heart, label: "Favorites" },
    { loc: { kind: "used" }, icon: Star, label: "Used in project" },
    { loc: { kind: "folder", path: "Recordings" }, icon: Mic, label: "Recordings" },
    ...own.map((e, i) => (i === 0 ? { ...e, group: "Folders" } : e)),
    ...kits.map((e, i) => (i === 0 ? { ...e, group: "Kits" } : e)),
    { loc: { kind: "online" }, icon: Globe, label: "Online kits" },
    ...FAMILIES.map((family, i): Entry => ({
      loc: { kind: "instruments", family },
      icon: family === "Synths" ? Waves : family === "Your instruments" ? User : Piano,
      label: family,
      group: i === 0 ? "Instruments" : undefined,
    })),
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
