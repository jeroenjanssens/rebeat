/** The Beatbox panel's Add and dataset menus: files, folders, links, the selected track's
 * recording, and dataset zips in and out (D110). */
import type { MenuItem } from "../../components/Menu";
import { ask } from "../../components/Ask";
import { toast } from "../../components/Toast";
import { platform } from "../../platform";
import { useStore } from "../../state/store";
import { sampleOf } from "../../model/tracks";
import { classFromName } from "../../library/beatbox/classes";
import { addFiles, addRecordingFromSample } from "../../library/beatbox/store";
import { exportDataset, importDataset, importLink } from "../../library/beatbox/transfer";

const AUDIO = [".wav", ".mp3", ".ogg", ".flac", ".aif", ".aiff", ".m4a", "audio/*"];

async function addPicked(files: File[]) {
  let n = 0;
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      n += await importDataset(await f.arrayBuffer());
      continue;
    }
    // a folder named after a class ("kicks/01.wav") labels what's in it
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
    const parent = rel.split("/").slice(-2, -1)[0] ?? "";
    const label = classFromName(f.name) ?? (parent ? classFromName(parent) : undefined);
    if (
      await addFiles([{ name: f.name, data: await f.arrayBuffer(), ...(label ? { label } : {}) }])
    )
      n++;
  }
  toast(
    n ? `Added ${n} recording${n === 1 ? "" : "s"}` : "Nothing to add there",
    n ? "info" : "error",
  );
}

const failed = (e: unknown) => toast((e as Error).message ?? String(e), "error", 4000);

/** Add a take from a track's recording (a Clip track) or a library sample. */
export async function openTakeFromSample(sampleId: string, name: string) {
  const { project } = useStore.getState();
  try {
    await addRecordingFromSample(sampleId, {
      name,
      kind: "take",
      bpm: project.bpm,
      barStart: 0,
    });
  } catch (e) {
    failed(e);
  }
}

export function addMenu(): MenuItem[] {
  const { project, selectedTrackId } = useStore.getState();
  const track = project.tracks.find((t) => t.id === selectedTrackId);
  const sample = track?.mode === "clip" ? sampleOf(track) : undefined;
  return [
    {
      label: "Audio files or a dataset (.zip)…",
      onSelect: async () => {
        const files = await platform.files.open({ accept: [...AUDIO, ".zip"], multiple: true });
        if (files.length) await addPicked(files).catch(failed);
      },
    },
    {
      label: "A folder…",
      onSelect: async () => {
        const files = await platform.files.open({ directory: true, multiple: true });
        if (files.length) await addPicked(files).catch(failed);
      },
    },
    {
      label: "From a link…",
      onSelect: async () => {
        const url = await ask({
          title: "Add from a link",
          message:
            "A strudel.json or a GitHub repository (github:user/repo). Keys that name a sound (kick, snare, hihat…) label its files.",
          input: "",
          placeholder: "https://… or github:user/repo",
          confirm: "Add",
        });
        if (!url) return;
        toast("Downloading…");
        try {
          const n = await importLink(url);
          toast(`Added ${n} recording${n === 1 ? "" : "s"}`);
        } catch (e) {
          failed(e);
        }
      },
    },
    { separator: true },
    {
      label:
        track && sample
          ? `The recording on “${track.name}”`
          : "The selected Clip track's recording",
      disabled: !sample,
      onSelect: () => void openTakeFromSample(sample!, track!.name),
    },
  ];
}

export function datasetMenu(voiceId: string, voiceName: string): MenuItem[] {
  const save = async (only?: string) => {
    try {
      const zip = await exportDataset(only);
      const name = only ? `Beatbox ${voiceName}.zip` : "Beatbox dataset.zip";
      await platform.files.save(name, new Blob([zip as BlobPart], { type: "application/zip" }));
    } catch (e) {
      failed(e);
    }
  };
  return [
    { label: `Export “${voiceName}” as a dataset…`, onSelect: () => void save(voiceId) },
    { label: "Export every voice as a dataset…", onSelect: () => void save() },
    {
      label: "Import a dataset…",
      onSelect: async () => {
        const [f] = await platform.files.open({ accept: [".zip"] });
        if (!f) return;
        try {
          const n = await importDataset(await f.arrayBuffer());
          toast(`Imported ${n} recording${n === 1 ? "" : "s"}`);
        } catch (e) {
          failed(e);
        }
      },
    },
  ];
}
