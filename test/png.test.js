const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const path = require('node:path');

const { solidSwatchPng } = require(path.join(__dirname, '..', 'out', 'png.js'));

/** Pull the raw scanlines back out of a PNG we just wrote. */
function decode(png) {
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'bad PNG signature');
  assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const bitDepth = png[24];
  const colorType = png[25];

  let offset = 8;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') {
      idat.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixel = (x, y) => {
    const row = y * (width * 4 + 1);
    assert.equal(raw[row], 0, 'expected filter type 0');
    const i = row + 1 + x * 4;
    return [raw[i], raw[i + 1], raw[i + 2], raw[i + 3]];
  };
  return { width, height, bitDepth, colorType, pixel };
}

test('a swatch is a valid 16x16 RGBA PNG', () => {
  const png = decode(solidSwatchPng(0x42, 0xb8, 0x83));
  assert.equal(png.width, 16);
  assert.equal(png.height, 16);
  assert.equal(png.bitDepth, 8);
  assert.equal(png.colorType, 6, 'expected truecolor with alpha');
});

test('a swatch is the requested color, opaque in the middle', () => {
  const png = decode(solidSwatchPng(0x42, 0xb8, 0x83));
  assert.deepEqual(png.pixel(8, 8), [0x42, 0xb8, 0x83, 255]);
  assert.deepEqual(png.pixel(2, 8), [0x42, 0xb8, 0x83, 255]);
});

test('swatch corners are rounded off rather than square', () => {
  const png = decode(solidSwatchPng(255, 0, 0));
  for (const [x, y] of [[0, 0], [15, 0], [0, 15], [15, 15]]) {
    const alpha = png.pixel(x, y)[3];
    assert.ok(alpha < 128, `corner (${x},${y}) alpha ${alpha} is not cut away`);
  }
  // The straight edges between the corners stay solid.
  assert.equal(png.pixel(8, 0)[3], 255);
  assert.equal(png.pixel(0, 8)[3], 255);
});

test('black swatches survive the round trip without collapsing to transparent', () => {
  const png = decode(solidSwatchPng(0, 0, 0));
  assert.deepEqual(png.pixel(8, 8), [0, 0, 0, 255]);
});
