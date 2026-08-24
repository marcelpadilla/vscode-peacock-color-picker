const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const cs = require(path.join(__dirname, '..', 'media', 'color-spaces.js'));

/** Shortest angular distance between two hues, in degrees. */
function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function close(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected} +/- ${tolerance}, got ${actual}`,
  );
}

test('the sRGB transfer function inverts itself', () => {
  for (let i = 0; i <= 1000; i++) {
    const c = i / 1000;
    close(cs.linearToSrgb(cs.srgbToLinear(c)), c, 1e-9, `round trip at ${c}`);
  }
});

test('the sRGB transfer function is sign preserving', () => {
  // Gamut mapping evaluates colors that fall outside 0..1 before clipping them,
  // so the transfer function has to behave on negatives instead of producing NaN.
  close(cs.linearToSrgb(-0.5), -cs.linearToSrgb(0.5), 1e-12, 'negative linear');
  close(cs.srgbToLinear(-0.5), -cs.srgbToLinear(0.5), 1e-12, 'negative encoded');
  assert.ok(Number.isFinite(cs.linearToSrgb(-2)));
});

test('known sRGB colors land on their published Oklch coordinates', () => {
  // Reference values from the Oklab article and CSS Color 4 examples.
  const cases = [
    ['#ffffff', 1.0, 0.0, null],
    ['#000000', 0.0, 0.0, null],
    ['#ff0000', 0.6279, 0.2577, 29.23],
    ['#00ff00', 0.8664, 0.2948, 142.5],
    ['#0000ff', 0.452, 0.3132, 264.05],
  ];
  for (const [hex, L, C, H] of cases) {
    const [l, c, h] = cs.hexToOklch(hex);
    close(l, L, 0.001, `${hex} lightness`);
    close(c, C, 0.001, `${hex} chroma`);
    if (H !== null) {
      close(h, H, 0.1, `${hex} hue`);
    }
  }
});

test('every 8-bit color survives a round trip through Oklch exactly', () => {
  for (let r = 0; r < 256; r += 5) {
    for (let g = 0; g < 256; g += 7) {
      for (let b = 0; b < 256; b += 11) {
        const oklch = cs.rgbToOklch([r, g, b]);
        const back = cs.gamutMapOklch(oklch);
        assert.deepEqual(back, [r, g, b], `round trip failed for ${r},${g},${b}`);
      }
    }
  }
});

test('grey stays grey: zero chroma round trips without a hue appearing', () => {
  for (let v = 0; v < 256; v += 3) {
    const [, chroma] = cs.rgbToOklch([v, v, v]);
    close(chroma, 0, 1e-6, `grey ${v} picked up chroma`);
  }
});

test('gamut mapping always produces a color sRGB can show', () => {
  // Chroma far past anything sRGB holds, swept across every hue.
  for (let h = 0; h < 360; h += 5) {
    for (const L of [0.15, 0.35, 0.55, 0.75, 0.95]) {
      const rgb = cs.gamutMapOklch([L, 0.4, h]);
      for (const channel of rgb) {
        assert.ok(
          Number.isInteger(channel) && channel >= 0 && channel <= 255,
          `L=${L} H=${h} produced channel ${channel}`,
        );
      }
    }
  }
});

test('gamut mapping holds hue within the tolerance the spec allows', () => {
  // CSS Color 4 accepts a clipped candidate once it is within a just noticeable
  // difference (deltaEOK 0.02) of the chroma-reduced one. That budget is spent
  // partly on hue, so a few degrees of drift is conformant, not a bug. What
  // matters is that it stays small and bounded; see the comparison below.
  for (let h = 0; h < 360; h += 5) {
    const mapped = cs.rgbToOklch(cs.gamutMapOklch([0.55, 0.35, h]));
    const drift = hueDistance(mapped[2], h);
    assert.ok(drift < 8, `hue ${h} drifted ${drift.toFixed(1)} degrees to ${mapped[2].toFixed(1)}`);
  }
});

test('chroma reduction beats clipping the channels outright', () => {
  // The reason the binary search exists: clipping an out-of-gamut color channel
  // by channel swings its hue. If this ever stops being true, the simpler
  // implementation would be the better one.
  let worstMapped = 0;
  let worstClipped = 0;

  for (let h = 0; h < 360; h += 5) {
    const requested = [0.55, 0.35, h];
    worstMapped = Math.max(worstMapped, hueDistance(cs.rgbToOklch(cs.gamutMapOklch(requested))[2], h));

    const clipped = cs.clipSrgb(cs.oklabToSrgb(cs.oklchToOklab(requested))).map(c => c * 255);
    worstClipped = Math.max(worstClipped, hueDistance(cs.rgbToOklch(clipped)[2], h));
  }

  assert.ok(
    worstMapped < worstClipped / 3,
    `mapping drifts ${worstMapped.toFixed(1)} degrees vs ${worstClipped.toFixed(1)} for clipping`,
  );
});

test('gamut mapping keeps lightness where it was asked to be', () => {
  for (let h = 0; h < 360; h += 30) {
    for (const L of [0.3, 0.5, 0.7]) {
      const mapped = cs.rgbToOklch(cs.gamutMapOklch([L, 0.35, h]));
      close(mapped[0], L, 0.02, `L=${L} H=${h} lightness moved`);
    }
  }
});

test('maxChroma marks the boundary of what sRGB can show', () => {
  for (let h = 0; h < 360; h += 11) {
    for (const L of [0.25, 0.5, 0.75]) {
      const limit = cs.maxChroma(L, h);
      assert.ok(limit > 0, `no chroma available at L=${L} H=${h}`);
      assert.ok(
        cs.inGamut(cs.oklabToSrgb(cs.oklchToOklab([L, limit * 0.98, h]))),
        `just inside the limit is out of gamut at L=${L} H=${h}`,
      );
      assert.equal(
        cs.inGamut(cs.oklabToSrgb(cs.oklchToOklab([L, limit * 1.15 + 0.01, h]))),
        false,
        `past the limit is still in gamut at L=${L} H=${h}`,
      );
    }
  }
});

test('maxChroma is zero at pure black and pure white', () => {
  assert.equal(cs.maxChroma(0, 120), 0);
  assert.equal(cs.maxChroma(1, 120), 0);
});

test('deltaEOK is zero for identical colors and grows with difference', () => {
  const a = cs.rgbToOklab([100, 150, 200]);
  assert.equal(cs.deltaEOK(a, a), 0);
  const near = cs.rgbToOklab([102, 150, 200]);
  const far = cs.rgbToOklab([250, 20, 10]);
  assert.ok(cs.deltaEOK(a, near) < cs.deltaEOK(a, far));
});

test('hex parsing matches the shorthand the pickers accept', () => {
  assert.deepEqual(cs.hexToRgb('#F00'), [255, 0, 0]);
  assert.deepEqual(cs.hexToRgb('42b883'), [66, 184, 131]);
  assert.equal(cs.hexToRgb('#12345'), undefined);
  assert.equal(cs.hexToOklch('nope'), undefined);
});
