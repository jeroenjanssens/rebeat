import { useState } from "react";
import { Dialog } from "../components/Dialog";
import { openMic } from "../audio-io/mic";
import { audioContext } from "../engine/context";
import { audioNow } from "../engine/engine";
import { record } from "../engine/recorder";
import { detectOnsets } from "../library/analysis";
import { useSettings } from "../state/settings";

const CLICKS = 8;
const GAP = 0.5;

/**
 * Loopback calibration: play clicks through the speakers, record them with the microphone,
 * and measure how late they arrive. That round-trip time is the recording latency.
 */
export function CalibrationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, setState] = useState<"intro" | "running" | "done" | "error">("intro");
  const [result, setResult] = useState<{ ms: number; spread: number; found: number } | null>(null);
  const [error, setError] = useState("");

  const run = async () => {
    setState("running");
    try {
      const mic = await openMic();
      const ctx = audioContext();
      const t0 = audioNow() + 0.3;
      const rec = await record(mic, t0, t0 + CLICKS * GAP + 0.6);
      for (let i = 0; i < CLICKS; i++) {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.frequency.value = 2000;
        const t = t0 + 0.1 + i * GAP;
        env.gain.setValueAtTime(0.9, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
        osc.connect(env).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.03);
      }
      const chans = await rec.done;
      const mono = chans[0];
      const onsets = detectOnsets({ data: mono, sampleRate: ctx.sampleRate }, 0.7, 0.2);
      // match each click to the first onset after it
      const delays: number[] = [];
      for (let i = 0; i < CLICKS; i++) {
        const expected = 0.1 + i * GAP;
        const hit = onsets.find((o) => o >= expected - 0.005 && o < expected + GAP * 0.8);
        if (hit !== undefined) delays.push(hit - expected);
      }
      if (delays.length < 4)
        throw new Error("Couldn't hear the clicks. Turn up the speakers and move the mic closer.");
      delays.sort((a, b) => a - b);
      const median = delays[Math.floor(delays.length / 2)];
      setResult({
        ms: Math.round(median * 1000),
        spread: Math.round((delays[delays.length - 1] - delays[0]) * 1000),
        found: delays.length,
      });
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Recording latency calibration"
      width={460}
    >
      <div className="flex flex-col gap-3 p-4 text-[12.5px]">
        {state === "intro" && (
          <>
            <p className="text-dim">
              Rebeat plays a few clicks and records them with your microphone, to measure how late
              recordings arrive. Use speakers (not headphones), or a loopback cable from your
              interface's output to its input.
            </p>
            <button className="hw-btn self-start" onClick={run}>
              Start
            </button>
          </>
        )}
        {state === "running" && (
          <p className="text-dim">Listening… keep quiet for a few seconds.</p>
        )}
        {state === "done" && result && (
          <>
            <p>
              Measured latency: <span className="num text-lit">{result.ms} ms</span>{" "}
              <span className="text-faint">
                ({result.found}/{CLICKS} clicks, spread {result.spread} ms)
              </span>
            </p>
            <div className="flex gap-2">
              <button
                className="hw-btn"
                onClick={() => {
                  useSettings.getState().set({ recordLatencyMs: Math.max(0, result.ms) });
                  onClose();
                  setState("intro");
                }}
              >
                Use {result.ms} ms
              </button>
              <button className="tool-btn border border-line" onClick={run}>
                Measure again
              </button>
            </div>
          </>
        )}
        {state === "error" && (
          <>
            <p className="text-[#fca5a5]">{error}</p>
            <button className="tool-btn self-start border border-line" onClick={run}>
              Try again
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
}
