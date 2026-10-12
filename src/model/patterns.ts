/**
 * The patterns (PLAN-patterns.md, D153, D155, D174–D178): rhythms the keys' chords play on while
 * held, in a notation like a drum machine's grid: lanes of characters, one per step.
 *
 *   X accent (velocity 1) · x normal (0.8) · o soft (0.55) · 1–9 velocity in tenths
 *   - holds the note before one step longer · . a rest
 *
 * A lane's name says which notes its hits play (`Lane`). A pattern's `division` is its steps per
 * beat: 4 (16ths), 3 (8th triplets), 6 (16th triplets). Ids are stored in the settings: never
 * change one. Pure.
 */

/** Which notes a lane's hits play (D176). */
export type Lane =
  | "all" // the whole chord and its bass
  | "chord" // the chord without its bass
  | "bass" // the bass (else the chord's lowest note)
  | "root" // chord tones in the bass's register:
  | "3"
  | "5"
  | "6"
  | "b7"
  | "7" // the chord's own seventh (the octave on a triad)
  | "8" // the root an octave up
  | "bass5" // the fifth and the octave above the bass note
  | "bass8"
  | "low" // the voiced chord's lowest, middle and highest note
  | "mid"
  | "high"
  | "walk"; // a walking bass: root, 3, 5, 6, and an approach to the next chord when it's known

export const LANES: readonly Lane[] = [
  "all",
  "chord",
  "bass",
  "root",
  "3",
  "5",
  "6",
  "b7",
  "7",
  "8",
  "bass5",
  "bass8",
  "low",
  "mid",
  "high",
  "walk",
];

/** A hit: when (in the pattern's steps), how long, how loud, which notes. */
export interface PatternStep {
  at: number;
  length: number;
  vel: number;
  part: Lane;
}

export const PATTERN_GROUPS = [
  "Basics",
  "Ballads & keys",
  "Rock, pop & soul",
  "Jazz & blues",
  "Latin",
  "Caribbean & African",
  "Dance & electronic",
  "Hip-hop",
  "Folk & country",
] as const;
export type PatternGroup = (typeof PATTERN_GROUPS)[number];

export interface ChordPattern {
  id: string;
  name: string;
  group: PatternGroup;
  /** A line about it, for the menu. */
  about: string;
  /** Steps per beat: 4 (16ths), 3 (8th triplets), 6 (16th triplets). */
  division: 3 | 4 | 6;
  /** Its length in steps. */
  length: number;
  /** Not 4/4, or longer than a bar: "3/4", "12/8", "2 bars" (shown in the menu). */
  tag?: string;
  lanes: Partial<Record<Lane, string>>;
  steps: PatternStep[];
}

const VEL: Record<string, number> = { X: 1, x: 0.8, o: 0.55 };

/** A lane's hits from its characters. */
export function parseLane(lane: string, part: Lane): PatternStep[] {
  const steps: PatternStep[] = [];
  for (let i = 0; i < lane.length; i++) {
    const c = lane[i];
    if (c === "." || c === "-") {
      if (c === "-" && steps.length && steps.at(-1)!.at + steps.at(-1)!.length === i)
        steps.at(-1)!.length++;
      continue;
    }
    const vel = VEL[c] ?? (/^[1-9]$/.test(c) ? Number(c) / 10 : NaN);
    if (!Number.isFinite(vel)) throw new Error(`pattern lane "${lane}": unknown "${c}"`);
    steps.push({ at: i, length: 1, vel, part });
  }
  return steps;
}

function pattern(
  id: string,
  name: string,
  group: PatternGroup,
  about: string,
  lanes: Partial<Record<Lane, string>>,
  opts: { division?: 3 | 4 | 6; tag?: string } = {},
): ChordPattern {
  const lengths = new Set(Object.values(lanes).map((l) => l!.length));
  if (lengths.size !== 1) throw new Error(`pattern ${id}: lanes of different lengths`);
  const steps = (Object.entries(lanes) as [Lane, string][])
    .flatMap(([part, lane]) => parseLane(lane, part))
    .sort((a, b) => a.at - b.at);
  return {
    id,
    name,
    group,
    about,
    division: opts.division ?? 4,
    length: [...lengths][0],
    ...(opts.tag ? { tag: opts.tag } : {}),
    lanes,
    steps,
  };
}

