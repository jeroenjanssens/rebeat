import { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import EnvelopePlugin from "wavesurfer.js/dist/plugins/envelope.esm.js";
import RegionsPlugin, { type Region } from "wavesurfer.js/dist/plugins/regions.esm.js";
import TimelinePlugin from "wavesurfer.js/dist/plugins/timeline.esm.js";
import ZoomPlugin from "wavesurfer.js/dist/plugins/zoom.esm.js";
import { nearestZeroCrossing } from "../../library/processing";
import { token } from "../../render/theme";
import type { Editor } from "./useEditor";

const PEAK_POINTS = 24000;

/** Downsampled absolute peaks of a channel (enough detail for deep zoom). */
function peaksOf(c: Float32Array): Float32Array {
  const n = Math.min(c.length, PEAK_POINTS);
  const out = new Float32Array(n);
  const step = c.length / n;
  for (let i = 0; i < n; i++) {
    let m = 0;
    const a = Math.floor(i * step);
    const b = Math.max(a + 1, Math.floor((i + 1) * step));
    for (let j = a; j < b; j++) m = Math.max(m, Math.abs(c[j]));
    out[i] = m;
  }
  return out;
}

interface Props {
  editor: Editor;
  snap: boolean;
  /** Current playback position in source seconds, or null (read every frame). */
  playhead: () => number | null;
  onSeek: (t: number) => void;
}

/** The editable waveform: trim, fades, loop, selection, slice markers and the volume envelope. */
export function Waveform({ editor, snap, playhead, onSeek }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const ws = useRef<WaveSurfer | null>(null);
  const regions = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
  const envelope = useRef<ReturnType<typeof EnvelopePlugin.create> | null>(null);
  const ed = useRef(editor);
  const onSeekRef = useRef(onSeek);
  useEffect(() => {
    ed.current = editor;
    onSeekRef.current = onSeek;
  });
  const { source, sampleRate, duration, settings, markers, selection } = editor;

  const snapTime = (t: number) => {
    if (!snap) return t;
    const i = nearestZeroCrossing(
      ed.current.source[0],
      Math.round(t * sampleRate),
      Math.round(sampleRate * 0.01),
    );
    return i / sampleRate;
  };

  // create wavesurfer for this audio
  useEffect(() => {
    const regionsPlugin = RegionsPlugin.create();
    const w = WaveSurfer.create({
      container: box.current!,
      height: "auto",
      peaks: source.map(peaksOf),
      duration,
      waveColor: token("accent"),
      progressColor: token("accent"),
      cursorColor: token("text"),
      cursorWidth: 1.5,
      normalize: false,
      interact: true,
      dragToSeek: false,
      splitChannels:
        source.length > 1
          ? source.map(() => ({ waveColor: token("accent"), progressColor: token("accent") }))
          : undefined,
      plugins: [
        regionsPlugin,
        TimelinePlugin.create({
          height: 14,
          style: { color: token("text-faint"), fontSize: "9px" },
        }),
        ZoomPlugin.create({ scale: 0.25, maxZoom: 4000 }),
      ],
    });
    ws.current = w;
    regions.current = regionsPlugin;
    w.on("interaction", (t) => onSeekRef.current(t));
    regionsPlugin.enableDragSelection({ color: "rgba(255,255,255,0.10)" });
    regionsPlugin.on("region-created", (r: Region) => {
      if (
        r.id.startsWith("ws-") ||
        (!["trim", "fadeIn", "fadeOut", "loop"].includes(r.id) && !r.id.startsWith("m-"))
      ) {
        // a new drag selection replaces the old one
        for (const o of regionsPlugin.getRegions())
          if (o !== r && o.id.startsWith("sel")) o.remove();
        r.setOptions({ id: "sel" });
        ed.current.setSelection({ start: r.start, end: r.end });
      }
    });
    regionsPlugin.on("region-updated", (r: Region) => {
      const e = ed.current;
      const s = e.settings;
      if (r.id === "trim")
        e.update({ trimStart: snapTime(r.start), trimEnd: snapTime(r.end) }, "trim");
      else if (r.id === "fadeIn")
        e.update({ fadeIn: Math.max(0, r.end - (s.trimStart ?? 0)) }, "fadeIn");
      else if (r.id === "fadeOut")
        e.update({ fadeOut: Math.max(0, (s.trimEnd ?? e.duration) - r.start) }, "fadeOut");
      else if (r.id === "loop")
        e.update(
          {
            loop: {
              start: r.start - s.trimStart,
              end: r.end - s.trimStart,
              crossfade: s.loop?.crossfade ?? 0.01,
            },
          },
          "loop",
        );
      else if (r.id === "sel") e.setSelection({ start: r.start, end: r.end });
      else if (r.id.startsWith("m-")) {
        const i = Number(r.id.slice(2));
        const m = [...e.markers];
        m[i] = snapTime(r.start);
        e.setMarkers(m);
      }
    });
    return () => {
      w.destroy();
      ws.current = null;
      regions.current = null;
      envelope.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, sampleRate]);

  // keep the regions in sync with the settings
  useEffect(() => {
    const rp = regions.current;
    if (!rp) return;
    const end = settings.trimEnd ?? duration;
    const want: Record<
      string,
      {
        start: number;
        end: number;
        color: string;
        drag?: boolean;
        resizeStart?: boolean;
        resizeEnd?: boolean;
        content?: string;
      }
    > = {
      trim: {
        start: settings.trimStart,
        end,
        color: "rgba(125,211,252,0.06)",
        drag: false,
        content: "",
      },
      fadeIn: {
        start: settings.trimStart,
        end: settings.trimStart + settings.fadeIn,
        color: "rgba(250,204,21,0.16)",
        drag: false,
        resizeStart: false,
        content: settings.fadeIn ? "fade in" : "",
      },
      fadeOut: {
        start: end - settings.fadeOut,
        end,
        color: "rgba(250,204,21,0.16)",
        drag: false,
        resizeEnd: false,
        content: settings.fadeOut ? "fade out" : "",
      },
    };
    if (settings.loop)
      want.loop = {
        start: settings.trimStart + settings.loop.start,
        end: settings.trimStart + settings.loop.end,
        color: "rgba(167,139,250,0.18)",
        content: "loop",
      };
    markers.forEach(
      (m, i) => (want[`m-${i}`] = { start: m, end: m, color: "rgba(251,146,60,0.9)", drag: true }),
    );
    const existing = new Map(rp.getRegions().map((r) => [r.id, r]));
    for (const [id, r] of existing) if (!(id in want) && id !== "sel") r.remove();
    for (const [id, w] of Object.entries(want)) {
      const r = existing.get(id);
      if (!r) rp.addRegion({ id, ...w, resize: id.startsWith("m-") ? false : true, minLength: 0 });
      else if (Math.abs(r.start - w.start) > 1e-4 || Math.abs(r.end - w.end) > 1e-4)
        r.setOptions({ start: w.start, end: w.end, content: w.content });
    }
    if (!selection) existing.get("sel")?.remove();
  }, [settings, duration, markers, selection]);

  // the drawn volume envelope
  useEffect(() => {
    const w = ws.current;
    if (!w) return;
    if (!settings.volumeEnvelope) {
      if (envelope.current) {
        w.unregisterPlugin(envelope.current);
        envelope.current = null;
      }
      return;
    }
    if (!envelope.current) {
      const env = EnvelopePlugin.create({
        volume: 1,
        lineColor: token("lit"),
        lineWidth: "2",
        dragPointSize: 8,
        dragPointFill: token("lit"),
        points: settings.volumeEnvelope.map((p) => ({
          time: p.time + settings.trimStart,
          volume: p.volume / 2,
        })),
      });
      w.registerPlugin(env);
      env.on("points-change", (points) => {
        const s = ed.current.settings;
        ed.current.update(
          {
            volumeEnvelope: points.map((p) => ({
              time: Math.max(0, p.time - s.trimStart),
              volume: p.volume * 2,
            })),
          },
          "env",
        );
      });
      envelope.current = env;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.volumeEnvelope === null, source]);

  // playhead
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = playhead();
      if (t !== null) ws.current?.setTime(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playhead]);

  return (
    <div ref={box} className="h-full w-full" data-testid="waveform" data-hint="editor.waveform" />
  );
}
