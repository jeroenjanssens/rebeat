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
  if (!json || typeof json !== "object" || Array.isArray(json))
    throw new Error("This isn't a strudel.json sample map");
  const map = json as Record<string, unknown>;
  const base = typeof map._base === "string" ? map._base : new URL(".", from).href;
  const abs = (p: string) => new URL(p, base.endsWith("/") ? base : `${base}/`).href;
  const out: Record<string, string[]> = {};
  for (const [name, value] of Object.entries(map)) {
    if (name.startsWith("_")) continue;
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
  if (!Object.keys(out).length) throw new Error("This strudel.json has no sounds");
  return out;
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
