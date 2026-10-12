/**
 * Suggesting the next chord (PLAN-suggestions.md, D158): what you just played, as a roman numeral
 * in the key; what usually follows it (a table of moves from common-practice and pop harmony,
 * written for Rebeat) and which famous progression it continues; how adventurous to be. Every
 * suggestion is a chord the chord pads can play: a root and the pads to hold. Pure.
 */
import { SCALES, keyUsesFlats, pitchClassName, type Key } from "./notes";

export type Quality = "maj" | "min" | "dim" | "7" | "m7" | "maj7" | "m7b5";
export type Role = "home" | "away" | "tension" | "color";

export interface Suggestion {
  /** The root's pitch class (0 = C), in the space of the keys pressed. */
  root: number;
  quality: Quality;
  /** The pads to hold for it in Chord mode (and to play it: `padChord(root, pads)`). */
  pads: number[];
  /** The pads to hold in Key mode (none: the key's own chord). */
  keyPads: number[];
  name: string;
  roman: string;
  role: Role;
  why: string;
  score: number;
}

/** The colors of the roles, on the pads, the picture and the device (D159). */
export const ROLE_COLORS: Record<Role, string> = {
  home: "#22c55e",
  away: "#3b82f6",
  tension: "#ef4444",
  color: "#a855f7",
};

export const ROLE_NAMES: Record<Role, string> = {
  home: "home",
  away: "away from home",
  tension: "tension",
  color: "color",
};

/** How each quality is played on the chord pads (Dim, Min, Maj, Sus, 6, m7, M7, 9). */
const PADS: Record<Quality, number[]> = {
  maj: [2],
  min: [1],
  dim: [0],
  "7": [2, 5],
  m7: [1, 5],
  maj7: [2, 6],
  m7b5: [0, 5],
};

const SUFFIX: Record<Quality, string> = {
  maj: "",
  min: "m",
  dim: "°",
  "7": "7",
  m7: "m7",
  maj7: "maj7",
  m7b5: "ø7",
};

/** The semitones of each quality above its root. */
const TONES: Record<Quality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  "7": [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  m7b5: [0, 3, 6, 10],
};

/** A chord a key can go to: semitones above the key's root, its quality, roman numeral, role,
 * and from which adventure level on it's suggested (0 Safe, 1 Common, 2 Adventurous). */
interface Degree {
  id: string;
  at: number;
  quality: Quality;
  role: Role;
  level: 0 | 1 | 2;
}

const d = (id: string, at: number, quality: Quality, role: Role, level: 0 | 1 | 2): Degree => ({
  id,
  at,
  quality,
  role,
  level,
});

const MAJOR: Degree[] = [
  d("I", 0, "maj", "home", 0),
  d("ii", 2, "min", "away", 0),
  d("iii", 4, "min", "home", 0),
  d("IV", 5, "maj", "away", 0),
  d("V", 7, "maj", "tension", 0),
  d("vi", 9, "min", "home", 0),
  d("vii°", 11, "dim", "tension", 0),
  d("V7", 7, "7", "tension", 1),
  d("♭VII", 10, "maj", "color", 1),
  d("iv", 5, "min", "color", 1),
  d("V/V", 2, "maj", "color", 1),
  d("ii7", 2, "m7", "away", 2),
  d("Imaj7", 0, "maj7", "home", 2),
  d("IVmaj7", 5, "maj7", "away", 2),
  d("♭VI", 8, "maj", "color", 2),
  d("♭III", 3, "maj", "color", 2),
  d("V/vi", 4, "maj", "color", 2),
  d("V/ii", 9, "maj", "color", 2),
  d("♭II", 1, "maj", "color", 2),
  d("viiø7", 11, "m7b5", "tension", 2),
];

const MINOR: Degree[] = [
  d("i", 0, "min", "home", 0),
  d("ii°", 2, "dim", "away", 0),
  d("III", 3, "maj", "home", 0),
  d("iv", 5, "min", "away", 0),
  d("v", 7, "min", "tension", 0),
  d("VI", 8, "maj", "away", 0),
  d("VII", 10, "maj", "tension", 0),
  d("V", 7, "maj", "tension", 1),
  d("V7", 7, "7", "tension", 1),
  d("IV", 5, "maj", "color", 1),
  d("i7", 0, "m7", "home", 2),
  d("iiø7", 2, "m7b5", "away", 2),
  d("♭II", 1, "maj", "color", 2),
  d("I", 0, "maj", "color", 2),
  d("IIImaj7", 3, "maj7", "home", 2),
];

