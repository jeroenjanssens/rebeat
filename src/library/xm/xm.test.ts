import { describe, expect, it } from "vitest";
import { convertXm, renderSample, XM_RATE } from "./convert";
import { envAt, releaseSeconds } from "./envelope";
import { bendAt } from "../../model/bend";
import { parseXm, XmError } from "./parse";
import { writeXm, type XmSpec } from "./write";

/** A sine cycle of `n` frames. */
const cycle = (n: number) =>
  Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * i) / n));
/** A decaying noise burst (a drum), seeded. */
const burst = (n: number) => {
  let x = 1;
  return Float32Array.from({ length: n }, (_, i) => {
    x = (x * 16807) % 2147483647;
    return ((x / 2147483647) * 2 - 1) * (1 - i / n);
  });
};

const C4 = 49;
const rows = (n: number) => Array.from({ length: n }, () => [] as XmSpec["patterns"][0][0]);

/** Drums (instrument 1) on every 4th row of channel 0, a looped lead (instrument 2) on 1 and 2. */
function song(): XmSpec {
  const a = rows(16);
  for (let r = 0; r < 16; r += 4) a[r][0] = { note: C4, instrument: 1 };
  a[0][1] = { note: C4, instrument: 2, volume: 0x10 + 32 };
  a[8][1] = { note: 97 };
  a[0][2] = { note: C4 + 7, instrument: 2 };
  a[2][0] = { note: C4, instrument: 1, effect: 0x0e, param: 0x94 }; // retrigger every 4 ticks
  a[6][0] = { note: C4 + 2, instrument: 1, effect: 0x0e, param: 0xd3 }; // delay 3 ticks
  a[10][0] = { note: C4, instrument: 1, effect: 0x0e, param: 0xc3 }; // cut after 3 ticks
  a[12][2] = { note: C4 + 5, effect: 0x03, param: 0x10 }; // a glide, a semitone a tick
  a[14][1] = { effect: 0x07, param: 0x37 }; // tremolo: not played
  const b = rows(16);
  b[0][0] = { note: C4, instrument: 1, effect: 0x0f, param: 3 }; // speed 3: twice as fast
  b[7][0] = { effect: 0x0d, param: 0 }; // pattern break after row 7
  return {
    name: "Test song",
    channels: 3,
    speed: 6,
    bpm: 125,
    orders: [0, 1, 0],
    patterns: [a, b],
    instruments: [
      { name: "Kick drum", samples: [{ name: "kick", data: burst(4000) }] },
      {
        name: "Lead",
        samples: [{ name: "saw", data: cycle(32), loopStart: 0, loopLength: 32, loopType: 1 }],
      },
    ],
  };
}

describe("reading .xm (D279)", () => {
  it("reads what FT2 writes: the header, patterns, instruments and samples", () => {
    const m = parseXm(writeXm(song()));
    expect(m).toMatchObject({
      name: "Test song",
      channels: 3,
      speed: 6,
      bpm: 125,
      orders: [0, 1, 0],
    });
    expect(m.patterns.map((p) => p.rows)).toEqual([16, 16]);
    expect(m.patterns[0].cells[0][1]).toEqual({
      note: C4,
      instrument: 2,
      volume: 0x30,
      effect: 0,
      param: 0,
    });
    expect(m.instruments.map((i) => i.name)).toEqual(["Kick drum", "Lead"]);
    const lead = m.instruments[1].samples[0];
    expect(lead).toMatchObject({ length: 32, loopStart: 0, loopLength: 32, loopType: 1 });
    expect(lead.data[8]).toBeCloseTo(1, 1);
  });

  it("reads 16-bit samples", () => {
    const spec = song();
    spec.instruments[1].samples[0].bits = 16;
    const s = parseXm(writeXm(spec)).instruments[1].samples[0];
    expect(s.length).toBe(32);
    expect(s.data[8]).toBeCloseTo(1, 3);
  });

  it("refuses files that aren't modules", () => {
    expect(() => parseXm(new TextEncoder().encode("RIFF....WAVE".padEnd(100)).buffer)).toThrow(
      XmError,
    );
  });
});

