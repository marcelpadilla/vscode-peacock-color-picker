# Change Log

## 1.1.4

- **A quieter color menu.** The rows no longer repeat their own hex: the name
  and the swatch already say which color each one is. "Surprise me" and
  "Palette, HSV, RGB and OKLCH" are gone too. Random color and the picker still
  show their shortcuts, the color in use is still marked, and typing a hex
  still offers it.

## 1.1.3

- No more em dashes anywhere you can read them.
- Trimmed the readme, the changelog and the status bar position setting.

## 1.1.2

- Shorter description.

## 1.1.1

- Fixed a stale description. It called the status bar item a "color wheel
  button", which stopped being true when the icon became a palette, and called
  the menu "floating", which it never was. It is a quick pick.

## 1.1.0

- **New icon.** The palette from Microsoft's `symbol-color` codicon, the same
  glyph the extension puts in your status bar, in Peacock's own five colors.
  Four wells filled, the fifth left white.
- **The color menu shows the colors.** Every entry carries a swatch, with a
  contrast ring so white reads on a light theme and near-black on a dark one.
  They were always generated but the workbench refused to load them: extension
  storage is a `vscode-userdata:` Uri, which is not on the Content Security
  Policy's `img-src` list. They are `data:` Uris now.
- **Shortcuts for random color and the picker**, shown in the menu.
  <kbd>⌃⌥⌘R</kbd> and <kbd>⌃⌥⌘P</kbd> on macOS, <kbd>Ctrl+Shift+Alt+R</kbd> and
  <kbd>Ctrl+Shift+Alt+P</kbd> elsewhere. Checked against every key VS Code
  already claims.
- **Holding a shortcut changes the color once, not sixty times.** Repeats are
  collapsed. Two deliberate presses are still two colors.
- **Browsing colors then choosing an action no longer keeps the color you were
  looking at.** Arrowing to Emerald and picking Lighten used to lighten
  Emerald. Only choosing a color keeps a color.
- **Choosing a swatch resets the lighten/darken slider** and re-anchors it.
- **The swatch in use is ringed in the palette.** The ring existed but the grid
  was never indexed, so it had never shown.
- **The palette grid is dense.** Swatches tile edge to edge, so every pixel
  picks the color under it. The old gaps were dead space.
- **Save and clear head the favorites section** instead of trailing the menu.
- **Neutrals climb to pure white** in six even steps of perceived lightness.

## 1.0.0

First release.

- **Peacock is now checked at runtime instead of declared as an
  `extensionDependency`.** A declared dependency makes installing from a `.vsix`
  fail outright when Peacock is absent, with an error that does not explain
  itself, and that is how most people on VS Code forks install things. The
  extension now always installs; if Peacock is missing the status bar button
  says so and offers to open it in the Extensions view.
- **Supported from VS Code 1.84.** The floor is verified, not guessed: the
  integration suite runs against it as well as stable, and `@types/vscode` is
  pinned to it so the compiler rejects any API newer than that.
- The lighten/darken slider falls back to the older vertical-range property on
  VS Code before 1.87, where `writing-mode` does not yet stand a range input on
  end.
- The README is now the Marketplace page and nothing else; the development and
  design notes moved to `docs/DEVELOPMENT.md`.

## 0.5.0

- **Lighten and Darken moved up**, to third and fourth in the menu, directly
  under Random color and Open color picker.
- **Each shows Peacock's own shortcut** rather than adding a competing one, so
  there is a single pair of keys to learn and nothing new to collide with. The
  shortcut displayed is the one actually in effect: Peacock's declared default,
  reconciled against your `keybindings.json`, so a rebind or a removal shows
  through. On Windows and Linux the entries show no shortcut, which is correct:
  Peacock's defaults use the Command key and so bind only on macOS.
- **The picker gained a lighten/darken column** on the left: a vertical slider
  with buttons above and below, ten steps in each direction, and the same
  shortcut printed underneath. It is anchored to the color you last picked
  rather than compounding, so returning the slider to zero gives back exactly
  the color you chose.
- The control uses Peacock's own arithmetic, HSL lightness moved by
  `peacock.darkenLightenPercentage` and rounded per step the way a key press
  is. The test suite runs the real `peacock.lighten` and `peacock.darken`
  commands and asserts the results agree, including over repeated presses.

