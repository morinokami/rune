/**
 * Generates an SVG image from the RUNE ASCII art banner.
 * All characters are converted to vector paths (no font dependency).
 *
 * Run: node docs/scripts/generate-logo.ts
 * Output: docs/scripts/logo-light.svg, docs/scripts/logo-dark.svg
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const LETTERS: Record<string, string[]> = {
  R: ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔══██╗", "██║  ██║", "╚═╝  ╚═╝"],
  U: ["██╗   ██╗", "██║   ██║", "██║   ██║", "██║   ██║", "╚██████╔╝", " ╚═════╝ "],
  N: ["███╗   ██╗", "████╗  ██║", "██╔██╗ ██║", "██║╚██╗██║", "██║ ╚████║", "╚═╝  ╚═══╝"],
  E: ["███████╗", "██╔════╝", "█████╗  ", "██╔══╝  ", "███████╗", "╚══════╝"],
};

const GAP = "  ";
const word = "RUNE";
const height = LETTERS["R"]!.length;

// Build the full character grid
const lines: string[] = [];
for (let row = 0; row < height; row++) {
  const line = Array.from(word)
    .map((ch) => LETTERS[ch]![row])
    .join(GAP);
  lines.push(line);
}

// --- SVG generation ---

const CELL_W = 10;
const CELL_H = 16;
const PAD_X = 12;
const PAD_Y_TOP = 13;
const PAD_Y_BOTTOM = 7;

const maxCols = Math.max(...lines.map((l) => Array.from(l).length));
const svgWidth = maxCols * CELL_W + PAD_X * 2;
const svgHeight = lines.length * CELL_H + PAD_Y_TOP + PAD_Y_BOTTOM;

/** Render a single character cell as SVG rect elements */
function renderCell(char: string, cx: number, cy: number, w: number, h: number): string {
  if (char === " ") return "";
  if (char === "█") return `<rect x="${cx}" y="${cy}" width="${w}" height="${h}"/>`;

  // Single-line box-drawing metrics
  const lw = w * 0.22;
  const lh = h * 0.16;
  // Centered line position
  const lx = cx + (w - lw) / 2;
  const ly = cy + (h - lh) / 2;

  // Determine which directions extend from center
  const goRight = char === "╔" || char === "╚" || char === "═";
  const goLeft = char === "╗" || char === "╝" || char === "═";
  const goDown = char === "╔" || char === "╗" || char === "║";
  const goUp = char === "╚" || char === "╝" || char === "║";

  const rects: string[] = [];
  const r = (rx: number, ry: number, rw: number, rh: number) => {
    if (rw > 0.01 && rh > 0.01) {
      rects.push(
        `<rect x="${rx.toFixed(2)}" y="${ry.toFixed(2)}" width="${rw.toFixed(2)}" height="${rh.toFixed(2)}"/>`,
      );
    }
  };

  // Horizontal line
  if (goRight || goLeft) {
    const hx = goLeft ? cx : lx;
    const hw = (goRight ? cx + w : lx + lw) - hx;
    r(hx, ly, hw, lh);
  }

  // Vertical line
  if (goUp || goDown) {
    const vy = goUp ? cy : ly;
    const vh = (goDown ? cy + h : ly + lh) - vy;
    r(lx, vy, lw, vh);
  }

  return rects.join("");
}

// Build all rects
const allRects: string[] = [];
for (let row = 0; row < lines.length; row++) {
  const chars = Array.from(lines[row]!);
  for (let col = 0; col < chars.length; col++) {
    const ch = chars[col]!;
    const cx = PAD_X + col * CELL_W;
    const cy = PAD_Y_TOP + row * CELL_H;
    const svg = renderCell(ch, cx, cy, CELL_W, CELL_H);
    if (svg) allRects.push(svg);
  }
}

const variants = [
  { name: "logo-light.svg", fill: "#1a1a2e" },
  { name: "logo-dark.svg", fill: "#e8e8f0" },
] as const;

for (const { name, fill } of variants) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" role="img" aria-label="RUNE">
  <g fill="${fill}">
    ${allRects.join("\n    ")}
  </g>
</svg>
`;
  const outPath = resolve(import.meta.dirname!, name);
  writeFileSync(outPath, svg);
  console.log(`Written to ${outPath}`);
}
