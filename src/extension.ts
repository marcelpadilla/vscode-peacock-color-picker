import * as vscode from 'vscode';
import { guardHeldKey } from './hold-guard';
import { PickerViewProvider } from './picker-view';
import { isPeacockInstalled, PEACOCK_EXTENSION_ID } from './peacock';
import { readMenuKeys } from './peacock-keys';
import { showColorMenu } from './quick-pick';
import { SwatchCache } from './swatch';

const CONFIG_SECTION = 'peacockColorPicker';
const OPEN_COMMAND = 'peacockColorPicker.open';
const RANDOM_COMMAND = 'peacockColorPicker.random';
const OPEN_WHEEL_COMMAND = 'peacockColorPicker.openWheel';
const STATUS_BAR_ID = 'peacockColorPicker.button';

let statusBarItem: vscode.StatusBarItem | undefined;

export interface PickerApi {
  readonly view: PickerViewProvider;
  readonly swatches: SwatchCache;
}

export function activate(context: vscode.ExtensionContext): PickerApi {
  const view = new PickerViewProvider(context.extensionUri, context.globalStorageUri);
  const swatches = new SwatchCache();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PickerViewProvider.viewType, view, {
      // Keep the wheel painted so reopening the panel is instant.
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(OPEN_COMMAND, async () => {
      if (!(await ensurePeacock())) {
        return;
      }
      await showColorMenu(swatches, await readMenuKeys(context.globalStorageUri));
    }),
    // Both of these carry a keybinding, so both can be auto-repeated by holding
    // the key. See hold-guard.ts.
    vscode.commands.registerCommand(
      RANDOM_COMMAND,
      guardHeldKey(async () => {
        if (!(await ensurePeacock())) {
          return;
        }
        // Peacock's own command, so a random color is saved and applied exactly
        // as it would be from Peacock's menu.
        await vscode.commands.executeCommand('peacock.changeColorToRandom');
      }),
    ),
    vscode.commands.registerCommand(
      OPEN_WHEEL_COMMAND,
      guardHeldKey(async () => {
        if (!(await ensurePeacock())) {
          return;
        }
        await vscode.commands.executeCommand(`${PickerViewProvider.viewType}.focus`);
      }),
    ),
  );

  // Installing or removing Peacock changes what the button should say.
  context.subscriptions.push(
    vscode.extensions.onDidChange(() => refreshStatusBarItem(context)),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (
        event.affectsConfiguration(`${CONFIG_SECTION}.statusBarPriority`) ||
        event.affectsConfiguration(`${CONFIG_SECTION}.showStatusBarButton`)
      ) {
        refreshStatusBarItem(context);
      }
    }),
  );

  refreshStatusBarItem(context);
  return { view, swatches };
}

export function deactivate(): void {
  statusBarItem?.dispose();
  statusBarItem = undefined;
}

/**
 * Peacock is checked here rather than declared as an `extensionDependency`.
 *
 * A hard dependency makes installing from a .vsix fail outright when Peacock is
 * absent, with an error that does not say why, and that is the route people on
 * VS Code forks usually take. Checking at runtime means the extension always
 * installs and simply explains itself if the piece it drives is missing.
 */
async function ensurePeacock(): Promise<boolean> {
  if (isPeacockInstalled()) {
    return true;
  }

  const show = 'Show Peacock';
  const choice = await vscode.window.showWarningMessage(
    'Peacock required. This extension picks colors for the Peacock extension, which is not installed.',
    show,
  );
  if (choice === show) {
    // Opens Peacock's page in the Extensions view, where Install sits.
    await vscode.commands.executeCommand('extension.open', PEACOCK_EXTENSION_ID);
  }
  return false;
}

function refreshStatusBarItem(context: vscode.ExtensionContext): void {
  statusBarItem?.dispose();
  statusBarItem = undefined;

  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  if (!config.get<boolean>('showStatusBarButton', true)) {
    return;
  }

  // Peacock creates its item on the left with no explicit priority, which VS
  // Code treats as 0. A slightly lower number puts us immediately to its right.
  const priority = config.get<number>('statusBarPriority', -1);

  const item = vscode.window.createStatusBarItem(
    STATUS_BAR_ID,
    vscode.StatusBarAlignment.Left,
    priority,
  );
  item.name = 'Peacock Color Picker';
  item.command = OPEN_COMMAND;

  if (isPeacockInstalled()) {
    item.text = '$(symbol-color)';
    item.tooltip = 'Pick a Peacock color';
    item.accessibilityInformation = { label: 'Pick a Peacock color', role: 'button' };
  } else {
    // Say so on the button rather than waiting for a click to fail.
    item.text = '$(symbol-color) $(warning)';
    item.tooltip = 'Peacock required — click to open it in the Extensions view';
    item.accessibilityInformation = { label: 'Peacock required', role: 'button' };
  }

  item.show();

  statusBarItem = item;
  context.subscriptions.push(item);
}
