import { useEffect, useState } from "react";
import { Circle, Headphones, Mic, Square } from "lucide-react";
import { LevelMeter } from "../../components/LevelMeter";
import { toast } from "../../components/Toast";
import { closeMic, micLevel, openMic, useMic } from "../../audio-io/mic";
import { audioNow } from "../../engine/engine";
import { record, type Recording } from "../../engine/recorder";
import { audioContext } from "../../engine/context";
import { saveRecording, useLibrary } from "../../library/library";
import { trimSilence } from "../../library/wav";
import { platform } from "../../platform";
import { useSettings } from "../../state/settings";

/** Microphone recording into the library: device, input meter, monitor, record/stop, auto-trim. */
export function RecorderStrip() {
  const mic = useMic();
  const inputDeviceId = useSettings((s) => s.inputDeviceId);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [rec, setRec] = useState<Recording | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [monitor, setMonitor] = useState(false);
  const [trim, setTrim] = useState(true);

  useEffect(() => {
    const load = () =>
      platform.media.devices().then((d) => setDevices(d.filter((x) => x.kind === "audioinput")));
    load();
    return platform.media.onDevicesChange(load);
  }, [mic.status]);

  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setElapsed(rec.captured()), 100);
    return () => clearInterval(t);
  }, [rec]);

  // monitoring: hear the input directly
  useEffect(() => {
    if (!monitor || mic.status !== "on") return;
    let src: MediaStreamAudioSourceNode | null = null;
    void openMic().then((s) => {
      src = s;
      s.connect(audioContext().destination);
    });
    return () => {
      try {
        src?.disconnect(audioContext().destination);
      } catch {
        // already disconnected
      }
    };
  }, [monitor, mic.status]);

  const start = async () => {
    try {
      const src = await openMic();
      const r = await record(src, audioNow() + 0.02);
      setRec(r);
      setElapsed(0);
    } catch {
      toast("The microphone isn't available", "error");
    }
  };

  const stop = async () => {
    if (!rec) return;
    rec.stop();
    setRec(null);
    let chans = await rec.done;
    const sr = audioContext().sampleRate;
    if (trim) chans = trimSilence(chans, sr, 0.008);
    if (!chans[0]?.length) return toast("Nothing was recorded (only silence)", "error");
    const id = await saveRecording(chans, sr, `Recording ${new Date().toLocaleTimeString()}`);
    if (id) {
      useLibrary.getState().set({ selectedId: id });
      toast("Saved to Recordings");
    }
  };

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-2.5 py-2"
      data-testid="recorder"
    >
      <Mic size={13} className="text-dim" />
      <select
        className="input !h-6 max-w-[160px] !text-[11px]"
        value={inputDeviceId}
        onChange={(e) => useSettings.getState().set({ inputDeviceId: e.target.value })}
        title="Input device"
      >
        <option value="">Default input</option>
        {devices
          .filter((d) => d.deviceId && d.deviceId !== "default")
          .map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Input ${i + 1}`}
            </option>
          ))}
      </select>
      <LevelMeter read={() => micLevel()} width={60} height={9} title="Input level" />
      <button
        className="tool-btn"
        data-active={monitor}
        title="Monitor the input (use headphones)"
        onClick={() =>
          mic.status === "on" ? setMonitor(!monitor) : openMic().then(() => setMonitor(true))
        }
      >
        <Headphones size={13} />
      </button>
      <label className="flex items-center gap-1 text-[10.5px] text-dim">
        <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} /> Trim
        silence
      </label>
      <span className="flex-1" />
      {rec ? (
        <button
          className="hw-btn !min-h-[26px] !flex-row gap-1.5"
          style={{ color: "#ef4444", borderColor: "#ef4444" }}
          onClick={stop}
          data-testid="rec-stop"
        >
          <Square size={10} fill="currentColor" /> {elapsed.toFixed(1)} s
        </button>
      ) : (
        <button
          className="hw-btn !min-h-[26px] !flex-row gap-1.5"
          onClick={start}
          data-testid="rec-start"
        >
          <Circle size={10} fill="#ef4444" stroke="#ef4444" /> Record
        </button>
      )}
      {mic.status === "denied" && (
        <span className="w-full text-[10.5px] text-[#fca5a5]">
          Microphone access was denied. Allow it in the browser's site settings.
        </span>
      )}
      {mic.status === "on" && !rec && (
        <button
          className="text-[10px] text-faint hover:text-ink"
          onClick={closeMic}
          title="Release the microphone"
        >
          Release mic
        </button>
      )}
    </div>
  );
}
