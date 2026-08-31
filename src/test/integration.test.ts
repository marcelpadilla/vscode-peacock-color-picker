import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { PickerApi } from '../extension';
import math from '../color-math';
import { getDarkenLightenPercentage, PEACOCK_MARKETPLACE_URL } from '../peacock';
import type { PickerViewProvider } from '../picker-view';
import { webviewLog } from '../picker-view';
import { ApplyQueue } from '../apply-queue';

const EXTENSION_ID = 'marcelpadilla.peacock-color-picker';
const PEACOCK_ID = 'johnpapa.vscode-peacock';
const VIEW_ID = 'peacockColorPicker.wheel';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function peacockColor(): string | undefined {
  return vscode.workspace.getConfiguration('peacock').get<string>('color');
}

/**
 * Peacock writes through the settings service, so the value lands a moment
 * after the command resolves. Poll rather than guess at a sleep length.
 */
// Generous on purpose: this waits on a settings write plus a workbench repaint,
// and a loaded machine can take seconds over it. The assertion is exact either
// way — the timeout only decides how long to wait before calling it a failure.
async function waitForColor(expected: string, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && peacockColor() !== expected) {
    await sleep(100);
  }
  assert.equal(peacockColor(), expected);
}

async function getApi(): Promise<PickerApi> {
  const extension = vscode.extensions.getExtension<PickerApi>(EXTENSION_ID);
  assert.ok(extension, `${EXTENSION_ID} is not installed in the test host`);
  return extension.activate();
}

async function getProvider(): Promise<PickerViewProvider> {
  return (await getApi()).view;
}

/**
 * Focus the picker and wait for it to settle. A view only reports `ready` the
 * first time it is resolved, so afterwards we wait on visibility instead.
 */
async function openPickerAndWait({ requireReady = false } = {}): Promise<string> {
  webviewLog.length = 0;
  const provider = await getProvider();
  await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
  for (let i = 0; i < 40; i++) {
    if (webviewLog.includes('ready') || (!requireReady && provider.isVisible)) {
      break;
    }
    await sleep(250);
  }
  return webviewLog.join('\n');
}

suite('Peacock Color Picker', () => {
  suiteTeardown(async () => {
    await vscode.commands.executeCommand('peacock.resetWorkspaceColors');
  });

  test('the extension is installed and activates', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension);
    await extension.activate();
    assert.equal(extension.isActive, true);
  });

  test('Peacock, our extension dependency, is present', () => {
    assert.ok(vscode.extensions.getExtension(PEACOCK_ID), 'Peacock is not installed');
  });

  test('the open command and the view focus command are both registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('peacockColorPicker.open'), 'open command missing');
    assert.ok(commands.includes('peacockColorPicker.openWheel'), 'wheel command missing');
    assert.ok(commands.includes('peacockColorPicker.random'), 'random command missing');
    assert.ok(commands.includes(`${VIEW_ID}.focus`), 'the view was not contributed');
  });

  test('peacock.enterColor applies a color passed as an argument', async () => {
    // This is the contract the whole extension rests on: Peacock's
    // enterColorHandler(color?) skips its input box when handed a color.
    await vscode.commands.executeCommand('peacock.enterColor', '#832561');
    await waitForColor('#832561');
    const customizations = vscode.workspace
      .getConfiguration('workbench')
      .get<Record<string, string>>('colorCustomizations');
    assert.equal(
      customizations?.['statusBar.background'],
      '#832561',
      'Peacock did not tint the status bar with the color we passed',
    );
  });

  test('the picker view loads its scripts and reports ready, with no page errors', async () => {
    const log = await openPickerAndWait({ requireReady: true });
    assert.ok(webviewLog.includes('ready'), `the picker never reached ready. Log:\n${log}`);
    assert.equal(
      webviewLog.some(entry => entry.startsWith('error:')),
      false,
      `the page reported errors:\n${log}`,
    );
  });

  test('the picker reports itself visible once the panel is open', async () => {
    const provider = await getProvider();
    await openPickerAndWait();
    assert.equal(provider.isVisible, true, 'the view did not report itself visible');
  });

  test('an apply message from the page recolors the workspace', async () => {
    const provider = await getProvider();
    await openPickerAndWait();

    await provider.handleMessage({ type: 'apply', color: '#7B2D8E' });

    // Normalized to lowercase on the way through, and handed to Peacock.
    await waitForColor('#7b2d8e');
    const customizations = vscode.workspace
      .getConfiguration('workbench')
      .get<Record<string, string>>('colorCustomizations');
    assert.equal(customizations?.['statusBar.background'], '#7b2d8e');
  });

  test('an invalid apply message is ignored rather than written through', async () => {
    const provider = await getProvider();
    await vscode.commands.executeCommand('peacock.enterColor', '#215732');
    await waitForColor('#215732');

    await provider.handleMessage({ type: 'apply', color: 'not-a-color' });
    await sleep(600);

    assert.equal(peacockColor(), '#215732');
  });

  test('the settings we contribute are readable with their documented defaults', () => {
    const config = vscode.workspace.getConfiguration('peacockColorPicker');
    assert.equal(config.get<boolean>('showStatusBarButton'), true);
    assert.equal(config.get<number>('statusBarPriority'), -1);
  });
});

