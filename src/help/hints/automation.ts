import type { Hints } from "./types";

const guide = "timeline-editing-points-in-the-inspector";

const hints: Hints = {
  "automation.back": {
    title: "Back to the track",
    text: "Show the selected track in the Inspector again. Choosing another track does the same.",
    guide,
  },
  "automation.on": {
    title: "Point on or off",
    text: "Off, the point stays but the curve skips it, as if it weren't there. It's drawn hollow on the lane.",
    guide,
  },
  "automation.position": {
    title: "Position",
    text: "Where the point is: bar, beat and 16th, as the ruler counts. The section it's in shows under it.",
    keys: "Drag sideways or scroll: a step of the Snap grid (Shift: a 16th) · Click: type 17.3.2, 17.3.2.5 or 6:3.2",
    guide,
  },
  "automation.value": {
    title: "Value",
    text: "The point's value in the knob's units (BPM for tempo changes).",
    keys: "Drag up or down or scroll (Shift: finer) · Click: type a value or a percentage · Double-click: the default",
    guide,
  },
  "automation.ease-in": {
    title: "Ease in",
    text: "How the curve arrives at this point: Linear, Smooth (settles slowly), Exponential or Bounce (lands and bounces back).",
    guide: "timeline-eases",
  },
  "automation.ease-out": {
    title: "Ease out",
    text: "How the curve leaves this point: Linear, Smooth (sets off slowly), Exponential, or None (holds, then jumps at the next point).",
    guide: "timeline-eases",
  },
  "automation.strength": {
    title: "Strength",
    text: "How much the ease shapes the curve: 0% is a straight line.",
    keys: "Drag or scroll · Click: type · Double-click: 50%",
    guide: "timeline-eases",
  },
  "automation.insert": {
    title: "Insert a point",
    text: "A new point halfway between these two, on the curve, so the line keeps its shape until you change it.",
    guide,
  },
  "automation.delete": {
    title: "Delete",
    text: "Delete this point. Select several rows and press Delete to remove them all.",
    guide,
  },
  "automation.ramp": {
    title: "Jump or ramp",
    text: "Jump to this tempo here, or ramp to it from the change before (eased by both ends).",
    guide: "timeline-tempo-changes",
  },
  "automation.add-marker": {
    title: "Add at the start marker",
    text: "A new point where the start marker (▼) is, on the curve.",
    guide,
  },
  "automation.add-last": {
    title: "Add after the last",
    text: "A new point one bar after the last one, at its value.",
    guide,
  },
};

export default hints;
