import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { ApplyQueue } from './apply-queue';
import { getCurrentColor, getDarkenLightenPercentage } from './peacock';
import { readMenuKeys, type MenuKeys } from './peacock-keys';

/** Messages the webview sends us. */
export type InboundMessage =
  | { type: 'ready' }
  | { type: 'apply'; color: string }
  | { type: 'copy'; text: string }
  | { type: 'error'; message: string };

/** Diagnostics buffer: what the webview has reported back, newest last. */
export const webviewLog: string[] = [];
const MAX_LOG_ENTRIES = 100;

/** The page only ever sends short color strings; refuse anything else. */
const MAX_COPY_LENGTH = 128;

function log(entry: string): void {
  webviewLog.push(entry);
  if (webviewLog.length > MAX_LOG_ENTRIES) {
    webviewLog.splice(0, webviewLog.length - MAX_LOG_ENTRIES);
  }
}

/**
 * The picker lives in the bottom panel rather than an editor tab, so it sits
 * directly above the status bar button that opens it. VS Code has no API for a
 * floating popup anchored to a status bar item; a panel view is the closest
 * thing it offers.
 */
export class PickerViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'peacockColorPicker.wheel';

  private view: vscode.WebviewView | undefined;

  private readonly queue = new ApplyQueue(error =>
    vscode.window.showErrorMessage(
      `Peacock Color Picker: ${error instanceof Error ? error.message : String(error)}`,
    ),
  );

  /** Peacock's own Lighten/Darken shortcuts, shown next to the control. */
  private keys: MenuKeys = {};

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly globalStorageUri: vscode.Uri,
  ) {}

  /** True when the panel is open and showing the picker. */
  public get isVisible(): boolean {
    return this.view?.visible ?? false;
  }

  public async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    log('resolve:start');
    this.view = view;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    try {
      await this.refreshKeys();
    view.webview.html = await this.buildHtml(view.webview);
    } catch (error) {
      log(`resolve:error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    view.webview.onDidReceiveMessage((message: InboundMessage) => {
      log(message.type === 'error' ? `error: ${message.message}` : message.type);
      void this.handleMessage(message);
    });

    // Peacock's color can change from its own commands while we are open.
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        void this.refreshKeys().then(() => this.postInit());
      }
    });

    view.onDidDispose(() => {
      this.view = undefined;
    });
  }

  public async handleMessage(message: InboundMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.postInit();
        return;
      case 'apply':
        await this.queue.push(message.color);
        return;
      case 'copy':
        // Webviews cannot reach the clipboard reliably; the host can.
        if (typeof message.text === 'string') {
          await vscode.env.clipboard.writeText(message.text.slice(0, MAX_COPY_LENGTH));
        }
        return;
      case 'error':
        console.error('Peacock Color Picker webview:', message.message);
        return;
    }
  }

  private async refreshKeys(): Promise<void> {
    this.keys = await readMenuKeys(this.globalStorageUri);
  }

  private postInit(): void {
    void this.view?.webview.postMessage({
      type: 'init',
      color: getCurrentColor() ?? '#42b883',
      percentage: getDarkenLightenPercentage(),
      keys: this.keys,
    });
  }

  /**
   * Scripts are inlined rather than linked. The picker is installed and
   * reinstalled locally, and VS Code serves webview resources through a caching
   * service worker, so linked files can go stale against a freshly loaded
   * extension. Inlining keeps the page and its scripts a single unit.
   */
  private async buildHtml(webview: vscode.Webview): Promise<string> {
    const nonce = createNonce();
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'picker.css'),
    );
    const [spaces, math, script] = await Promise.all([
      this.readMedia('color-spaces.js'),
      this.readMedia('color-math.js'),
      this.readMedia('picker.js'),
    ]);

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="${styleUri}" rel="stylesheet" />
    <title>Peacock Color Picker</title>
  </head>
  <body>
    <main class="picker">
      <div class="workspace">
      <aside class="adjust">
        <button id="lighten" class="adjust-button" type="button" title="Lighten">+</button>
        <input
          id="steps"
          class="steps"
          type="range"
          min="-10"
          max="10"
          step="1"
          value="0"
          aria-label="Lighten or darken the chosen color"
        />
        <button id="darken" class="adjust-button" type="button" title="Darken">&minus;</button>
        <output id="steps-out" class="steps-value">0</output>
        <span id="adjust-keys" class="adjust-keys"></span>
      </aside>

      <div class="workbench">
      <nav class="tabs" role="tablist" aria-label="Color space">
        <button class="tab" role="tab" type="button" data-tab="palette">Palette</button>
        <button class="tab" role="tab" type="button" data-tab="hsv">HSV</button>
        <button class="tab" role="tab" type="button" data-tab="rgb">RGB</button>
        <button class="tab" role="tab" type="button" data-tab="oklch">OKLCH</button>
      </nav>

      <div class="panes">
        <section class="pane" data-pane="palette" role="tabpanel">
          <div id="grid" class="grid"></div>
        </section>

        <section class="pane" data-pane="hsv" role="tabpanel">
          <canvas id="wheel" aria-label="Hue and saturation wheel"></canvas>
          <div class="sliders">
            <label class="slider-row" for="hsv-v">
              <span class="slider-label">Value</span>
              <input id="hsv-v" class="track" type="range" min="0" max="100" step="1" />
              <output id="hsv-v-out" class="slider-value"></output>
            </label>
            <p class="hint">Click or drag the wheel. Hue runs around it, saturation outward.</p>
          </div>
        </section>

        <section class="pane" data-pane="rgb" role="tabpanel">
          <div class="sliders">
            <label class="slider-row" for="rgb-r">
              <span class="slider-label">R</span>
              <input id="rgb-r" class="track" type="range" min="0" max="255" step="1" />
              <output id="rgb-r-out" class="slider-value"></output>
            </label>
            <label class="slider-row" for="rgb-g">
              <span class="slider-label">G</span>
              <input id="rgb-g" class="track" type="range" min="0" max="255" step="1" />
              <output id="rgb-g-out" class="slider-value"></output>
            </label>
            <label class="slider-row" for="rgb-b">
              <span class="slider-label">B</span>
              <input id="rgb-b" class="track" type="range" min="0" max="255" step="1" />
              <output id="rgb-b-out" class="slider-value"></output>
            </label>
          </div>
        </section>

        <section class="pane" data-pane="oklch" role="tabpanel">
          <div class="sliders">
            <label class="slider-row" for="oklch-l">
              <span class="slider-label">L</span>
              <input id="oklch-l" class="track" type="range" min="0" max="100" step="0.5" />
              <output id="oklch-l-out" class="slider-value"></output>
            </label>
            <label class="slider-row" for="oklch-c">
              <span class="slider-label">C</span>
              <input id="oklch-c" class="track" type="range" min="0" max="400" step="1" />
              <output id="oklch-c-out" class="slider-value"></output>
            </label>
            <label class="slider-row" for="oklch-h">
              <span class="slider-label">H</span>
              <input id="oklch-h" class="track" type="range" min="0" max="360" step="1" />
              <output id="oklch-h-out" class="slider-value"></output>
            </label>
            <p id="gamut" class="hint gamut" hidden>
              Beyond what sRGB can show; chroma reduced to the nearest match.
            </p>
          </div>
        </section>
      </div>
      </div>
      </div>

      <footer class="readout">
        <span id="swatch" class="swatch" aria-hidden="true"></span>
        <input
          id="hex"
          class="hex"
          type="text"
          spellcheck="false"
          autocomplete="off"
          aria-label="Hex color"
          maxlength="7"
        />
        <button id="copy-hex" class="copy" type="button" title="Copy hex">HEX</button>
        <button id="copy-rgb" class="copy" type="button" title="Copy CSS rgb()">RGB</button>
        <button id="copy-oklch" class="copy" type="button" title="Copy CSS oklch()">OKLCH</button>
        <button id="eyedropper" class="copy icon" type="button" title="Pick a color from the screen" hidden>
          &#9678;
        </button>
        <span id="toast" class="toast" role="status" aria-live="polite"></span>
      </footer>
    </main>
    <script nonce="${nonce}">${spaces}</script>
    <script nonce="${nonce}">${math}</script>
    <script nonce="${nonce}">${script}</script>
  </body>
</html>`;
  }

  private async readMedia(name: string): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(this.extensionUri, 'media', name),
    );
    return new TextDecoder().decode(bytes);
  }
}

/**
 * A CSP nonce is a security boundary: it is what stops injected markup from
 * running as script. It has to be unpredictable, so it comes from the CSPRNG.
 */
function createNonce(): string {
  return randomBytes(24).toString('base64');
}
