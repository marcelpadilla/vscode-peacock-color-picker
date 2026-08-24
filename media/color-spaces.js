// @ts-check
/**
 * sRGB, Oklab and OKLCH conversions, plus CSS Color 4 gamut mapping.
 *
 * One implementation, used by both the webview (as a classic script that
 * publishes on `globalThis`) and the extension host (via `require`), so the
 * colors the picker draws and the colors the menu offers can never drift apart.
 *
 * Sources:
 *   Oklab matrices — Bjorn Ottosson, https://bottosson.github.io/posts/oklab/
 *   Gamut mapping  — CSS Color 4 s14.2, "Binary Search with Local MINDE"
 */
(function (root) {
  'use strict';

  /** Chroma beyond this is unreachable in sRGB for any hue. */
  const MAX_CHROMA = 0.4;

  // ------------------------------------------------------------ sRGB transfer

  /** Gamma-encoded sRGB channel (0..1) to linear light. Sign preserving. */
  function srgbToLinear(c) {
    const sign = c < 0 ? -1 : 1;
    const abs = Math.abs(c);
    return sign * (abs <= 0.04045 ? abs / 12.92 : Math.pow((abs + 0.055) / 1.055, 2.4));
  }

  /** Linear light to gamma-encoded sRGB (0..1). Sign preserving. */
  function linearToSrgb(c) {
    const sign = c < 0 ? -1 : 1;
    const abs = Math.abs(c);
    return sign * (abs <= 0.0031308 ? abs * 12.92 : 1.055 * Math.pow(abs, 1 / 2.4) - 0.055);
  }

  // ------------------------------------------------------------------- Oklab

  /** @param {[number,number,number]} rgb linear sRGB @returns {[number,number,number]} Oklab */
  function linearSrgbToOklab([r, g, b]) {
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

    const l_ = Math.cbrt(l);
    const m_ = Math.cbrt(m);
    const s_ = Math.cbrt(s);

    return [
      0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
      1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
      0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
    ];
  }

  /** @param {[number,number,number]} lab Oklab @returns {[number,number,number]} linear sRGB */
  function oklabToLinearSrgb([L, a, b]) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;

    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;

    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
  }

  // ------------------------------------------------------------------ OKLCH

  /** Oklab to OKLCH. Hue in degrees, chroma as the polar radius. */
  function oklabToOklch([L, a, b]) {
    const chroma = Math.sqrt(a * a + b * b);
    // Below this the hue angle is numerical noise, so call it zero.
    const hue = chroma < 1e-7 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
    return [L, chroma, hue];
  }

  function oklchToOklab([L, C, H]) {
    const radians = (H * Math.PI) / 180;
    return [L, C * Math.cos(radians), C * Math.sin(radians)];
  }

  // ------------------------------------------------------- 0..255 sRGB bridge

  /** @param {[number,number,number]} rgb 0..255 @returns {[number,number,number]} Oklab */
  function rgbToOklab([r, g, b]) {
    return linearSrgbToOklab([srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)]);
  }

  function rgbToOklch(rgb) {
    return oklabToOklch(rgbToOklab(rgb));
  }

  /** Gamma-encoded sRGB for an Oklab color, unclamped: channels may leave 0..1. */
  function oklabToSrgb(lab) {
    return oklabToLinearSrgb(lab).map(linearToSrgb);
  }

  function inGamut(srgb, epsilon = 1e-5) {
    return srgb.every(c => c >= -epsilon && c <= 1 + epsilon);
  }

  function clipSrgb(srgb) {
    return srgb.map(c => Math.min(1, Math.max(0, c)));
  }

  function to255(srgb) {
    return srgb.map(c => Math.round(Math.min(1, Math.max(0, c)) * 255));
  }

  /** Perceptual distance in Oklab: plain Euclidean, which is the point of Oklab. */
  function deltaEOK(lab1, lab2) {
    const dL = lab1[0] - lab2[0];
    const da = lab1[1] - lab2[1];
    const db = lab1[2] - lab2[2];
    return Math.sqrt(dL * dL + da * da + db * db);
  }

  /**
   * Map an OKLCH color into sRGB the way CSS Color 4 specifies.
   *
   * Chroma is reduced by binary search rather than channels being clipped
   * outright, because clipping shifts hue — a vivid blue clips toward purple.
   * At each step the candidate is compared against its own clipped version, and
   * once the two are within a just-noticeable difference the clip is accepted.
   *
   * @returns {[number,number,number]} sRGB 0..255, always in gamut
   */
  function gamutMapOklch([L, C, H]) {
    if (L >= 1) {
      return [255, 255, 255];
    }
    if (L <= 0) {
      return [0, 0, 0];
    }

    const direct = oklabToSrgb(oklchToOklab([L, C, H]));
    if (inGamut(direct)) {
      return to255(direct);
    }

    const JND = 0.02;
    const EPSILON = 0.0001;

    let min = 0;
    let max = C;
    let minInGamut = true;

    while (max - min > EPSILON) {
      const chroma = (min + max) / 2;
      const lab = oklchToOklab([L, chroma, H]);
      const srgb = oklabToSrgb(lab);

      if (minInGamut && inGamut(srgb)) {
        min = chroma;
        continue;
      }

      const clipped = clipSrgb(srgb);
      const difference = deltaEOK(linearSrgbToOklab(clipped.map(srgbToLinear)), lab);

      if (difference < JND) {
        if (JND - difference < EPSILON) {
          return to255(clipped);
        }
        minInGamut = false;
        min = chroma;
      } else {
        max = chroma;
      }
    }

    return to255(clipSrgb(oklabToSrgb(oklchToOklab([L, min, H]))));
  }

  /**
   * The largest chroma sRGB can show at this lightness and hue.
   * Drives the chroma slider, so the track never promises colors it cannot give.
   */
  function maxChroma(L, H) {
    if (L <= 0 || L >= 1) {
      return 0;
    }
    let low = 0;
    let high = MAX_CHROMA;
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (inGamut(oklabToSrgb(oklchToOklab([L, mid, H])))) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return low;
  }

  // -------------------------------------------------------------------- hex

  function toHex([r, g, b]) {
    return (
      '#' +
      [r, g, b]
        .map(n =>
          Math.round(Math.min(255, Math.max(0, n)))
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    );
  }

  function oklchToHex(oklch) {
    return toHex(gamutMapOklch(oklch));
  }

  function hexToRgb(value) {
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value).trim());
    if (!match) {
      return undefined;
    }
    let digits = match[1];
    if (digits.length === 3) {
      digits = digits
        .split('')
        .map(d => d + d)
        .join('');
    }
    return [
      parseInt(digits.slice(0, 2), 16),
      parseInt(digits.slice(2, 4), 16),
      parseInt(digits.slice(4, 6), 16),
    ];
  }

  function hexToOklch(value) {
    const rgb = hexToRgb(value);
    return rgb ? rgbToOklch(rgb) : undefined;
  }

  const api = {
    MAX_CHROMA,
    srgbToLinear,
    linearToSrgb,
    linearSrgbToOklab,
    oklabToLinearSrgb,
    oklabToOklch,
    oklchToOklab,
    rgbToOklab,
    rgbToOklch,
    oklabToSrgb,
    inGamut,
    clipSrgb,
    deltaEOK,
    gamutMapOklch,
    maxChroma,
    toHex,
    oklchToHex,
    hexToRgb,
    hexToOklch,
  };

  root.PeacockColorSpaces = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
