import * as vscode from 'vscode';
import { ApplyQueue } from './apply-queue';
import { normalizeHex } from './color';
import { buildNeutrals, buildRainbow, type PaletteColor } from './palette';
import { getCurrentColor, getFavoriteColors, resetColors } from './peacock';
import { type MenuKeys } from './peacock-keys';
import { SwatchCache } from './swatch';

export type MenuAction = 'wheel' | 'random' | 'lighten' | 'darken' | 'saveFavorite' | 'reset';

export interface MenuItem extends vscode.QuickPickItem {
  color?: string;
  action?: MenuAction;
}

/** The entries that open the menu, in the order they are reached. */
function leadActions(keys: MenuKeys): MenuItem[] {
  return [
    { label: '$(sparkle) Random color', description: keys.random, action: 'random' },
    { label: '$(color-mode) Open color picker', description: keys.picker, action: 'wheel' },
    // Lighten and darken are Peacock's own shortcuts. Showing its keys rather
    // than adding a competing pair means there is one set to learn.
    { label: '$(arrow-up) Lighten', description: keys.lighten, action: 'lighten' },
    { label: '$(arrow-down) Darken', description: keys.darken, action: 'darken' },
  ];
}

/**
 * These head the favorites section rather than trailing the whole menu: saving
 * and clearing belong beside the saved colors, and putting them at a fixed
 * position means they do not move as the list of favorites grows.
 */
const FAVORITE_ACTIONS: ReadonlyArray<MenuItem> = [
  { label: '$(star-add) Save current color to favorites', action: 'saveFavorite' },
  { label: '$(clear-all) Remove Peacock color', action: 'reset' },
];

/**
 * Favorites come from workspace settings, which a repository you opened can
 * write. Nothing catastrophic lives down that path, but a name is rendered as a
 * menu label, where `$(...)` turns into an icon, and the list length decides how
 * many swatches get built. Both get bounded.
 */
const MAX_FAVORITES = 60;
const MAX_LABEL = 60;

function sanitizeLabel(name: string): string {
  return name
    .replace(/\$\(/g, '(') // codicon syntax would otherwise render as an icon
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, MAX_LABEL);
}

/**
 * Builds the menu contents. Pure, so the composition is testable without
 * standing up a QuickPick.
 */
export function buildItems(options: {
  favorites: PaletteColor[];
  rainbow: PaletteColor[];
  neutrals: PaletteColor[];
  filter: string;
  currentColor?: string;
  keys?: MenuKeys;
}): MenuItem[] {
  const items: MenuItem[] = [];

  // Typing a hex offers it directly, so any color is reachable from here.
  const typed = normalizeHex(options.filter);
  if (typed) {
    items.push({ label: `Use ${typed}`, color: typed, alwaysShow: true });
  }

  // Random comes first so it is what Enter does on a bare open, then the
  // picker, then the two adjustments. Colors follow; favorites sit last rather
  // than greeting you with a list Peacock seeded on your behalf.
  items.push(...leadActions(options.keys ?? {}));

  // Only the marker for the colour in use. The name and the swatch already say
  // which colour a row is, so the hex was repeating them on every line.
  const describe = (color: string) =>
    color === options.currentColor ? '$(check)' : undefined;

  items.push({ label: 'Rainbow', kind: vscode.QuickPickItemKind.Separator });
  for (const entry of options.rainbow) {
    items.push({ label: entry.name, description: describe(entry.value), color: entry.value });
  }

  items.push({ label: 'Neutrals', kind: vscode.QuickPickItemKind.Separator });
  for (const entry of options.neutrals) {
    items.push({ label: entry.name, description: describe(entry.value), color: entry.value });
  }

  const usableFavorites = options.favorites.slice(0, MAX_FAVORITES).flatMap(favorite => {
    const color = normalizeHex(favorite.value);
    const label = sanitizeLabel(favorite.name);
    return color && label ? [{ label, color }] : [];
  });

  // The separator shows even with nothing saved, so the two actions always have
  // a heading and always sit in the same place.
  items.push({ label: 'Favorites', kind: vscode.QuickPickItemKind.Separator });
  items.push(...FAVORITE_ACTIONS);
  for (const favorite of usableFavorites) {
    items.push({
      label: favorite.label,
      description: describe(favorite.color),
      color: favorite.color,
    });
  }

  return items;
}

