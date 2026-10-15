/** Lightweight metadata for examples — no project specs, no synth patches. */

export const EXAMPLE_PREFIX = "example:";
export const isExampleId = (id: string) => id.startsWith(EXAMPLE_PREFIX);

export interface ExampleMeta {
  id: string;
  name: string;
  artist: string;
}

/** One entry per example: enough to build the command palette and check example ids. */
export const EXAMPLE_META: ExampleMeta[] = [
  { id: "night-drive", name: "Night Drive", artist: "Rebeat demo" },
  { id: "blue-monday", name: "Blue Monday", artist: "New Order" },
  { id: "billie-jean", name: "Billie Jean", artist: "Michael Jackson" },
  { id: "planet-rock", name: "Planet Rock", artist: "Afrika Bambaataa & the Soulsonic Force" },
  { id: "sweet-dreams", name: "Sweet Dreams", artist: "Eurythmics" },
  { id: "neon-horizon", name: "Neon Horizon", artist: "Rebeat demo · factory synths" },
  { id: "late-night-cafe", name: "Late Night Café", artist: "Rebeat demo · sampled instruments" },
  { id: "hyperdrive", name: "Hyperdrive", artist: "Rebeat demo · the advanced synth" },
  { id: "liquid-ladder", name: "Liquid Ladder", artist: "Rebeat demo · the advanced synth" },
  { id: "laser-highway", name: "Laser Highway", artist: "Rebeat demo · synthwave" },
  { id: "long-way-home", name: "Long Way Home", artist: "Rebeat demo · the timeline" },
  {
    id: "sweeps-and-bends",
    name: "Sweeps and Bends",
    artist: "Rebeat demo · bends and synth automation",
  },
  {
    id: "wood-wire-and-glass",
    name: "Wood, Wire and Glass",
    artist: "Rebeat demo · wavetables and physical models",
  },
  { id: "gravel-road", name: "Gravel Road", artist: "Rebeat demo · country" },
  { id: "around-the-world", name: "Around the World", artist: "Daft Punk" },
];
