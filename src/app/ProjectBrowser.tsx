import { useEffect, useState } from "react";
import { Copy, Download, FolderOpen, Plus, Trash2, Upload, X } from "lucide-react";
import { InlineEdit } from "../components/InlineEdit";
import { contextMenu } from "../components/Menu";
import { usePortalTarget } from "../components/portal";
import { useStore } from "../state/store";
import type { ProjectRecord } from "../storage/db";
import { deleteProject, listProjects, renameProject } from "../storage/projects";
import { TEMPLATES } from "../templates";
import { createPortal } from "react-dom";
import {
  duplicate,
  exportProject,
  importProjectFile,
  newFromTemplate,
  open,
} from "./projectActions";
import { useShell } from "./shell";

function ago(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

/** Home: recent projects, templates, import. */
export function ProjectBrowser() {
  const isOpen = useShell((s) => s.homeOpen);
  const set = useShell((s) => s.set);
  const currentId = useStore((s) => s.projectId);
  const saveStatus = useStore((s) => s.saveStatus);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const target = usePortalTarget();
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    listProjects().then((p) => alive && setProjects(p));
    return () => {
      alive = false;
    };
  }, [isOpen, version, saveStatus]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && set({ homeOpen: false });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, set]);

  if (!isOpen) return null;

  const menu = (p: ProjectRecord) => [
    { label: "Open", onSelect: () => open(p.id) },
    { label: "Duplicate", onSelect: () => duplicate(p.id).then(refresh) },
    { label: "Export .rebeat…", onSelect: () => exportProject(p.id) },
    { separator: true },
    {
      label: "Delete",
      disabled: p.id === currentId,
      onSelect: () => setConfirm(p.id),
    },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[1050] flex flex-col bg-bg/95 backdrop-blur-sm"
      data-testid="project-browser"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = [...e.dataTransfer.files].find((x) => /\.(rebeat|zip)$/i.test(x.name));
        if (f) importProjectFile(f);
      }}
    >
      <div className="mx-auto flex w-full max-w-[1100px] min-h-0 flex-1 flex-col px-8 py-6">
        <div className="mb-6 flex items-center gap-3">
          <span className="text-[22px] font-bold tracking-tight">
            re<span className="text-lit">beat</span>
          </span>
          <span className="label mt-1">Projects</span>
          <div className="flex-1" />
          <button className="tool-btn border border-line" onClick={() => importProjectFile()}>
            <Upload size={13} /> Import .rebeat
          </button>
          <button className="tool-btn" title="Close (Esc)" onClick={() => set({ homeOpen: false })}>
            <X size={16} />
          </button>
        </div>

        <div className="label mb-2">New project</div>
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              className="group flex flex-col gap-1 rounded-lg border border-line bg-panel p-3 text-left hover:border-accent"
              onClick={() => newFromTemplate(t.id)}
            >
              <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                <Plus size={13} className="text-dim group-hover:text-accent" />
                {t.name}
              </span>
              <span className="text-[11px] text-dim">{t.description}</span>
            </button>
          ))}
        </div>

        <div className="label mb-2">Recent</div>
        <div className="scroll-thin -mx-1 grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-auto px-1 pb-4 md:grid-cols-3 lg:grid-cols-4">
          {projects.map((p) => (
            <div
              key={p.id}
              className="group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-panel"
              style={{ borderColor: p.id === currentId ? "var(--accent)" : "var(--border)" }}
              onClick={() => open(p.id)}
              onContextMenu={(e) => contextMenu(e, menu(p))}
              data-testid="project-card"
            >
              {p.thumbnail ? (
                <img
                  src={p.thumbnail}
                  alt=""
                  className="aspect-[2/1] w-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="aspect-[2/1] w-full bg-display" />
              )}
              <div
                className="flex items-center gap-2 px-3 py-2"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="min-w-0 flex-1">
                  <InlineEdit
                    value={p.name}
                    onCommit={(v) => renameProject(p.id, v).then(refresh)}
                    className="block text-[12.5px] font-semibold"
                  />
                  <div className="text-[10.5px] text-faint">
                    {p.id === currentId ? "Open now · " : ""}
                    {ago(p.updatedAt)}
                  </div>
                </div>
                <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                  <button className="tool-btn !px-1" title="Open" onClick={() => open(p.id)}>
                    <FolderOpen size={13} />
                  </button>
                  <button
                    className="tool-btn !px-1"
                    title="Duplicate"
                    onClick={() => duplicate(p.id).then(refresh)}
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    className="tool-btn !px-1"
                    title="Export .rebeat"
                    onClick={() => exportProject(p.id)}
                  >
                    <Download size={13} />
                  </button>
                  <button
                    className="tool-btn !px-1"
                    title={p.id === currentId ? "Can't delete the open project" : "Delete"}
                    disabled={p.id === currentId}
                    onClick={() => setConfirm(p.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {confirm === p.id && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-raised/95 p-3 text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-[12px]">Delete “{p.name}”? This can't be undone.</span>
                  <div className="flex gap-2">
                    <button
                      className="tool-btn border border-line"
                      onClick={() => setConfirm(null)}
                    >
                      Cancel
                    </button>
                    <button
                      className="tool-btn border border-[#ef4444] !text-[#ef4444]"
                      onClick={() => {
                        setConfirm(null);
                        deleteProject(p.id).then(refresh);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    target,
  );
}
