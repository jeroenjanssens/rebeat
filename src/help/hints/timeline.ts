import type { Hints } from "./types";

const hints: Hints = {
  "dm.section.settings": {
    title: "Section settings",
    text: "This section changes something for itself only: tracks muted here, a transpose, a fill, or fewer steps. Its clones keep the link. Hover to read which.",
    keys: "Right-click the section: change or clear them",
    guide: "timeline-section-settings",
  },
  "timeline.section": {
    title: "Section",
    text: "A section of the song, as long as it plays, its pattern drawn once per repeat. Click to edit it (while playing, it's queued). Right-click for the section menu and its own settings.",
    keys: "Drag: move · Alt+drag: copy · Alt+Shift+drag: clone · Shift+click: a range · ⌘D / ⇧⌘D: duplicate · Delete · Double-click: the drum machine",
    guide: "timeline-sections-in-song-time",
  },
  "timeline.section-edge": {
    title: "Repeats",
    text: "Drag to set how many times the section plays. With Alt, drag to set how many of its pattern's steps it plays (a stop, a pickup).",
    keys: "Alt+drag: play only the first … steps",
    guide: "timeline-sections-in-song-time",
  },
  "timeline.ruler": {
    title: "Ruler",
    text: "Bars, and the time under them (it follows the tempo changes). Every section starts a bar. Click to put the start marker there: Play starts at that bar.",
    keys: "Double-click: play from there",
    guide: "timeline-the-ruler-and-where-play-starts",
  },
  "timeline.tempo": {
    title: "Tempo lane",
    text: "Tempo changes over the song: jumps and ramps, eased. Open it to edit them; its header shows the start tempo. Double-click: the changes as a table in the Inspector.",
    guide: "timeline-tempo-changes",
  },
  "timeline.tempo.lane": {
    title: "Tempo changes",
    text: "Click to add a tempo change, drag it up or down or sideways. Right-click: jump to the tempo there, or ramp to it from the change before.",
    keys: "Shift+drag: tenths of a BPM, free · Double-click: delete",
    guide: "timeline-tempo-changes",
  },
  "timeline.tempo.menu": {
    title: "Tempo lane menu",
    text: "Edit the tempo changes in the Inspector: a table with each change's position, tempo, ramp and eases.",
    guide: "timeline-editing-points-in-the-inspector",
  },
  "timeline.lane": {
    title: "Automation lane",
    text: "A knob over the song. Click the line to add a point on it, elsewhere for one at that height; drag points to move them. Right-click a point for its eases (how the curve arrives and leaves). Turning the knob itself overrides the lane until Back to automation.",
    keys: "Shift+drag: free · Double-click or Delete: remove · Drag a box or Shift+click: select · Double-click the lane's name: its points in the Inspector",
    guide: "timeline-automation",
  },
  "timeline.lane.on": {
    title: "Automation on or off",
    text: "Off, the knob's own value plays, and the lane keeps its points.",
    guide: "timeline-automation",
  },
  "timeline.lane.menu": {
    title: "Lane menu",
    text: "Clear the lane's points, or delete the lane.",
    guide: "timeline-automation",
  },
  "timeline.track.automate": {
    title: "Automate",
    text: "Pick one of this track's knobs to automate: its level, pan, sends, EQ, filter or macros, and some effect knobs.",
    guide: "timeline-automation",
  },
  "timeline.track.cell": {
    title: "Mute in a section",
    text: "Click a section's cell to mute this track there only (hatched). Its clones still play it. Click again to unmute.",
    guide: "timeline-section-settings",
  },
  "timeline.region": {
    title: "Audio on the timeline",
    text: "A sample in song time, across sections, through its track. Drag to move it, the edges to trim, the top corners to fade. While it plays, the track's own clip is silent.",
    keys: "Alt+drag: copy · S: split at the playhead · Delete · Right-click: gain",
    guide: "timeline-audio-on-the-timeline",
  },
  "timeline.snap": {
    title: "Snap",
    text: "What drags snap to: bars, beats, 16ths or nothing. Bars and beats count from each section.",
    keys: "Shift while dragging: free",
    guide: "timeline-the-ruler-and-where-play-starts",
  },
  "timeline.tracks": {
    title: "Track rows",
    text: "Show every track, only the tracks with automation or audio on the timeline, or none.",
    guide: "timeline",
  },
  "timeline.automate": {
    title: "Add automation",
    text: "Pick a knob to automate: tracks, buses and the master. The lane starts with a point at the start marker, at the knob's value.",
    guide: "timeline-automation",
  },
  "timeline.back-to-automation": {
    title: "Back to automation",
    text: "You turned automated knobs (or typed a tempo), which overrides their lanes. This brings every overridden lane back.",
    guide: "timeline-automation",
  },
  "timeline.arm-automation": {
    title: "Arm automation",
    text: "While recording in Song mode, turning a knob that can be automated writes its moves as points on its lane. The same switch is in Rec ▾ in the top bar, and Rec shows an A while it's armed.",
    guide: "timeline-automation",
  },
  "transport.record-automation": {
    title: "Record automation",
    text: "While recording in Song mode, turning a knob that can be automated writes its moves as automation points, where they happen in the song. When the take ends they're thinned and replace the lane's points under them; one undo step.",
    guide: "timeline-automation",
  },
  "timeline.zoom": {
    title: "Zoom",
    text: "Zoom out, fit the whole song, or zoom in.",
    keys: "⌘+scroll: zoom around the pointer",
    guide: "timeline-the-ruler-and-where-play-starts",
  },
  "timeline.follow": {
    title: "Follow",
    text: "Keep the playhead in view while the song plays (the drum machine follows the playing section too).",
    guide: "timeline-the-ruler-and-where-play-starts",
  },
  "timeline.drop": {
    title: "New audio track",
    text: "Drop a sample here: a new audio track with the sample on the timeline, where you drop it. It plays in song time, across sections.",
    guide: "timeline-audio-on-the-timeline",
  },
};

export default hints;
