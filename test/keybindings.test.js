const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  stripJsonComments,
  parseKeybindingsFile,
  resolveKeybinding,
  formatKeybinding,
} = require(path.join(__dirname, '..', 'out', 'keybindings.js'));

/** What Peacock declares in its own manifest. */
const PEACOCK_DEFAULTS = [
  { key: 'alt+cmd+-', command: 'peacock.darken' },
  { key: 'alt+cmd+=', command: 'peacock.lighten' },
];

test('comments are stripped but string contents are left alone', () => {
  const source = [
    '// leading comment',
    '[',
    '  /* block */',
    '  { "key": "ctrl+/", "command": "x" }, // trailing',
    '  { "key": "a", "command": "http://not-a-comment" },',
    ']',
  ].join('\n');
  const parsed = JSON.parse(stripJsonComments(source));
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].key, 'ctrl+/');
  assert.equal(parsed[1].command, 'http://not-a-comment');
});

test('a trailing comma does not defeat the parser', () => {
  assert.deepEqual(parseKeybindingsFile('[{"key":"a","command":"b"},]'), [
    { key: 'a', command: 'b' },
  ]);
});

test('the file VS Code creates for a user with no overrides parses to nothing', () => {
  const seeded = [
    '// Place your key bindings in this file to override the defaults',
    '[',
    ']',
  ].join('\n');
  assert.deepEqual(parseKeybindingsFile(seeded), []);
});

test('a broken keybindings file falls back rather than throwing', () => {
  assert.deepEqual(parseKeybindingsFile('[{"key": '), []);
  assert.deepEqual(parseKeybindingsFile('not json at all'), []);
  assert.deepEqual(parseKeybindingsFile('{"not": "an array"}'), []);
});

test("Peacock's defaults resolve on macOS", () => {
  assert.equal(resolveKeybinding('peacock.lighten', PEACOCK_DEFAULTS, [], 'mac'), 'alt+cmd+=');
  assert.equal(resolveKeybinding('peacock.darken', PEACOCK_DEFAULTS, [], 'mac'), 'alt+cmd+-');
});

test('a binding needing Command is reported as unbound off macOS', () => {
  // Peacock's defaults use cmd, which exists only on macOS, so on Windows and
  // Linux there is genuinely no shortcut to advertise.
  for (const platform of ['win', 'linux']) {
    assert.equal(resolveKeybinding('peacock.lighten', PEACOCK_DEFAULTS, [], platform), undefined);
  }
});

test('a user override wins over the default', () => {
  const user = [{ key: 'ctrl+alt+l', command: 'peacock.lighten' }];
  assert.equal(resolveKeybinding('peacock.lighten', PEACOCK_DEFAULTS, user, 'mac'), 'ctrl+alt+l');
});

test('a user override makes the command reachable off macOS', () => {
  const user = [{ key: 'ctrl+alt+l', command: 'peacock.lighten' }];
  assert.equal(resolveKeybinding('peacock.lighten', PEACOCK_DEFAULTS, user, 'win'), 'ctrl+alt+l');
});

test('removing a binding leaves the command unbound', () => {
  const user = [{ key: 'alt+cmd+=', command: '-peacock.lighten' }];
  assert.equal(resolveKeybinding('peacock.lighten', PEACOCK_DEFAULTS, user, 'mac'), undefined);
});

test('the rebind pattern the shortcuts editor writes resolves to the new key', () => {
  // VS Code records a rebind as a removal followed by an addition.
  const user = [
    { key: 'alt+cmd+=', command: '-peacock.lighten' },
    { key: 'cmd+shift+.', command: 'peacock.lighten' },
  ];
  assert.equal(resolveKeybinding('peacock.lighten', PEACOCK_DEFAULTS, user, 'mac'), 'cmd+shift+.');
});

test('platform specific entries beat the generic key', () => {
  const defaults = [{ key: 'ctrl+l', mac: 'cmd+l', command: 'peacock.lighten' }];
  assert.equal(resolveKeybinding('peacock.lighten', defaults, [], 'mac'), 'cmd+l');
  assert.equal(resolveKeybinding('peacock.lighten', defaults, [], 'linux'), 'ctrl+l');
});

test('an unbound command reports nothing rather than a placeholder', () => {
  assert.equal(resolveKeybinding('peacock.nothing', PEACOCK_DEFAULTS, [], 'mac'), undefined);
});

test('macOS bindings render as the symbols VS Code shows', () => {
  assert.equal(formatKeybinding('alt+cmd+=', 'mac'), '⌥⌘=');
  assert.equal(formatKeybinding('alt+cmd+-', 'mac'), '⌥⌘-');
  assert.equal(formatKeybinding('ctrl+shift+alt+cmd+k', 'mac'), '⌃⌥⇧⌘K');
});

test('modifier order is normalised regardless of how it was written', () => {
  assert.equal(formatKeybinding('cmd+alt+=', 'mac'), formatKeybinding('alt+cmd+=', 'mac'));
});

test('other platforms render as words', () => {
  assert.equal(formatKeybinding('ctrl+alt+l', 'win'), 'Ctrl+Alt+L');
  assert.equal(formatKeybinding('ctrl+shift+f5', 'linux'), 'Ctrl+Shift+F5');
});

test('chords are rendered as two strokes', () => {
  assert.equal(formatKeybinding('ctrl+k ctrl+c', 'win'), 'Ctrl+K Ctrl+C');
  assert.equal(formatKeybinding('cmd+k cmd+c', 'mac'), '⌘K ⌘C');
});
