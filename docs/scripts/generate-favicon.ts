/**
 * Generates favicon files from the "R" letter of the RUNE ASCII art.
 *
 * Output:
 *   - favicon.svg           (with prefers-color-scheme support)
 *   - apple-touch-icon.png  (180x180)
 *   - favicon.ico           (32x32)
 *
 * Run: node docs/scripts/generate-favicon.ts
 * Requires: sharp (`npm i -D sharp`)
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const R_LINES = ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔══██╗", "██║  ██║", "╚═╝  ╚═╝"];

// --- Shared renderer (same logic as rune-banner-svg.ts) ---

function renderCell(char: string, cx: number, cy: number, w: number, h: number): string {
  if (char === " ") return "";
  if (char === "█") return `<rect x="${cx}" y="${cy}" width="${w}" height="${h}"/>`;

  const lw = w * 0.22;
  const lh = h * 0.16;
  const lx = cx + (w - lw) / 2;
  const ly = cy + (h - lh) / 2;

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

  if (goRight || goLeft) {
    const hx = goLeft ? cx : lx;
    const hw = (goRight ? cx + w : lx + lw) - hx;
    r(hx, ly, hw, lh);
  }

  if (goUp || goDown) {
    const vy = goUp ? cy : ly;
    const vh = (goDown ? cy + h : ly + lh) - vy;
    r(lx, vy, lw, vh);
  }

  return rects.join("");
}

// --- Build R rects ---

const CELL_W = 10;
const CELL_H = 16;
const maxCols = Math.max(...R_LINES.map((l) => Array.from(l).length));
const contentW = maxCols * CELL_W;
const contentH = R_LINES.length * CELL_H;

// Make it square with padding
const size = Math.max(contentW, contentH) + 16;
const offsetX = (size - contentW) / 2;
const offsetY = (size - contentH) / 2 + 3;

const allRects: string[] = [];
for (let row = 0; row < R_LINES.length; row++) {
  const chars = Array.from(R_LINES[row]!);
  for (let col = 0; col < chars.length; col++) {
    const ch = chars[col]!;
    const cx = offsetX + col * CELL_W;
    const cy = offsetY + row * CELL_H;
    const svg = renderCell(ch, cx, cy, CELL_W, CELL_H);
    if (svg) allRects.push(svg);
  }
}

const rectsBody = allRects.join("\n    ");
const outDir = import.meta.dirname!;

// 1. favicon.svg — with prefers-color-scheme
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <style>
    g { fill: #1a1a2e; }
    @media (prefers-color-scheme: dark) {
      g { fill: #e8e8f0; }
    }
  </style>
  <g>
    ${rectsBody}
  </g>
</svg>
`;
const svgPath = resolve(outDir, "favicon.svg");
writeFileSync(svgPath, faviconSvg);
console.log(`Written: ${svgPath}`);

// 2. apple-touch-icon.png (180x180) and favicon.ico (32x32)
async function generateRaster() {
  const sharp = (await import("sharp")).default;

  // Use a light-background version for raster (apple-touch-icon has solid bg)
  const rasterSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="512" height="512">
  <rect width="${size}" height="${size}" fill="#ffffff" rx="${size * 0.1}"/>
  <g fill="#1a1a2e">
    ${rectsBody}
  </g>
</svg>
`;
  const svgBuffer = Buffer.from(rasterSvg);

  // apple-touch-icon.png (180x180)
  const applePath = resolve(outDir, "apple-touch-icon.png");
  await sharp(svgBuffer).resize(180, 180).png().toFile(applePath);
  console.log(`Written: ${applePath}`);

  // favicon.ico (32x32 PNG inside ICO container)
  const ico32 = await sharp(svgBuffer).resize(32, 32).png().toBuffer();
  const icoBuffer = createIco(ico32, 32);
  const icoPath = resolve(outDir, "favicon.ico");
  writeFileSync(icoPath, icoBuffer);
  console.log(`Written: ${icoPath}`);
}

/** Wrap a single PNG buffer in a minimal ICO container */
function createIco(pngBuffer: Buffer, size: number): Buffer {
  // ICO header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // ICO type
  header.writeUInt16LE(1, 4); // 1 image

  // Directory entry: 16 bytes
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0); // width (0 = 256)
  entry.writeUInt8(size === 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // color palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8); // image size
  entry.writeUInt32LE(6 + 16, 12); // offset to image data

  return Buffer.concat([header, entry, pngBuffer]);
}

await generateRaster();
