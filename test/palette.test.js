const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { buildRainbow, buildNeutrals, nameForHue, cuspFor } = require(
  path.join(__dirname, '..', 'out', 'palette.js'),
);
const cs = require(path.join(__dirname, '..', 'media', 'color-spaces.js'));
const { normalizeHex } = require(path.join(__dirname, '..', 'out', 'color.js'));

/** Shortest distance between two hue angles, in degrees. */
function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

test('the rainbow has the twenty steps the menu promises', () => {
  assert.equal(buildRainbow().length, 20);
  assert.equal(buildRainbow(12).length, 12);
});

test('every rainbow color is hex Peacock will accept', () => {
  for (const entry of buildRainbow()) {
    assert.equal(normalizeHex(entry.value), entry.value, `${entry.name} is not normalized hex`);
  }
});

test('rainbow names and colors are all distinct', () => {
  const rainbow = buildRainbow();
  assert.equal(new Set(rainbow.map(c => c.name)).size, rainbow.length, 'duplicate names');
  assert.equal(new Set(rainbow.map(c => c.value)).size, rainbow.length, 'duplicate colors');
});

test('the steps are evenly spaced around the OKLCH hue circle', () => {
  // This is the whole reason for OKLCH over HSV: equal steps of the hue angle
  // are equal steps of perceived hue, so the ramp has no crowded stretches.
  const hues = buildRainbow().map(c => cs.hexToOklch(c.value)[2]);
  const gaps = hues.map((h, i) => {
    const next = hues[(i + 1) % hues.length];
    return (next - h + 360) % 360;
  });
  for (const gap of gaps) {
    assert.ok(
      Math.abs(gap - 18) < 2.5,
      `expected 18 degree steps, found one of ${gap.toFixed(1)}`,
    );
  }
});

test('each step is as vivid as sRGB allows at that hue', () => {
  // Riding the gamut cusp is what keeps yellow yellow instead of olive.
  for (const entry of buildRainbow()) {
    const [L, C, H] = cs.hexToOklch(entry.value);
    const { chroma } = cuspFor(H);
    assert.ok(
      C > chroma * 0.85,
      `${entry.name} uses chroma ${C.toFixed(3)} of an available ${chroma.toFixed(3)}`,
    );
    assert.ok(L > 0.2 && L < 1, `${entry.name} has an unusable lightness ${L.toFixed(2)}`);
  }
});

test('the cusp really is the most chroma available at its hue', () => {
  for (const hue of [29, 101, 155, 209, 263, 335]) {
    const { lightness, chroma } = cuspFor(hue);
    for (const offset of [-0.2, -0.1, 0.1, 0.2]) {
      const other = lightness + offset;
      if (other > 0 && other < 1) {
        assert.ok(
          cs.maxChroma(other, hue) <= chroma + 1e-3,
          `hue ${hue} has more chroma at L=${other.toFixed(2)} than at its cusp`,
        );
      }
    }
  }
});

test('a step is named after the hue nearest it', () => {
  for (const entry of buildRainbow()) {
    const hue = cs.hexToOklch(entry.value)[2];
    assert.equal(nameForHue(hue), entry.name, `${entry.value} at hue ${hue.toFixed(1)}`);
  }
});

test('naming is stable across the wrap at zero degrees', () => {
  assert.equal(nameForHue(359), nameForHue(-1));
  assert.equal(nameForHue(0), nameForHue(360));
  assert.equal(nameForHue(29.2), 'Red');
  assert.equal(nameForHue(263.2), 'Blue');
});

test('neutrals carry no hue at all', () => {
  for (const entry of buildNeutrals()) {
    const [, chroma] = cs.hexToOklch(entry.value);
    // Not exactly zero: the round trip leaves float noise around 1e-8, which is
    // orders of magnitude below anything representable in 8-bit colour.
    assert.ok(chroma < 1e-6, `${entry.name} (${entry.value}) has chroma ${chroma}`);
  }
});

test('there are six neutrals and the last one is pure white', () => {
  const neutrals = buildNeutrals();
  assert.equal(neutrals.length, 6);
  assert.equal(neutrals[neutrals.length - 1].value, '#ffffff');
});

test('neutrals climb in equal steps of perceived lightness', () => {
  // Equal steps of an sRGB channel are not equal to the eye; equal steps of
  // OKLCH lightness are, which is the point of building them this way.
  const lightness = buildNeutrals().map(entry => cs.hexToOklch(entry.value)[0]);
  const steps = lightness.slice(1).map((l, i) => l - lightness[i]);
  const spread = Math.max(...steps) - Math.min(...steps);
  assert.ok(spread < 0.005, `steps vary by ${spread.toFixed(4)} in lightness`);
  for (const step of steps) {
    assert.ok(step > 0, 'neutrals must ascend');
  }
});

test('neutrals are hex Peacock will accept', () => {
  for (const entry of buildNeutrals()) {
    assert.equal(normalizeHex(entry.value), entry.value);
  }
});

test('buildNeutrals hands back a copy each time', () => {
  const first = buildNeutrals();
  first[0].name = 'mutated';
  assert.notEqual(buildNeutrals()[0].name, 'mutated');
});
