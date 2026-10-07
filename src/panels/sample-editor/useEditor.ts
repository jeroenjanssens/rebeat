/** Sample editor state: the working audio, its settings, a selection, markers and local undo. */
import { useCallback, useEffect, useState } from "react";
import { loadOriginal } from "../../library/library";
import { DEFAULT_SETTINGS, withDefaults, type SampleSettings } from "../../library/processing";
import { db } from "../../storage/db";
import type { Channels } from "../../library/editorOps";

interface Snapshot {
  source: Channels;
  settings: SampleSettings;
  /** The audio itself was changed (cut, paste, render…): applying makes a new version. */
  sourceDirty: boolean;
}

export interface Editor {
  ready: boolean;
  name: string;
  sampleRate: number;
  source: Channels;
  settings: SampleSettings;
  sourceDirty: boolean;
  /** Settings or audio differ from what's stored. */
  dirty: boolean;
  duration: number;
  selection: { start: number; end: number } | null;
  markers: number[];
  setSelection: (s: { start: number; end: number } | null) => void;
  setMarkers: (m: number[]) => void;
  /** Change settings (merged into one undo step per `key` while dragging). */
  update: (patch: Partial<SampleSettings>, key?: string) => void;
  /** Replace the audio (destructive edit). */
  replaceSource: (source: Channels, patch?: Partial<SampleSettings>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  markSaved: () => void;
}

export function useEditor(sampleId: string): Editor {
  const [name, setName] = useState("");
  const [sampleRate, setSampleRate] = useState(44100);
  const [history, setHistory] = useState<{
    list: Snapshot[];
    i: number;
    key: string | null;
    at: number;
  }>({
    list: [{ source: [new Float32Array(1)], settings: DEFAULT_SETTINGS, sourceDirty: false }],
    i: 0,
    key: null,
    at: 0,
  });
  const [saved, setSaved] = useState<Snapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [markers, setMarkers] = useState<number[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [buf, rec] = await Promise.all([loadOriginal(sampleId), db.samples.get(sampleId)]);
      if (!alive || !buf) return;
      const snap: Snapshot = {
        source: Array.from({ length: buf.numberOfChannels }, (_, c) =>
          buf.getChannelData(c).slice(),
        ),
        settings: withDefaults(rec?.settings as Partial<SampleSettings>),
        sourceDirty: false,
      };
      setName(rec?.name ?? sampleId);
      setSampleRate(buf.sampleRate);
      setHistory({ list: [snap], i: 0, key: null, at: 0 });
      setSaved(snap);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [sampleId]);

  const cur = history.list[history.i];

  const push = useCallback((next: Snapshot, key: string | null) => {
    setHistory((h) => {
      const now = performance.now();
      const merge = key !== null && key === h.key && now - h.at < 800;
      const list = h.list.slice(0, h.i + (merge ? 0 : 1));
      list.push(next);
      return { list: list.slice(-100), i: Math.min(list.length, 100) - 1, key, at: now };
    });
  }, []);

  return {
    ready,
    name,
    sampleRate,
    source: cur.source,
    settings: cur.settings,
    // compared with what's stored (an Apply resets it)
    sourceDirty: !!saved && cur.source !== saved.source,
    dirty:
      !!saved &&
      (cur.source !== saved.source ||
        JSON.stringify(cur.settings) !== JSON.stringify(saved.settings)),
    duration: cur.source[0].length / sampleRate,
    selection,
    markers,
    setSelection,
    setMarkers,
    update: (patch, key) => push({ ...cur, settings: { ...cur.settings, ...patch } }, key ?? null),
    replaceSource: (source, patch) =>
      push({ source, settings: { ...cur.settings, ...patch }, sourceDirty: true }, null),
    undo: () => setHistory((h) => ({ ...h, i: Math.max(0, h.i - 1), key: null })),
    redo: () => setHistory((h) => ({ ...h, i: Math.min(h.list.length - 1, h.i + 1), key: null })),
    canUndo: history.i > 0,
    canRedo: history.i < history.list.length - 1,
    markSaved: () => setSaved(cur),
  };
}
