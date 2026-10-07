import type { Hints } from "./types";

const hints: Hints = {
  // ── Track strip ──────────────────────────────────────────────────────────
  "mixer.track.select": {
    title: "Track strip",
    text: "Click to select this track. The selected track is highlighted and shown in the inspector.",
    guide: "mixing-the-mixer",
  },
  "mixer.track.fx": {
    title: "Insert effects",
    text: "Opens the insert effect chain for this track. Click inside to add, reorder or remove effects.",
    guide: "mixing-effects",
  },
  "mixer.track.mute": {
    title: "Mute",
    text: "Silences this track without removing it from the mix. Click again to unmute.",
    guide: "mixing-the-mixer",
  },
  "mixer.track.solo": {
    title: "Solo",
    text: "Mutes every other track so you hear this one alone. Click again to unsolo.",
    guide: "mixing-the-mixer",
  },
  // ── Bus (return) strip ───────────────────────────────────────────────────
  "mixer.bus.fader": {
    title: "Return level",
    text: "Sets the output volume of this return bus (reverb or delay). Drag up or down; double-click for 0 dB.",
    keys: "Double-click: 0 dB",
    guide: "mixing-sends-reverb-and-delay",
  },
  "mixer.bus.mute": {
    title: "Mute return",
    text: "Silences this return bus so the reverb or delay is not heard.",
    guide: "mixing-sends-reverb-and-delay",
  },
  "mixer.bus.fx": {
    title: "Bus effects",
    text: "Opens the effect chain for this return bus. The reverb and delay live here by default.",
    guide: "mixing-effects",
  },
  // ── Master strip ─────────────────────────────────────────────────────────
  "mixer.master.fader": {
    title: "Master volume",
    text: "Sets the overall output level. Drag up or down; double-click for 0 dB.",
    keys: "Double-click: 0 dB",
    guide: "mixing-the-mixer",
  },
  "mixer.master.fx": {
    title: "Master chain",
    text: "Opens the master effect chain (EQ, compressor and limiter by default). Changes affect everything you hear.",
    guide: "mixing-effects",
  },
  "mixer.master.scope": {
    title: "Open master scope",
    text: "Opens the master scope panel for a larger oscilloscope and spectrum view of the output.",
    guide: "mixing-the-master-scope",
  },
  // ── Effect chain popover ─────────────────────────────────────────────────
  "mixer.fx.add": {
    title: "Add effect",
    text: "Choose an effect type from the list to add it at the end of the chain.",
    guide: "mixing-effects",
  },
  // ── Master scope ─────────────────────────────────────────────────────────
  "scope.mode": {
    title: "Scope mode",
    text: "Switch between overlaid L/R waveforms, a mono sum, the stereo X-Y image, or a frequency spectrum.",
    guide: "mixing-the-master-scope",
  },
  "scope.window": {
    title: "Time window",
    text: "How many milliseconds of audio the waveform displays (5–180 ms). Shorter shows faster transients.",
    guide: "mixing-the-master-scope",
  },
  "scope.freeze": {
    title: "Freeze",
    text: "Pauses the scope so you can study the current waveform without it updating.",
    guide: "mixing-the-master-scope",
  },
  "scope.trail": {
    title: "Trail",
    text: "How long previous traces stay visible. Higher values leave a glowing persistence effect.",
    guide: "mixing-the-master-scope",
  },
  "scope.brightness": {
    title: "Glow",
    text: "Adjusts the brightness and glow of the waveform traces.",
    guide: "mixing-the-master-scope",
  },
  "scope.display": {
    title: "Scope display",
    text: "Live view of what you hear after the master chain. The readout above shows RMS and peak level in dB.",
    guide: "mixing-the-master-scope",
  },
  // ── Guide search ─────────────────────────────────────────────────────────
  "guide.search": {
    title: "Search the guide",
    text: "Type to search all chapters and sections. Click a result to jump to it.",
    guide: "getting-started-getting-help",
  },
};

export default hints;
