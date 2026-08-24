/**
 * Builds the picker as a standalone page for headless Chrome.
 *
 * This is the real thing: the markup the extension serves, lifted out of
 * `picker-view.ts`, and the scripts it ships, with a stub of the webview API and
 * the theme variables VS Code supplies. The screenshot and the behaviour check
 * both go through here so neither can drift from what is actually shipped.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

/** Chrome, wherever it is. Returns undefined if it is not installed. */
function findChrome() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find(candidate => fs.existsSync(candidate));
}

/** The theme tokens VS Code injects into a webview, at their Dark Modern values. */
const THEME = `:root {
  --vscode-font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  --vscode-font-size: 13px;
  --vscode-foreground: #cccccc;
  --vscode-input-background: #313131;
  --vscode-input-foreground: #cccccc;
  --vscode-input-border: #3c3c3c;
  --vscode-widget-border: #5a5a5a;
  --vscode-focusBorder: #0078d4;
  --vscode-editor-font-family: ui-monospace, monospace;
  --vscode-button-secondaryBackground: #313131;
  --vscode-button-secondaryForeground: #cccccc;
}
body { background: #181818; }`;

/**
 * Writes the page and its scripts to a fresh temp directory.
 *
 * @param {{tab?: string, color?: string}} options `tab` is what the stub reports
 *   as previously saved webview state, so an unknown one can be exercised.
 * @returns {{dir: string, html: string, cleanup: () => void}}
 */
function buildPage({ tab = 'palette', color = '#364c67' } = {}) {
  const view = fs.readFileSync(path.join(ROOT, 'src', 'picker-view.ts'), 'utf8');
  const body = view.slice(view.indexOf('<main class="picker">'), view.indexOf('</main>') + 7);
  if (!body.startsWith('<main')) {
    throw new Error('could not find the picker markup in picker-view.ts');
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'picker-page-'));
  for (const file of ['color-spaces.js', 'color-math.js', 'picker.js', 'picker.css']) {
    fs.copyFileSync(path.join(ROOT, 'media', file), path.join(dir, file));
  }

  // Everything the page posts is kept, so a check can assert on what it sent.
  fs.writeFileSync(
    path.join(dir, 'boot.js'),
    `window.__sent = [];
     window.acquireVsCodeApi = () => ({
       getState: () => ({ tab: ${JSON.stringify(tab)} }),
       setState: () => {},
       postMessage: m => {
         window.__sent.push(m);
         if (m.type === 'ready') {
           setTimeout(() => window.dispatchEvent(new MessageEvent('message', {
             data: { type: 'init', color: ${JSON.stringify(color)}, percentage: 5,
                     keys: { lighten: '\\u2325\\u2318=', darken: '\\u2325\\u2318-' } }
           })), 0);
         }
       }
     });`,
  );

  const html = path.join(dir, 'page.html');
  fs.writeFileSync(
    html,
    `<!DOCTYPE html><html><head><meta charset="utf-8"/>
     <link href="picker.css" rel="stylesheet"/><style>${THEME}</style></head>
     <body>${body}
     <script src="boot.js"></script>
     <script src="color-spaces.js"></script>
     <script src="color-math.js"></script>
     <script src="picker.js"></script>
     </body></html>`,
  );

  return { dir, html, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

module.exports = { buildPage, findChrome };
