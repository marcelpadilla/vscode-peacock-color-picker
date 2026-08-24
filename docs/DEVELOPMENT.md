# Development

The README is the Marketplace page and is deliberately almost empty. Everything
else lives here.

## What it does

A status bar item next to Peacock's color opens a color menu:

1. **Random color** — first, so a bare Enter rolls one.
2. **Open color picker** — the four-tab picker below.
3. **Lighten** and **Darken**.
4. **Rainbow** — 20 steps laid out in OKLCH.
5. **Neutrals**, then Save to favorites and Remove color, then your favorites.

Each of the first four shows the shortcut that is actually bound to it.

Arrowing through previews live. Enter keeps the color, <kbd>Esc</kbd> restores.
Typing a hex offers it as the top entry.

The picker docks in the bottom panel with four tabs — Palette, HSV, RGB,
OKLCH — over a single canonical color, so switching tabs never changes it. Down
the left is a lighten/darken slider anchored to the last color picked, so
sliding back to zero returns exactly that color.

## Build and test

```bash
npm install
npm run compile
npm test                     # unit, then webview, then the extension host suites
npm run package              # -> peacock-color-picker-<version>.vsix
```

Three layers, because there are three places code runs:

| | what it covers | needs |
| --- | --- | --- |
| `test:unit` | the pure modules, on a fake clock where time matters | nothing |
| `test:webview` | `media/picker.js`, driven in the real page | Chrome |
| `test:integration` | the extension host, against a real Peacock | VS Code |

`test:webview` loads the markup out of `picker-view.ts` and the scripts out of
`media/` into headless Chrome and drives them over the DevTools protocol. The
webview is the largest file here and nothing else can reach it: it is DOM
behaviour, so it needs a DOM. Without Chrome installed it prints `SKIP` and
passes, so it is worth reading the output rather than only the exit code.

`test:integration` runs twice: against `stable`, and against `1.84.0`, the floor
declared in `engines.vscode`. That number is verified rather than guessed.

Two layout notes for anyone cloning this:

- `.vscode-test` is a symlink to a cache outside the repo. It holds several
  hundred megabytes of downloaded VS Code builds.
- `.vscode-test.mjs` puts the throwaway user-data directory in `/tmp`. macOS
  caps unix socket paths at 103 characters and VS Code puts its main socket
  inside that directory, so a deep checkout would otherwise fail to launch.

## Screenshots

```bash
npm run screenshot:picker                  # renders the real webview headlessly
npm run screenshot:window -- statusbar     # click the VS Code window to capture
npm run screenshot:window -- menu
```

The picker shot is generated from the shipped markup and scripts, so it cannot
drift from the real thing. The other two show VS Code's own chrome, so they are
captured from a running window rather than drawn — faking them would
misrepresent the product.

## Design notes

### Peacock is a runtime requirement, not an `extensionDependency`

