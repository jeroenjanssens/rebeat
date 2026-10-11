/**
 * Controller maps (D124): what a known MIDI controller sends by default, as global mappings to
 * roles (the selected track's SOUND knobs, its volume and sends, the transport). Any slot can be
 * learned again; a map only sets a starting point. Pure data, unit-tested.
 */
import type { MidiMapping, MidiMode } from "../model/project";
import { ROLES, type PadsChannel } from "./mapping";

/** Command id for adding the current Playable sound as a track (WS-A registers it). */
const ADD_TRACK_CMD = "keys.add-track";

export type SlotKind = "knob" | "fader" | "encoder" | "button" | "pad";

export interface MapSlot {
  /** Stable id within the map ("knob1", "fader4", "encoder", "play"). */
  slot: string;
  label: string;
  type: "cc" | "note";
  /** 0..15 */
  channel: number;
  /** null: no factory assignment, learn it (the slot waits). */
  number: number | null;
  mode: MidiMode;
  target: string;
  /**
   * What kind of control this is (D129). Derived from the slot id when absent.
   * Only "knob" and "encoder" slots are sniffed for relative mode; faders are always absolute.
   */
  kind?: SlotKind;
  /** Numbers the map had for this slot before (wrong ones, fixed in an update): saved
   * mappings with one of them get the current number. A number you learned yourself is kept. */
  formerly?: number[];
}

export interface ControllerMap {
  id: string;
  name: string;
  /** Input port names that are this controller. */
  ports: RegExp;
  padsChannel: PadsChannel;
  slots: MapSlot[];
  /** Steps to put the device in the mode the map expects. */
  checklist: string[];
  /** What we couldn't confirm without the device (shown with the map). */
  unconfirmed?: string;
}

/**
 * Derive the kind of a slot from its slot id (D129). Used when `MapSlot.kind` is absent.
 * Faders are always absolute; only knobs and encoders are sniffed for relative mode.
 */
export function slotKind(slot: string): SlotKind {
  if (/^fader\d/.test(slot)) return "fader";
  if (/^knob\d/.test(slot)) return "knob";
  if (/^encoder\d*$/.test(slot)) return "encoder";
  if (/^pad\d/.test(slot)) return "pad";
  return "button";
}

const knobs = (ccs: (number | null)[], channel: number, mode: MidiMode): MapSlot[] =>
  ccs.map((number, i) => ({
    slot: `knob${i + 1}`,
    label: `Knob ${i + 1}`,
    type: "cc",
    channel,
    number,
    mode,
    target: ROLES.selectedSound(i + 1),
  }));

const FADER_TARGETS = [
  { label: "volume", target: ROLES.selectedVolume },
  { label: "Reverb send", target: ROLES.selectedMix("sendA") },
  { label: "Delay send", target: ROLES.selectedMix("sendB") },
  { label: "master volume", target: "master:volume" },
];

const faders = (ccs: number[], channel: number): MapSlot[] =>
  ccs.map((number, i) => ({
    slot: `fader${i + 1}`,
    label: `Fader ${i + 1} (${FADER_TARGETS[i].label})`,
    type: "cc",
    channel,
    number,
    mode: "absolute" as MidiMode,
    target: FADER_TARGETS[i].target,
  }));

export const CONTROLLER_MAPS: ControllerMap[] = [
  {
    id: "minilab3",
    name: "Arturia MiniLab 3",
    ports: /minilab ?3/i,
    padsChannel: 9,
    // ARTURIA mode, from the MiniLab 3 manual 1.0.5 (§5.4): knobs = Analog Lab's macros and
    // effects, faders = its EQ and master volume; the touch strips send pitch bend and CC 1.
    //
    // Main encoder (the large black knob, ARTURIA mode), as seen on Jeroen's MiniLab 3's MIDI
    // monitor (2026-10-11); the community dump (MaksPV/minilab3-mixxx-config, 2026-09-21) had
    // CC 28, 118 and 27, which never arrived:
    //   CC 114 (0x72) turn, rel64 (64 ± steps)
    //   CC 112 (0x70) turn with Shift held: the device sends another CC, rel64
    //   CC 115 (0x73) push, like a button (127 press, 0 release)
    //   CC 9 Shift button
    // Turn = browse the library (browse:sound); Shift + turn = by section (browse:section).
    slots: [
      ...knobs([74, 71, 76, 77, 93, 18, 19, 16], 0, "absolute"),
      ...faders([82, 83, 85, 17], 0),
      // Main encoder
      {
        slot: "encoder",
        label: "Main encoder (browse)",
        type: "cc",
        channel: 0,
        number: 114, // 0x72, seen on the device
        mode: "rel64",
        target: "browse:sound",
        kind: "encoder",
        formerly: [28],
      },
      // Encoder click → add track (WS-A registers keys.add-track)
      {
        slot: "encoder-click",
        label: "Main encoder click (add track)",
        type: "cc",
        channel: 0,
        number: 115, // 0x73, seen on the device
        mode: "absolute",
        target: `command:${ADD_TRACK_CMD}`,
        kind: "button",
        formerly: [118],
      },
      // Encoder turned with Shift held: the device sends its own CC
      {
        slot: "encoder-shift",
        label: "Main encoder with Shift (browse by section)",
        type: "cc",
        channel: 0,
        number: 112, // 0x70, seen on the device
        mode: "rel64",
        target: "browse:section",
        kind: "encoder",
      },
      // Shift button — used as modifier for browse:section; held state tracked internally
      {
        slot: "shift",
        label: "Shift (modifier)",
        type: "cc",
        channel: 0,
        number: 9, // seen on the device
        mode: "absolute",
        target: "modifier:shift",
        kind: "button",
        formerly: [27],
      },
    ],
    checklist: [
      "Put the MiniLab in ARTURIA mode: hold Shift and press Pad 3 until the display says Arturia.",
      "The pads play your step tracks (bank A: tracks 1–8, Shift + Pad 2 for bank B: 9–16).",
      "Turn the large encoder to browse sounds; Shift + turn jumps by section.",
      "In the pads' Key mode the large encoder is the Key dial: turn for the root, Shift + turn for the scale, press and turn to transpose, click to select the key it picked (or to undo the transpose).",
      "For Play, Stop and Record, switch to DAW mode (Shift + Pad 3) and use Shift + Pads 5–7: Rebeat listens to the MiniLab's MCU port.",
    ],
    unconfirmed:
      "Whether the knobs send absolute or relative values isn't documented; Rebeat notices relative knobs and switches by itself. The display SysEx format comes from community research (MaksPV/minilab3-mixxx-config, confirmed by MIDI dump) and is unconfirmed on real hardware — verify with Send test text.",
  },
];

