import { toast } from "../components/Toast";
import { platform } from "../platform";
import { useStore } from "../state/store";
import { db } from "../storage/db";
import {
  createProject,
  duplicateProject,
  openProject,
  readProject,
  saveNow,
} from "../storage/projects";
import { exportRebeat, importRebeat, rebeatFileName } from "../storage/rebeatFile";
import { TEMPLATES } from "../templates";
import { useShell } from "./shell";

export async function newFromTemplate(templateId: string) {
  const t = TEMPLATES.find((x) => x.id === templateId) ?? TEMPLATES[0];
  await saveNow();
  await createProject(t.create());
  useShell.getState().set({ homeOpen: false });
  toast(`New project from “${t.name}”`);
}

export async function open(id: string) {
  await saveNow();
  if (await openProject(id)) useShell.getState().set({ homeOpen: false });
  else toast("Could not open the project", "error");
}

export async function duplicate(id: string) {
  const newId = await duplicateProject(id);
  if (newId) toast("Project duplicated");
}

export async function exportProject(id = useStore.getState().projectId) {
  try {
    await saveNow();
    const project =
      id === useStore.getState().projectId ? useStore.getState().project : await readProject(id);
    if (!project) return;
    const blob = await exportRebeat(project);
    await platform.files.save(rebeatFileName(project), blob);
    toast(`Exported ${rebeatFileName(project)}`);
  } catch (e) {
    toast(`Export failed: ${e instanceof Error ? e.message : e}`, "error");
  }
}

export async function importProjectFile(file?: File) {
  const f = file ?? (await platform.files.open({ accept: [".rebeat", ".zip"] }))[0];
  if (!f) return;
  try {
    const project = await importRebeat(f);
    await saveNow();
    await createProject(project);
    useShell.getState().set({ homeOpen: false });
    toast(`Imported “${project.name}”`);
  } catch (e) {
    toast(`Import failed: ${e instanceof Error ? e.message : e}`, "error");
  }
}

/** Chromium: write the project as a .rebeat file into a folder you pick (remembered). */
export async function saveToFolder(pickNew = false) {
  if (!platform.files.supportsFolders) {
    toast("Saving to a folder needs a Chromium browser; use Export instead.", "error");
    return;
  }
  const key = `folder:${useStore.getState().projectId}`;
  let dir = pickNew
    ? null
    : (((await db.meta.get(key))?.value as FileSystemDirectoryHandle | undefined) ?? null);
  if (dir) {
    const perm = await (
      dir as unknown as { requestPermission(o: object): Promise<string> }
    ).requestPermission({ mode: "readwrite" });
    if (perm !== "granted") dir = null;
  }
  dir ??= await platform.files.pickFolder();
  if (!dir) return;
  await db.meta.put({ key, value: dir });
  const project = useStore.getState().project;
  const handle = await dir.getFileHandle(rebeatFileName(project), { create: true });
  const w = await handle.createWritable();
  await w.write(await exportRebeat(project));
  await w.close();
  toast(`Saved to ${dir.name}/${rebeatFileName(project)}`);
}

export async function save() {
  await saveNow();
  toast("Saved");
}
