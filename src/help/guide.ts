/**
 * The in-app guide: Markdown chapters in help/chapters, rendered with marked.
 * Extensions: `{#id}` after a heading sets its anchor, `{{key:command.id}}` shows the current
 * shortcut of a command, `{{shortcuts}}` the whole shortcut table. Links can point to
 * `#anchor`, `panel:<id>` (open a panel) or `command:<id>` (run a command).
 */
import { marked } from "marked";
import { formatKeys, keysFor, type Command } from "../app/commands";

const files = import.meta.glob("./chapters/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface Section {
  id: string;
  title: string;
  level: number;
  /** Plain text of the section, for search. */
  text: string;
}

export interface Chapter {
  id: string;
  title: string;
  source: string;
  sections: Section[];
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const plain = (md: string) =>
  md
    .replace(/\{#[\w-]+\}/g, "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#|>]/g, "");

/** Headings without an explicit {#id} are named after their chapter: "settings-audio". */
const sectionId = (chapter: string | undefined, title: string) =>
  chapter ? `${chapter}-${slug(title)}` : slug(title);

const HEADING = /^(#{1,3}) (.+?)(?: \{#([\w-]+)\})?\s*$/;

function parseChapter(source: string): Chapter {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const line of source.split("\n")) {
    const m = HEADING.exec(line);
    if (m) {
      const id = m[3] ?? sectionId(sections[0]?.id, m[2]);
      current = { id, title: m[2], level: m[1].length, text: "" };
      sections.push(current);
    } else if (current) current.text += `${plain(line)}\n`;
  }
  return { id: sections[0]?.id ?? "", title: sections[0]?.title ?? "", source, sections };
}

export const CHAPTERS: Chapter[] = Object.keys(files)
  .sort()
  .map((k) => parseChapter(files[k]));

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function keyHtml(c: Command | undefined): string {
  const keys = c ? keysFor(c) : [];
  if (!keys.length) return '<span class="guide-nokey">no shortcut</span>';
  return keys.map((k) => `<kbd>${esc(formatKeys(k))}</kbd>`).join(" or ");
}

function shortcutTable(commands: Command[]): string {
  const rows: string[] = [];
  const categories = [...new Set(commands.map((c) => c.category))];
  for (const cat of categories) {
    const list = commands.filter((c) => c.category === cat && keysFor(c).length);
    if (!list.length) continue;
    rows.push(`<tr><th colspan="2">${esc(cat)}</th></tr>`);
    for (const c of list) rows.push(`<tr><td>${esc(c.title)}</td><td>${keyHtml(c)}</td></tr>`);
  }
  return `<table class="guide-shortcuts"><tbody>${rows.join("")}</tbody></table>`;
}

/** A chapter as HTML, with the current shortcuts filled in. */
export function renderChapter(ch: Chapter, commands: Command[]): string {
  const byId = new Map(commands.map((c) => [c.id, c]));
  const md = ch.source
    .replace(/\{\{key:([\w.-]+)\}\}/g, (_, id: string) => keyHtml(byId.get(id)))
    .replace(/\{\{shortcuts\}\}/g, () => shortcutTable(commands));
  // headings get their anchors; an explicit {#id} wins over the slug
  const html = marked.parse(md, { async: false }) as string;
  let i = 0;
  return html.replace(/<h([1-3])>(.*?)<\/h\1>/g, (_, level: string, inner: string) => {
    const m = /^(.*?) \{#([\w-]+)\}$/.exec(inner);
    const title = m ? m[1] : inner;
    // the ids come from the Markdown source, in the same order
    const id = ch.sections[i++]?.id ?? slug(title);
    return `<h${level} id="guide-${id}">${title}</h${level}>`;
  });
}