/** Two bars: a lane written twice. */
const twice = (lane: string) => lane + lane;

/** The patterns, group by group (knob 7 steps through them in this order). */
export const PATTERNS: ChordPattern[] = [
  // ---- Basics ----
  pattern("whole", "Whole notes", "Basics", "A chord per bar, left to ring.", {
    all: "X---------------",
  }),
  pattern("halves", "Halves", "Basics", "On 1 and 3.", { all: "X-------8-------" }),
  pattern("quarters", "Quarters", "Basics", "Every beat, the accents on 1 and 3.", {
    all: "X---8---9---8---",
  }),
  pattern("eighths", "Eighths", "Basics", "Straight pop eighths.", { all: "X-7-8-7-X-7-8-7-" }),
  pattern("dotted", "Dotted", "Basics", "3 + 3 + 2 eighths: the pop push across the bar.", {
    all: "X-----8-----9---",
  }),
  pattern("pulse", "Pulse", "Basics", "Sixteenths with an accent every beat: trance, synth pop.", {
    all: "X666X666X666X666",
  }),
  pattern("rockpush", "Rock push", "Basics", "Driving eighths, the chord pushed in on 4-and.", {
    all: "X-x-x-x-X-x-x.X-",
  }),

  // ---- Ballads & keys ----
  pattern(
    "ballad",
    "Ballad",
    "Ballads & keys",
    "The bass and chord on 1, softer chords on 3 and 4.",
    {
      bass: "X-------........",
      chord: "9-------7---8---",
    },
  ),
  pattern(
    "waltz",
    "Waltz",
    "Ballads & keys",
    "In three: bass, chord, chord.",
    { bass: "X---........", chord: "....x--.8--." },
    { tag: "3/4" },
  ),
  pattern(
    "jazzwaltz",
    "Jazz waltz",
    "Ballads & keys",
    "In three: the chord on 1 and on the and of 2.",
    { bass: "X---........", chord: "X.....x-...." },
    { tag: "3/4" },
  ),
  pattern(
    "tripletballad",
    "Triplet ballad",
    "Ballads & keys",
    "The 50s slow-dance piano: chord triplets over a bass on 1 and 3.",
    { bass: "X-----X-----", chord: "Xooxoo9ooxoo" },
    { division: 3, tag: "12/8" },
  ),
  pattern(
    "alberti",
    "Alberti bass",
    "Ballads & keys",
    "Classical piano: low, high, middle, high.",
    {
      low: "X...x...X...x...",
      high: ".o.o.o.o.o.o.o.o",
      mid: "..o...o...o...o.",
    },
  ),
  pattern("arpup", "Arpeggio up", "Ballads & keys", "The chord broken up and down in eighths.", {
    low: "X-......x-......",
    mid: "..o-..o-..o-..o-",
    high: "....o-......o-..",
  }),

  // ---- Rock, pop & soul ----
  pattern(
    "backbeat",
    "Backbeat",
    "Rock, pop & soul",
    "The bass on 1 and 3, the chord on 2 and 4.",
    {
      bass: "X---....9---....",
      chord: "....X--.....X--.",
    },
  ),
  pattern("gallop", "Gallop", "Rock, pop & soul", "An eighth and two sixteenths on every beat.", {
    all: "X-789-78X-789-78",
  }),
  pattern("motown", "Motown stabs", "Rock, pop & soul", "Short chords on 2 and 4 with a pickup.", {
    bass: "X.......x.......",
    chord: "....x......ox...",
  }),
  pattern("gospel", "Gospel shout", "Rock, pop & soul", "Fast, syncopated sixteenth stabs.", {
    bass: "X.......X.......",
    chord: "X..x.x..x.x.x.x.",
  }),
  pattern("stadium", "Stadium eighths", "Rock, pop & soul", "Palm-muted root and fifth eighths.", {
    root: "X.x.x.x.X.x.x.x.",
    "5": "X.x.x.x.X.x.x.x.",
  }),

  // ---- Jazz & blues ----
  pattern("charleston", "Charleston", "Jazz & blues", "1 and the and of 2.", {
    all: "X-----8---------",
  }),
  pattern(
    "shuffle",
    "Shuffle",
    "Jazz & blues",
    "Long-short on every beat, in true triplets.",
    { all: "X-6x-6X-6x-6" },
    { division: 3, tag: "triplets" },
  ),
  pattern("swingcomp", "Swing comp", "Jazz & blues", "Short quarter chords, 2 and 4 louder.", {
    chord: "o...x...o...x...",
  }),
  pattern(
    "walking",
    "Walking bass",
    "Jazz & blues",
    "A bass walking up the chord, leaning into the next one.",
    { walk: "X...x...x...x...", chord: "....o.......o..." },
  ),
  pattern("boogie", "Boogie-woogie", "Jazz & blues", "The left hand's root–3–5–6–♭7–6–5–3.", {
    root: "X...............",
    "3": "..x...........x.",
    "5": "....x.......x...",
    "6": "......x...x.....",
    b7: "........x.......",
    chord: "....o.......o...",
  }),

  // ---- Latin ----
  pattern("tresillo", "Tresillo", "Latin", "3 + 3 + 2 sixteenths: the Latin and pop pulse.", {
    all: "X--x--8-X--x--8-",
  }),
  pattern(
    "clave",
    "Clave (son 3-2)",
    "Latin",
    "The son clave, three side first.",
    { all: "X-....8-....8-......X-..8-......" },
    { tag: "2 bars" },
  ),
  pattern(
    "clave23",
    "Son clave 2-3",
    "Latin",
    "The son clave, two side first.",
    { all: "....X-..x-......X-....8-....8-.." },
    { tag: "2 bars" },
  ),
  pattern(
    "rumba",
    "Rumba clave",
    "Latin",
    "Like the son clave, its third hit a sixteenth later.",
    { all: "X-....8-.....8-.....X-..8-......" },
    { tag: "2 bars" },
  ),
  pattern(
    "habanera",
    "Habanera",
    "Latin",
    "Dotted eighth, sixteenth, two eighths: Carmen, the tango's ancestor.",
    {
      bass: "X-------X-------",
      chord: "X..xx.x.X..xx.x.",
    },
  ),
  pattern(
    "bossa",
    "Bossa",
    "Latin",
    "A bossa nova bass and comping rhythm.",
    {
      bass: "X-----x-X-----x-X-----x-X-----x-",
      chord: "X-.x-.x-..X-x-....x-..X-.x-.x-..",
    },
    { tag: "2 bars" },
  ),
  pattern(
    "samba",
    "Samba (partido alto)",
    "Latin",
    "The syncopated sixteenths of samba comping.",
    {
      bass: twice("X.......x......."),
      chord: "..x..x.x..x.x...x.x..x...x..x.x.",
    },
    { tag: "2 bars" },
  ),
  pattern("chacha", "Cha-cha-chá", "Latin", "One, two, cha-cha-chá.", {
    bass: "X...........x...",
    chord: "X...x...x...x.x.",
  }),
  pattern(
    "montuno",
    "Montuno",
    "Latin",
    "A salsa piano figure off the beat.",
    { all: "..X.x..X..x.X..x..X.x..X..x.X..x" },
    { tag: "2 bars" },
  ),
  pattern("reggaeton", "Reggaeton (dembow)", "Latin", "3 + 3 + 2: the pulse of Latin pop.", {
    bass: "X-------X-------",
    chord: "X..x..x.X..x..x.",
  }),
  pattern(
    "bolero",
    "Bolero",
    "Latin",
    "The romantic Latin bolero's gentle syncopation.",
    { bass: twice("X.......X......."), chord: "..x.x.x...x.x.x.....x.x.....x.x." },
    { tag: "2 bars" },
  ),
  pattern("tango", "Tango marcato", "Latin", "Four heavy beats with a drag into the next bar.", {
    all: "X...x...X...x..o",
  }),

  // ---- Caribbean & African ----
  pattern(
    "offbeats",
    "Offbeats",
    "Caribbean & African",
    "On every and: the reggae and ska skank.",
    {
      bass: "X---....9---....",
      chord: "..9...9...9...9.",
    },
  ),
  pattern(
    "onedrop",
    "One drop",
    "Caribbean & African",
    "Reggae: the bass on 3, chords on 2 and 4.",
    {
      chord: "....8.......8...",
      bass: "........X-----..",
    },
  ),
  pattern("ska", "Ska", "Caribbean & African", "A walking bass, upstrokes on every and.", {
    bass: "X-..8-..X-..8-..",
    chord: "..9...9...9...9.",
  }),
  pattern(
    "bubble",
    "Reggae bubble",
    "Caribbean & African",
    "The organ's skank with a ghost note before.",
    {
      low: ".o...o...o...o..",
      chord: "..X...X...X...X.",
    },
  ),
  pattern(
    "afrobeats",
    "Afrobeats",
    "Caribbean & African",
    "Syncopated 3 + 3 + 2 + 2 groupings over two bars.",
    { bass: twice("X.......X......."), chord: "x..x..x...x..x..x..x..x...x.x..." },
    { tag: "2 bars" },
  ),
  pattern("highlife", "Highlife", "Caribbean & African", "Light, bright offbeat guitar.", {
    chord: ".xx.x.x..xx.x.x.",
  }),

  // ---- Dance & electronic ----
  pattern(
    "house",
    "House",
    "Dance & electronic",
    "The bass on the beats, syncopated piano stabs.",
    {
      bass: "X-..X-..X-..X-..",
      chord: "...X..x...X..x..",
    },
  ),
  pattern("funk", "Funk", "Dance & electronic", "Short, syncopated sixteenth stabs.", {
    bass: "X-..............",
    chord: "X..7..96..X..7x.",
  }),
  pattern("disco", "Disco stabs", "Dance & electronic", "Offbeat chords over an octave bass.", {
    root: "X...X...X...X...",
    "8": "..x...x...x...x.",
    chord: "..o...x...o...x.",
  }),
  pattern("trancegate", "Trance gate", "Dance & electronic", "A pad gated into sixteenths.", {
    chord: "X.xx.x.xX.xx.x.x",
  }),
  pattern("ukgarage", "UK garage", "Dance & electronic", "Skippy two-step stabs.", {
    bass: "X.........X.....",
    chord: "...x..x....x.x..",
  }),

  // ---- Hip-hop ----
  pattern("boombap", "Boom bap", "Hip-hop", "Sparse stabs on 1, the a of 2, and 4.", {
    bass: "X.........x.....",
    chord: "X......x....x...",
  }),
  pattern(
    "trap",
    "Trap",
    "Hip-hop",
    "A long chord, an 808, and sixteenth-triplet rolls.",
    {
      chord: "X-----------------------",
      bass: "X...............x.......",
      high: "..................oooooo",
    },
    { division: 6, tag: "triplets" },
  ),

  // ---- Folk & country ----
  pattern("oompah", "Oom-pah", "Folk & country", "Bass on 1 and 3, chord on 2 and 4.", {
    bass: "X---....X---....",
    chord: "....x--.....x--.",
  }),
  pattern("polka", "Polka", "Folk & country", "A fast oom-pah with a pickup.", {
    bass: "X.......X.......",
    chord: "....x...o...x...",
  }),
  pattern("trainbeat", "Train beat", "Folk & country", "Boom-chicka: the rockabilly train.", {
    bass: "X.......x.......",
    chord: "..o.x.o...o.x.o.",
  }),
  pattern(
    "rootfifth",
    "Root–fifth bass",
    "Folk & country",
    "Country: the root on 1, the fifth on 3, chords between.",
    {
      root: "X...............",
      "5": "........x.......",
      chord: "....x.......x...",
    },
  ),
  pattern(
    "travis",
    "Travis picking",
    "Folk & country",
    "An alternating bass under treble pinches.",
    {
      root: "X.......x.......",
      "5": "....x.......x...",
      high: "x.o...o.x.o...o.",
      mid: "......o.......o.",
    },
  ),
];