/** What follows each chord, with a weight (0..1) and why. */
type Moves = Record<string, [string, number, string][]>;

const MAJOR_MOVES: Moves = {
  I: [
    ["IV", 0.9, "lifts away from home"],
    ["V", 0.85, "tension that wants to come home"],
    ["vi", 0.8, "the sad turn"],
    ["ii", 0.6, "a gentle step away"],
    ["iii", 0.35, "a softer vi"],
    ["♭VII", 0.5, "a rock, mixolydian color"],
    ["V/V", 0.3, "a bright detour to V"],
    ["iv", 0.25, "borrowed from minor, bittersweet"],
    ["♭VI", 0.3, "the epic, cinematic step"],
  ],
  ii: [
    ["V", 0.95, "ii–V, the strongest way home"],
    ["V7", 0.75, "ii–V7, the jazz way home"],
    ["vii°", 0.4, "the leading-tone chord"],
    ["IV", 0.3, "a step back down"],
    ["I", 0.3, "straight home"],
  ],
  iii: [
    ["vi", 0.8, "down a fifth"],
    ["IV", 0.6, "up a step, warmer"],
    ["ii", 0.4, "on toward V"],
    ["V/vi", 0.3, "a pull toward vi"],
  ],
  IV: [
    ["V", 0.85, "builds up to home"],
    ["I", 0.8, "home, the amen cadence"],
    ["ii", 0.5, "a softer way on"],
    ["iv", 0.55, "the minor plagal, bittersweet"],
    ["vi", 0.4, "the sad turn"],
    ["♭VII", 0.35, "a rock step"],
  ],
  V: [
    ["I", 1, "home, the strongest resolution"],
    ["vi", 0.65, "the deceptive cadence: a surprise"],
    ["IV", 0.4, "the rock turnaround"],
    ["iii", 0.2, "a soft sidestep"],
  ],
  V7: [
    ["I", 1, "home, the strongest resolution"],
    ["vi", 0.6, "the deceptive cadence"],
  ],
  vi: [
    ["IV", 0.85, "the pop move"],
    ["ii", 0.7, "down a fifth"],
    ["V", 0.55, "up to the tension"],
    ["iii", 0.4, "down a step"],
    ["I", 0.4, "back to the bright side"],
  ],
  "vii°": [
    ["I", 0.95, "the leading tone resolves home"],
    ["iii", 0.3, "a soft sidestep"],
  ],
  "♭VII": [
    ["I", 0.85, "home, the mixolydian way"],
    ["IV", 0.6, "♭VII–IV–I, the rock cadence"],
    ["V", 0.3, "the tension after all"],
  ],
  iv: [
    ["I", 0.9, "the minor plagal cadence home"],
    ["V", 0.5, "on to the tension"],
    ["♭VII", 0.4, "a borrowed climb"],
  ],
  "V/V": [
    ["V", 0.95, "the secondary dominant resolves"],
    ["V7", 0.6, "on to V7"],
  ],
  ii7: [
    ["V7", 0.9, "ii7–V7, the jazz cadence"],
    ["V", 0.7, "on to V"],
  ],
  Imaj7: [
    ["IVmaj7", 0.7, "a dreamy step away"],
    ["ii7", 0.6, "the jazz turnaround"],
    ["vi", 0.5, "the sad turn"],
  ],
  IVmaj7: [
    ["Imaj7", 0.7, "home, softly"],
    ["V", 0.6, "builds up to home"],
    ["iii", 0.4, "down a step"],
  ],
  "♭VI": [
    ["♭VII", 0.8, "the epic climb: ♭VI–♭VII–I"],
    ["V", 0.5, "on to the tension"],
    ["I", 0.5, "back home"],
    ["iv", 0.4, "a borrowed shade"],
  ],
  "♭III": [
    ["IV", 0.6, "up a whole step"],
    ["♭VI", 0.5, "a borrowed shade"],
    ["♭VII", 0.5, "a borrowed climb"],
  ],
  "V/vi": [["vi", 0.95, "resolves to vi"]],
  "V/ii": [["ii", 0.95, "resolves to ii"]],
  "♭II": [
    ["V", 0.7, "the Neapolitan: ♭II–V–I"],
    ["I", 0.6, "home"],
  ],
  viiø7: [["I", 0.8, "resolves home"]],
};

