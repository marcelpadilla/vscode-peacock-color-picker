const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const m = require(path.join(__dirname, '..', 'media', 'color-math.js'));

/** tinycolor's HSL round trip, which Peacock's Lighten and Darken run through. */
test('rgb survives a round trip through HSL', () => {
  for (let r = 0; r < 256; r += 7) {
    for (let g = 0; g < 256; g += 11) {
      for (let b = 0; b < 256; b += 13) {
        const { h, s, l } = m.rgbToHsl(r, g, b);
        assert.deepEqual(m.hslToRgb(h, s, l), [r, g, b], `failed for ${r},${g},${b}`);
      }
    }
  }
});

test('zero steps leaves the color exactly alone', () => {
  assert.deepEqual(m.adjustLightness([54, 76, 103], 0, 5), [54, 76, 103]);
});

test('lightening raises HSL lightness by the given percent', () => {
  const start = [54, 76, 103];
  const before = m.rgbToHsl(...start).l;
  const after = m.rgbToHsl(...m.adjustLightness(start, 1, 5)).l;
  assert.ok(Math.abs(after - before - 0.05) < 0.005, `moved ${(after - before).toFixed(4)}`);
});

test('darkening is the mirror of lightening', () => {
  const start = [54, 76, 103];
  const up = m.rgbToHsl(...m.adjustLightness(start, 1, 5)).l;
  const down = m.rgbToHsl(...m.adjustLightness(start, -1, 5)).l;
  const middle = m.rgbToHsl(...start).l;
  assert.ok(Math.abs(up - middle - (middle - down)) < 0.005);
});

test('steps compose the way repeated key presses do', () => {
  // The control has to land where pressing the shortcut n times would.
  const start = [54, 76, 103];
  let repeated = start;
  for (let i = 0; i < 6; i++) {
    repeated = m.adjustLightness(repeated, 1, 5);
  }
  assert.deepEqual(m.adjustLightness(start, 6, 5), repeated);
});

test('lightening clamps at white and darkening at black', () => {
  assert.deepEqual(m.adjustLightness([255, 255, 255], 10, 5), [255, 255, 255]);
  assert.deepEqual(m.adjustLightness([0, 0, 0], -10, 5), [0, 0, 0]);
  assert.deepEqual(m.adjustLightness([54, 76, 103], 40, 5), [255, 255, 255]);
  assert.deepEqual(m.adjustLightness([54, 76, 103], -40, 5), [0, 0, 0]);
});

test('hue holds within the drift that per-step rounding causes', () => {
  // Each step rounds back to 8-bit channels, exactly as Peacock does on every
  // key press, and that rounding nudges the hue slightly. Matching Peacock
  // matters more than avoiding the drift, so the test bounds it rather than
  // forbidding it.
  const start = [54, 76, 103];
  const hue = m.rgbToHsl(...start).h * 360;
  for (const steps of [-3, -1, 1, 3, 8]) {
    const rgb = m.adjustLightness(start, steps, 5);
    const moved = m.rgbToHsl(...rgb);
    if (moved.s === 0) {
      continue; // clamped to black or white, where there is no hue to compare
    }
    const drift = Math.abs(moved.h * 360 - hue);
    assert.ok(drift < 5, `hue drifted ${drift.toFixed(2)} degrees at ${steps} steps`);
  }
});

test('a color driven to black or white has no hue left to preserve', () => {
  assert.deepEqual(m.adjustLightness([54, 76, 103], -8, 5), [0, 0, 0]);
  assert.equal(m.rgbToHsl(...m.adjustLightness([54, 76, 103], -8, 5)).s, 0);
});

test('grey stays grey through any adjustment', () => {
  for (const steps of [-10, -1, 1, 10]) {
    const [r, g, b] = m.adjustLightness([128, 128, 128], steps, 5);
    assert.equal(r, g);
    assert.equal(g, b);
  }
});