export const patternById = (id: string) => PATTERNS.find((p) => p.id === id) ?? PATTERNS[0];

/** The hits of a pattern on its step number `n` (it loops). */
export function patternHits(pattern: ChordPattern, n: number): PatternStep[] {
  const pos = ((n % pattern.length) + pattern.length) % pattern.length;
  return pattern.steps.filter((s) => s.at === pos);
}

/** A pattern's length in beats. */
export const patternBeats = (p: ChordPattern) => p.length / p.division;

// ---------- which notes a hit plays (D176) ----------

/** What a hit picks its notes from: the chord as voiced (without its bass), its bass notes, its
 * root (a MIDI note) and its tones (semitones above the root). */
export interface ChordInfo {
  notes: readonly number[];
  bass: readonly number[];
  root: number;
  tones: readonly number[];
}

/** The lowest a bass note goes (C1), as for the Bass (D139). */
const FLOOR = 24;

/** The chord's root where a bass plays it: the bass note, else an octave under the chord. */
export function bassRoot(c: ChordInfo): number {
  if (c.bass.length) return c.bass[0];
  const low = (c.notes[0] ?? c.root) - 12;
  let r = low + ((((c.root - low) % 12) + 12) % 12);
  if (r >= (c.notes[0] ?? r + 1)) r -= 12;
  while (r < FLOOR) r += 12;
  return r;
}

