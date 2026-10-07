/**
 * Like Tone.Offline, but on a native OfflineAudioContext. Tone's default wrapper
 * (standardized-audio-context) is slower and rejects some node settings the engine uses (e.g. a
 * stereo panner mode), so offline renders would differ from, or fail where, live playback works.
 */
import * as Tone from "tone";

export async function renderOffline(
  build: () => Promise<void> | void,
  duration: number,
  channels: number,
  sampleRate: number,
): Promise<AudioBuffer> {
  const native = new OfflineAudioContext(
    channels,
    Math.max(1, Math.ceil(duration * sampleRate)),
    sampleRate,
  );
  const context = new Tone.OfflineContext(native);
  const original = Tone.getContext();
  Tone.setContext(context);
  try {
    await build();
  } catch (e) {
    Tone.setContext(original);
    throw e;
  }
  const rendering = context.render();
  Tone.setContext(original);
  const buffer = await rendering;
  void context.dispose();
  return buffer.get()!;
}
