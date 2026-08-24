/**
 * Renders the picker webview in headless Chrome and saves it as the screenshot
 * used on the Marketplace page.
 *
 * This is the real page — see `picker-page.js`, which the behaviour checks use
 * too, so the screenshot cannot show something the checks never exercised.
 * Run with `npm run screenshot:picker`.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { buildPage, findChrome } = require('./picker-page');

const OUT = path.join(__dirname, '..', 'media', 'screenshots', 'picker.png');

const chrome = findChrome();
if (!chrome) {
  console.error('Chrome or Chromium is needed to render the picker.');
  process.exit(1);
}

const page = buildPage({ tab: process.argv[2] || 'palette', color: process.argv[3] || '#364c67' });

try {
  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--window-size=820,300',
    '--virtual-time-budget=4000',
    `--screenshot=${OUT}`,
    `file://${page.html}`,
  ]);
} finally {
  page.cleanup();
}

console.log(`wrote ${OUT}`);
