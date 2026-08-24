# Change Log

## 1.1.2

- **A shorter description.** "Minimal color picker for the Peacock extension."
  says what it is and what it needs in one line, which is all the extensions
  list has room to show anyway.

## 1.1.1

- **The Marketplace description said the wrong things.** It called the status
  bar item a "color wheel button", which stopped being true when the icon
  became a palette, and described the menu as "floating", which it never
  really was — it is a quick pick, the same dropdown the command palette
  uses. The `showStatusBarButton` setting carried the same stale wording in
  the Settings UI.

## 1.1.0

- **A new icon.** The old one was a generic HSV wheel that said nothing about
  what the extension is for or what it works with. The new one is the palette
  from Microsoft's `symbol-color` codicon — the same glyph the extension
  already puts in your status bar, so the Marketplace listing and the button
  you click are the same shape — carrying Peacock's own five colors, sampled
  from Peacock's icon. Four wells are filled; the fifth is the color you have
  not picked yet.
- **The color menu now shows the colors.** Every entry carries a swatch of the
  color it names, with a contrast ring so a white swatch still reads on a light
  theme and a near-black one on a dark theme.

  The swatches were always being generated; they were being blocked. An
  extension's storage directory is handed to it as a `vscode-userdata:` Uri, and
  the workbench document's Content Security Policy allows images only from
  `'self'`, `data:`, `blob:`, `vscode-remote-resource:` and `https:`. An icon
  written there is fetched, refused, and drawn as an empty square, with nothing
  reported to the extension. The swatches are now `data:` Uris built in memory,
  which is on that list, needs no file on disk, and behaves the same over a
  remote connection and in the browser.
- **Random color and the picker have keyboard shortcuts**, shown beside them in
  the menu: <kbd>⌃⌥⌘R</kbd> and <kbd>⌃⌥⌘P</kbd> on macOS,
  <kbd>Ctrl+Shift+Alt+R</kbd> and <kbd>Ctrl+Shift+Alt+P</kbd> elsewhere. Peacock
  has no shortcut for either, so these are new; the combinations were checked
  against every key VS Code and its extensions already claim, and avoid
  `Ctrl+Alt`, which is AltGr on many European layouts.
- **Choosing a swatch in the palette now resets the lighten/darken slider** and
  re-anchors it to that swatch. It used to leave the slider reading its old
  offset against the previous color, so the next nudge jumped somewhere
  unrelated and the swatch you had just chosen was lost.
- **The swatch currently in use is ringed in the palette.** The ring was
  written but the grid was never indexed, so it had never appeared.
- **Browsing colors and then choosing an action no longer keeps the color you
  were merely looking at.** Arrowing to Emerald and then picking Lighten
  lightened Emerald rather than your own color, and Save to favorites saved it.
  Only choosing a color keeps a color now. Opening the menu and dismissing it
  without moving writes nothing at all.
- **Holding a shortcut down changes the color once, not sixty times.** A held
  key auto-repeats every 15–30ms and each repeat is a full command invocation,
  which strobed the window and wrote to `settings.json` just as often. Repeats
  are now collapsed: two deliberate presses are still two colors, but a hold of
  any length is one.
- **Saving and clearing moved to the top of the favorites section**, where they
  sit beside the saved colors instead of trailing the whole menu, and they stay
  in one place whether or not anything is saved.
- **The palette grid is dense.** The swatches tile edge to edge, so every pixel
  picks the color under it — the old gaps between them were dead space.
- **Neutrals now climb to pure white in six equal steps** of perceived
  lightness, rather than five uneven ones stopping at mid grey.
- **The palette grid no longer zooms on hover.** Rings are drawn inside the
  chip, so nothing changes size as the pointer crosses two hundred swatches, and
  the color currently in use is marked with a ring of its own.

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
  through. On Windows and Linux the entries show no shortcut, which is correct —
  Peacock's defaults use the Command key and so bind only on macOS.
- **The picker gained a lighten/darken column** on the left: a vertical slider
  with buttons above and below, ten steps in each direction, and the same
  shortcut printed underneath. It is anchored to the color you last picked
  rather than compounding, so returning the slider to zero gives back exactly
  the color you chose.
- The control uses Peacock's own arithmetic — HSL lightness moved by
  `peacock.darkenLightenPercentage`, rounded per step the way a key press is —
  and the test suite runs the real `peacock.lighten` and `peacock.darken`
  commands and asserts the results agree, including over repeated presses.

## 0.4.0

### The menu

- **Random color is now the first entry**, so opening the menu and pressing
  Enter rolls a color. **Open color picker** is second.
- **Favorites moved below the colors.** The favorites you saw on a fresh install
  were Peacock's own recommended defaults, not anything you had chosen, and they
  had no business being the first thing in the list.
- **The rainbow is 20 steps laid out in OKLCH.** HSV's "value" is not
  brightness — a pure yellow and a pure blue at V=1 differ by about 5x in
  perceived lightness — so an HSV sweep crowds some hues and stretches others.
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
  extension code — which showed up as a completely blank wheel.
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