const MINOR_MOVES: Moves = {
  i: [
    ["iv", 0.85, "the minor subdominant"],
    ["VI", 0.8, "lifts, warm"],
    ["VII", 0.7, "the natural minor climb"],
    ["V", 0.6, "tension that wants to come home"],
    ["III", 0.55, "the relative major"],
    ["v", 0.5, "a softer tension"],
    ["ii°", 0.35, "a dark step away"],
  ],
  "ii°": [
    ["V", 0.9, "ii°–V–i, the minor cadence"],
    ["v", 0.5, "on to v"],
    ["VII", 0.3, "a step up"],
  ],
  III: [
    ["VI", 0.7, "down a third"],
    ["iv", 0.6, "on to the subdominant"],
    ["VII", 0.55, "the III–VII sway"],
    ["i", 0.4, "back home"],
  ],
  iv: [
    ["V", 0.7, "up to the tension"],
    ["i", 0.7, "home"],
    ["VII", 0.6, "a climb"],
    ["v", 0.5, "a softer tension"],
    ["VI", 0.4, "a warm step"],
  ],
  v: [
    ["i", 0.7, "home"],
    ["VI", 0.6, "the deceptive turn"],
    ["iv", 0.5, "a step back"],
  ],
  V: [
    ["i", 1, "home, the strongest resolution"],
    ["VI", 0.7, "the deceptive cadence"],
  ],
  V7: [
    ["i", 1, "home, the strongest resolution"],
    ["VI", 0.6, "the deceptive cadence"],
  ],
  VI: [
    ["VII", 0.8, "rising: VI–VII–i"],
    ["V", 0.5, "on to the tension"],
    ["iv", 0.55, "a step back"],
    ["III", 0.55, "the relative major"],
    ["i", 0.4, "home"],
  ],
  VII: [
    ["i", 0.7, "back home"],
    ["III", 0.7, "the relative major"],
    ["VI", 0.4, "back down"],
  ],
  IV: [
    ["i", 0.5, "the dorian way home"],
    ["VII", 0.5, "a dorian climb"],
  ],
  i7: [
    ["iv", 0.7, "the minor subdominant"],
    ["VII", 0.5, "a climb"],
  ],
  iiø7: [["V7", 0.9, "iiø7–V7–i, the minor jazz cadence"]],
  "♭II": [
    ["V", 0.7, "the Neapolitan: ♭II–V–i"],
    ["i", 0.6, "home"],
  ],
  I: [["iv", 0.7, "the Picardy turn"]],
  IIImaj7: [["VI", 0.6, "down a third"]],
};

/** A famous progression (D158, D161): what it's called, its chords as roman numerals, what it
 * is. The suggestions name it when you continue one; in Next mode you can pick one for pad 1. */
export interface Progression {
  id: string;
  /** For the menu: "Four chords". */
  title: string;
  /** In a sentence: "the four-chord pop progression". */
  name: string;
  minor: boolean;
  chords: string[];
  about: string;
}

