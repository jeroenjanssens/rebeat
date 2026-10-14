/**
 * What the synth editor's piano and wheels show besides your own clicks: the notes the keys play
 * into this synth (a MIDI keyboard such as the MiniLab 3, the computer keys, Hold, the play
 * styles' strums and arpeggios), lit as they sound, and the device's pitch bend and mod wheel.
 */
import { useEffect, useState } from "react";
import { onFrame } from "../../render/raf";
import { audioNow } from "../../engine/engine";
import { keysPlayInto, onKeysControl, onKeysLight } from "../../state/keys";

export interface KeysOwner {
  trackId?: string;
  panelId?: string;
}

/** The pitches sounding through the keys into this synth now, with their loudest velocity. */
export function useHeard(owner: KeysOwner): Map<number, number> {
  const [heard, setHeard] = useState<Map<number, number>>(() => new Map());
  const { trackId, panelId } = owner;
  useEffect(() => {
    let queue: { pitch: number | null; on: boolean; at: number; velocity: number }[] = [];
    // the velocities sounding on each pitch (two notes can share one)
    const sounding = new Map<number, number[]>();
    const offLight = onKeysLight((pitch, on, at, velocity) => {
      // a note that starts elsewhere isn't ours; stops are always applied
      if (on && !keysPlayInto({ trackId, panelId })) return;
      queue.push({ pitch, on, at, velocity });
    });
    const offFrame = onFrame(() => {
      if (!queue.length) return;
      // the notes that started or stopped by now (a strum's later notes wait for their time)
      const now = audioNow() + 0.004;
      const due = queue.filter((e) => e.at <= now).sort((a, b) => a.at - b.at);
      if (!due.length) return;
      queue = queue.filter((e) => e.at > now);
      for (const e of due) {
        if (e.pitch === null) {
          sounding.clear();
          continue;
        }
        const v = sounding.get(e.pitch) ?? [];
        if (e.on) v.push(e.velocity);
        else if (v.includes(e.velocity)) v.splice(v.indexOf(e.velocity), 1);
        else v.pop();
        if (v.length) sounding.set(e.pitch, v);
        else sounding.delete(e.pitch);
      }
      setHeard(new Map([...sounding].map(([p, v]) => [p, Math.max(...v)])));
    });
    return () => {
      offLight();
      offFrame();
    };
  }, [trackId, panelId]);
  return heard;
}

/** The device's pitch bend and mod wheel as they reach this synth (null: not yet). */
export function useDeviceWheels(
  owner: KeysOwner,
  onWheel: (name: "pitchbend" | "modwheel", value: number) => void,
) {
  const { trackId, panelId } = owner;
  useEffect(
    () =>
      onKeysControl((name, value) => {
        if (name === "aftertouch" || !keysPlayInto({ trackId, panelId })) return;
        onWheel(name, value);
      }),
    // the callback sets state; it's the same for the editor's life
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trackId, panelId],
  );
}
