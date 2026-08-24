/**
 * Interactive helper for the two screenshots that have to come from a real
 * VS Code window: the status bar button, and the colour menu open over the
 * editor. Both show VS Code's own chrome, which cannot honestly be faked.
 *
 * Usage:  npm run screenshot:window -- statusbar
 *         npm run screenshot:window -- menu
 *
 * Your cursor turns into a camera; click the VS Code window to capture it.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const NAMES = {
  statusbar: 'The status bar button, with Peacock beside it. Zoom in first.',
  menu: 'The colour menu open. Run "Peacock Color Picker: Pick a Color" first.',
};

const which = process.argv[2];
if (!NAMES[which]) {
  console.error(`Usage: npm run screenshot:window -- <${Object.keys(NAMES).join('|')}>`);
  process.exit(1);
}

if (process.platform !== 'darwin') {
  console.error('This helper uses the macOS screencapture tool; capture manually elsewhere.');
  process.exit(1);
}

const out = path.join(__dirname, '..', 'media', 'screenshots', `${which}.png`);
console.log(NAMES[which]);
console.log('\nClick the window to capture it (Esc to cancel)...');

// -w waits for a window click, -o drops the drop shadow.
execFileSync('screencapture', ['-w', '-o', out], { stdio: 'inherit' });
console.log(`\nSaved ${out}`);
