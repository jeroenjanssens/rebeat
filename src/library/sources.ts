/**
 * Sample sources from a URL (D74): a single audio file or zip, a strudel.json file, or a GitHub
 * repository (with a strudel.json, or else its audio files). Parsing only; fetching is in
 * onlineImport.ts.
 */

export type ParsedUrl =
  | { kind: "file"; url: string; name: string }
  | { kind: "json"; url: string; name: string }
  | { kind: "github"; owner: string; repo: string; ref: string; path: string; name: string }
  | { kind: "unknown"; url: string; name: string };

const AUDIO = /\.(wav|wave|mp3|ogg|oga|opus|flac|aac|m4a|aif|aiff|webm|caf)$/i;

const lastPart = (path: string) =>
  decodeURIComponent(path.split("/").filter(Boolean).pop() ?? "").replace(/\.[a-z0-9]+$/i, "");

/** What a pasted URL points at. Returns null if it isn't a URL at all. */
export function parseSourceUrl(input: string): ParsedUrl | null {
  const text = input.trim();
  // Strudel's shorthand: github:user/repo[/branch[/path]]
  const short = /^github:([\w.-]+)\/([\w.-]+)(?:\/([^/]+)(?:\/(.*))?)?$/.exec(text);
  if (short) {
    const [, owner, repo, ref = "HEAD", path = ""] = short;
    return { kind: "github", owner, repo, ref, path: path.replace(/\/$/, ""), name: repo };
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.hostname === "github.com" && parts.length >= 2) {
    const [owner, rawRepo, kind, ref, ...rest] = parts;
    const repo = rawRepo.replace(/\.git$/, "");
    // a file on GitHub: use its raw version
    if (kind === "blob" && ref) {
      const raw = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${rest.join("/")}`;
      return parseSourceUrl(raw);
    }
    return {
      kind: "github",
      owner,
      repo,
      ref: kind === "tree" && ref ? ref : "HEAD",
      path: kind === "tree" ? rest.join("/") : "",
      name: repo,
    };
  }
  const file = url.pathname;
  if (/\.json$/i.test(file)) {
    // name a collection after the repo (raw GitHub URLs) or the folder it's in
    const name =
      url.hostname === "raw.githubusercontent.com" && parts.length >= 2
        ? parts[1]
        : lastPart(file.slice(0, file.lastIndexOf("/"))) || url.hostname;
    return { kind: "json", url: url.href, name };
  }
  if (AUDIO.test(file) || /\.zip$/i.test(file))
    return { kind: "file", url: url.href, name: decodeURIComponent(parts.at(-1) ?? "sample") };
  return { kind: "unknown", url: url.href, name: lastPart(file) || url.hostname };
}

export const rawGithub = (owner: string, repo: string, ref: string, path: string) =>
  `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;

/**
 * The sounds of a strudel.json: name → file URLs. Values can be one file, a list, or a map of
 * notes to files (pitched samples); relative paths resolve against `_base`, or else the URL the
 * file came from.
 */
export function parseStrudelJson(json: unknown, from: string): Record<string, string[]> {
  const { sounds, pitched } = parseStrudelMap(json, from);
  if (!Object.keys(sounds).length && !Object.keys(pitched).length)
    throw new Error("This strudel.json has no sounds");
  return sounds;
}

/**
 * A strudel.json's sounds, and separately its pitched instruments: entries that map note names to
 * files ({"c3": "piano/C3.mp3"}), which become multi-sample instruments (D82).
 */
export function parseStrudelMap(
  json: unknown,
  from: string,
): { sounds: Record<string, string[]>; pitched: Record<string, { note: number; url: string }[]> } {
  if (!json || typeof json !== "object" || Array.isArray(json))
    throw new Error("This isn't a strudel.json sample map");
  const map = json as Record<string, unknown>;
  const base = typeof map._base === "string" ? map._base : new URL(".", from).href;
  const abs = (p: string) => new URL(p, base.endsWith("/") ? base : `${base}/`).href;
  const out: Record<string, string[]> = {};
  const pitched: Record<string, { note: number; url: string }[]> = {};
  for (const [name, value] of Object.entries(map)) {
    if (name.startsWith("_")) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const zones = Object.entries(value as Record<string, unknown>).flatMap(([k, f]) => {
        const note = noteNumber(k);
        return note !== null && typeof f === "string" ? [{ note, url: abs(f) }] : [];
      });
      if (zones.length && zones.length === Object.keys(value).length) {
        pitched[name] = zones.sort((a, b) => a.note - b.note);
        continue;
      }
    }
    const files =
      typeof value === "string"
        ? [value]
        : Array.isArray(value)
          ? value
          : value && typeof value === "object"
            ? Object.values(value)
            : [];
    const urls = files.filter((f): f is string => typeof f === "string").map(abs);
    if (urls.length) out[name] = urls;
  }
  return { sounds: out, pitched };
}

/** Audio files of a repository tree (GitHub API), grouped by folder: folder → file URLs. */
export function groupRepoFiles(
  paths: string[],
  under: string,
  url: (path: string) => string,
): Record<string, string[]> {
  const prefix = under ? `${under.replace(/\/$/, "")}/` : "";
  const out: Record<string, string[]> = {};
  for (const p of paths.filter((p) => p.startsWith(prefix) && AUDIO.test(p)).sort()) {
    const rel = p.slice(prefix.length);
    const folder = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "samples";
    (out[folder] ??= []).push(url(p));
  }
  return out;
}

// ---------- multi-sample instruments (D82) ----------

const SEMIS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** "C4" → 60, "f#2" → 42, "Bb3" → 58 (C4 = 60); null if it isn't a note. */
export function noteNumber(name: string): number | null {
  const m = /^([a-g])([#b]|s)?(-?\d)$/i.exec(name.trim());
  if (!m) return null;
  const acc = m[2] === "#" || m[2] === "s" ? 1 : m[2] === "b" ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + SEMIS[m[1].toLowerCase()] + acc;
}

/** The note in a sample's file name: "Piano C4.wav", "piano_f#2_v3.wav", "Harp-A3". */
export function noteInName(file: string): number | null {
  const base = file.replace(/\.[a-z0-9]+$/i, "");
  // the last note-looking token wins ("Piano Bb3" rather than the "B" of a word)
  const tokens = base.split(/[\s_\-.()[\]]+/).reverse();
  for (const t of tokens) {
    const n = noteNumber(t);
    if (n !== null) return n;
  }
  return null;
}

/**
 * Keyboard zones for samples of one instrument: each at the note in its name, or, when names
 * have no notes, one semitone apart from C3 in name order.
 */
export function zonesFor(names: string[]): { index: number; note: number }[] {
  const found = names.map((n, index) => ({ index, note: noteInName(n) }));
  if (found.every((f) => f.note !== null))
    return found.map((f) => ({ index: f.index, note: f.note! })).sort((a, b) => a.note - b.note);
  return names
    .map((n, index) => ({ n, index }))
    .sort((a, b) => a.n.localeCompare(b.n, undefined, { numeric: true }))
    .map((x, i) => ({ index: x.index, note: 48 + i }));
}
