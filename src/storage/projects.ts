/** Projects in IndexedDB: list, open, save, autosave, duplicate, delete. */
import { stop } from "../engine/transport";
import { uid } from "../model/id";
import type { Project } from "../model/project";
import { deserializeProject, serializeProject } from "../model/schema";
import { platform } from "../platform";
import { projectThumbnail } from "../render/thumbnail";
import { useSettings } from "../state/settings";
import { useStore } from "../state/store";
import { db, type ProjectRecord } from "./db";

const LAST = "lastProjectId";

export async function listProjects(): Promise<ProjectRecord[]> {
  return db.projects.orderBy("updatedAt").reverse().toArray();
}

export async function saveProject(id: string, project: Project) {
  const now = Date.now();
  const existing = await db.projects.get(id);
  await db.projects.put({
    id,
    name: project.name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    data: serializeProject(project),
    thumbnail: projectThumbnail(project),
  });
  await db.meta.put({ key: LAST, value: id });
}

export async function readProject(id: string): Promise<Project | null> {
  const rec = await db.projects.get(id);
  return rec ? deserializeProject(rec.data) : null;
}

/** Make a project current (stops playback first) and remember it for the next start. */
export async function openProject(id: string): Promise<boolean> {
  const project = await readProject(id);
  if (!project) return false;
  stop();
  useStore.getState().loadProject(project, id);
  await db.meta.put({ key: LAST, value: id });
  return true;
}

/** Store a new project (from a template or an import) and open it. */
export async function createProject(project: Project): Promise<string> {
  const id = uid("prj");
  await saveProject(id, project);
  await openProject(id);
  return id;
}

export async function duplicateProject(id: string): Promise<string | null> {
  const p = await readProject(id);
  if (!p) return null;
  p.name = `${p.name} copy`;
  const newId = uid("prj");
  await saveProject(newId, p);
  return newId;
}

export async function renameProject(id: string, name: string) {
  if (id === useStore.getState().projectId) {
    useStore.getState().commit((p) => void (p.name = name));
    return;
  }
  const p = await readProject(id);
  if (!p) return;
  p.name = name;
  await saveProject(id, p);
}

export async function deleteProject(id: string) {
  await db.projects.delete(id);
}

/** Save the current project now (Cmd+S, before closing, before switching). */
export async function saveNow() {
  const s = useStore.getState();
  if (!s.projectId) return;
  useStore.setState({ saveStatus: "saving" });
  try {
    await saveProject(s.projectId, s.project);
    // a later edit during the save keeps the project dirty
    if (useStore.getState().project === s.project) useStore.setState({ saveStatus: "saved" });
  } catch (e) {
    console.error(e);
    useStore.setState({ saveStatus: "error" });
  }
}

let timer = 0;

let starting: Promise<void> | null = null;

/** Debounced autosave of every edit; on start, reopen the last project (crash recovery). */
export function startProjects(fallback: () => Project) {
  starting ??= start(fallback);
  return starting;
}

async function start(fallback: () => Project) {
  let recovered = false;
  try {
    const last = (await db.meta.get(LAST))?.value as string | undefined;
    if (last) recovered = await openProject(last);
  } catch (e) {
    console.error("Could not reopen the last project", e);
  }
  if (!recovered) await createProject(fallback());

  let last = useStore.getState().project;
  useStore.subscribe((s) => {
    if (s.project === last) return;
    last = s.project;
    if (s.saveStatus !== "dirty") useStore.setState({ saveStatus: "dirty" });
    if (!useSettings.getState().autosave) return;
    clearTimeout(timer);
    timer = window.setTimeout(saveNow, 800);
  });
  platform.onBeforeUnload(() => {
    const dirty = useStore.getState().saveStatus === "dirty";
    if (dirty && useSettings.getState().autosave) void saveNow();
    return dirty && !useSettings.getState().autosave;
  });
  void platform.storage.persist();
}