suite('Lighten and darken match Peacock', () => {
  /**
   * The picker's lighten/darken control has to land on exactly the colors
   * Peacock's own commands produce, or the slider and the keyboard shortcut
   * would disagree. This runs the real commands and compares.
   */
  const START = '#364c67';

  test('one Lighten press lands where our own arithmetic says it should', async () => {
    await vscode.commands.executeCommand('peacock.enterColor', START);
    await waitForColor(START);

    const expected = math.toHex(
      ...math.adjustLightness(math.parseHex(START)!, 1, getDarkenLightenPercentage()),
    );
    await vscode.commands.executeCommand('peacock.lighten');
    await waitForColor(expected);
  });

  test('one Darken press does too', async () => {
    await vscode.commands.executeCommand('peacock.enterColor', START);
    await waitForColor(START);

    const expected = math.toHex(
      ...math.adjustLightness(math.parseHex(START)!, -1, getDarkenLightenPercentage()),
    );
    await vscode.commands.executeCommand('peacock.darken');
    await waitForColor(expected);
  });

  test('six presses stay in step with six of ours', async () => {
    // Divergence would only show up after repeated presses if the rounding
    // differed, so the multi-step case is the one worth pinning down.
    await vscode.commands.executeCommand('peacock.enterColor', START);
    await waitForColor(START);

    const percentage = getDarkenLightenPercentage();
    const expected = math.toHex(...math.adjustLightness(math.parseHex(START)!, 6, percentage));

    for (let i = 0; i < 6; i++) {
      await vscode.commands.executeCommand('peacock.lighten');
      await sleep(120);
    }
    await waitForColor(expected);
  });

  test('Peacock declares the shortcuts we advertise', () => {
    const declared = vscode.extensions.getExtension(PEACOCK_ID)?.packageJSON?.contributes
      ?.keybindings;
    assert.ok(Array.isArray(declared), 'Peacock no longer declares any keybindings');
    const commands = declared.map((entry: { command: string }) => entry.command);
    assert.ok(commands.includes('peacock.lighten'), 'no binding declared for peacock.lighten');
    assert.ok(commands.includes('peacock.darken'), 'no binding declared for peacock.darken');
  });
});