/** The progressions, the most played first (major keys, then minor). */
export const PROGRESSIONS: Progression[] = [
  {
    id: "four",
    title: "Four chords",
    name: "the four-chord pop progression",
    minor: false,
    chords: ["I", "V", "vi", "IV"],
    about: "The backbone of countless pop and rock songs: home, tension, the sad turn, the lift.",
  },
  {
    id: "sadpop",
    title: "Sad pop",
    name: "the sad pop progression",
    minor: false,
    chords: ["vi", "IV", "I", "V"],
    about: "The four chords started on vi: the same chords, but it feels minor and wistful.",
  },
  {
    id: "fifties",
    title: "Fifties (doo-wop)",
    name: "the fifties progression",
    minor: false,
    chords: ["I", "vi", "IV", "V"],
    about: "The doo-wop ballads of the 1950s and the love songs that followed them.",
  },
  {
    id: "three",
    title: "Three chords",
    name: "the three-chord song",
    minor: false,
    chords: ["I", "IV", "V"],
    about: "Folk, country, punk and rock 'n' roll: three chords and the truth.",
  },
  {
    id: "royalroad",
    title: "Royal road (J-pop)",
    name: "the royal road (J-pop)",
    minor: false,
    chords: ["IV", "V", "iii", "vi"],
    about: "Japan's ōdō shinkō, behind countless J-pop and anime songs: yearning and bittersweet.",
  },
  {
    id: "pachelbel",
    title: "Pachelbel's canon",
    name: "Pachelbel's canon",
    minor: false,
    chords: ["I", "V", "vi", "iii", "IV", "I", "IV", "V"],
    about: "The chords of the Canon in D, borrowed by many pop songs since.",
  },
  {
    id: "blues",
    title: "12-bar blues",
    name: "the 12-bar blues",
    minor: false,
    chords: ["I", "IV", "I", "V", "IV", "I"],
    about: "The blues, chord by chord: four bars of I, two of IV, two of I, V, IV, two of I.",
  },
  {
    id: "twofive",
    title: "ii–V–I",
    name: "ii–V–I",
    minor: false,
    chords: ["ii", "V", "I"],
    about: "The cadence at the heart of jazz: away, tension, home.",
  },
  {
    id: "turnaround",
    title: "Jazz turnaround",
    name: "the jazz turnaround",
    minor: false,
    chords: ["I", "vi", "ii", "V"],
    about: "The end of a jazz chorus that leads back to the top (rhythm changes).",
  },
  {
    id: "circle",
    title: "Circle of fifths",
    name: "the circle progression",
    minor: false,
    chords: ["vi", "ii", "V", "I"],
    about: "Each chord a fifth below the last, falling home: jazz standards and soul.",
  },
  {
    id: "mixo",
    title: "Mixolydian rock",
    name: "the mixolydian rock progression",
    minor: false,
    chords: ["I", "♭VII", "IV"],
    about: "Classic and arena rock: the borrowed ♭VII gives it swagger.",
  },
  {
    id: "epic",
    title: "Epic resolution",
    name: "the epic resolution",
    minor: false,
    chords: ["♭VI", "♭VII", "I"],
    about: "Two borrowed chords climbing home: film scores, power ballads, video game victories.",
  },
  {
    id: "creep",
    title: "Major to minor iv",
    name: "the I–III–IV–iv progression",
    minor: false,
    chords: ["I", "V/vi", "IV", "iv"],
    about: "The bittersweet borrowed iv at the end, famous from Radiohead's Creep.",
  },
  {
    id: "andalusian",
    title: "Andalusian cadence",
    name: "the Andalusian cadence",
    minor: true,
    chords: ["i", "VII", "VI", "V"],
    about: "Flamenco's falling steps down to the dominant: dramatic, also in rock and pop.",
  },
  {
    id: "epicminor",
    title: "Epic minor",
    name: "the epic minor progression",
    minor: true,
    chords: ["i", "VI", "III", "VII"],
    about: "The anthem of film scores and arena pop in a minor key.",
  },
  {
    id: "climb",
    title: "Minor climb",
    name: "the minor climb",
    minor: true,
    chords: ["i", "VI", "VII"],
    about: "Rising back to home: epic rock and EDM drops.",
  },
  {
    id: "minorthree",
    title: "Minor three chords",
    name: "the minor three-chord song",
    minor: true,
    chords: ["i", "iv", "v"],
    about: "The minor blues and folk progression.",
  },
  {
    id: "dorian",
    title: "Dorian vamp",
    name: "the dorian vamp",
    minor: true,
    chords: ["i", "IV"],
    about: "Two chords back and forth with the bright IV: funk, soul and Latin grooves.",
  },
];

export const progressionById = (id: string | null | undefined) =>
  PROGRESSIONS.find((p) => p.id === id) ?? null;

