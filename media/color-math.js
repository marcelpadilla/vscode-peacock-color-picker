// @ts-check
/**
 * Pure HSV/RGB/hex helpers shared by the picker webview.
 *
 * Kept free of DOM access so it can be loaded and unit tested outside a webview.
 * Exposed on `globalThis` because webview scripts are plain classic scripts.
 */
(function (root) {
  'use strict';

  /**
   * @param {number} h hue in degrees
   * @param {number} s saturation 0..1
   * @param {number} v value 0..1
   * @returns {[number, number, number]} rgb, each 0..255
   */
  function hsvToRgb(h, s, v) {
    const hue = ((h % 360) + 360) % 360;
    const c = v * s;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = v - c;
    let r = 0;
    let g = 0;
    let b = 0;
    if (hue < 60) {
      r = c; g = x;
    } else if (hue < 120) {
      r = x; g = c;
    } else if (hue < 180) {
      g = c; b = x;
    } else if (hue < 240) {
      g = x; b = c;
    } else if (hue < 300) {
      r = x; b = c;
    } else {
      r = c; b = x;
    }
    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
    ];
  }

  /**
   * @param {number} r 0..255
   * @param {number} g 0..255
   * @param {number} b 0..255
   * @returns {{ h: number, s: number, v: number }}
   */
  function rgbToHsv(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;

    let h = 0;
    if (delta !== 0) {
      if (max === rn) {
        h = 60 * (((gn - bn) / delta) % 6);
      } else if (max === gn) {
        h = 60 * ((bn - rn) / delta + 2);
      } else {
        h = 60 * ((rn - gn) / delta + 4);
      }
    }
    return { h: (h + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
  }

  /** @returns {string} `#rrggbb` */
  function toHex(r, g, b) {
    return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Accepts `#rgb`, `#rrggbb`, with or without the leading `#`.
   * @returns {[number, number, number] | undefined}
   */
  function parseHex(value) {
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value).trim());
    if (!match) {
      return undefined;
    }
    let digits = match[1];
    if (digits.length === 3) {
      digits = digits.split('').map(d => d + d).join('');
    }
    return [
      parseInt(digits.slice(0, 2), 16),
      parseInt(digits.slice(2, 4), 16),
      parseInt(digits.slice(4, 6), 16),
    ];
  }

  /**
   * Wheel geometry: hue is the angle around the center, saturation the distance
   * from it. Painting the disc and hit-testing a click both go through this, so
   * the color under the pointer is by construction the color you get.
   *
   * @param {number} dx pixels right of center
   * @param {number} dy pixels below center
   * @param {number} radius disc radius in the same units
   * @returns {{ h: number, s: number }} hue in degrees, saturation clamped to 0..1
   */
  function pointerToHueSat(dx, dy, radius) {
    const hue = (Math.atan2(dy, dx) * 180) / Math.PI;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return { h: (hue + 360) % 360, s: radius > 0 ? Math.min(1, distance / radius) : 0 };
  }

  /**
   * The inverse of {@link pointerToHueSat}, used to place the marker ring.
   * @returns {{ x: number, y: number }} offsets from the center
   */
  function hueSatToPointer(h, s, radius) {
    const angle = (h * Math.PI) / 180;
    return { x: Math.cos(angle) * s * radius, y: Math.sin(angle) * s * radius };
  }

  /**
   * HSL, as tinycolor computes it.
   *
   * Peacock's Lighten and Darken run `tinycolor(color).lighten(n)`, which moves
   * HSL lightness by n percent. The picker's lighten/darken control has to land
   * on exactly the same colors as the keyboard shortcut, so this mirrors that
   * implementation rather than using a perceptual space that would disagree.
   *
   * @returns {{h: number, s: number, l: number}} all in 0..1
   */
  function rgbToHsl(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;

    if (max === min) {
      return { h: 0, s: 0, l };
    }

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === rn) {
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
    } else if (max === gn) {
      h = (bn - rn) / d + 2;
    } else {
      h = (rn - gn) / d + 4;
    }
    return { h: h / 6, s, l };
  }

  /** @returns {[number, number, number]} rgb 0..255 */
  function hslToRgb(h, s, l) {
    if (s === 0) {
      const v = Math.round(l * 255);
      return [v, v, v];
    }

    const hue2rgb = (p, q, t) => {
      let tt = t;
      if (tt < 0) {
        tt += 1;
      }
      if (tt > 1) {
        tt -= 1;
      }
      if (tt < 1 / 6) {
        return p + (q - p) * 6 * tt;
      }
      if (tt < 1 / 2) {
        return q;
      }
      if (tt < 2 / 3) {
        return p + (q - p) * (2 / 3 - tt) * 6;
      }
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
      Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
      Math.round(hue2rgb(p, q, h) * 255),
      Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
    ];
  }

  /**
   * Move a color by `steps` of `percent` HSL lightness each, the way Peacock's
   * Lighten and Darken commands do. Negative steps darken.
   */
  function adjustLightness(rgb, steps, percent) {
    let current = rgb;
    // Applied one step at a time, because Peacock's commands are repeated
    // presses and the clamp at either end makes the operation non-additive.
    for (let i = 0; i < Math.abs(steps); i++) {
      const hsl = rgbToHsl(current[0], current[1], current[2]);
      const delta = (steps > 0 ? 1 : -1) * (percent / 100);
      const lightness = Math.min(1, Math.max(0, hsl.l + delta));
      current = hslToRgb(hsl.h, hsl.s, lightness);
    }
    return current;
  }

  root.PeacockColorMath = {
    hsvToRgb,
    rgbToHsv,
    toHex,
    parseHex,
    pointerToHueSat,
    hueSatToPointer,
    rgbToHsl,
    hslToRgb,
    adjustLightness,
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.PeacockColorMath;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
