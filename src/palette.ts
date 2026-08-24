import spaces, { type Triplet } from './color-spaces';

export interface PaletteColor {
  name: string;
  value: string;
}

/**
 * Colors for the menu, laid out in OKLCH rather than HSV.
 *
 * HSV's "value" is not brightness: a pure yellow and a pure blue at V=1 differ
 * by roughly a factor of five in perceived lightness, which is why a naive HSV
 * ramp glares in the warm half and goes muddy in the cool half. OKLCH is built
 * so that a step in L is the same perceptual step at every hue, so a sweep of
 * the hue angle produces a rainbow that reads as one family.
 */

/** Steps around the hue circle. */
const RAINBOW_STEPS = 20;

/** Pull back slightly from the very edge of the gamut. */
const RAINBOW_CHROMA_FRACTION = 0.95;

/** OKLCH hue of pure sRGB red, where the ramp starts. */
const RED_HUE = 29.23;

/**
 * Names anchored to hue angles measured in OKLCH.
 *
 * They are not evenly spaced in HSV terms, and cannot be: OKLCH gives the blues
 * a far wider arc than HSV does and squeezes yellow through green into a narrow
 * band. Naming a step by its index would drift, so each step takes the name of
 * the nearest anchor.
 */
const HUE_ANCHORS: ReadonlyArray<readonly [string, number]> = [
  ['Red', 29.2],
  ['Orange', 47.2],
  ['Tangerine', 65.2],
  ['Amber', 83.2],
  ['Yellow', 101.2],
  ['Chartreuse', 119.2],
  ['Lime', 137.2],
  ['Green', 155.2],
  ['Emerald', 173.2],
  ['Cyan', 191.2],
  ['Aqua', 209.2],
  ['Sky', 227.2],
  ['Azure', 245.2],
  ['Blue', 263.2],
  ['Indigo', 281.2],
  ['Violet', 299.2],
  ['Purple', 317.2],
  ['Magenta', 335.2],
  ['Pink', 353.2],
  ['Rose', 11.2],
];

/** Shortest distance between two hue angles, in degrees. */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function nameForHue(hue: number): string {
  let best = HUE_ANCHORS[0];
  for (const anchor of HUE_ANCHORS) {
    if (hueDistance(hue, anchor[1]) < hueDistance(hue, best[1])) {
      best = anchor;
    }
  }
  return best[0];
}

/**
 * The most colorful point sRGB offers at this hue: the lightness where the
 * gamut bulges furthest from the neutral axis, known as the cusp.
 *
 * A constant-lightness ramp is perceptually even but turns yellow olive, because
 * a genuinely yellow yellow lives near L = 0.97 and nothing at L = 0.6 can look
 * like it. Riding the cusp keeps every hue as vivid as sRGB allows. The hue
 * spacing is still perceptually even, which is what OKLCH is here for.
 */
export function cuspFor(hue: number): { lightness: number; chroma: number } {
  let lightness = 0;
  let chroma = 0;
  // Coarse sweep, then refine around the peak.
  for (let i = 1; i < 64; i++) {
    const L = i / 64;
    const C = spaces.maxChroma(L, hue);
    if (C > chroma) {
      chroma = C;
      lightness = L;
    }
  }
  const step = 1 / 64;
  for (let i = -32; i <= 32; i++) {
    const L = lightness + (i * step) / 32;
    if (L <= 0 || L >= 1) {
      continue;
    }
    const C = spaces.maxChroma(L, hue);
    if (C > chroma) {
      chroma = C;
      lightness = L;
    }
  }
  return { lightness, chroma };
}

/**
 * Six greys climbing to white in equal steps of perceived lightness.
 *
 * Equal steps of OKLCH lightness are equal steps to the eye, which equal steps
 * of an sRGB channel are not: the gap between #000 and #111 looks far larger
 * than the one between #eee and #fff.
 */
const NEUTRAL_STEPS = 6;
const NEUTRAL_DARKEST = 0.2;
const NEUTRAL_NAMES = ['Ink', 'Charcoal', 'Graphite', 'Stone', 'Silver', 'White'];

export function buildRainbow(steps: number = RAINBOW_STEPS): PaletteColor[] {
  const colors: PaletteColor[] = [];
  for (let i = 0; i < steps; i++) {
    const hue = (RED_HUE + (360 * i) / steps) % 360;
    const { lightness, chroma } = cuspFor(hue);
    const oklch: Triplet = [lightness, chroma * RAINBOW_CHROMA_FRACTION, hue];
    colors.push({ name: nameForHue(hue), value: spaces.oklchToHex(oklch) });
  }
  return colors;
}

export function buildNeutrals(): PaletteColor[] {
  const span = 1 - NEUTRAL_DARKEST;
  return NEUTRAL_NAMES.map((name, i) => ({
    name,
    // The last step lands exactly on L = 1, which is pure white.
    value: spaces.oklchToHex([NEUTRAL_DARKEST + (span * i) / (NEUTRAL_STEPS - 1), 0, 0]),
  }));
}
