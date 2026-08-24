const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Loading the webview script for its side effect: it publishes on globalThis.
require(path.join(__dirname, '..', 'media', 'color-math.js'));
const { hsvToRgb, rgbToHsv, toHex, parseHex } = globalThis.PeacockColorMath;

const { normalizeHex } = require(path.join(__dirname, '..', 'out', 'color.js'));

test('parseHex accepts the forms the hex field allows', () => {
  assert.deepEqual(parseHex('#ff0000'), [255, 0, 0]);
  assert.deepEqual(parseHex('ff0000'), [255, 0, 0]);
  assert.deepEqual(parseHex('#F00'), [255, 0, 0]);
  assert.deepEqual(parseHex('  #42b883  '), [66, 184, 131]);
  assert.equal(parseHex('#ff00'), undefined);
  assert.equal(parseHex('rebeccapurple'), undefined);
  assert.equal(parseHex(''), undefined);
});

test('toHex pads single-digit channels', () => {
  assert.equal(toHex(0, 0, 0), '#000000');
  assert.equal(toHex(1, 2, 3), '#010203');
  assert.equal(toHex(255, 255, 255), '#ffffff');
});

test('hsvToRgb hits the primaries at the expected angles', () => {
  assert.deepEqual(hsvToRgb(0, 1, 1), [255, 0, 0]);
  assert.deepEqual(hsvToRgb(120, 1, 1), [0, 255, 0]);
  assert.deepEqual(hsvToRgb(240, 1, 1), [0, 0, 255]);
  // The wheel feeds atan2 output straight in, so negative hues must wrap.
  assert.deepEqual(hsvToRgb(-120, 1, 1), [0, 0, 255]);
  assert.deepEqual(hsvToRgb(480, 1, 1), [0, 255, 0]);
});

test('hsvToRgb collapses to grey at zero saturation and black at zero value', () => {
  assert.deepEqual(hsvToRgb(200, 0, 1), [255, 255, 255]);
  assert.deepEqual(hsvToRgb(200, 0, 0.5), [128, 128, 128]);
  assert.deepEqual(hsvToRgb(200, 1, 0), [0, 0, 0]);
});

test('hex survives a full rgb -> hsv -> rgb round trip', () => {
  const samples = [
    '#42b883', '#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000',
    '#123456', '#fedcba', '#7f7f7f', '#010203', '#832561', '#215732',
  ];
  for (const hex of samples) {
    const [r, g, b] = parseHex(hex);
    const { h, s, v } = rgbToHsv(r, g, b);
    assert.equal(toHex(...hsvToRgb(h, s, v)), hex, `round trip failed for ${hex}`);
  }
});

test('round trip is exact across a dense sweep of the color cube', () => {
  for (let r = 0; r < 256; r += 7) {
    for (let g = 0; g < 256; g += 11) {
      for (let b = 0; b < 256; b += 13) {
        const { h, s, v } = rgbToHsv(r, g, b);
        assert.deepEqual(hsvToRgb(h, s, v), [r, g, b], `round trip failed for ${r},${g},${b}`);
      }
    }
  }
});

test('normalizeHex produces what Peacock will accept', () => {
  assert.equal(normalizeHex('#42B883'), '#42b883');
  assert.equal(normalizeHex('#f00'), '#ff0000');
  assert.equal(normalizeHex('  #42b883  '), '#42b883');
  // Peacock's colors are opaque, so an alpha channel is dropped rather than passed on.
  assert.equal(normalizeHex('#42b88380'), '#42b883');
  assert.equal(normalizeHex('#12345'), undefined);
  assert.equal(normalizeHex('red'), undefined);
  assert.equal(normalizeHex(undefined), undefined);
  assert.equal(normalizeHex(42), undefined);
});

const { pointerToHueSat, hueSatToPointer } = globalThis.PeacockColorMath;

test('pointerToHueSat places the primaries where the wheel paints them', () => {
  const radius = 100;
  // atan2 puts 0 degrees to the right and y grows downward.
  assert.equal(Math.round(pointerToHueSat(radius, 0, radius).h), 0); // red, right
  assert.equal(Math.round(pointerToHueSat(0, radius, radius).h), 90); // chartreuse, bottom
  assert.equal(Math.round(pointerToHueSat(-radius, 0, radius).h), 180); // cyan, left
  assert.equal(Math.round(pointerToHueSat(0, -radius, radius).h), 270); // violet, top
});

test('pointerToHueSat ramps saturation outward and clamps past the rim', () => {
  const radius = 100;
  assert.equal(pointerToHueSat(0, 0, radius).s, 0);
  assert.equal(pointerToHueSat(50, 0, radius).s, 0.5);
  assert.equal(pointerToHueSat(100, 0, radius).s, 1);
  // Releasing outside the disc should still give the hue at full saturation
  // rather than an out-of-range value.
  assert.equal(pointerToHueSat(400, 0, radius).s, 1);
  assert.equal(pointerToHueSat(0, 0, 0).s, 0);
});

test('the marker lands back on the pixel that was clicked', () => {
  const radius = 128;
  const points = [
    [10, 0], [0, 10], [-40, 60], [90, -70], [-100, -20], [3, -125], [70, 70],
  ];
  for (const [dx, dy] of points) {
    const { h, s } = pointerToHueSat(dx, dy, radius);
    const back = hueSatToPointer(h, s, radius);
    assert.ok(
      Math.abs(back.x - dx) < 1e-9 && Math.abs(back.y - dy) < 1e-9,
      `marker drifted for (${dx}, ${dy}): got (${back.x}, ${back.y})`,
    );
  }
});
