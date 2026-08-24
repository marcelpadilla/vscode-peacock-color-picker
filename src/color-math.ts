import * as path from 'node:path';
import type { Triplet } from './color-spaces';

/** The subset of media/color-math.js the extension host uses. */
export interface ColorMath {
  toHex(r: number, g: number, b: number): string;
  parseHex(value: string): Triplet | undefined;
  rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number };
  hslToRgb(h: number, s: number, l: number): Triplet;
  /** Peacock's Lighten/Darken, one step of `percent` HSL lightness at a time. */
  adjustLightness(rgb: Triplet, steps: number, percent: number): Triplet;
}

// Same file the webview loads; see the note in color-spaces.ts.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const math = require(path.join(__dirname, '..', 'media', 'color-math.js')) as ColorMath;

export default math;
