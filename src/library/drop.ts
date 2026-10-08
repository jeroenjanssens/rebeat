/** What a drop on a track (or the track list) brings: library samples, online sounds or files. */
import type { SoundCategory } from "../model/types";
import { SAMPLE_MIME } from "../state/trackActions";
import { filesFromDrop, importFiles } from "./library";
import { importSounds } from "./onlineImport";
import { ONLINE_MIME, typeCategory, type OnlineSound } from "./onlineKits";

/** Whether a drag carries samples (checked on dragover, when the data isn't readable yet). */
export function isSampleDrag(dt: DataTransfer): boolean {
  const types = [...dt.types];
  return types.includes(SAMPLE_MIME) || types.includes(ONLINE_MIME) || types.includes("Files");
}

/** The sample ids of a drop, importing online sounds and files into the library first. */
export async function droppedSamples(
  dt: DataTransfer,
): Promise<{ ids: string[]; categories?: SoundCategory[] }> {
  const id = dt.getData(SAMPLE_MIME);
  if (id) return { ids: [id] };
  const online = dt.getData(ONLINE_MIME);
  if (online) {
    const sound = JSON.parse(online) as OnlineSound;
    const [sid] = await importSounds([sound]);
    return sid ? { ids: [sid], categories: [typeCategory(sound.type)] } : { ids: [] };
  }
  if (dt.files.length) return { ids: await importFiles(await filesFromDrop(dt)) };
  return { ids: [] };
}