/** Whether a key is minor-like (a minor third over its root): its chords follow the minor table. */
export function isMinorKey(key: Key): boolean {
  const steps = (SCALES[key.scale] ?? SCALES.major).steps;
  return steps.includes(3) && !steps.includes(4);
}

const pc = (n: number) => ((n % 12) + 12) % 12;

/** A chord's quality from its notes and root, or null when it isn't one of ours (sus, aug…). */
export function qualityOf(root: number, notes: readonly number[]): Quality | null {
  const s = new Set(notes.map((n) => pc(n - root)));
  const third = s.has(4) ? "maj" : s.has(3) ? "min" : null;
  if (third === "maj" && s.has(7)) return s.has(10) ? "7" : s.has(11) ? "maj7" : "maj";
  if (third === "min" && s.has(7)) return s.has(10) ? "m7" : "min";
  if (third === "min" && s.has(6)) return s.has(10) ? "m7b5" : "dim";
  return null;
}

/** The chord's id in the key (its roman numeral), or null when it's none of the key's. */
export function romanOf(root: number, quality: Quality, key: Key): string | null {
  const degrees = isMinorKey(key) ? MINOR : MAJOR;
  const at = pc(root - key.root);
  const exact = degrees.find((g) => g.at === at && g.quality === quality);
  if (exact) return exact.id;
  // a seventh we don't list: the triad under it
  const triad = quality === "7" || quality === "maj7" ? "maj" : quality === "m7" ? "min" : "dim";
  return degrees.find((g) => g.at === at && g.quality === triad)?.id ?? null;
}

/** A chord played: its root (pitch class) and quality, for the history. */
export interface Played {
  root: number;
  quality: Quality;
}

/**
 * The next chords to play after `history` (oldest first, the last one is what you're on) in
 * `key`, best first, at most `count`: what follows the last chord, plus a bonus for continuing a
 * famous progression; only chords up to the adventure level; the chord you're on left out.
 */
export function suggestNext(
  history: readonly Played[],
  key: Key,
  adventure: 0 | 1 | 2,
  count = 8,
  progression: Progression | null = null,
): Suggestion[] {
  // a progression picked (Next mode, D161): its next chord first, the others after it
  if (progression && progression.minor === isMinorKey(key)) {
    const next = progressionChords(progression, key)[progressionIndex(progression, history, key)];
    const rest = suggestNext(history, key, adventure, count + 1).filter(
      (s) => s.roman !== next.roman,
    );
    return [next, ...rest].slice(0, count);
  }
  const minor = isMinorKey(key);
  const degrees = (minor ? MINOR : MAJOR).filter((g) => g.level <= adventure);
  const moves = minor ? MINOR_MOVES : MAJOR_MOVES;
  const ids = history.map((h) => romanOf(h.root, h.quality, key));
  const last = ids.at(-1) ?? null;
  const scores = new Map<string, { score: number; why: string; named?: boolean }>();
  /** Scores add up; the reason is the strongest one's, a famous progression's name first. */
  const add = (id: string, score: number, why: string, named = false) => {
    const prev = scores.get(id);
    if (!prev) return void scores.set(id, { score, why, named });
    const takes = named ? !prev.named || score > 0 : !prev.named && score > prev.score;
    scores.set(id, {
      score: prev.score + score,
      why: takes ? why : prev.why,
      named: named || prev.named,
    });
  };

  if (last && moves[last]) for (const [to, w, why] of moves[last]) add(to, w, why);
  else if (!history.length || !last) {
    // nothing played yet (or a chord from outside the key): the key's home and its neighbors
    for (const [to, w, why] of moves[minor ? "i" : "I"]) add(to, w * 0.8, why);
    add(minor ? "i" : "I", 1, "home");
  }

  // continuing a famous progression (any rotation): the longer the match, the bigger the bonus,
  // and a little more when it matches from the progression's own start (C G Am: four chords,
  // not the sad pop rotation of it); one name per chord, the best match's
  const known = ids.filter((x): x is string => !!x);
  const best = new Map<string, { score: number; name: string }>();
  for (const p of PROGRESSIONS) {
    if (p.minor !== minor) continue;
    const n = p.chords.length;
    for (let m = Math.min(known.length, n - 1); m >= 2; m--) {
      const tail = known.slice(-m);
      let start = -1;
      for (let st = 0; st < n && start < 0; st++)
        if (tail.every((c, i) => p.chords[(st + i) % n] === c)) start = st;
      if (start < 0) continue;
      const next = p.chords[(start + m) % n];
      const score = 0.6 + 0.2 * (m - 2) + (start === 0 ? 0.1 : 0);
      if (score > (best.get(next)?.score ?? 0)) best.set(next, { score, name: p.name });
      break;
    }
  }
  for (const [id, b] of best) add(id, b.score, b.name, true);

  // fill up with the key's own chords (then the level's borrowed ones), so the pads are full
  for (const g of degrees)
    add(
      g.id,
      g.level === 0 ? 0.05 : 0.02,
      g.level === 0 ? "one of the key's own chords" : "a color",
    );

  const flats = keyUsesFlats(key);
  return [...scores]
    .filter(([id]) => id !== last)
    .map(([id, s]) => ({ g: degrees.find((x) => x.id === id), ...s }))
    .filter((x): x is { g: Degree; score: number; why: string; named?: boolean } => !!x.g)
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(({ g, score, why, named }) =>
      toSuggestion(g, score, named ? `${g.id}: continues ${why}` : `${g.id}: ${why}`, key, flats),
    );
}

