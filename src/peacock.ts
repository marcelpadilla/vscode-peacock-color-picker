import * as vscode from 'vscode';

/** Peacock's identifiers, as declared in johnpapa/vscode-peacock. */
export const PEACOCK_EXTENSION_ID = 'johnpapa.vscode-peacock';
/** This extension's own id, as published. */
export const EXTENSION_ID = 'marcelpadilla.peacock-color-picker';
const PEACOCK_SECTION = 'peacock';
const ENTER_COLOR_COMMAND = 'peacock.enterColor';
const RESET_COLORS_COMMAND = 'peacock.resetWorkspaceColors';

export interface FavoriteColor {
  name: string;
  value: string;
}

/**
 * Peacock keeps two colors: one for local workspaces and one for remote ones,
 * and picks between them based on the environment. We mirror that logic so the
 * picker opens on whatever color is actually showing.
 */
export function getCurrentColor(): string | undefined {
  const config = vscode.workspace.getConfiguration(PEACOCK_SECTION);
  const key = vscode.env.remoteName ? 'remoteColor' : 'color';
  const value = config.get<string>(key);
  return value ? value.trim() : undefined;
}

export function getFavoriteColors(): FavoriteColor[] {
  const favorites =
    vscode.workspace.getConfiguration(PEACOCK_SECTION).get<FavoriteColor[]>('favoriteColors') ?? [];
  return favorites.filter(f => !!f && typeof f.value === 'string' && typeof f.name === 'string');
}

export function isPeacockInstalled(): boolean {
  return !!vscode.extensions.getExtension(PEACOCK_EXTENSION_ID);
}

/**
 * Hand the color to Peacock rather than writing settings ourselves.
 *
 * `peacock.enterColor` takes an optional color argument (see Peacock's
 * `enterColorHandler(color?: string)`); passing one skips its input box and
 * runs the real apply + persist path, so every element Peacock is configured
 * to tint stays in sync.
 */
export async function applyColor(color: string): Promise<void> {
  await vscode.commands.executeCommand(ENTER_COLOR_COMMAND, color);
}

export async function resetColors(): Promise<void> {
  await vscode.commands.executeCommand(RESET_COLORS_COMMAND);
}

/** Peacock's Lighten and Darken move HSL lightness by this many percent. */
export function getDarkenLightenPercentage(): number {
  const value = vscode.workspace
    .getConfiguration(PEACOCK_SECTION)
    .get<number>('darkenLightenPercentage');
  return typeof value === 'number' && value > 0 ? value : 5;
}

/**
 * The keybindings an extension declares in its own manifest. VS Code offers no
 * API for reading keybindings, so the defaults have to come from the manifest
 * and be reconciled against the user's overrides by hand.
 */
export function getDeclaredKeybindings(
  extensionId: string,
): Array<Record<string, string>> {
  const extension = vscode.extensions.getExtension(extensionId);
  const declared = extension?.packageJSON?.contributes?.keybindings;
  return Array.isArray(declared) ? declared : [];
}
