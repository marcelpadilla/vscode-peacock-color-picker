/**
 * A hand-rolled PNG encoder for color swatches.
 *
 * Free of any `vscode` import so the encoder can be unit tested in plain Node.
 */
import * as zlib from 'node:zlib';

const SIZE = 16;
const CORNER = 3.5;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Coverage of a rounded square at a pixel center, used to antialias the corners. */
function alphaAt(x: number, y: number): number {
  const cx = Math.min(x + 0.5, SIZE - x - 0.5);
  const cy = Math.min(y + 0.5, SIZE - y - 0.5);
  if (cx >= CORNER || cy >= CORNER) {
    return 1;
  }
  const dx = CORNER - cx;
  const dy = CORNER - cy;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return Math.max(0, Math.min(1, CORNER - distance + 0.5));
}

/**
 * Encode a square RGBA bitmap as a PNG.
 *
 * @param pixels row-major RGBA bytes, `size * size * 4` long
 */
export function encodeRgbaPng(pixels: Uint8Array, size: number): Buffer {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    Buffer.from(pixels.buffer, pixels.byteOffset + y * size * 4, size * 4).copy(
      raw,
      y * stride + 1,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolor with alpha

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Coverage of the 1px ring just inside the rounded edge. */
function ringAt(x: number, y: number): number {
  const outer = alphaAt(x, y);
  const inner = alphaAt2(x, y);
  return Math.max(0, outer - inner);
}

/** Same rounded square, inset by a pixel, used to carve the ring out. */
function alphaAt2(x: number, y: number): number {
  const cx = Math.min(x + 0.5 - 1, SIZE - x - 0.5 - 1);
  const cy = Math.min(y + 0.5 - 1, SIZE - y - 0.5 - 1);
  if (cx <= 0 || cy <= 0) {
    return 0;
  }
  const corner = CORNER - 1;
  if (cx >= corner || cy >= corner) {
    return 1;
  }
  const dx = corner - cx;
  const dy = corner - cy;
  return Math.max(0, Math.min(1, corner - Math.sqrt(dx * dx + dy * dy) + 0.5));
}

/**
 * QuickPick items take an icon as a Uri, so a color swatch has to be an actual
 * image. A 16px rounded square is small enough to build by hand, and small
 * enough that inlining it into a `data:` Uri costs nothing.
 *
 * The outline matters: without it a white swatch disappears on a light theme and
 * a near-black one disappears on a dark theme. Two variants are produced, and
 * the icon is handed to VS Code as a light/dark pair.
 */
export function solidSwatchPng(
  r: number,
  g: number,
  b: number,
  ring: 'light' | 'dark' = 'light',
): Buffer {
  // On a dark theme the outline is lighter than the panel, and vice versa.
  const ringLevel = ring === 'light' ? 255 : 0;
  const ringAlpha = 0.45;

  const pixels = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const fill = alphaAt(x, y);
      const edge = ringAt(x, y) * ringAlpha;

      // Composite the ring over the fill, both against transparency.
      pixels[i] = Math.round(r * (1 - edge) + ringLevel * edge);
      pixels[i + 1] = Math.round(g * (1 - edge) + ringLevel * edge);
      pixels[i + 2] = Math.round(b * (1 - edge) + ringLevel * edge);
      pixels[i + 3] = Math.round(255 * fill);
    }
  }
  return encodeRgbaPng(pixels, SIZE);
}

