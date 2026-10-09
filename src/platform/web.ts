import type { OpenFilesOptions, Platform } from "./types";

function openFiles({ accept, multiple, directory }: OpenFilesOptions = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (accept) input.accept = accept.join(",");
    input.multiple = !!multiple;
    if (directory) input.webkitdirectory = true;
    input.style.display = "none";
    document.body.append(input);
    // "cancel" fires when the dialog closes without a choice (Chromium, Firefox, Safari 16.4+)
    input.addEventListener("cancel", () => {
      input.remove();
      resolve([]);
    });
    input.addEventListener("change", () => {
      const files = [...(input.files ?? [])];
      input.remove();
      resolve(files);
    });
    input.click();
  });
}

async function saveFile(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * A synthetic microphone for end-to-end tests (beeps on every half second), enabled with
 * `window.__REBEAT_TEST_MIC__ = true` before the app loads. Headless browsers can't always open
 * even a fake capture device.
 */
function testMicStream(): MediaStream {
  const ctx = new AudioContext();
  if ((window as { __REBEAT_TEST_MIC__?: unknown }).__REBEAT_TEST_MIC__ === "beats")
    return testBeatsStream(ctx);
  const osc = ctx.createOscillator();
  const gate = ctx.createGain();
  osc.frequency.value = 660;
  gate.gain.value = 0;
  const lfo = ctx.createOscillator();
  lfo.type = "square";
  lfo.frequency.value = 2;
  const depth = ctx.createGain();
  depth.gain.value = 0.25;
  lfo.connect(depth).connect(gate.gain);
  const dest = ctx.createMediaStreamDestination();
  osc.connect(gate).connect(dest);
  osc.start();
  lfo.start();
  return dest.stream;
}

/** `__REBEAT_TEST_MIC__ = "beats"`: a decaying noise burst every half second, like a hi-hat
 * beatboxed to a click (for the Beatbox panel, which needs hits that start and fade). */
function testBeatsStream(ctx: AudioContext): MediaStream {
  const buf = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.5), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 1;
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 16807) % 2147483647;
    d[i] = ((seed / 2147483647) * 2 - 1) * 0.6 * Math.exp(-i / (ctx.sampleRate * 0.02));
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const dest = ctx.createMediaStreamDestination();
  src.connect(dest);
  src.start();
  return dest.stream;
}

const testMicEnabled = () =>
  typeof window !== "undefined" &&
  !!(window as { __REBEAT_TEST_MIC__?: boolean }).__REBEAT_TEST_MIC__;

export const webPlatform: Platform = {
  kind: "web",

  kv: {
    get: (key) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // storage full or disabled: settings just don't persist
      }
    },
    remove: (key) => localStorage.removeItem(key),
  },

  storage: {
    persist: async () => (await navigator.storage?.persist?.()) ?? false,
    estimate: async () => {
      const e = await navigator.storage?.estimate?.();
      return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
    },
  },

  files: {
    open: openFiles,
    save: saveFile,
    supportsFolders: typeof window !== "undefined" && "showDirectoryPicker" in window,
    pickFolder: async () => {
      const picker = (
        window as unknown as {
          showDirectoryPicker?: (o: object) => Promise<FileSystemDirectoryHandle>;
        }
      ).showDirectoryPicker;
      if (!picker) return null;
      try {
        return await picker({ mode: "readwrite" });
      } catch {
        return null;
      }
    },
  },

  fullscreen: {
    enter: async (el = document.documentElement) => {
      if (document.fullscreenElement === el) return;
      if (document.fullscreenElement) await document.exitFullscreen();
      await el.requestFullscreen({ navigationUI: "hide" });
    },
    exit: async () => {
      if (document.fullscreenElement) await document.exitFullscreen();
    },
    element: () => document.fullscreenElement,
    onChange: (fn) => {
      document.addEventListener("fullscreenchange", fn);
      return () => document.removeEventListener("fullscreenchange", fn);
    },
  },

  media: {
    getUserMedia: (c) =>
      testMicEnabled() ? Promise.resolve(testMicStream()) : navigator.mediaDevices.getUserMedia(c),
    devices: async () => (await navigator.mediaDevices?.enumerateDevices?.()) ?? [],
    onDevicesChange: (fn) => {
      navigator.mediaDevices?.addEventListener("devicechange", fn);
      return () => navigator.mediaDevices?.removeEventListener("devicechange", fn);
    },
    micPermission: async () => {
      try {
        const s = await navigator.permissions.query({ name: "microphone" as PermissionName });
        return s.state;
      } catch {
        return "unknown";
      }
    },
  },

  midi: {
    supported: typeof navigator !== "undefined" && "requestMIDIAccess" in navigator,
    request: async (sysex = false) => {
      if (!("requestMIDIAccess" in navigator)) return null;
      try {
        return await navigator.requestMIDIAccess({ sysex });
      } catch {
        return null;
      }
    },
  },

  onBeforeUnload: (fn) => {
    const handler = (e: BeforeUnloadEvent) => {
      if (fn()) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  },
};
