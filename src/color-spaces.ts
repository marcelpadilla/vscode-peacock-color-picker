import * as path from 'node:path';

export type Triplet = [number, number, number];

/** The subset of media/color-spaces.js the extension host uses. */
export interface ColorSpaces {
  readonly MAX_CHROMA: number;
  rgbToOklch(rgb: Triplet): Triplet;
  oklchToOklab(oklch: Triplet): Triplet;
  oklabToSrgb(lab: Triplet): number[];
  inGamut(srgb: number[], epsilon?: number): boolean;
  gamutMapOklch(oklch: Triplet): Triplet;
  maxChroma(lightness: number, hue: number): number;
  oklchToHex(oklch: Triplet): string;
  hexToRgb(value: string): Triplet | undefined;
  hexToOklch(value: string): Triplet | undefined;
  toHex(rgb: Triplet): string;
}

/**
 * The color science lives in `media/` rather than `src/` on purpose: the webview
 * can only load a classic script, and the extension host can `require` the same
 * file. One implementation, so the swatches the menu offers and the colors the
 * picker draws cannot drift apart.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const spaces = require(path.join(__dirname, '..', 'media', 'color-spaces.js')) as ColorSpaces;

export default spaces;