/** Learn the transport in the Shortcuts dialog, if a device's buttons send something plain. */
const LEARN_BUTTONS =
  "Buttons such as Play or Record: learn them in the Shortcuts dialog (its MIDI column), or the right-click menu of the transport bar's buttons.";

CONTROLLER_MAPS.push(
  {
    id: "mpkmini3",
    name: "Akai MPK Mini MK3",
    ports: /mpk ?mini ?(mk ?)?(3|iii)\b/i,
    padsChannel: 9,
    // pads: bank A 36–43, bank B 44–51 on channel 10; joystick: pitch bend and CC 1
    slots: knobs([70, 71, 72, 73, 74, 75, 76, 77], 0, "absolute"),
    checklist: [
      "Use the factory program (Program 1), with the pads in Note mode.",
      "The pads play your step tracks (bank A: tracks 1–8, bank B: 9–16).",
      LEARN_BUTTONS,
    ],
    unconfirmed:
      "The knobs' CC numbers (70–77) come from Akai's factory program and couldn't be checked against the manual; if a knob does nothing, press Learn every control.",
  },
  {
    id: "launchkeymini3",
    name: "Novation Launchkey Mini MK3",
    ports: /launchkey mini( mk3| midi)/i,
    padsChannel: 9,
    // standalone: pots CC 21–28 on channel 1, drum-mode pads 36–51 on channel 10 (user guide 1.1)
    slots: knobs([21, 22, 23, 24, 25, 26, 27, 28], 0, "absolute"),
    checklist: [
      "Use the pads in Drum mode (Shift + the Drum pad button); they play tracks 1–16.",
      "Its transport buttons only send in DAW mode; " + LEARN_BUTTONS.toLowerCase(),
    ],
    unconfirmed:
      "Which pad sends which note (the top or the bottom row first) isn't documented for the Mini.",
  },
  {
    id: "launchkeymini4",
    name: "Novation Launchkey Mini MK4",
    ports: /launchkey mini (25|37)? ?mk4/i,
    padsChannel: 9,
    // endless encoders without factory CCs outside DAW mode: learn them; Play sends MIDI Start
    slots: knobs([null, null, null, null, null, null, null, null], 0, "rel64"),
    checklist: [
      "Its encoders have no factory assignment: press Learn every control and turn each one.",
      "Play sends MIDI Start (and Shift + Play Stop), which Rebeat follows.",
      "The pads (Drum mode) play tracks 1–16: the bottom row 1–8, the top row 9–16.",
    ],
  },
);

export const mapById = (id: string) => CONTROLLER_MAPS.find((m) => m.id === id);

/** A map as global mappings (fresh ids). */
export function mappingsOf(map: ControllerMap, uid: (p: string) => string): MidiMapping[] {
  return map.slots.flatMap((s) =>
    s.number === null
      ? []
      : [
          {
            id: uid("midi"),
            type: s.type,
            channel: s.channel,
            number: s.number,
            device: "",
            target: s.target,
            label: `${map.name} · ${s.label}`,
            mode: s.mode,
            slot: s.slot,
          },
        ],
  );
}

/**
 * A map's slots that the saved mappings don't have yet (a map that gained slots in an update,
 * such as the MiniLab 3's encoder): a map's mappings are written when you pick it, so settings
 * saved before never got them. Slots you learned again are kept as they are.
 */
export function missingSlots(
  map: ControllerMap,
  saved: MidiMapping[],
  uid: (p: string) => string,
): MidiMapping[] {
  const have = new Set(saved.map((m) => m.slot).filter(Boolean));
  return mappingsOf(map, uid).filter((m) => !have.has(m.slot));
}

/**
 * Saved mappings with a number the map has since corrected (a slot's `formerly`), set to the
 * map's current number; the others as they are (the same objects, so callers can tell).
 */
export function correctedSlots(map: ControllerMap, saved: MidiMapping[]): MidiMapping[] {
  return saved.map((m) => {
    const slot = map.slots.find((s) => s.slot === m.slot);
    if (!slot || slot.number === null || !slot.formerly?.includes(m.number)) return m;
    return { ...m, number: slot.number };
  });
}

/** The known controller among these input names, if any. */
export function detectController(names: string[]): ControllerMap | undefined {
  return CONTROLLER_MAPS.find((m) => names.some((n) => m.ports.test(n)));
}
