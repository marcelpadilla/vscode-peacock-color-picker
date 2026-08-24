/**
 * Renders the Marketplace icon from `media/icon.svg`.
 *
 * The SVG is the source of truth and carries its own provenance note; this
 * only rasterises it. Its viewBox is the artwork's exact bounding box plus a
 * margin, so the render needs no cropping or centring and the PNG is a pure
 * function of the SVG.
 *
 * Run with `npm run icon`.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { findChrome } = require('./picker-page');

const SIZE = 256;
const MEDIA = path.join(__dirname, '..', 'media');
const SRC = path.join(MEDIA, 'icon.svg');
const OUT = path.join(MEDIA, 'icon.png');

const chrome = findChrome();
if (!chrome) {
  console.error('Chrome or Chromium is needed to rasterise the icon.');
  process.exit(1);
}

// No supersampling: --force-device-scale-factor multiplies the window size
// rather than the sampling rate, so it would just emit a larger PNG. The
// thinnest line here is the 0.14-unit body stroke, which is 2.3px once the
// 15.41-unit viewBox is mapped onto 256 -- comfortably above the point where
// Chrome's own vector antialiasing stops being enough.
execFileSync(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--default-background-color=00000000',
  `--window-size=${SIZE},${SIZE}`,
  `--screenshot=${OUT}`,
  `file://${SRC}`,
]);

const { width, height } = pngSize(fs.readFileSync(OUT));
console.log(`wrote ${path.relative(process.cwd(), OUT)} (${width}x${height})`);

/** Width and height out of a PNG's IHDR, so the output is actually checked. */
function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
