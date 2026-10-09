/** Downloading online kit sounds: previews stay in memory; importing adds them to the library. */
import { importFiles, importItems } from "./library";
import type { CatalogInstrument } from "./instruments";
import { machineName, soundName, type OnlineKit, type OnlineSound } from "./onlineKits";
import { makeMultiSample } from "./userInstruments";
import {
  groupRepoFiles,
  parseSourceUrl,
  parseStrudelJson,
  parseStrudelMap,
  rawGithub,
  type ParsedUrl,
} from "./sources";

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

// ---------- your own sources (D74) ----------

export type Resolved = { kind: "files"; ids: string[] } | { kind: "collection"; kit: OnlineKit };

async function get(url: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    // network errors include sites that don't allow downloads from other sites (CORS)
    throw new Error(`Couldn't reach ${new URL(url).hostname} (or it doesn't allow downloads)`);
  }
  if (!res.ok)
    throw new Error(`${res.status === 404 ? "Not found" : `Error ${res.status}`}: ${url}`);
  return res;
}

async function importFile(url: string, name: string): Promise<Resolved> {
  const res = await get(url);
  const file = new File([await res.blob()], name, { type: res.headers.get("content-type") ?? "" });
  const ids = await importFiles([file], /\.zip$/i.test(name) ? "" : "Downloads");
  if (!ids.length) throw new Error("No audio found at that link");
  return { kind: "files", ids };
}

const collection = (
  name: string,
  sounds: Record<string, string[]>,
  source: string,
  instruments?: Record<string, { note: number; url: string }[]>,
): Resolved => ({
  kind: "collection",
  kit: {
    machine: name,
    sounds,
    source,
    ...(instruments && Object.keys(instruments).length ? { instruments } : {}),
  },
});

/** A strudel.json as a collection: its sounds, and its pitched entries as instruments. */
const fromMap = (name: string, json: unknown, url: string, source: string) => {
  parseStrudelJson(json, url); // throws when there's nothing in it
  const { sounds, pitched } = parseStrudelMap(json, url);
  return collection(name, sounds, source, pitched);
};

/** Add a link source's pitched instrument to Your sounds, downloading its samples. */
export async function importPitched(kit: OnlineKit, name: string): Promise<CatalogInstrument> {
  const zones = kit.instruments?.[name] ?? [];
  const sounds: OnlineSound[] = zones.map((z, i) => ({
    machine: kit.machine,
    type: name,
    variant: i,
    url: z.url,
    variants: zones.length,
  }));
  const ids = await importSounds(sounds);
  const samples = zones.flatMap((z, i) =>
    ids[i] ? [{ id: ids[i]!, name: `${name} ${i + 1}`, note: z.note }] : [],
  );
  return makeMultiSample(`${machineName(kit.machine)} ${name}`, samples);
}

async function fromGithub(p: Extract<ParsedUrl, { kind: "github" }>, input: string) {
  const json = rawGithub(p.owner, p.repo, p.ref, `${p.path ? `${p.path}/` : ""}strudel.json`);
  const res = await fetch(json).catch(() => null);
  if (res?.ok) return fromMap(p.name, await res.json(), json, input);
  // no sample map: the repository's audio files, grouped by folder
  const tree = await get(
    `https://api.github.com/repos/${p.owner}/${p.repo}/git/trees/${p.ref}?recursive=1`,
  );
  const { tree: entries } = (await tree.json()) as { tree: { path: string; type: string }[] };
  const sounds = groupRepoFiles(
    entries.filter((e) => e.type === "blob").map((e) => e.path),
    p.path,
    (path) => rawGithub(p.owner, p.repo, p.ref, path.split("/").map(encodeURIComponent).join("/")),
  );
  if (!Object.keys(sounds).length)
    throw new Error("No strudel.json or audio files in that repository");
  return collection(p.name, sounds, input);
}

/** Import what a link points at: files straight into the library, collections as a source. */
export async function resolveLink(input: string): Promise<Resolved> {
  const p = parseSourceUrl(input);
  if (!p) throw new Error("Paste a link (https://…) or github:user/repo");
  if (p.kind === "file") return importFile(p.url, p.name);
  if (p.kind === "github") return fromGithub(p, input.trim());
  const res = await get(p.url);
  const type = res.headers.get("content-type") ?? "";
  if (p.kind === "json" || type.includes("json"))
    return fromMap(p.name, await res.json(), p.url, input.trim());
  if (type.startsWith("audio/") || type.includes("zip")) return importFile(p.url, p.name);
  throw new Error("That link isn't an audio file, a zip, a strudel.json or a GitHub repository");
}

const collections = new Map<string, Promise<OnlineKit>>();

/** A saved source's kit (resolved once per session). */
export function loadSource(input: string): Promise<OnlineKit> {
  let p = collections.get(input);
  if (!p) {
    p = resolveLink(input).then((r) => {
      if (r.kind !== "collection") throw new Error("Not a collection");
      return r.kit;
    });
    p.catch(() => collections.delete(input));
    collections.set(input, p);
  }
  return p;
}
