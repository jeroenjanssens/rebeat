import { describe, expect, it } from "vitest";
import { groupRepoFiles, parseSourceUrl, parseStrudelJson } from "./sources";

describe("parseSourceUrl", () => {
  it("understands GitHub repositories in every form", () => {
    expect(parseSourceUrl("https://github.com/jeroenjanssens/beatbox-samples")).toEqual({
      kind: "github",
      owner: "jeroenjanssens",
      repo: "beatbox-samples",
      ref: "HEAD",
      path: "",
      name: "beatbox-samples",
    });
    expect(parseSourceUrl("https://github.com/a/b.git")).toMatchObject({ repo: "b", ref: "HEAD" });
    expect(parseSourceUrl("https://github.com/a/b/tree/dev/samples/drums")).toMatchObject({
      ref: "dev",
      path: "samples/drums",
    });
    expect(parseSourceUrl("github:tidalcycles/dirt-samples")).toMatchObject({
      kind: "github",
      owner: "tidalcycles",
      repo: "dirt-samples",
      ref: "HEAD",
    });
    expect(parseSourceUrl("github:a/b/main/sub")).toMatchObject({ ref: "main", path: "sub" });
  });

  it("turns a GitHub file page into its raw URL", () => {
    expect(parseSourceUrl("https://github.com/a/b/blob/main/strudel.json")).toEqual({
      kind: "json",
      url: "https://raw.githubusercontent.com/a/b/main/strudel.json",
      name: "b",
    });
    expect(parseSourceUrl("https://github.com/a/b/blob/main/wav/kick%201.wav")).toMatchObject({
      kind: "file",
      name: "kick 1.wav",
    });
  });

  it("recognizes sample maps, audio files and zips", () => {
    expect(parseSourceUrl("https://example.com/kits/808/strudel.json")).toMatchObject({
      kind: "json",
      name: "808",
    });
    expect(parseSourceUrl("https://example.com/a/Snare.WAV")).toMatchObject({ kind: "file" });
    expect(parseSourceUrl("https://example.com/pack.zip")).toMatchObject({ kind: "file" });
    expect(parseSourceUrl("https://example.com/download?id=3")).toMatchObject({ kind: "unknown" });
    expect(parseSourceUrl("not a url")).toBeNull();
    expect(parseSourceUrl("ftp://example.com/a.wav")).toBeNull();
  });
});

describe("parseStrudelJson", () => {
  it("reads single files, lists and note maps against _base", () => {
    const sounds = parseStrudelJson(
      {
        _base: "https://raw.githubusercontent.com/u/r/main/",
        clap: "wav/clap.wav",
        kick: ["wav/kick1.wav", "wav/kick2.wav"],
        piano: { c3: "p/C3.mp3", e3: "p/E3.mp3" },
        abs: "https://cdn.example.com/x.wav",
        bad: 3,
      },
      "https://example.com/strudel.json",
    );
    expect(sounds).toEqual({
      clap: ["https://raw.githubusercontent.com/u/r/main/wav/clap.wav"],
      kick: [
        "https://raw.githubusercontent.com/u/r/main/wav/kick1.wav",
        "https://raw.githubusercontent.com/u/r/main/wav/kick2.wav",
      ],
      piano: [
        "https://raw.githubusercontent.com/u/r/main/p/C3.mp3",
        "https://raw.githubusercontent.com/u/r/main/p/E3.mp3",
      ],
      abs: ["https://cdn.example.com/x.wav"],
    });
  });

  it("resolves against the file's own location without _base, and rejects non-maps", () => {
    expect(parseStrudelJson({ hh: "hh.wav" }, "https://example.com/kits/strudel.json")).toEqual({
      hh: ["https://example.com/kits/hh.wav"],
    });
    expect(() => parseStrudelJson([1, 2], "https://e.com/x.json")).toThrow(/sample map/);
    expect(() => parseStrudelJson({ _base: "x" }, "https://e.com/x.json")).toThrow(/no sounds/);
  });
});

describe("groupRepoFiles", () => {
  it("groups a repo's audio files by folder, under a path", () => {
    const url = (p: string) => `https://raw/${p}`;
    expect(
      groupRepoFiles(
        ["README.md", "drums/kick.wav", "drums/snare.wav", "fx/laser.mp3", "top.wav", "x/y.txt"],
        "",
        url,
      ),
    ).toEqual({
      drums: ["https://raw/drums/kick.wav", "https://raw/drums/snare.wav"],
      fx: ["https://raw/fx/laser.mp3"],
      samples: ["https://raw/top.wav"],
    });
    expect(groupRepoFiles(["a/b/c.wav", "z.wav"], "a", url)).toEqual({
      b: ["https://raw/a/b/c.wav"],
    });
  });
});
