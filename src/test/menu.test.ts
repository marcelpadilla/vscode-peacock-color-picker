import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { PickerApi } from '../extension';
import { buildNeutrals, buildRainbow } from '../palette';
import { buildItems, type MenuItem } from '../quick-pick';

const EXTENSION_ID = 'marcelpadilla.peacock-color-picker';

const rainbow = buildRainbow();
const neutrals = buildNeutrals();
const favorites = [
  { name: 'Vue Green', value: '#42b883' },
  { name: 'Broken', value: 'not-a-color' },
];

function menu(overrides: Partial<Parameters<typeof buildItems>[0]> = {}): MenuItem[] {
  return buildItems({ favorites, rainbow, neutrals, filter: '', ...overrides });
}

function colorsOf(items: MenuItem[]): string[] {
  return items.filter(item => item.color).map(item => item.color as string);
}

function separators(items: MenuItem[]): string[] {
  return items
    .filter(item => item.kind === vscode.QuickPickItemKind.Separator)
    .map(item => item.label);
}

suite('Color menu order', () => {
  test('random comes first so a bare Enter rolls a color', () => {
    const items = menu();
    assert.equal(items[0].action, 'random');
    assert.ok(items[0].label.includes('Random color'), items[0].label);
  });

  test('the picker is the second entry', () => {
    const items = menu();
    assert.equal(items[1].action, 'wheel');
    assert.ok(items[1].label.includes('Open color picker'), items[1].label);
  });

  test('lighten and darken sit third and fourth, above the colors', () => {
    const items = menu();
    assert.equal(items[2].action, 'lighten');
    assert.equal(items[3].action, 'darken');

    const firstSeparator = items.findIndex(
      item => item.kind === vscode.QuickPickItemKind.Separator,
    );
    assert.ok(firstSeparator > 3, 'the adjustments fell below the first group');
  });

  test("each adjustment shows Peacock's own shortcut", () => {
    const items = menu({ keys: { lighten: '⌥⌘=', darken: '⌥⌘-' } });
    assert.equal(items[2].description, '⌥⌘=');
    assert.equal(items[3].description, '⌥⌘-');
  });

  test('an unbound adjustment simply shows no shortcut', () => {
    // Peacock's defaults use the Command key, so off macOS there is nothing to
    // advertise and the entry must not invent one.
    const items = menu({ keys: {} });
    assert.equal(items[2].description, undefined);
    assert.equal(items[3].description, undefined);
  });

  test('random and the picker show their own shortcuts beside their descriptions', () => {
    const items = menu({ keys: { random: '⌃⌥⌘R', picker: '⌃⌥⌘P' } });
    assert.ok(items[0].description?.includes('⌃⌥⌘R'), items[0].description);
    assert.ok(items[0].description?.includes('Surprise me'), 'the description was replaced');
    assert.ok(items[1].description?.includes('⌃⌥⌘P'), items[1].description);
  });

  test('an unbound shortcut leaves the description alone rather than trailing a gap', () => {
    const items = menu({ keys: {} });
    assert.equal(items[0].description, 'Surprise me');
    assert.equal(items[1].description, 'Palette, HSV, RGB and OKLCH');
  });

  test('neither lead entry carries a color, so opening the menu previews nothing', () => {
    const items = menu();
    assert.equal(items[0].color, undefined);
    assert.equal(items[1].color, undefined);
  });

  test('favorites come after the colors rather than greeting you first', () => {
    assert.deepEqual(separators(menu()), ['Rainbow', 'Neutrals', 'Favorites']);
  });

  test('the rainbow is reachable before the favorites are', () => {
    const items = menu();
    const firstRainbow = items.findIndex(item => item.color === rainbow[0].value);
    const firstFavorite = items.findIndex(item => item.color === '#42b883');
    assert.ok(firstRainbow > 0, 'the rainbow is missing');
    assert.ok(
      firstRainbow < firstFavorite,
      `rainbow at ${firstRainbow} should precede favorites at ${firstFavorite}`,
    );
  });

  test('every rainbow and neutral entry reaches the menu', () => {
    const colors = colorsOf(menu());
    for (const entry of [...rainbow, ...neutrals]) {
      assert.ok(colors.includes(entry.value), `${entry.name} missing`);
    }
  });

  test('the two favorite actions come last of the actions', () => {
    const actions = menu()
      .filter(item => item.action)
      .map(item => item.action);
    assert.deepEqual(actions, ['random', 'wheel', 'lighten', 'darken', 'saveFavorite', 'reset']);
  });

  test('saving and clearing head the favorites section, above the saved colors', () => {
    const items = menu();
    const heading = items.findIndex(
      item => item.kind === vscode.QuickPickItemKind.Separator && item.label === 'Favorites',
    );
    assert.equal(items[heading + 1].action, 'saveFavorite');
    assert.equal(items[heading + 2].action, 'reset');

    const firstFavorite = items.findIndex(item => item.color === '#42b883');
    assert.ok(
      firstFavorite > heading + 2,
      `a saved color at ${firstFavorite} came before the actions`,
    );
  });
});

