/** Audio clip and overdub layer operations (merge, double, halve, layer → track). */
import { audioContext } from "../engine/context";
import { getBuffer, sampleInfo } from "../engine/samples";
import { loadSample, saveRecording } from "../library/library";
import { addTrack, makeTrack } from "../model/project";
import { useStore } from "./store";

const get = () => useStore.getState();

function track(id: string) {
  return get().project.tracks.find((t) => t.id === id);
}

function update(trackId: string, fn: (t: NonNullable<ReturnType<typeof track>>) => void) {
  get().commit((p) => {
    const t = p.tracks.find((x) => x.id === trackId);
    if (t) fn(t);
  });
}

export const toggleLayer = (trackId: string, layerId: string) =>
  update(trackId, (t) => {
    const l = t.layers?.find((x) => x.id === layerId);
    if (l) l.mute = !l.mute;
  });

export const removeLastLayer = (trackId: string) => update(trackId, (t) => void t.layers?.pop());

export const clearClip = (trackId: string) =>
  update(trackId, (t) => {
    t.sampleId = undefined;
    t.layers = [];
    t.source = "No clip";
  });

/** Mix the clip and its unmuted layers into one new sample. */
export async function mergeLayers(trackId: string) {
  const t = track(trackId);
  const main = getBuffer(t?.sampleId);
  if (!t || !main) return;
  const sr = main.sampleRate;
  const nch = Math.max(main.numberOfChannels, 2);
  const out = Array.from({ length: nch }, () => new Float32Array(main.length));
  const add = (b: AudioBuffer, gain: number) => {
    for (let c = 0; c < nch; c++) {
      const d = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
      // layers loop under the main clip if they are shorter
      for (let i = 0; i < main.length; i++) out[c][i] += d[i % d.length] * gain;
    }
  };
  add(main, 1);
  for (const l of t.layers ?? []) {
    const b = getBuffer(l.sampleId);
    if (b && !l.mute) add(b, l.gain);
  }
  let peak = 0;
  for (const c of out) for (const v of c) peak = Math.max(peak, Math.abs(v));
  if (peak > 1) for (const c of out) for (let i = 0; i < c.length; i++) c[i] /= peak;
  const id = await saveRecording(out, sr, `${t.name} merged`, sampleInfo(t.sampleId)?.bpm);
  if (id) update(trackId, (x) => ((x.sampleId = id), (x.layers = [])));
}

async function resample(trackId: string, factor: 2 | 0.5) {
  const t = track(trackId);
  const b = getBuffer(t?.sampleId);
  if (!t || !b) return;
  const n = Math.round(b.length * factor);
  const out = Array.from({ length: b.numberOfChannels }, (_, c) => {
    const d = b.getChannelData(c);
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) o[i] = d[i % d.length];
    return o;
  });
  const id = await saveRecording(
    out,
    b.sampleRate,
    `${t.name} ${factor === 2 ? "×2" : "÷2"}`,
    sampleInfo(t.sampleId)?.bpm,
  );
  if (id) update(trackId, (x) => void (x.sampleId = id));
}

/** Double the loop length (the loop repeats), or keep the first half. */
export const doubleClip = (trackId: string) => resample(trackId, 2);
export const halveClip = (trackId: string) => resample(trackId, 0.5);

/** Move an overdub layer onto its own audio track. */
export function layerToTrack(trackId: string, layerId: string) {
  const s = get();
  const t = track(trackId);
  const layer = t?.layers?.find((l) => l.id === layerId);
  if (!t || !layer) return;
  void loadSample(layer.sampleId);
  const index = s.project.tracks.indexOf(t) + 1;
  s.commit((p) => {
    const src = p.tracks.find((x) => x.id === trackId)!;
    src.layers = src.layers?.filter((l) => l.id !== layerId);
    const nt = makeTrack("audio", t.category, `${t.name} L`, "Layer");
    nt.sampleId = layer.sampleId;
    addTrack(p, nt, index);
    for (const pattern of Object.values(p.patterns)) {
      const from = pattern.lanes[trackId];
      const lane = pattern.lanes[nt.id];
      if (from?.kind === "clip" && lane.kind === "clip") {
        lane.active = from.active;
        lane.launchMode = from.launchMode;
      }
    }
  });
}

export function sampleRate() {
  return audioContext().sampleRate;
}