function toSuggestion(g: Degree, score: number, why: string, key: Key, flats: boolean): Suggestion {
  const root = pc(key.root + g.at);
  return {
    root,
    quality: g.quality,
    pads: PADS[g.quality],
    keyPads: keyModePads(root, g.quality, key),
    name: pitchClassName(root, flats || g.id.startsWith("♭")) + SUFFIX[g.quality],
    roman: g.id,
    role: g.role,
    why,
    score,
  };
}

/** The progressions that fit a key (major ones in a major key, minor ones in a minor key). */
export function progressionsFor(key: Key): Progression[] {
  return PROGRESSIONS.filter((p) => p.minor === isMinorKey(key));
}

/**
 * Where you are in a progression after `history` (D161): the index of its next chord. The
 * longest run of your last chords that matches it (cyclically) says where; without a match, its
 * first chord.
 */
export function progressionIndex(p: Progression, history: readonly Played[], key: Key): number {
  const ids = history.map((h) => romanOf(h.root, h.quality, key));
  const n = p.chords.length;
  for (let m = Math.min(ids.length, n); m >= 1; m--) {
    const tail = ids.slice(-m);
    for (let e = 0; e < n; e++)
      if (tail.every((c, i) => p.chords[(((e - m + 1 + i) % n) + n) % n] === c)) return (e + 1) % n;
  }
  return 0;
}

/** A progression's chords as suggestions in a key (to show them, and to play the next one). */
export function progressionChords(p: Progression, key: Key): Suggestion[] {
  const all = isMinorKey(key) ? MINOR : MAJOR;
  const flats = keyUsesFlats(key);
  return p.chords.map((id) => {
    const g = all.find((x) => x.id === id)!;
    return toSuggestion(g, 10, `${id}: next in ${p.name}`, key, flats);
  });
}

/** The scale's own chord on `root` (a triad, or a seventh), as a quality. */
function diatonic(root: number, key: Key, seventh: boolean): Quality | null {
  const steps = (SCALES[key.scale] ?? SCALES.major).steps;
  const i = steps.indexOf(pc(root - key.root));
  if (i < 0 || steps.length !== 7) return null;
  const note = (k: number) => steps[(i + k) % 7] + Math.floor((i + k) / 7) * 12 - steps[i];
  const tones = [0, note(2), note(4), ...(seventh ? [note(6)] : [])];
  return qualityOf(0, tones);
}

/**
 * The pads that play a suggestion in Key mode: none for the key's own chord, the 7th pad for its
 * own seventh, else the chord type pads (Key mode plays a chord type on the key as pressed).
 */
function keyModePads(root: number, quality: Quality, key: Key): number[] {
  const seventh = TONES[quality].length === 4;
  if (diatonic(root, key, seventh) === quality) return seventh ? [5] : [];
  return PADS[quality];
}
