import { useEffect, useMemo, useRef, useState } from "react";
import { runCommand, useCommands } from "../../app/commands";
import { focusPanel } from "../../app/openers";
import type { PanelProps } from "../../app/panels";
import { CHAPTERS, renderChapter } from "../../help/guide";
import { useSettings } from "../../state/settings";

/** The user guide: a table of contents with search, and the chapters (D70). */
export function GuidePanel({ params }: PanelProps) {
  const commands = useCommands();
  // re-render the shortcuts when they're rebound
  const overrides = useSettings((s) => s.shortcuts);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState<string | undefined>(CHAPTERS[0]?.id);
  const body = useRef<HTMLDivElement>(null);

  const html = useMemo(
    () => CHAPTERS.map((ch) => renderChapter(ch, commands)).join(""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commands, overrides],
  );

  const q = query.trim().toLowerCase();
  const results = useMemo(
    () =>
      q
        ? CHAPTERS.flatMap((ch) =>
            ch.sections
              .filter((s) => `${s.title}\n${s.text}`.toLowerCase().includes(q))
              .map((s) => ({ chapter: ch, section: s })),
          )
        : [],
    [q],
  );

  const goTo = (id: string) => {
    const el = body.current?.querySelector(`#guide-${CSS.escape(id)}`);
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    setCurrent(CHAPTERS.find((c) => c.sections.some((s) => s.id === id))?.id);
  };

  // open at a section: openGuide("mixing")
  const anchor = params.anchor as string | undefined;
  const nonce = params.nonce;
  useEffect(() => {
    if (anchor) requestAnimationFrame(() => goTo(anchor));
  }, [anchor, nonce]);

  // follow the scroll position in the table of contents
  const onScroll = () => {
    const el = body.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + 40;
    let id = CHAPTERS[0]?.id;
    for (const h of el.querySelectorAll("h1[id]"))
      if (h.getBoundingClientRect().top <= top) id = h.id.slice("guide-".length);
    setCurrent(id);
  };

  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (!href) return;
    e.preventDefault();
    if (href.startsWith("#")) goTo(href.slice(1));
    else if (href.startsWith("panel:")) focusPanel(href.slice(6));
    else if (href.startsWith("command:")) runCommand(href.slice(8));
    else window.open(href, "_blank", "noopener");
  };

  return (
    <div className="flex h-full min-h-0" data-testid="guide">
      <nav className="flex w-52 shrink-0 flex-col border-r border-line">
        <div className="p-2">
          <input
            className="input w-full"
            placeholder="Search the guide…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="guide-search"
          />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-1 pb-2 text-[12px]">
          {q
            ? results.map(({ chapter, section }) => (
                <li key={`${chapter.id}:${section.id}`}>
                  <button
                    className="guide-toc-item"
                    onClick={() => goTo(section.id)}
                    data-testid="guide-result"
                  >
                    {section.title}
                    {section.level > 1 && <span className="text-faint"> · {chapter.title}</span>}
                  </button>
                </li>
              ))
            : CHAPTERS.map((ch) => (
                <li key={ch.id}>
                  <button
                    className="guide-toc-item"
                    data-active={ch.id === current}
                    onClick={() => goTo(ch.id)}
                  >
                    {ch.title}
                  </button>
                </li>
              ))}
          {q && !results.length && <li className="px-2 py-1 text-faint">Nothing found</li>}
        </ul>
      </nav>
      <div
        ref={body}
        className="guide min-w-0 flex-1 overflow-y-auto px-6 py-4"
        onScroll={onScroll}
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