describe("a module as a project (D280–D283)", () => {
  const { project, samples, notes } = convertXm(parseXm(writeXm(song())), "test.xm");
  const kick = project.tracks.find((t) => t.name === "Kick drum")!;
  const lead = project.tracks.find((t) => t.name === "Lead")!;
  const [first, second, third] = project.slots;

  it("makes a track per instrument: a one-shot drum hits, a looped lead plays notes", () => {
    expect(project.tracks.length).toBe(2);
    expect(kick.mode).toBe("hits");
    expect(lead.mode).toBe("notes");
    expect(samples.length).toBe(2);
    expect(kick.sound).toMatchObject({ source: "sample", rootNote: 60 });
  });

  it("turns the order list into sections: clones, and a break makes one shorter", () => {
    expect(project.slots.length).toBe(3);
    expect(first.patternId).toBe(third.patternId);
    expect(second.steps).toBe(8);
    expect(project.patterns[first.patternId].stepCount).toBe(16);
  });

  it("keeps the rows' length as the tempo, and Fxx as a tempo change", () => {
    expect(project.bpm).toBe(125);
    expect(project.tempo).toEqual([{ slotId: second.id, at: 0, bpm: 250 }]);
  });

  it("writes the hits with their pitch, retriggers, delays and cuts", () => {
    const steps = project.patterns[first.patternId].lanes[kick.id].steps;
    expect([0, 2, 4, 6, 8, 10, 12].map((i) => steps[i].on)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(steps[2].ratchet).toBe(2);
    expect(steps[6].pitch).toBe(2);
    expect(steps[6].nudge).toBeCloseTo(0.5);
    expect(steps[10].gate).toBeCloseTo(0.5);
  });

  it("writes notes until the next note or key-off in their channel, chords where they overlap", () => {
    const steps = project.patterns[first.patternId].lanes[lead.id].steps;
    const at0 = steps[0].notes!;
    expect(at0.map((n) => n.pitch)).toEqual([60, 67]);
    // channel 1: the key-off on row 8; channel 2: the glide on row 12
    expect(at0.find((n) => n.pitch === 60)!.length).toBe(8);
    expect(at0.find((n) => n.pitch === 60)!.velocity).toBeCloseTo(0.5);
    expect(at0.find((n) => n.pitch === 67)!.length).toBe(12);
    // the glide comes in from G, two semitones above
    expect(steps[12].notes![0]).toMatchObject({ pitch: 65, bend: { shape: "scoop", amount: 2 } });
  });

  it("lists what it doesn't play", () => {
    expect(notes.join(" ")).toMatch(/tremolo/);
  });
});

describe("rendering samples (D283)", () => {
  /** Rising zero crossings per second. */
  const pitchOf = (x: Float32Array) => {
    let n = 0;
    for (let i = 1; i < x.length; i++) if (x[i - 1] <= 0 && x[i] > 0) n++;
    return n / (x.length / XM_RATE);
  };
  const s = parseXm(writeXm(song())).instruments[1].samples[0];

  it("tunes a sample so C-4 plays it at FT2's 8363 Hz, and plays its loop out", () => {
    const [out] = renderSample(s, 60, 3);
    expect(out.length).toBe(XM_RATE * 3);
    // a 32-frame cycle at 8363 Hz is 261 Hz: middle C
    expect(pitchOf(out)).toBeGreaterThan(255);
    expect(pitchOf(out)).toBeLessThan(268);
  });

  it("renders it at C-5's pitch for a zone rooted on C-5 (the sampler plays it as it is there)", () => {
    const f = pitchOf(renderSample(s, 72, 2)[0]);
    expect(f).toBeGreaterThan(510);
    expect(f).toBeLessThan(535);
  });

  it("follows the relative note", () => {
    const [up] = renderSample({ ...s, relativeNote: 12 }, 60, 2);
    expect(pitchOf(up)).toBeGreaterThan(510);
  });
});

/** One channel, one looped instrument (and its envelopes), the rows given. */
function one(
  cells: Record<number, XmSpec["patterns"][0][0][0]>,
  inst: Partial<XmSpec["instruments"][0]> = {},
): XmSpec {
  const p = rows(16);
  for (const [r, c] of Object.entries(cells)) p[Number(r)][0] = c;
  return {
    channels: 1,
    orders: [0],
    patterns: [p],
    instruments: [
      {
        name: "Lead",
        samples: [{ data: cycle(32), loopStart: 0, loopLength: 32, loopType: 1 }],
        ...inst,
      },
    ],
  };
}
const convert = (spec: XmSpec) => convertXm(parseXm(writeXm(spec)));
const firstNotes = (r: ReturnType<typeof convert>) => {
  const p = r.project;
  return p.patterns[p.slots[0].patternId].lanes[p.tracks[0].id].steps;
};

describe("FT2's effects (D284–D289)", () => {
  it("plays an arpeggio as an Arp bend on the note: no retrigger, a step a tick", () => {
    const r = convert(
      one({
        0: { note: C4, instrument: 1, effect: 0, param: 0x37 },
        1: { effect: 0, param: 0x37 },
        2: { effect: 0, param: 0x37 },
        3: { effect: 0, param: 0x37 },
        8: { note: 97 },
      }),
    );
    const steps = firstNotes(r);
    expect(steps.flatMap((s) => s.notes ?? []).length).toBe(1);
    const b = steps[0].notes![0].bend!;
    expect(b).toMatchObject({ shape: "arp", amount: 3, second: 7, rate: 24, time: 1, unit: "q" });
    // at 125 BPM a tick is 20 ms: C, D#, G, C…, then the note itself after the four rows
    const secPerQ = 60 / 125;
    expect([0.01, 0.03, 0.05, 0.07].map((t) => bendAt(b, t, null, secPerQ))).toEqual([0, 3, 7, 0]);
    expect(bendAt(b, 0.5, null, secPerQ)).toBe(0);
  });

  it("plays vibrato as a Shake from its row, slides as a Rise by what they add up to", () => {
    const vib = firstNotes(
      convert(one({ 0: { note: C4, instrument: 1 }, 2: { effect: 4, param: 0x48 } })),
    );
    expect(vib[0].notes![0].bend).toMatchObject({
      shape: "shake",
      amount: 0.5,
      rate: 1.5,
      delay: 0.5,
    });
    const up = firstNotes(
      convert(one({ 0: { note: C4, instrument: 1, effect: 1, param: 0x10 }, 1: { effect: 1 } })),
    );
    // 16/16 of a semitone on each of 5 ticks, two rows (01 repeats the last speed)
    expect(up[0].notes![0].bend).toMatchObject({ shape: "rise", amount: 10 });
  });

  it("keeps the larger of two pitch effects, and says so", () => {
    const r = convert(
      one({
        0: { note: C4, instrument: 1, effect: 4, param: 0x42 },
        1: { effect: 2, param: 0x20 },
      }),
    );
    expect(firstNotes(r)[0].notes![0].bend).toMatchObject({ shape: "rise", amount: -10 });
    expect(r.notes.join(" ")).toMatch(/two pitch effects/);
  });

  it("plays the volume envelope into the sample, a zone per octave, the release from the fadeout", () => {
    const envelope = {
      points: [
        [0, 64],
        [10, 32],
        [20, 32],
      ] as [number, number][],
      sustain: 1,
    };
    const r = convert(
      one(
        { 0: { note: C4, instrument: 1 }, 4: { note: 97 }, 8: { note: C4 + 12, instrument: 1 } },
        { volumeEnvelope: envelope, fadeout: 1024 },
      ),
    );
    const t = r.project.tracks[0];
    expect(t.sound?.source).toBe("multi");
    expect(t.sound?.zones?.map((z) => z.note)).toEqual([60, 72]);
    // 32768 / 1024 = 32 ticks of 20 ms after key-off
    expect(
      releaseSeconds(
        parseXm(writeXm(one({}, { volumeEnvelope: envelope, fadeout: 1024 }))).instruments[0],
        0.02,
      ),
    ).toBeCloseTo(0.64);
    const [ch] = r.samples[0].channels;
    const level = (from: number) => Math.max(...ch.subarray(from, from + 400).map(Math.abs));
    // full at the start, half from the sustain point on (tick 10 = 0.2 s)
    expect(level(0)).toBeGreaterThan(0.9);
    expect(level(Math.round(0.4 * XM_RATE))).toBeCloseTo(0.5, 1);
    expect(envAt(envelope, 5)).toBe(48);
  });

  it("makes a panning envelope stereo", () => {
    const pan = {
      points: [
        [0, 0],
        [1, 0],
      ] as [number, number][],
    };
    const r = convert(one({ 0: { note: C4, instrument: 1 } }, { panEnvelope: pan }));
    const [l, rr] = r.samples[0].channels;
    expect(rr).toBeDefined();
    expect(Math.max(...l.subarray(0, 400).map(Math.abs))).toBeGreaterThan(0.9);
    expect(Math.max(...rr.subarray(0, 400).map(Math.abs))).toBe(0);
  });

  it("turns panning and volume slides into automation on the instrument's track", () => {
    const r = convert(
      one({
        0: { note: C4, instrument: 1, volume: 0x50, effect: 8, param: 0x00 },
        2: { effect: 0x0a, param: 0x08 },
        6: { note: C4, instrument: 1, volume: 0x50 },
      }),
    );
    const id = r.project.tracks[0].id;
    const lanes = r.project.automation ?? [];
    const pan = lanes.find((l) => l.target === `track:${id}:mix.pan`)!;
    const level = lanes.find((l) => l.target === `track:${id}:volume`)!;
    expect(pan.points[0]).toMatchObject({ at: 0, value: 0 });
    // A08: 8 down on each of 5 ticks over row 2, from 64: 24 / 64 → a fader at 0.8 × √0.375
    const ramp = level.points.filter((p) => p.at > 0.4 && p.at < 0.8);
    expect(ramp.map((p) => Math.round(p.value * 100) / 100)).toEqual([0.8, 0.49]);
    // the next note starts at 0 dB again
    expect(level.points.find((p) => Math.abs(p.at - 1.5) < 1e-6)?.value).toBe(0.8);
  });
});
