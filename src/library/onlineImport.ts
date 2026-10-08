/** Downloading online kit sounds: previews stay in memory; importing adds them to the library. */
import { importItems } from "./library";
import { machineName, soundName, type OnlineSound } from "./onlineKits";

// downloads are kept for the session, so previewing again (or adding later) is instant
const downloads = new Map<string, Promise<ArrayBuffer>>();

function download(url: string): Promise<ArrayBuffer> {
  let p = downloads.get(url);
  if (!p) {
    p = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      return res.arrayBuffer();
    });
    p.catch(() => downloads.delete(url));
    downloads.set(url, p);
  }
  // decoding detaches a buffer: hand out copies
  return p.then((b) => b.slice(0));
}

/** Download and decode a sound for previewing, without adding it to the library. */
export async function previewBuffer(s: OnlineSound, ctx: BaseAudioContext): Promise<AudioBuffer> {
  return ctx.decodeAudioData(await download(s.url));
}

/** Add sounds to the library (folder "Kits/<machine>"); returns their sample ids (null = failed). */
export async function importSounds(sounds: OnlineSound[]): Promise<(string | null)[]> {
  const items = await Promise.all(
    sounds.map(async (s) => {
      try {
        return {
          name: `${soundName(s)}.wav`,
          data: await download(s.url),
          folder: `Kits/${machineName(s.machine)}`,
          tags: ["kit", s.type],
        };
      } catch {
        return null;
      }
    }),
  );
  const ok = items.filter((x): x is NonNullable<typeof x> => !!x);
  const ids = await importItems(ok);
  let next = 0;
  return items.map((x) => (x ? ids[next++] : null));
}
