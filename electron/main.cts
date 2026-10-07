/**
 * Rebeat desktop: an Electron shell around the web app. The app is served from a custom
 * `rebeat://` scheme (a stable, secure origin for storage, AudioWorklets and media), with
 * native dialogs, menus, `.rebeat` file association, a stage (kiosk) mode and permanent
 * microphone/MIDI permissions.
 */
import {
  BrowserWindow,
  Menu,
  app,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
  shell,
  systemPreferences,
} from "electron";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { autoUpdater } from "electron-updater";

const DEV_URL = process.env.REBEAT_DEV_URL;
const DIST = path.join(__dirname, "../../dist");
const ALLOWED = new Set([
  "media",
  "midi",
  "midiSysex",
  "fullscreen",
  "clipboard-read",
  "clipboard-sanitized-write",
  "speaker-selection",
]);

protocol.registerSchemesAsPrivileged([
  {
    scheme: "rebeat",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

const windows = new Set<BrowserWindow>();
/** Files opened before a window was ready (file association, command line). */
const pendingFiles: string[] = [];

function send(win: BrowserWindow | null | undefined, channel: string, ...args: unknown[]) {
  win?.webContents.send(channel, ...args);
}

async function openFileIn(win: BrowserWindow, file: string) {
  const data = await readFile(file);
  send(win, "file:open", { name: path.basename(file), data: new Uint8Array(data) });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#08090b",
    title: "Rebeat",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });
  windows.add(win);
  win.on("closed", () => windows.delete(win));
  // Dockview pop-outs open as real windows; other links go to the browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes("popout.html") || url === "about:blank") return { action: "allow" };
    void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.once("did-finish-load", () => {
    for (const f of pendingFiles.splice(0)) void openFileIn(win, f);
  });
  void win.loadURL(DEV_URL ?? "rebeat://app/index.html");
  return win;
}

function focused() {
  return BrowserWindow.getFocusedWindow() ?? [...windows][0];
}

function command(id: string) {
  return () => send(focused(), "command", id);
}

function buildMenu() {
  const mac = process.platform === "darwin";
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(mac ? [{ role: "appMenu" as const }] : []),
    {
      label: "File",
      submenu: [
        { label: "Projects…", accelerator: "CmdOrCtrl+O", click: command("project.home") },
        {
          label: "Open .rebeat File…",
          accelerator: "CmdOrCtrl+Shift+O",
          click: async () => {
            const win = focused();
            const r = await dialog.showOpenDialog(win, {
              filters: [{ name: "Rebeat project", extensions: ["rebeat"] }],
              properties: ["openFile"],
            });
            if (!r.canceled && r.filePaths[0]) await openFileIn(win, r.filePaths[0]);
          },
        },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: command("project.save") },
        {
          label: "Export .rebeat…",
          accelerator: "CmdOrCtrl+Shift+E",
          click: command("project.export"),
        },
        {
          label: "Export Audio / MIDI…",
          accelerator: "CmdOrCtrl+E",
          click: command("project.exportAudio"),
        },
        { type: "separator" },
        { label: "New Window", accelerator: "CmdOrCtrl+Shift+N", click: () => createWindow() },
        { type: "separator" },
        mac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        // the app has its own undo history (steps, tracks…), not the text field's
        { label: "Undo", accelerator: "CmdOrCtrl+Z", click: command("edit.undo") },
        { label: "Redo", accelerator: "CmdOrCtrl+Shift+Z", click: command("edit.redo") },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Command Palette", accelerator: "CmdOrCtrl+K", click: command("app.palette") },
        { label: "Keyboard Shortcuts", click: command("app.shortcuts") },
        { type: "separator" },
        { role: "togglefullscreen" },
        {
          label: "Stage Mode",
          accelerator: "CmdOrCtrl+Shift+K",
          click: () => {
            const win = focused();
            win?.setKiosk(!win.isKiosk());
          },
        },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        { label: "Rebeat Guide", accelerator: "F1", click: command("app.guide") },
        { label: "Keyboard Shortcuts", click: command("app.shortcuts") },
        { label: "Settings…", accelerator: "CmdOrCtrl+,", click: command("app.settings") },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle(
  "dialog:open",
  async (e, opts: { accept?: string[]; multiple?: boolean; directory?: boolean }) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const exts = (opts.accept ?? []).filter((a) => a.startsWith(".")).map((a) => a.slice(1));
    const audio = (opts.accept ?? []).some((a) => a.startsWith("audio/"));
    const filters =
      exts.length || audio
        ? [
            {
              name: "Files",
              extensions: [
                ...exts,
                ...(audio ? ["wav", "mp3", "ogg", "flac", "aif", "aiff", "m4a"] : []),
              ],
            },
          ]
        : [];
    const r = await dialog.showOpenDialog(win!, {
      filters,
      properties: opts.directory
        ? ["openDirectory"]
        : ["openFile", ...(opts.multiple ? (["multiSelections"] as const) : [])],
    });
    if (r.canceled) return [];
    if (opts.directory) {
      // a picked folder: all files inside, recursively, with their relative paths
      const { readdir } = await import("node:fs/promises");
      const root = r.filePaths[0];
      const entries = await readdir(root, { recursive: true, withFileTypes: true });
      const files = entries.filter((d) => d.isFile());
      return Promise.all(
        files.map(async (d) => {
          const full = path.join(d.parentPath, d.name);
          return {
            name: d.name,
            path: path.join(path.basename(root), path.relative(root, full)),
            data: new Uint8Array(await readFile(full)),
          };
        }),
      );
    }
    return Promise.all(
      r.filePaths.map(async (f) => ({
        name: path.basename(f),
        path: "",
        data: new Uint8Array(await readFile(f)),
      })),
    );
  },
);

ipcMain.handle("dialog:save", async (e, name: string, data: Uint8Array) => {
  const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
  const r = await dialog.showSaveDialog(win!, { defaultPath: name });
  if (r.canceled || !r.filePath) return false;
  await writeFile(r.filePath, data);
  return true;
});

// one instance; opening a file in a second instance hands it to the first
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", (_e, argv) => {
  const file = argv.find((a) => a.endsWith(".rebeat"));
  const win = [...windows][0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
    if (file) void openFileIn(win, file);
  }
});
app.on("open-file", (e, file) => {
  e.preventDefault();
  const win = [...windows][0];
  if (win && !win.webContents.isLoading()) void openFileIn(win, file);
  else pendingFiles.push(file);
});
pendingFiles.push(...process.argv.slice(1).filter((a) => a.endsWith(".rebeat")));

app.whenReady().then(() => {
  protocol.handle("rebeat", (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
    if (!file.startsWith(DIST)) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // the desktop app keeps its permissions: no prompt for the mic and MIDI every session
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) =>
    cb(ALLOWED.has(permission)),
  );
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => ALLOWED.has(permission));
  buildMenu();
  createWindow();
  // releases come from GitHub (see "publish" in package.json); quiet when offline or unpublished
  if (app.isPackaged && !process.env.REBEAT_NO_UPDATES)
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  // macOS asks once for the microphone; don't hold up the window for the answer
  if (process.platform === "darwin" && !process.env.REBEAT_NO_MIC_PROMPT)
    void systemPreferences.askForMediaAccess("microphone").catch(() => false);
  app.on("activate", () => windows.size === 0 && createWindow());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