/** A chord tone's interval above the root, from the chord itself where it has one. */
function interval(c: ChordInfo, tone: "3" | "5" | "6" | "b7" | "7"): number {
  const has = (n: number) => c.tones.some((t) => ((t % 12) + 12) % 12 === n);
  if (tone === "3") return has(3) ? 3 : has(4) ? 4 : has(5) ? 5 : 4;
  if (tone === "5") return has(7) ? 7 : has(6) ? 6 : has(8) ? 8 : 7;
  if (tone === "6") return 9;
  if (tone === "b7") return 10;
  return has(10) ? 10 : has(11) ? 11 : 12;
}

/**
 * The notes a lane's hit plays, and whether they're bass notes (they go to the bass's track,
 * D154). `walk`: the hit's place in the chord's walk, and `approach`, the next chord's root
 * when it's known and this is the walk's last hit before it (a half step below or above it).
 */
export function laneNotes(
  lane: Lane,
  c: ChordInfo,
  walk = 0,
  approach: number | null = null,
): { notes: number[]; bass: boolean } {
  const notes = [...c.notes].sort((a, b) => a - b);
  switch (lane) {
    case "all":
      return { notes: [...c.bass, ...notes.filter((n) => !c.bass.includes(n))], bass: false };
    case "chord":
      return { notes, bass: false };
    case "bass":
      return { notes: c.bass.length ? [...c.bass] : notes.slice(0, 1), bass: true };
    case "low":
      return { notes: notes.slice(0, 1), bass: false };
    case "high":
      return { notes: notes.slice(-1), bass: false };
    case "mid":
      // the middle one (of three: the second; of four: the second from the bottom)
      return {
        notes: notes.length ? [notes[Math.floor((notes.length - 1) / 2)]] : [],
        bass: false,
      };
  }
  const root = bassRoot(c);
  if (lane === "root") return { notes: [root], bass: true };
  if (lane === "8") return { notes: [root + 12], bass: true };
  if (lane === "bass5") return { notes: [(c.bass[0] ?? root) + 7], bass: true };
  if (lane === "bass8") return { notes: [(c.bass[0] ?? root) + 12], bass: true };
  if (lane === "walk") {
    if (approach !== null) {
      // the next root nearest this one, approached from a half step below (or above, coming down)
      const next = root + ((((approach - root + 6) % 12) + 12) % 12) - 6;
      return { notes: [next > root ? next - 1 : next + 1], bass: true };
    }
    const steps = [0, interval(c, "3"), interval(c, "5"), interval(c, "6")];
    return { notes: [root + steps[walk % steps.length]], bass: true };
  }
  return { notes: [root + interval(c, lane)], bass: true };
}
