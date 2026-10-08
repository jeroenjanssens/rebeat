/**
 * Explain-mode hints for the Library panel (prefix: "library.").
 */
import type { Hints } from "./types";

const hints: Hints = {
  // ─── Toolbar ─────────────────────────────────────────────────────────────

  "library.location": {
    title: "Location",
    text: "Switch between All samples, Favorites, Used in project, Recordings, your folders, the built-in kits, and Online kits.",
    guide: "library-finding-sounds",
  },
  "library.search": {
    title: "Search",
    text: "Filter the list by name, folder or tag. Start typing to narrow down immediately.",
    guide: "library-finding-sounds",
  },
  "library.filter": {
    title: "Filter",
    text: "Filter by type (loops or one-shots), length (short / medium / long) and tag. The button turns highlighted when a filter is active.",
    guide: "library-finding-sounds",
  },
  "library.sort": {
    title: "Sort",
    text: "Sort the list by name, duration or date added, in either direction. The button shows the current order; it applies everywhere, built-in kits included.",
    guide: "library-finding-sounds",
  },
  "library.import.files": {
    title: "Import files",
    text: "Pick audio files or zip archives to add to the library. You can also drop files directly onto the library panel.",
    guide: "library-importing",
  },
  "library.import.folder": {
    title: "Import folder",
    text: "Pick a whole folder to import. All supported audio files inside it are added, preserving the folder structure.",
    guide: "library-importing",
  },

  // ─── Sidebar ─────────────────────────────────────────────────────────────

  "library.sidebar": {
    title: "Location",
    text: "Switch what the list shows. Drag a sample onto a folder button to move it there.",
    keys: "Drop sample: move to folder",
    guide: "library-finding-sounds",
  },

  // ─── Kit header ──────────────────────────────────────────────────────────

  "library.kit.header": {
    title: "Kit header",
    text: "Shows the name and number of sounds in this built-in kit. Drag it onto the drum machine to load the whole kit at once.",
    keys: "Drag onto drum machine: load kit",
    guide: "library-kits",
  },
  "library.kit.load": {
    title: "Load kit as tracks",
    text: "Adds all sounds of this kit as new drum tracks in one go. Each sound becomes its own track.",
    guide: "library-kits",
  },

  // ─── Sample list ─────────────────────────────────────────────────────────

  "library.sample": {
    title: "Sample",
    text: "Click to preview this sound. Drag it onto a track to replace its sound, or onto the drop zone below the tracks to create a new track. Double-click to open it in the sample editor.",
    keys: "Click: preview · Drag: use on track · Double-click: open in editor · Right-click: more options · ↑↓: navigate list · Enter: add as track · Space: replay · Esc: stop",
    guide: "library-listening",
  },
  "library.sample.favorite": {
    title: "Favorite",
    text: "Marks this sample as a favorite. Favorites appear in the Favorites location for quick access.",
    guide: "library-finding-sounds",
  },

  // ─── Footer ──────────────────────────────────────────────────────────────

  "library.preview.volume": {
    title: "Preview volume",
    text: "Sets how loud samples play when you click them to preview. Doesn't affect the project volume.",
    guide: "library-listening",
  },
  "library.sync": {
    title: "Sync",
    text: "When on, loops preview at the song tempo and start in sync with the beat. Turn it on to audition a loop in context.",
    guide: "library-listening",
  },

  // ─── Online kits ─────────────────────────────────────────────────────────

  "library.online.search": {
    title: "Search drum machines and sounds",
    text: "Type a machine (808, Linn) or a sound (hat, snare, cowbell), or both. Matching kits come first, then every matching sound across all kits, so you can compare, say, hi-hats from different machines.",
    guide: "library-kits",
  },
  "library.online.machine": {
    title: "Drum machine",
    text: "Click to show or hide its sounds. Nothing is downloaded until you listen to or add a sound.",
    guide: "library-kits",
  },
  "library.online.addkit": {
    title: "Add the kit to the library",
    text: "Downloads one of each sound type into your library, in the folder Kits/<machine>, without adding tracks.",
    guide: "library-kits",
  },
  "library.online.load": {
    title: "Load as tracks",
    text: "Adds one of each sound type to your library and a track for each to your project.",
    guide: "library-kits",
  },
  "library.online.sound": {
    title: "Online sound",
    text: "Click to hear it; it doesn't go into your library. Drag it onto a track to use it there (it's added to the library then).",
    keys: "Drag onto a track: replace its sound · Alt+drop: add as a new track · Drop below the tracks: new track",
    guide: "library-kits",
  },
  "library.online.add": {
    title: "Add to the library",
    text: "Downloads this one sound into your library, in the folder Kits/<machine>.",
    guide: "library-kits",
  },

  // ─── Recorder strip ──────────────────────────────────────────────────────

  "library.recorder.device": {
    title: "Input device",
    text: "Select which microphone or audio input to record from.",
    guide: "library-recording-into-the-library",
  },
  "library.recorder.level": {
    title: "Input level",
    text: "Shows the live input level from your microphone. Check that it moves before you hit Record.",
    guide: "library-recording-into-the-library",
  },
  "library.recorder.monitor": {
    title: "Monitor",
    text: "Sends the microphone input directly to your speakers so you can hear yourself while recording. Use headphones to avoid feedback.",
    guide: "library-recording-into-the-library",
  },
  "library.recorder.trim": {
    title: "Trim silence",
    text: "Automatically removes silence at the start and end of the recording when you stop.",
    guide: "library-recording-into-the-library",
  },
  "library.recorder.record": {
    title: "Record",
    text: "Start recording from the microphone. The recording is saved as a new sample in the Recordings folder when you stop.",
    guide: "library-recording-into-the-library",
  },
  "library.recorder.stop": {
    title: "Stop recording",
    text: "Stops the recording and saves it as a new sample. The elapsed time is shown while recording.",
    guide: "library-recording-into-the-library",
  },
  "library.recorder.release": {
    title: "Release mic",
    text: "Releases the microphone access so other apps can use it. The browser keeps the mic open until you release it or reload.",
    guide: "library-recording-into-the-library",
  },
};

export default hints;
