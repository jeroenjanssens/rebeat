import type { Hints } from "./types";

const hints: Hints = {
  // ── Pads ──────────────────────────────────────────────────────────────────
  "perf.pad": {
    title: "Performance pad",
    text: "Triggers this track. Higher on the pad is louder. While recording, hits are written into the pattern.",
    guide: "performance-the-performance-panel",
  },
  // ── Page launcher ─────────────────────────────────────────────────────────
  "perf.page": {
    title: "Page / pattern slot",
    text: "Click to select this page for editing, or to queue it to play next (when the transport is running). The playing page is lit; the queued one pulses.",
    guide: "performance-the-performance-panel",
  },
  // ── Mutes ─────────────────────────────────────────────────────────────────
  "perf.mute": {
    title: "Mute / solo",
    text: "Click to mute this track. Shift+click to solo it (mutes all others). Right-click to assign it to crossfader side A or B.",
    keys: "Shift+click: solo · Right-click: crossfader side",
    guide: "performance-the-performance-panel",
  },
  "perf.muteGroup": {
    title: "Mute group",
    text: "Mutes or unmutes all the tracks in this group at once. Right-click to choose which tracks belong to it.",
    keys: "Right-click: choose tracks",
    guide: "performance-the-performance-panel",
  },
  "perf.queueBar": {
    title: "Queue to bar",
    text: "When on, mute and group changes wait until the start of the next bar so they snap in on the beat.",
    guide: "performance-the-performance-panel",
  },
  // ── Scratch ───────────────────────────────────────────────────────────────
  "perf.scratch.track": {
    title: "Scratch track",
    text: "Choose which audio track to scratch. The track must have a sample loaded.",
    guide: "performance-the-performance-panel",
  },
  "perf.scratch.platter": {
    title: "Platter",
    text: "Drag around the platter to scratch the audio track. The record spins at normal speed when not touched. Right-click to map a MIDI jog wheel.",
    keys: "Drag: scratch · Right-click: MIDI learn jog wheel",
    guide: "performance-the-performance-panel",
  },
  "perf.scratch.cut": {
    title: "Cut",
    text: "Hold to silence the track while scratching, like a DJ fader cut. Release to hear the sound again.",
    guide: "performance-the-performance-panel",
  },
  "perf.scratch.sync": {
    title: "Sync / Keep pos",
    text: "Sync: snaps back to the beat when you release the platter. Keep pos: carries on from where you let go.",
    guide: "performance-the-performance-panel",
  },
  // ── Master FX — filter ────────────────────────────────────────────────────
  "perf.filter": {
    title: "Filter sweep",
    text: "Turn left for a low-pass sweep, right for a high-pass sweep over the whole mix. The centre position is fully open.",
    keys: "Right-click: MIDI learn",
    guide: "performance-the-performance-panel",
  },
  // ── Master FX — beat repeat ───────────────────────────────────────────────
  "perf.rpt.1_4": {
    title: "Beat repeat ¼",
    text: "Hold to loop the current quarter-note slice of the mix in real time.",
    guide: "performance-the-performance-panel",
  },
  "perf.rpt.1_8": {
    title: "Beat repeat ⅛",
    text: "Hold to loop the current eighth-note slice of the mix in real time.",
    guide: "performance-the-performance-panel",
  },
  "perf.rpt.1_16": {
    title: "Beat repeat 1/16",
    text: "Hold to loop the current sixteenth-note slice of the mix in real time.",
    guide: "performance-the-performance-panel",
  },
  "perf.rpt.1_32": {
    title: "Beat repeat 1/32",
    text: "Hold to loop the current thirty-second-note slice of the mix in real time.",
    guide: "performance-the-performance-panel",
  },
  // ── Master FX — throws ────────────────────────────────────────────────────
  "perf.throwVerb": {
    title: "Throw reverb",
    text: "Hold to feed the whole mix into the reverb bus while held, creating a dramatic reverb wash on release.",
    guide: "performance-the-performance-panel",
  },
  "perf.throwDelay": {
    title: "Throw delay",
    text: "Hold to feed the whole mix into the delay bus while held, for a tempo-synced echo throw.",
    guide: "performance-the-performance-panel",
  },
  "perf.tapeStop": {
    title: "Tape stop",
    text: "Slows the mix to a halt like a turntable stopping. Click again to restart.",
    guide: "performance-the-performance-panel",
  },
  // ── Crossfader ────────────────────────────────────────────────────────────
  "perf.crossfader": {
    title: "Crossfader",
    text: "Fades between tracks on side A (left) and side B (right). Tracks not assigned to a side are not affected. Double-click to centre.",
    keys: "Double-click: centre",
    guide: "performance-the-performance-panel",
  },
  // ── Tempo ─────────────────────────────────────────────────────────────────
  "perf.tap": {
    title: "Tap tempo",
    text: "Tap several times in rhythm to set the BPM. The tempo settles after a few taps.",
    command: "transport.tap",
    guide: "performance-the-performance-panel",
  },
  "perf.bpmDown": {
    title: "BPM −1",
    text: "Nudges the tempo down by 1 BPM.",
    command: "transport.bpmDown",
    guide: "performance-the-performance-panel",
  },
  "perf.bpmUp": {
    title: "BPM +1",
    text: "Nudges the tempo up by 1 BPM.",
    command: "transport.bpmUp",
    guide: "performance-the-performance-panel",
  },
};

export default hints;