A declared dependency makes installing from a `.vsix` fail outright when Peacock
is absent, with an error that does not explain itself
([microsoft/vscode#233375](https://github.com/microsoft/vscode/issues/233375)),
and that is the route people on VS Code forks usually take. Checking at runtime
means the extension always installs and says what it needs.

### Colors go through Peacock's own command

`peacock.enterColor` takes an optional color argument, which skips its input box
and runs the real apply-and-persist path. Nothing writes Peacock's settings
directly, so every element Peacock is configured to tint stays consistent.

### Why OKLCH

HSV is not perceptual. Its "value" is the largest channel, not brightness, so a
pure yellow and a pure blue both sit at V=1 while differing about fivefold in how
light they look, and the hue circle is spent unevenly. OKLCH is built so a step
of the same size is the same perceived step wherever it is taken.

Two consequences:

- **Not every OKLCH color exists in sRGB.** Colors outside it are brought in with
  the CSS Color 4 gamut mapping algorithm — reduce chroma by binary search,
  accept a clip only within a just noticeable difference. Clipping channels
  directly is simpler and much worse: measured over the hue circle it swings hue
  by up to 47°, where this holds it under 7°.
- **A constant-lightness rainbow turns yellow olive**, because a genuinely yellow
  yellow lives near L = 0.97. Each step therefore sits at its own hue's gamut
  cusp, the most vivid point sRGB reaches there, while hue spacing stays even.

### Lighten and darken match Peacock exactly

Peacock runs `tinycolor(color).lighten(n)`, which moves HSL lightness by n
percent and rounds to 8-bit channels each press. The picker's slider replicates
that rather than using a perceptual space that would disagree with the keyboard
shortcut. The integration suite runs the real `peacock.lighten` and
`peacock.darken` commands and asserts the results agree, including over repeated
presses.

### Menu swatches are `data:` Uris, not files

This is the one thing in the extension that cannot be changed casually. VS Code
hands an extension its storage as a `vscode-userdata:` Uri, and the workbench
document declares

    img-src 'self' data: blob: vscode-remote-resource: ... https:

which has no entry for that scheme. A swatch written to extension storage is
requested and refused by the Content Security Policy; nothing is reported to the
extension and the item renders as an empty square. A `file:` Uri fails too —
`FileAccess.uriToBrowserUri` would rewrite it to `vscode-file://vscode-app`,
which is same-origin and does load, but only for paths under the roots
`protocolMainService` accepts, and only on the desktop. `data:` is on the CSP
list unconditionally, needs no file to exist, and works in remote workspaces and
in the browser. The test suite asserts the scheme.

### Keybindings are read as well as bound

Lighten and darken are Peacock's own; the menu displays Peacock's keys rather
than adding a competing pair. Random color and the picker have no Peacock
equivalent, so this extension binds those two itself.

VS Code has no API for querying keybindings, so the declared defaults are read
from the relevant manifest and reconciled against the user's
`keybindings.json`, honouring rebinds and removals. Peacock's defaults use the
Command key, so off macOS they correctly show nothing.

The two new keys are `ctrl+alt+cmd+R`/`P` on macOS and `ctrl+shift+alt+R`/`P`
elsewhere. Four modifiers is deliberate. It keeps the obvious mnemonic letter —
R for random, P for picker — which `alt+cmd+R` and `alt+cmd+P` could not, both
being taken several times over by the find and search widgets. `ctrl+alt+X` is
avoided because it is AltGr on many European layouts. The whole default
keybinding set was dumped from a running VS Code and checked before choosing;
`scripts/` has no tool for this because it is a once-per-decade question.

### Only choosing a color keeps a color

Arrowing through the menu previews each color on the workbench, which means the
workbench is left dirty at the moment anything is accepted. The rule is that a
preview is undone unless the accepted entry *is* a color: browsing to Emerald
and then picking Lighten has to lighten the color you had, not the one you were
looking at, and Save to favorites has to save the same one.

Two things fall out of that. The undo is awaited before the action runs, so the
action never races the write that reverses the preview — which is why
`ApplyQueue.push` resolves on the queue draining rather than on the color being
accepted into it. And nothing is undone unless something was done, so opening
the menu and dismissing it without moving does not write to settings at all.

### A held key must not repeat a command

Binding a key to a command that rewrites the workbench colors needs a guard, or
holding it strobes the window and writes to `settings.json` thirty times a
second. `src/hold-guard.ts` collapses a hold into one run.

The awkward part is that the extension host sees each repeat when it *processes*
it, not when the key was pressed, and it falls behind while the workbench
repaints. Measured on a real hold: key events 30ms apart arrived as invocations
with gaps of up to 400ms, and continued for a second after the key was released.
A window wide enough to cover that would also swallow a deliberate second press.

So the guard uses two thresholds. Normally an invocation is dropped only within
250ms of the previous one. But once four in a row have been dropped — which no
hand produces — it concludes the key is held and requires a full second of
silence instead. A single press suppresses nothing, so nothing about ordinary
use changes. The unit tests replay a recorded burst, stalls included.

### The icon is the status bar glyph

`media/icon.svg` is the source; `media/icon.png` is generated from it by
`npm run icon` and is the only one of the two that ships. The palette shape is
Microsoft's `symbol-color` codicon, which is also what `$(symbol-color)` draws
in the status bar, so the Marketplace listing and the button people click are
the same drawing rather than two that have to be kept in sync. Codicons are
CC BY 4.0, which is why the README carries a credit.

The five wells use Peacock's own colors, sampled from its icon: `#1a79ca`,
`#791aca`, `#ca1a79`, `#79ca1a` and `#ffcc00`. Four of those are byte
permutations of one triple, which is why the set looks deliberate. The fifth
well is white, for the color not yet picked.

The SVG's `viewBox` is the artwork's exact bounding box plus 4.5%, so
rasterising it needs no cropping or centring pass and the PNG is a pure
function of the SVG. Note that `--force-device-scale-factor` enlarges the
output rather than supersampling it; it is not a quality knob here.

### Webview scripts are inlined

VS Code serves webview resources through a caching service worker. When an
extension is reinstalled locally, freshly loaded extension code can end up paired
with a cached copy of the old scripts, which surfaces as a silently blank page.
Inlining keeps the page and its scripts one unit. `media/color-spaces.js` and
`media/color-math.js` stay separate files so they can be unit tested outside a
browser, and the extension host `require`s the same files the webview inlines —
one implementation, so the two can never drift.

## Layout

| Path | What |
| --- | --- |
| `src/extension.ts` | Activation, status bar item, commands |
| `src/quick-pick.ts` | The color menu |
| `src/picker-view.ts` | The panel webview |
| `src/palette.ts` | The OKLCH rainbow and neutrals |
| `src/keybindings.ts` | Keybinding resolution (pure, no `vscode` import) |
| `src/apply-queue.ts` | One colour write at a time, newest wins |
| `src/hold-guard.ts` | Collapses a held key into one run |
| `src/png.ts` | Swatch encoder, no image dependency |
| `src/swatch.ts` | Swatches as `data:` Uris |
| `media/icon.svg` | The Marketplace icon, source of `icon.png` |
| `media/color-spaces.js` | sRGB, Oklab, OKLCH, gamut mapping |
| `media/color-math.js` | Hex, HSV, HSL, wheel geometry |
| `media/picker.js` | The picker UI |

## Publishing

See [PUBLISHING.md](../PUBLISHING.md).
