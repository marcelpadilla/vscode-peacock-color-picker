import * as vscode from 'vscode';
import { solidSwatchPng } from './png';

/**
 * Turns a color into the icon a quick pick item shows next to it.
 *
 * The swatches are `data:` Uris held in memory rather than files on disk, and
 * that is the whole reason they are visible.
 *
 * An extension's storage location is handed to it as `vscode-userdata:`, not
 * `file:`, and the workbench document declares
 *
 *     img-src 'self' data: blob: vscode-remote-resource: ... https:
 *
 * which has no entry for that scheme. An icon written to extension storage is
 * therefore requested and dropped by the Content Security Policy: no error
 * reaches the extension, the item simply renders with an empty square. `data:`
 * is on that list, needs no file to exist, and behaves identically over a
 * remote connection and in the browser, where there is no local disk at all.
 */

/** Colors reach here from workspace settings, so only exact `#rrggbb` is trusted. */
const STRICT_HEX = /^#[0-9a-f]{6}$/;

/**
 * Distinct colors held before the cache is dropped and rebuilt. Typing in the
 * menu mints a swatch per valid hex, and an unbounded map behind a text field
 * is a leak however small each entry is.
 */
const MAX_CACHED = 512;

/** Which side of the swatch's contrast ring: light rings suit dark themes. */
type Ring = 'light' | 'dark';

export class SwatchCache {
  private readonly icons = new Map<string, vscode.Uri>();

  /**
   * A light/dark pair, which is what the quick pick renderer reads. The ring is
   * always the opposite tone to the theme, so a white swatch stays visible on a
   * light background and a black one on a dark background.
   */
  public getIconPath(hex: string): { light: vscode.Uri; dark: vscode.Uri } {
    return { light: this.get(hex, 'dark'), dark: this.get(hex, 'light') };
  }

  public get(hex: string, ring: Ring = 'light'): vscode.Uri {
    const color = hex.trim().toLowerCase();
    if (!STRICT_HEX.test(color)) {
      throw new Error(`Refusing to build a swatch for ${JSON.stringify(hex)}`);
    }

    const key = `${color}-${ring}`;
    const cached = this.icons.get(key);
    if (cached) {
      return cached;
    }

    if (this.icons.size >= MAX_CACHED) {
      this.icons.clear();
    }

    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    const png = Buffer.from(solidSwatchPng(r, g, b, ring)).toString('base64');
    // Base64 contains no `#`, `?` or `/` before the first `:`, so this parses
    // back to exactly the string it was built from.
    const uri = vscode.Uri.parse(`data:image/png;base64,${png}`);

    this.icons.set(key, uri);
    return uri;
  }
}