## 0.4.0

### The menu

- **Random color is now the first entry**, so opening the menu and pressing
  Enter rolls a color. **Open color picker** is second.
- **Favorites moved below the colors.** The favorites you saw on a fresh install
  were Peacock's own recommended defaults, not anything you had chosen, and they
  had no business being the first thing in the list.
- **The rainbow is 20 steps laid out in OKLCH.** HSV's "value" is not
  brightness. A pure yellow and a pure blue at V=1 differ about 5x in perceived
  lightness, so an HSV sweep crowds some hues and stretches others.
  OKLCH hue angles are perceptually spaced, so the 20 steps are evenly spaced to
  the eye. Each step sits at its hue's gamut cusp, the most vivid point sRGB can
  reach there.

### The picker

Four tabs, with **Palette** open by default:

- **Palette** - a large grid sorted hue across, lightness down, with a neutral
  row beneath. Built in OKLCH, so every row is one perceived lightness the whole
  way across.
- **HSV** - the wheel, with a value slider.
- **RGB** - three sliders, each track showing what the color becomes as it moves.
- **OKLCH** - lightness, chroma and hue sliders, with a warning when a chroma is
  past what sRGB can show.

All four are views onto one color, so switching tabs never changes it.

### Quality of life

- **Copy buttons** for the hex, the CSS `rgb()` and the CSS `oklch()`.
- **Eyedropper** to sample any pixel on screen, where the platform offers one.
- Every slider track is painted with the gradient of the channel it controls.
- The tab you were last on is remembered.
- Sliders and the hex field apply as you go, same as the wheel.

### Under the hood

- Colors that fall outside sRGB are brought in with the CSS Color 4 gamut
  mapping algorithm, which reduces chroma by binary search rather than clipping
  channels. Clipping swings hue by up to 47 degrees in the blues; this holds it
  under 7.
- The color science lives in one file that both the webview and the extension
  host load, so the swatches the menu offers and the colors the picker draws
  cannot drift apart.

## 0.3.0

- Clicking the status bar button now opens a **floating color menu**, the same
  kind of quick pick that other status bar buttons use. It closes itself when you
  pick something; there is nothing to dismiss by hand.
- Arrowing through the menu **previews each color live** on the workbench.
  Accepting keeps it, <kbd>Esc</kbd> puts the original back.
- The menu shows real color swatches, generated as PNGs on the fly and cached in
  the extension's storage, because quick pick icons have to be files on disk.
- Contents: your Peacock favorites, a 41-color palette (18 hues x 2 tones, plus
  neutrals), and actions for the wheel, Surprise me, Lighten, Darken, Save to
  favorites, and Remove color.
- Type a hex into the menu's filter box and it is offered as the top entry, so
  any color is still one step away.
- The wheel is still there for shades the list does not carry, now reached from
  **Color wheel...** in the menu or the `Peacock Color Picker: Open Color Wheel`
  command.

## 0.2.0

- The picker now lives in the **bottom panel**, directly above the status bar
  button that opens it, instead of taking over an editor tab. Clicking the
  status bar button toggles it open and closed.
- **A single click on the wheel applies the color immediately.** The old
  press-drag-release-to-commit dance is gone; dragging simply keeps applying.
- The wheel sizes itself to the panel's height, so it stays usable whether the
  panel is a thin strip or half the screen.
- Webview scripts are inlined into the page rather than linked. VS Code serves
  webview resources through a caching service worker, and a locally reinstalled
  extension could otherwise end up running stale scripts against freshly loaded
  extension code, which showed up as a completely blank wheel.
- The page reports script errors back to the extension, and the test suite
  asserts that the picker loads cleanly and reports no errors.
- Removed `peacockColorPicker.livePreview` and `peacockColorPicker.viewColumn`;
  neither means anything now that every interaction applies instantly to a
  docked view.

## 0.1.0

- Initial release.
- Status bar color wheel button that sits next to Peacock's color item.
- HSV wheel with press-drag-release selection, live workbench preview, and
  revert on cancel.
- Brightness slider, hex entry, and one-click Peacock favorites.