suite('Shipping correctness', () => {
  const manifest = () => vscode.extensions.getExtension(EXTENSION_ID)!.packageJSON;

  test('Peacock is a runtime requirement, not a hard install dependency', () => {
    // A declared dependency makes .vsix installs fail when Peacock is absent,
    // which is how most people on VS Code forks install things.
    assert.equal(
      manifest().extensionDependencies,
      undefined,
      'extensionDependencies would break sideloading',
    );
  });

  test('the command used to offer Peacock actually exists in this VS Code', async () => {
    // If VS Code ever renames this, the "Peacock required" prompt would lead
    // nowhere, and nothing else would notice.
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('extension.open'), 'extension.open is gone');
  });

  test('the Peacock link points at Peacock', () => {
    // The other half of that prompt, and the only half that works the same on
    // every fork. A typo here would be invisible until someone without Peacock
    // clicked it.
    const url = new URL(PEACOCK_MARKETPLACE_URL);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.host, 'marketplace.visualstudio.com');
    assert.equal(url.pathname, '/items');
    assert.equal(url.searchParams.get('itemName'), PEACOCK_ID);
  });

  test('we bind exactly the two keys Peacock has none for', () => {
    // Lighten and darken are Peacock's own and are only displayed here. Random
    // and the picker have no Peacock equivalent, so they get keys of their own.
    const declared: Array<{ command: string }> = manifest().contributes?.keybindings ?? [];
    assert.deepEqual(
      declared.map(entry => entry.command).sort(),
      ['peacockColorPicker.openWheel', 'peacockColorPicker.random'],
    );
  });

  test('our keys avoid the combinations VS Code and its neighbours already use', () => {
    const declared: Array<Record<string, string>> = manifest().contributes?.keybindings ?? [];
    for (const entry of declared) {
      assert.ok(entry.key, `${entry.command} has no key for Windows and Linux`);
      assert.ok(entry.mac, `${entry.command} has no macOS key`);

      // ctrl+alt is AltGr on many European layouts, where it types a character
      // instead. VS Code's own guidance is to keep away from that pair.
      assert.equal(
        /^ctrl\+alt\+/.test(entry.key),
        false,
        `${entry.key} collides with AltGr on European keyboards`,
      );
      // Four modifiers is deliberate: it leaves the mnemonic letter free to be
      // the obvious one (R for random, P for picker) with nothing else on it.
      assert.match(entry.key, /^ctrl\+shift\+alt\+[a-z]$/, `unexpected shape: ${entry.key}`);
      assert.match(entry.mac, /^ctrl\+alt\+cmd\+[a-z]$/, `unexpected shape: ${entry.mac}`);
    }
  });

  test('every key we declare points at a command that exists', async () => {
    const declared: Array<{ command: string }> = manifest().contributes?.keybindings ?? [];
    const commands = await vscode.commands.getCommands(true);
    for (const entry of declared) {
      assert.ok(commands.includes(entry.command), `${entry.command} is bound but not registered`);
    }
  });

  test('the manifest carries what the Marketplace requires', () => {
    const m = manifest();
    for (const field of ['displayName', 'description', 'publisher', 'license', 'icon', 'repository']) {
      assert.ok(m[field], `missing ${field}`);
    }
    assert.ok(String(m.icon).endsWith('.png'), 'the Marketplace rejects an SVG icon');
    assert.ok((m.keywords ?? []).length <= 30, 'more than 30 keywords is rejected');
    assert.equal(m.categories.includes('Themes'), false, 'Themes is for colour themes only');
  });

  test('no runtime dependencies are shipped', () => {
    const deps = Object.keys(manifest().dependencies ?? {});
    assert.deepEqual(deps, [], `would ship node_modules for: ${deps.join(', ')}`);
  });

  test('the declared engine floor is not above the APIs we rely on', () => {
    // QuickPickItem.iconPath, the newest API here, was finalised in 1.81.
    const engine = manifest().engines.vscode;
    assert.match(engine, /^\^1\.(8[4-9]|9\d|\d{3})/, `unexpected engine range ${engine}`);
  });
});

suite('Applying colors', () => {
  /**
   * The menu restores the color you started on before running an action, and
   * then runs the action. If `push` resolved while the write was still in
   * flight, Lighten would act on the color being replaced rather than the one
   * replacing it, and Save to favorites would save the wrong color.
   */
  test('push resolves only once the color has actually landed', async () => {
    const queue = new ApplyQueue();
    await queue.push('#123456');
    assert.equal(peacockColor(), '#123456', 'push resolved before the write landed');
  });

  test('a push made during a write waits for its own color, not just for entry', async () => {
    // The case the menu depends on: a preview is still being written when the
    // original color is pushed back. Returning as soon as the queue accepted
    // the color would let the next command run against the preview.
    const queue = new ApplyQueue();
    void queue.push('#111111'); // deliberately not awaited: still in flight
    await queue.push('#222222');
    assert.equal(peacockColor(), '#222222', 'the second push resolved before it landed');
  });

  test('waiting on the first push waits for the whole queue', async () => {
    // Both handles resolve on the same drain, so either one is a safe barrier.
    const queue = new ApplyQueue();
    const first = queue.push('#333333');
    queue.push('#444444');
    await first;
    assert.equal(peacockColor(), '#444444', 'the first handle resolved early');
  });

  test('an unusable color neither throws nor disturbs the current one', async () => {
    const queue = new ApplyQueue();
    await queue.push('#555555');
    await queue.push('not-a-color');
    assert.equal(peacockColor(), '#555555');
  });
});
