/**
 * Explain-mode hints for the Beatbox panel (prefix: "beatbox.").
 */
import type { Hints } from "./types";

const hints: Hints = {
  // ─── Toolbar ─────────────────────────────────────────────────────────────

  "beatbox.voice": {
    title: "Voice",
    text: "Whose beatboxing this is. Every voice has its own recordings and calibration, so several people can teach Rebeat their sounds. New voice, rename and remove are in this menu.",
    guide: "beatbox-voices",
  },
  "beatbox.record": {
    title: "Record",
    text: "Record from the microphone: single sounds (one class, again and again, to teach the model) or a take (a beat to turn into step tracks).",
    guide: "beatbox-recording",
  },
  "beatbox.add": {
    title: "Add",
    text: "Add audio files, a folder, a link (a strudel.json or GitHub repository) or the selected Clip track's recording. File and folder names like “kick2.wav” or “snares/” label their hits.",
    guide: "beatbox-recording",
  },
  "beatbox.model": {
    title: "The model",
    text: "The beatbox model downloads the first time you open this panel (about 6 MB) and then works offline. It guesses what every hit is; your labels calibrate it to your voice.",
    guide: "beatbox-model",
  },
  "beatbox.view": {
    title: "Recordings or Model",
    text: "Recordings: label hits and convert takes. Model: how well the model knows this voice, per class, and what to record next.",
    guide: "beatbox-model",
  },
  "beatbox.menu": {
    title: "Datasets",
    text: "Export this voice's recordings (or every voice's) as a dataset zip: WAVs plus hits.csv, the format Rebeat's model trains on. Import brings a dataset back in, labels and all.",
    guide: "beatbox-datasets",
  },

  // ─── Recordings ──────────────────────────────────────────────────────────

  "beatbox.filter": {
    title: "Filter",
    text: "Show every recording, or only those with hits to look at: unlabeled ones, uncertain guesses, or hits where your label and the model's guess differ.",
    guide: "beatbox-labeling",
  },
  "beatbox.list": {
    title: "Recordings",
    text: "This voice's recordings with their labels per class. Double-click a name to rename; right-click to move it to another voice, switch between single sounds and take, or remove it.",
    guide: "beatbox-labeling",
  },
  "beatbox.kind": {
    title: "Single sounds or take",
    text: "Single sounds teach the model one class at a time. A take is a beat: it gets a Convert tab that turns it into step tracks.",
    guide: "beatbox-recording",
  },
  "beatbox.play": {
    title: "Play",
    text: "Hear the whole recording (a take loops). It plays on the preview output, not through the mixer.",
    keys: "P",
    guide: "beatbox-labeling",
  },
  "beatbox.sensitivity": {
    title: "Sensitivity",
    text: "How quiet a sound can be and still count as a hit when you press Find hits. Higher finds ghost notes, lower ignores breaths and room noise.",
    guide: "beatbox-labeling",
  },
  "beatbox.find": {
    title: "Find hits",
    text: "Find the hits again with the sensitivity you set. Hits you labeled yourself stay where they are.",
    guide: "beatbox-labeling",
  },
  "beatbox.wave": {
    title: "Hits",
    text: "Every hit is a region in its class's color: solid for your labels, dashed for the model's guesses (with its confidence). Click a hit to hear and select it, drag its edges to trim it, drag over empty space to add one.",
    keys: "Shift/⌘+click: several · Ctrl/⌘+wheel: zoom · wheel: scroll · double-click: show all",
    guide: "beatbox-labeling",
  },
  "beatbox.labels": {
    title: "Label",
    text: "Give the selected hits a class. Your labels are what the model learns your voice from, and what a take converts with.",
    keys: "1–8: label · 0: clear · Tab / Shift+Tab: the next or previous hit to check · ←/→: next or previous hit",
    guide: "beatbox-labeling",
  },
  "beatbox.accept": {
    title: "Accept guess",
    text: "Take the model's guess as your label, for the selected hits, or for every unlabeled hit when none is selected.",
    keys: "Enter",
    guide: "beatbox-labeling",
  },
  "beatbox.remove-hit": {
    title: "Remove hit",
    text: "Remove the selected hits: a breath or a click that isn't a sound you meant.",
    keys: "Delete",
    guide: "beatbox-labeling",
  },

  // ─── Record dialog ───────────────────────────────────────────────────────

  "beatbox.record.kind": {
    title: "What to record",
    text: "Single sounds: one class, repeated, labeled for you. A take: a beat, to the metronome or free.",
    guide: "beatbox-recording",
  },
  "beatbox.record.class": {
    title: "Class",
    text: "The sound you're going to make. Every hit found in the recording gets this label.",
    guide: "beatbox-recording",
  },
  "beatbox.record.count": {
    title: "Times",
    text: "How many times you make the sound. Ten of each class is a good start for calibration.",
    guide: "beatbox-recording",
  },
  "beatbox.record.pace": {
    title: "Pace",
    text: "How often the light flashes for the next sound.",
    guide: "beatbox-recording",
  },
  "beatbox.record.click": {
    title: "Click",
    text: "Play a click as well as the light. With speakers the microphone hears the clicks too, so use headphones.",
    guide: "beatbox-recording",
  },
  "beatbox.record.mode": {
    title: "To the metronome or free",
    text: "To the metronome: a bar of count-in, then the bars you choose at the project's tempo, so the take lines up with the grid. Free: record until you press Stop; Rebeat finds the tempo.",
    guide: "beatbox-recording",
  },
  "beatbox.record.bars": {
    title: "Bars",
    text: "How long the take is. Play your pattern a few times: repetitions help clean up the result.",
    guide: "beatbox-recording",
  },

  // ─── Convert ─────────────────────────────────────────────────────────────

  "beatbox.convert.tempo": {
    title: "Tempo and first beat",
    text: "Where the grid lies on the take. A take recorded to the metronome knows both; for others, Detect finds them from the hits, and you can drag either value to fit. The grid shows on the waveform.",
    guide: "beatbox-converting",
  },
  "beatbox.convert.step": {
    title: "Steps",
    text: "The step size of the new tracks: 1/16 for most beats, 1/32 for fast rolls, triplets for shuffles.",
    guide: "beatbox-converting",
  },
  "beatbox.convert.timing": {
    title: "Timing",
    text: "Snap puts every hit right on its step. Keep feel keeps how early or late you were as the step's nudge; Strength says how much of it.",
    guide: "beatbox-converting",
  },
  "beatbox.convert.velocity": {
    title: "Velocity",
    text: "Detected: louder hits get higher velocities, from Min to Max, so ghost notes stay quiet. Constant: every hit gets the same velocity.",
    guide: "beatbox-converting",
  },
  "beatbox.convert.quiet": {
    title: "Drop quiet hits",
    text: "Hits this far below the loudest one in the take don't make it onto the steps.",
    guide: "beatbox-converting",
  },
  "beatbox.convert.repeats": {
    title: "Repetitions",
    text: "Fold into one pattern: every repetition votes, and a step keeps a hit when most of them have it (velocity and nudge averaged). Keep every bar: the whole take, on pages one after the other.",
    guide: "beatbox-converting",
  },
  "beatbox.convert.bars": {
    title: "Pattern length",
    text: "How many bars one pattern is. Auto finds the length your pattern repeats at.",
    guide: "beatbox-converting",
  },
  "beatbox.convert.grid": {
    title: "The result",
    text: "One row per class, as the steps it becomes; brighter steps are louder. A ! on the waveform marks a hit whose class disagrees with the other repetitions.",
    guide: "beatbox-converting",
  },
  "beatbox.convert.include": {
    title: "Include",
    text: "Whether this class becomes a track. Other is off at first.",
    guide: "beatbox-converting",
  },
  "beatbox.convert.sound": {
    title: "Sound",
    text: "What the track plays: your own hit (the most typical one in this take, saved to the library under Beatbox), the matching kit sound, or any sample you drop here from the library.",
    guide: "beatbox-converting",
  },
  "beatbox.convert.preview": {
    title: "Hear",
    text: "Loop the original take, the result, or both together, before you make any tracks. The preview follows your changes.",
    guide: "beatbox-converting",
  },
  "beatbox.convert.create": {
    title: "Create tracks",
    text: "Add one step track per class to the page you're editing (or new pages for Keep every bar), and mute the take's Clip track. One undo takes it all back.",
    guide: "beatbox-converting",
  },

  // ─── Model ───────────────────────────────────────────────────────────────

  "beatbox.model.voice": {
    title: "Your voice",
    text: "How many labeled examples this voice has per class, and how often the model gets them right: alone, and calibrated to your examples. Each hit is judged without its own label.",
    guide: "beatbox-model",
  },
  "beatbox.model.about": {
    title: "About the model",
    text: "Which model this is, what it was trained on and how well it does on voices it never heard.",
    guide: "beatbox-model",
  },
};

export default hints;