/**
 * The color menu, opened from the status bar button.
 *
 * Arrowing through the list previews each color on the workbench; accepting
 * keeps it and dismisses the menu; Escape puts the original color back. This is
 * the same shape as other status bar menus in VS Code, which is what makes it
 * feel native.
 */
export async function showColorMenu(swatches: SwatchCache, keys: MenuKeys): Promise<void> {
  const rainbow = buildRainbow();
  const neutrals = buildNeutrals();
  const originalColor = getCurrentColor();
  const queue = new ApplyQueue(error =>
    console.error('Peacock Color Picker: apply failed', error),
  );

  const quickPick = vscode.window.createQuickPick<MenuItem>();
  quickPick.placeholder = 'Pick a Peacock color, or type a hex like #42b883';
  quickPick.matchOnDescription = true;

  /** Assigning `items` re-fires activation; that echo must not repaint anything. */
  let skipNextActivation = true;
  let accepted = false;

  /**
   * Whether a preview has actually been applied. Nothing is undone unless
   * something was done: opening the menu and dismissing it without moving must
   * not write to settings at all.
   */
  let previewed = false;

  /** Put the workbench back the way it was found. */
  const restore = async (): Promise<void> => {
    if (!previewed) {
      return;
    }
    previewed = false;
    await (originalColor ? queue.push(originalColor) : resetColors());
  };

  const refresh = (): void => {
    const items = buildItems({
      favorites: getFavoriteColors(),
      rainbow,
      neutrals,
      filter: quickPick.value,
      currentColor: originalColor,
      keys,
    });

    for (const item of items) {
      if (item.color) {
        item.iconPath = swatches.getIconPath(item.color);
      }
    }

    skipNextActivation = true;
    quickPick.items = items;
  };

  quickPick.onDidChangeValue(refresh);

  quickPick.onDidChangeActive(active => {
    if (skipNextActivation) {
      skipNextActivation = false;
      return;
    }
    const color = active[0]?.color;
    if (color) {
      previewed = true;
      void queue.push(color);
    }
  });

  quickPick.onDidAccept(() => {
    const item = quickPick.selectedItems[0];
    if (!item) {
      return;
    }
    accepted = true;
    quickPick.hide();

    if (item.color) {
      previewed = false; // this one is the choice, not a preview
      void queue.push(item.color);
      return;
    }
    if (item.action) {
      // Only choosing a color keeps a color. Browsing to Emerald and then
      // picking Lighten must lighten the color you had, not the one you were
      // looking at — and Save to favorites must save the same. The restore is
      // awaited so the action never races the write that undoes the preview.
      void restore().then(() => runAction(item.action as MenuAction));
    }
  });

  quickPick.onDidHide(() => {
    if (!accepted) {
      void restore();
    }
    quickPick.dispose();
  });

  refresh();
  quickPick.show();
}

async function runAction(action: MenuAction): Promise<void> {
  switch (action) {
    case 'wheel':
      await vscode.commands.executeCommand('peacockColorPicker.wheel.focus');
      return;
    case 'random':
      // Our own command rather than Peacock's, so the menu and the keyboard
      // shortcut go down one path and share its hold guard.
      await vscode.commands.executeCommand('peacockColorPicker.random');
      return;
    case 'lighten':
      await vscode.commands.executeCommand('peacock.lighten');
      return;
    case 'darken':
      await vscode.commands.executeCommand('peacock.darken');
      return;
    case 'saveFavorite':
      await vscode.commands.executeCommand('peacock.saveColorToFavorites');
      return;
    case 'reset':
      await vscode.commands.executeCommand('peacock.resetWorkspaceColors');
      return;
  }
}
