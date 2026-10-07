import { useRef } from "react";
import { ChevronDown } from "lucide-react";
import { dropdown, type MenuItem } from "../../components/Menu";
import { SCALES, keyName, pitchClassName } from "../../model/notes";
import { pageKey } from "../../model/project";
import { useEditPattern, useStore } from "../../state/store";

/** Project key and scale, with an optional override for the page being edited. */
export function KeyMenu({ compact = false }: { compact?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const pattern = useEditPattern();
  const project = useStore((s) => s.project);
  const commit = useStore((s) => s.commit);
  const key = pageKey(project, pattern);
  const override = !!pattern.keyOverride;

  const setKey = (k: { root: number; scale: string }) =>
    commit((p) => {
      if (p.patterns[pattern.id].keyOverride) p.patterns[pattern.id].keyOverride = k;
      else p.key = k;
    });

  const items = (): MenuItem[] => [
    {
      render: (close) => (
        <div className="px-2 py-1.5">
          <div className="label mb-1.5">Root</div>
          <div className="grid grid-cols-6 gap-1">
            {Array.from({ length: 12 }, (_, i) => (
              <button
                key={i}
                className="tool-btn !h-6 border border-line"
                data-active={key.root === i}
                onClick={() => {
                  setKey({ ...key, root: i });
                  close();
                }}
              >
                {pitchClassName(i, true)}
              </button>
            ))}
          </div>
        </div>
      ),
    },
    { separator: true },
    ...Object.entries(SCALES).map(([id, sc]) => ({
      label: sc.name,
      checked: key.scale === id,
      onSelect: () => setKey({ ...key, scale: id }),
    })),
    { separator: true },
    {
      label: override ? "Use the project key on this page" : "Own key for this page",
      onSelect: () =>
        commit((p) => {
          const pat = p.patterns[pattern.id];
          pat.keyOverride = override ? undefined : { ...p.key };
        }),
    },
  ];

  return (
    <button
      ref={ref}
      className="field"
      title={override ? "Key (this page)" : "Key (project)"}
      onClick={() => dropdown(ref.current!, items())}
    >
      <span className="label">{override ? "Page key" : "Key"}</span>
      <span className="num text-ink">
        {compact ? pitchClassName(key.root, true) : keyName(key)}
      </span>
      <ChevronDown size={12} className="text-dim" />
    </button>
  );
}