suite('Color menu contents', () => {
  test('a favorite with an unusable color is dropped rather than shown', () => {
    assert.equal(
      menu().some(item => item.label === 'Broken'),
      false,
    );
  });

  test('typing a hex offers that exact color above everything else', () => {
    const items = menu({ filter: '#ABC' });
    assert.equal(items[0].label, 'Use #aabbcc');
    assert.equal(items[0].color, '#aabbcc');
    assert.equal(items[0].alwaysShow, true, 'the typed color must survive filtering');
  });

  test('typing something that is not a color adds no such entry', () => {
    assert.equal(
      menu({ filter: 'blu' }).some(item => item.label.startsWith('Use ')),
      false,
    );
  });

  test('the color currently in use is marked', () => {
    const marked = menu({ currentColor: '#42b883' }).filter(item =>
      item.description?.includes('$(check)'),
    );
    assert.equal(marked.length, 1);
    assert.equal(marked[0].color, '#42b883');
  });

  test('separators never carry colors', () => {
    assert.equal(
      menu().some(item => item.kind === vscode.QuickPickItemKind.Separator && item.color),
      false,
    );
  });

  test('with nothing saved the favorites group still holds its two actions', () => {
    const items = menu({ favorites: [] });
    assert.deepEqual(separators(items), ['Rainbow', 'Neutrals', 'Favorites']);

    const tail = items.slice(-2).map(item => item.action);
    assert.deepEqual(tail, ['saveFavorite', 'reset'], 'the actions went missing with no favorites');
  });
});

suite('Untrusted favorites', () => {
  test('a name carrying codicon syntax cannot render an icon in the menu', () => {
    const items = menu({ favorites: [{ name: '$(alert) Warning', value: '#112233' }] });
    const item = items.find(entry => entry.color === '#112233');
    assert.ok(item);
    assert.equal(item.label.includes('$('), false, `still has codicon syntax: ${item.label}`);
    assert.ok(item.label.includes('Warning'), 'the readable part of the name was lost');
  });

  test('control characters are stripped out of names', () => {
    const name = ['One', 'Two', 'Three'].join(String.fromCharCode(1));
    const items = menu({ favorites: [{ name, value: '#112233' }] });
    assert.equal(items.find(entry => entry.color === '#112233')?.label, 'One Two Three');
  });

  test('long names are truncated rather than allowed to fill the menu', () => {
    const items = menu({ favorites: [{ name: 'x'.repeat(500), value: '#112233' }] });
    const item = items.find(entry => entry.color === '#112233');
    assert.ok(item && item.label.length <= 60, `label is ${item?.label.length} characters`);
  });

  test('an unreasonable number of favorites is capped', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ name: `Fav ${i}`, value: '#0000ff' }));
    const known = new Set([...rainbow, ...neutrals].map(entry => entry.value));
    const favoriteItems = menu({ favorites: many }).filter(
      entry => entry.color && !known.has(entry.color) && !entry.label.startsWith('Use '),
    );
    assert.ok(favoriteItems.length <= 60, `${favoriteItems.length} favorites reached the menu`);
  });

  test('a favorite with a blank name is dropped', () => {
    assert.equal(
      menu({ favorites: [{ name: '   ', value: '#112233' }] }).some(
        entry => entry.color === '#112233',
      ),
      false,
    );
  });
});

suite('Swatch cache', () => {
  async function swatchCache() {
    const extension = vscode.extensions.getExtension<PickerApi>(EXTENSION_ID);
    assert.ok(extension);
    return (await extension.activate()).swatches;
  }

  /**
   * The scheme is the whole point. The workbench document restricts `img-src`
   * to `'self' data: blob: vscode-remote-resource: ... https:`, and an
   * extension's storage lives under `vscode-userdata:`, which is on none of
   * those lists. An icon pointed there is fetched, refused, and rendered as an
   * empty square, with nothing reported to the extension. Only `data:` is safe.
   */
  const CSP_ALLOWED = /^(data|https):/;

  test('a swatch is a data Uri, the only scheme the workbench may load', async () => {
    const swatches = await swatchCache();
    const uri = swatches.get('#42b883');

    assert.match(uri.toString(true), CSP_ALLOWED, 'this scheme is blocked by the workbench CSP');
    assert.match(uri.toString(true), /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
  });

  test('the Uri survives its own round trip, so the bytes reach the renderer intact', async () => {
    // The icon crosses to the main thread as UriComponents and is turned back
    // into a URI there. Base64 padding and `+`/`/` must come through untouched.
    const swatches = await swatchCache();
    const uri = swatches.get('#42b883');
    const text = uri.toString(true);

    assert.equal(vscode.Uri.parse(text).toString(true), text);

    const png = Buffer.from(text.slice('data:image/png;base64,'.length), 'base64');
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'not a PNG');
  });

  test('the same color is built once and reused', async () => {
    const swatches = await swatchCache();
    assert.equal(swatches.get('#42B883').toString(), swatches.get('#42b883').toString());
  });

  test('the icon is a light/dark pair with opposite contrast rings', async () => {
    const swatches = await swatchCache();
    const icon = swatches.getIconPath('#42b883');

    assert.ok(icon.light, 'no light variant');
    assert.ok(icon.dark, 'no dark variant');
    assert.notEqual(
      icon.light.toString(),
      icon.dark.toString(),
      'the two variants differ by the contrast ring around the swatch',
    );
  });

  test('every color entry in the menu gets an icon', async () => {
    const swatches = await swatchCache();
    const items = buildItems({ favorites, rainbow, neutrals, filter: '#abcdef' });
    for (const item of items.filter(entry => entry.color)) {
      const icon = swatches.getIconPath(item.color as string);
      assert.ok(icon.light && icon.dark, `${item.label} would show no swatch`);
      assert.match(icon.dark.toString(true), CSP_ALLOWED, `${item.label} would be blocked`);
    }
  });

  test('refuses a color that is not strictly #rrggbb', async () => {
    const swatches = await swatchCache();
    for (const bad of ['../../etc/passwd', '#12345', 'red', '#GGGGGG', '']) {
      assert.throws(
        () => swatches.get(bad),
        /Refusing to build a swatch/,
        `accepted ${JSON.stringify(bad)}`,
      );
    }
  });
});
