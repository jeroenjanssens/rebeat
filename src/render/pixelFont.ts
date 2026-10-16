/**
 * A small bitmap font for the tracker (D266): 5×7 glyphs in a 6×9 cell, drawn by us (no font
 * file, no license), scaled by whole device pixels so it stays crisp. Text is drawn from an atlas
 * per color and pixel size. Lowercase draws as uppercase; anything else unknown as `?`.
 */

export const CELL_W = 6;
export const CELL_H = 9;

// prettier-ignore
const GLYPHS: Record<string, string[]> = {
  "0": [" ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "],
  "1": ["  #  ", " ##  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "],
  "2": [" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"],
  "3": ["#####", "   # ", "  #  ", "   # ", "    #", "#   #", " ### "],
  "4": ["   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # "],
  "5": ["#####", "#    ", "#### ", "    #", "    #", "#   #", " ### "],
  "6": ["  ## ", " #   ", "#    ", "#### ", "#   #", "#   #", " ### "],
  "7": ["#####", "    #", "   # ", "  #  ", " #   ", " #   ", " #   "],
  "8": [" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "],
  "9": [" ### ", "#   #", "#   #", " ####", "    #", "   # ", " ##  "],
  A: [" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  B: ["#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "],
  C: [" ### ", "#   #", "#    ", "#    ", "#    ", "#   #", " ### "],
  D: ["###  ", "#  # ", "#   #", "#   #", "#   #", "#  # ", "###  "],
  E: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"],
  F: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#    "],
  G: [" ### ", "#   #", "#    ", "# ###", "#   #", "#   #", " ####"],
  H: ["#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  I: [" ### ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "],
  J: ["  ###", "   # ", "   # ", "   # ", "   # ", "#  # ", " ##  "],
  K: ["#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"],
  L: ["#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"],
  M: ["#   #", "## ##", "# # #", "# # #", "#   #", "#   #", "#   #"],
  N: ["#   #", "#   #", "##  #", "# # #", "#  ##", "#   #", "#   #"],
  O: [" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  P: ["#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "],
  Q: [" ### ", "#   #", "#   #", "#   #", "# # #", "#  # ", " ## #"],
  R: ["#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"],
  S: [" ####", "#    ", "#    ", " ### ", "    #", "    #", "#### "],
  T: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
  U: ["#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  V: ["#   #", "#   #", "#   #", "#   #", "#   #", " # # ", "  #  "],
  W: ["#   #", "#   #", "#   #", "# # #", "# # #", "# # #", " # # "],
  X: ["#   #", "#   #", " # # ", "  #  ", " # # ", "#   #", "#   #"],
  Y: ["#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "],
  Z: ["#####", "    #", "   # ", "  #  ", " #   ", "#    ", "#####"],
  "-": ["     ", "     ", "     ", "#####", "     ", "     ", "     "],
  "#": [" # # ", " # # ", "#####", " # # ", "#####", " # # ", " # # "],
  "·": ["     ", "     ", "     ", "  #  ", "     ", "     ", "     "],
  ".": ["     ", "     ", "     ", "     ", "     ", " ##  ", " ##  "],
  ",": ["     ", "     ", "     ", "     ", " ##  ", "  #  ", " #   "],
  "=": ["     ", "#####", "#####", "     ", "#####", "#####", "     "],
  ":": ["     ", " ##  ", " ##  ", "     ", " ##  ", " ##  ", "     "],
  "/": ["     ", "    #", "   # ", "  #  ", " #   ", "#    ", "     "],
  "+": ["     ", "  #  ", "  #  ", "#####", "  #  ", "  #  ", "     "],
  "*": ["     ", "# # #", " ### ", "#####", " ### ", "# # #", "     "],
  "!": ["  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "     ", "  #  "],
  "?": [" ### ", "#   #", "    #", "   # ", "  #  ", "     ", "  #  "],
  "(": ["   # ", "  #  ", " #   ", " #   ", " #   ", "  #  ", "   # "],
  ")": [" #   ", "  #  ", "   # ", "   # ", "   # ", "  #  ", " #   "],
  "<": ["    #", "   # ", "  #  ", " #   ", "  #  ", "   # ", "    #"],
  ">": ["#    ", " #   ", "  #  ", "   # ", "  #  ", " #   ", "#    "],
  _: ["     ", "     ", "     ", "     ", "     ", "     ", "#####"],
  "'": ["  #  ", "  #  ", " #   ", "     ", "     ", "     ", "     "],
  "%": ["##   ", "##  #", "   # ", "  #  ", " #   ", "#  ##", "   ##"],
  "&": [" ##  ", "#  # ", "# #  ", " #   ", "# # #", "#  # ", " ## #"],
  "~": ["     ", "     ", " #   ", "# # #", "   # ", "     ", "     "],
  "▲": ["     ", "  #  ", " ### ", "#####", "     ", "     ", "     "],
  "▼": ["     ", "     ", "#####", " ### ", "  #  ", "     ", "     "],
  "♪": ["  ## ", "  # #", "  #  ", "  #  ", "###  ", "###  ", "     "],
  " ": ["     ", "     ", "     ", "     ", "     ", "     ", "     "],
};

const CHARS = Object.keys(GLYPHS);
const INDEX = new Map(CHARS.map((c, i) => [c, i]));

const atlases = new Map<string, HTMLCanvasElement>();

/** The atlas for a color at `px` device pixels per font pixel. */
function atlas(color: string, px: number): HTMLCanvasElement {
  const key = `${color}|${px}`;
  let a = atlases.get(key);
  if (a) return a;
  a = document.createElement("canvas");
  a.width = CHARS.length * CELL_W * px;
  a.height = CELL_H * px;
  const ctx = a.getContext("2d")!;
  ctx.fillStyle = color;
  CHARS.forEach((ch, i) => {
    GLYPHS[ch].forEach((line, y) => {
      for (let x = 0; x < line.length; x++)
        if (line[x] === "#") ctx.fillRect((i * CELL_W + x) * px, (y + 1) * px, px, px);
    });
  });
  if (atlases.size > 64) atlases.clear();
  atlases.set(key, a);
  return a;
}

/** Forget the atlases (after a theme change, their colors are stale). */
export function clearPixelFont() {
  atlases.clear();
}

/**
 * Draw text at device pixel (x, y), `px` device pixels per font pixel. The context's transform
 * should be the identity (device pixels).
 */
export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  px: number,
) {
  const a = atlas(color, px);
  const w = CELL_W * px;
  const h = CELL_H * px;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === " ") continue;
    const g = INDEX.get(ch) ?? INDEX.get(ch.toUpperCase()) ?? INDEX.get("?")!;
    ctx.drawImage(a, g * w, 0, w, h, x + i * w, y, w, h);
  }
}

/** Whether the font has a glyph for a character (else it draws `?`). */
export const hasGlyph = (ch: string) => INDEX.has(ch) || INDEX.has(ch.toUpperCase());
