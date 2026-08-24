import * as vscode from 'vscode';
import {
  currentPlatform,
  formatKeybinding,
  parseKeybindingsFile,
  resolveKeybinding,
} from './keybindings';
import { getDeclaredKeybindings, EXTENSION_ID, PEACOCK_EXTENSION_ID } from './peacock';

export interface MenuKeys {
  /** Ready to display, e.g. "⌥⌘=" on macOS. Absent when nothing is bound. */
  lighten?: string;
  darken?: string;
  random?: string;
  picker?: string;
}

/**
 * VS Code keeps the user's keybindings next to the extension storage it hands
 * us: `<profile>/User/globalStorage/<extension>` sits two levels below
 * `<profile>/User/keybindings.json`. Deriving it this way follows whichever
 * profile and build is running instead of guessing per-platform paths.
 */
function keybindingsFileFor(globalStorageUri: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(globalStorageUri, '..', '..', 'keybindings.json');
}

async function readUserKeybindings(globalStorageUri: vscode.Uri): Promise<string> {
  try {
    const bytes = await vscode.workspace.fs.readFile(keybindingsFileFor(globalStorageUri));
    return new TextDecoder().decode(bytes);
  } catch {
    // No overrides yet, or the profile is not readable.
    return '';
  }
}

/**
 * What each of the menu's four shortcuts is bound to right now, formatted for
 * display.
 *
 * Lighten and darken are Peacock's own; this extension shows them rather than
 * adding a competing pair. Random and the picker are its own, declared in its
 * manifest. Either way the declared default is reconciled against the user's
 * `keybindings.json`, so a rebind or an unbind shows up here.
 */
export async function readMenuKeys(globalStorageUri: vscode.Uri): Promise<MenuKeys> {
  const platform = currentPlatform();
  const user = parseKeybindingsFile(await readUserKeybindings(globalStorageUri));
  const peacock = getDeclaredKeybindings(PEACOCK_EXTENSION_ID);
  const ours = getDeclaredKeybindings(EXTENSION_ID);

  const describe = (command: string, defaults: Array<Record<string, string>>) => {
    const binding = resolveKeybinding(command, defaults, user, platform);
    return binding ? formatKeybinding(binding, platform) : undefined;
  };

  return {
    lighten: describe('peacock.lighten', peacock),
    darken: describe('peacock.darken', peacock),
    random: describe('peacockColorPicker.random', ours),
    picker: describe('peacockColorPicker.openWheel', ours),
  };
}
