// @ts-check
(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  window.addEventListener(
    'error',
    event => {
      const target = /** @type {any} */ (event.target);
      const detail = event.message
        ? `${event.message} @ ${event.filename}:${event.lineno}`
        : `failed to load ${target && target.src ? target.src : 'resource'}`;
      vscode.postMessage({ type: 'error', message: detail });
    },
    true,
  );

  const {
    hsvToRgb,
    rgbToHsv,
    toHex,
    parseHex,
    pointerToHueSat,
    hueSatToPointer,
    adjustLightness,
  } = globalThis.PeacockColorMath;
  const spaces = globalThis.PeacockColorSpaces;

  const $ = id => document.getElementById(id);

  const canvas = /** @type {HTMLCanvasElement} */ ($('wheel'));
  const ctx = canvas.getContext('2d');
  const hexInput = /** @type {HTMLInputElement} */ ($('hex'));
  const swatch = $('swatch');
  const grid = $('grid');
  const toast = $('toast');
  const gamutNote = $('gamut');

  const sliders = {
    hsvV: /** @type {HTMLInputElement} */ ($('hsv-v')),
    r: /** @type {HTMLInputElement} */ ($('rgb-r')),
    g: /** @type {HTMLInputElement} */ ($('rgb-g')),
    b: /** @type {HTMLInputElement} */ ($('rgb-b')),
    L: /** @type {HTMLInputElement} */ ($('oklch-l')),
    C: /** @type {HTMLInputElement} */ ($('oklch-c')),
    H: /** @type {HTMLInputElement} */ ($('oklch-h')),
  };
  const outputs = {
    hsvV: $('hsv-v-out'),
    r: $('rgb-r-out'),
    g: $('rgb-g-out'),
    b: $('rgb-b-out'),
    L: $('oklch-l-out'),
    C: $('oklch-c-out'),
    H: $('oklch-h-out'),
  };

  /**
   * One canonical color, with each tab a view onto it.
   *
   * `hsv` and `oklch` are kept alongside rather than recomputed from scratch
   * every time, because both have coordinates that vanish at the extremes: a
   * grey has no hue, and black has no chroma. Recomputing would snap those
   * sliders to zero the moment you dragged through the neutral axis, so the
   * value the user was last on is carried instead.
   */
  const state = {
    rgb: [66, 184, 131],
    hsv: { h: 160, s: 0.64, v: 0.72 },
    oklch: { L: 0.7, C: 0.13, H: 160 },
  };

  let activeTab = 'palette';
  let suppressApply = false;

  /**
   * Lighten and darken are anchored to the last colour actually chosen rather
   * than applied on top of themselves. Ten steps out and back returns the
   * original exactly, which repeated rounding would not.
   */
  const MAX_STEPS = 10;
  let baseRgb = [66, 184, 131];
  let steps = 0;
  let percentage = 5;

  const stepsSlider = /** @type {HTMLInputElement} */ ($('steps'));
  const stepsOut = $('steps-out');
  const adjustKeys = $('adjust-keys');

  // ------------------------------------------------------------- conversions

  const EPSILON = 1e-6;

  /** Adopt a new rgb, refreshing every representation except the one edited. */
  function commit(rgb, source) {
    state.rgb = rgb.map(c => Math.round(Math.min(255, Math.max(0, c))));

    if (source !== 'hsv') {
      const hsv = rgbToHsv(state.rgb[0], state.rgb[1], state.rgb[2]);
      state.hsv = { h: hsv.s < EPSILON ? state.hsv.h : hsv.h, s: hsv.s, v: hsv.v };
    }
    if (source !== 'oklch') {
      const [L, C, H] = spaces.rgbToOklch(state.rgb);
      state.oklch = { L, C, H: C < EPSILON ? state.oklch.H : H };
    }

    renderAll();
    if (!suppressApply) {
      vscode.postMessage({ type: 'apply', color: currentHex() });
    }
  }

  function currentHex() {
    return toHex(state.rgb[0], state.rgb[1], state.rgb[2]);
  }

  /** The chosen color with the current lighten/darken offset applied. */
  function adjusted() {
    return steps === 0 ? baseRgb : adjustLightness(baseRgb, steps, percentage);
  }

  /** A new color was chosen, which resets the lighten/darken offset. */
  function pick(rgb, source) {
    baseRgb = rgb.map(c => Math.round(Math.min(255, Math.max(0, c))));
    steps = 0;
    commit(baseRgb, source);
  }

  function setSteps(next) {
    steps = Math.max(-MAX_STEPS, Math.min(MAX_STEPS, Math.round(next)));
    commit(adjusted(), 'adjust');
  }

  function css(rgb) {
    return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
  }

  function oklchCss() {
    const { L, C, H } = state.oklch;
    return `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(4)} ${H.toFixed(1)})`;
  }

  // ---------------------------------------------------------------- gradients

  /** A CSS gradient sampled from a function of t in 0..1. */
  function gradient(sample, steps = 12) {
    const stops = [];
    for (let i = 0; i <= steps; i++) {
      stops.push(sample(i / steps));
    }
    return `linear-gradient(to right, ${stops.join(', ')})`;
  }

  function setTrack(input, value) {
    input.style.setProperty('--track', value);
  }

  // ------------------------------------------------------------------- wheel

  const WHEEL_PADDING = 3;
  let wheelSize = 150;
  const wheelCanvas = document.createElement('canvas');
  const wheelCtx = wheelCanvas.getContext('2d');
  let wheelValue = -1;
  let wheelPixels = -1;
  let frameQueued = false;

  function dpr() {
    return window.devicePixelRatio || 1;
  }

  function buildWheel(px) {
    if (wheelCanvas.width !== px) {
      wheelCanvas.width = px;
      wheelCanvas.height = px;
    }
    const image = wheelCtx.createImageData(px, px);
    const data = image.data;
    const center = px / 2;
    const radius = center - WHEEL_PADDING * dpr();
    const feather = Math.max(1, dpr());

    for (let y = 0; y < px; y++) {
      const dy = y - center + 0.5;
      for (let x = 0; x < px; x++) {
        const dx = x - center + 0.5;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const index = (y * px + x) * 4;
        if (distance > radius) {
          data[index + 3] = 0;
          continue;
        }
        const { h, s } = pointerToHueSat(dx, dy, radius);
        const [r, g, b] = hsvToRgb(h, s, state.hsv.v);
        data[index] = r;
        data[index + 1] = g;
        data[index + 2] = b;
        data[index + 3] = Math.round(255 * Math.min(1, (radius - distance) / feather));
      }
    }
    wheelCtx.putImageData(image, 0, 0);
    wheelValue = state.hsv.v;
    wheelPixels = px;
  }

  function drawWheel() {
    const px = Math.max(1, Math.round(wheelSize * dpr()));
    canvas.style.width = `${wheelSize}px`;
    canvas.style.height = `${wheelSize}px`;
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    if (wheelPixels !== px || wheelValue !== state.hsv.v) {
      buildWheel(px);
    }

    ctx.clearRect(0, 0, px, px);
    ctx.drawImage(wheelCanvas, 0, 0);

    const center = px / 2;
    const radius = center - WHEEL_PADDING * dpr();
    const offset = hueSatToPointer(state.hsv.h, state.hsv.s, radius);
    const mx = center + offset.x;
    const my = center + offset.y;
    const markerRadius = Math.max(4, 0.028 * px);

    ctx.lineWidth = 2 * dpr();
    ctx.strokeStyle = state.hsv.v > 0.55 ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(mx, my, markerRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = dpr();
    ctx.strokeStyle = state.hsv.v > 0.55 ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)';
    ctx.beginPath();
    ctx.arc(mx, my, markerRadius + 1.5 * dpr(), 0, Math.PI * 2);
    ctx.stroke();
  }

  function scheduleWheel() {
    if (frameQueued || activeTab !== 'hsv') {
      return;
    }
    frameQueued = true;
    requestAnimationFrame(() => {
      frameQueued = false;
      drawWheel();
    });
  }

  function measureWheel() {
    const pane = document.querySelector('[data-pane="hsv"]');
    if (!pane || !pane.clientHeight) {
      return;
    }
    const next = Math.floor(Math.min(pane.clientHeight - 4, pane.clientWidth * 0.45));
    const clamped = Math.max(70, Math.min(260, next));
    if (clamped !== wheelSize) {
      wheelSize = clamped;
      scheduleWheel();
    }
  }

  // ------------------------------------------------------------------ render

  /** Ring whichever chip matches the color in use, if the grid holds it. */
  let markedChip;
  function markSelectedChip(hex) {
    if (markedChip) {
      markedChip.removeAttribute('data-selected');
    }
    markedChip = chipsByHex.get(hex);
    if (markedChip) {
      markedChip.dataset.selected = 'true';
    }
  }

  function renderAll() {
    const hex = currentHex();
    markSelectedChip(hex);
    document.documentElement.style.setProperty('--picked', hex);
    swatch.style.background = hex;
    if (document.activeElement !== hexInput) {
      hexInput.value = hex;
      hexInput.classList.remove('invalid');
    }

    const [r, g, b] = state.rgb;

    // HSV
    sliders.hsvV.value = String(Math.round(state.hsv.v * 100));
    outputs.hsvV.textContent = `${Math.round(state.hsv.v * 100)}%`;
    setTrack(
      sliders.hsvV,
      gradient(t => toHex(...hsvToRgb(state.hsv.h, state.hsv.s, t)), 8),
    );

    // RGB
    sliders.r.value = String(r);
    sliders.g.value = String(g);
    sliders.b.value = String(b);
    outputs.r.textContent = String(r);
    outputs.g.textContent = String(g);
    outputs.b.textContent = String(b);
    setTrack(sliders.r, gradient(t => toHex(Math.round(t * 255), g, b), 8));
    setTrack(sliders.g, gradient(t => toHex(r, Math.round(t * 255), b), 8));
    setTrack(sliders.b, gradient(t => toHex(r, g, Math.round(t * 255)), 8));

    // OKLCH
    const { L, C, H } = state.oklch;
    const limit = spaces.maxChroma(L, H);
    sliders.L.value = String((L * 100).toFixed(1));
    sliders.C.value = String(Math.round(C * 1000));
    sliders.H.value = String(Math.round(H));
    outputs.L.textContent = `${(L * 100).toFixed(0)}%`;
    outputs.C.textContent = C.toFixed(3);
    outputs.H.textContent = `${Math.round(H)}°`;
    setTrack(sliders.L, gradient(t => spaces.oklchToHex([t, C, H]), 12));
    setTrack(sliders.C, gradient(t => spaces.oklchToHex([L, t * spaces.MAX_CHROMA, H]), 12));
    setTrack(sliders.H, gradient(t => spaces.oklchToHex([L, C, t * 360]), 24));
    gamutNote.hidden = C <= limit + 1e-4;

    stepsSlider.value = String(steps);
    stepsOut.textContent = steps > 0 ? `+${steps}` : String(steps);
    // Bottom to top, because the slider runs darkest at the bottom.
    stepsSlider.style.setProperty(
      '--steps-track',
      `linear-gradient(to top, ${Array.from({ length: 9 }, (_, i) =>
        toHex(...adjustLightness(baseRgb, -MAX_STEPS + (i * MAX_STEPS) / 4, percentage)),
      ).join(', ')})`,
    );

    scheduleWheel();
  }

  // ------------------------------------------------------------------- tabs

  const TABS = ['palette', 'hsv', 'rgb', 'oklch'];

  function selectTab(name) {
    activeTab = name;
    for (const tab of document.querySelectorAll('.tab')) {
      tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
    }
    for (const pane of document.querySelectorAll('.pane')) {
      pane.dataset.active = String(pane.dataset.pane === name);
    }
    vscode.setState({ tab: name });
    if (name === 'hsv') {
      measureWheel();
      scheduleWheel();
    }
  }

  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => selectTab(tab.dataset.tab));
  }

  // ---------------------------------------------------------------- palette

  /**
   * A grid sorted the way people look for colors: hue across, lightness down,
   * with a neutral row underneath. Built in OKLCH so each row is one perceived
   * lightness the whole way across, and each column one perceived hue.
   */
  const GRID_HUES = 20;
  /** Every chip by its hex, so the selected one can be marked as colors change. */
  const chipsByHex = new Map();
  const GRID_LIGHTNESS = [0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.44, 0.36, 0.28];
  const RED_HUE = 29.23;

  function buildGrid() {
    grid.style.gridTemplateColumns = `repeat(${GRID_HUES}, 1fr)`;
    const chips = [];

    for (const L of GRID_LIGHTNESS) {
      for (let i = 0; i < GRID_HUES; i++) {
        const hue = (RED_HUE + (360 * i) / GRID_HUES) % 360;
        chips.push(spaces.oklchToHex([L, spaces.maxChroma(L, hue) * 0.9, hue]));
      }
    }
    // Neutral row, white through black.
    for (let i = 0; i < GRID_HUES; i++) {
      chips.push(spaces.oklchToHex([1 - i / (GRID_HUES - 1), 0, 0]));
    }

    const fragment = document.createDocumentFragment();
    chipsByHex.clear();
    for (const hex of chips) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.style.background = hex;
      chip.title = hex;
      chip.setAttribute('aria-label', hex);
      // `pick`, not `commit`: choosing a swatch is choosing a new color, so the
      // lighten/darken offset resets and re-anchors to it. Going through
      // `commit` would leave the slider reading its old offset against the old
      // color, and the next nudge would jump somewhere unrelated.
      chip.addEventListener('click', () => pick(parseHex(hex), 'grid'));
      // Every chip is remembered so the one in use can be ringed. Duplicates
      // across rows are possible at the extremes; the first one wins.
      if (!chipsByHex.has(hex)) {
        chipsByHex.set(hex, chip);
      }
      fragment.appendChild(chip);
    }
    grid.replaceChildren(fragment);
  }

  // ----------------------------------------------------------- interactions

  let dragging = false;

  function pickFromPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const center = rect.width / 2;
    const radius = center - WHEEL_PADDING;
    const picked = pointerToHueSat(
      event.clientX - rect.left - center,
      event.clientY - rect.top - center,
      radius,
    );
    state.hsv.h = picked.h;
    state.hsv.s = picked.s;
    pick(hsvToRgb(state.hsv.h, state.hsv.s, state.hsv.v), 'hsv');
  }

  canvas.addEventListener('pointerdown', event => {
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
    pickFromPointer(event);
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', event => dragging && pickFromPointer(event));
  canvas.addEventListener('pointerup', event => {
    if (!dragging) {
      return;
    }
    dragging = false;
    canvas.releasePointerCapture(event.pointerId);
    pickFromPointer(event);
  });
  canvas.addEventListener('pointercancel', () => {
    dragging = false;
  });

  sliders.hsvV.addEventListener('input', () => {
    state.hsv.v = Number(sliders.hsvV.value) / 100;
    pick(hsvToRgb(state.hsv.h, state.hsv.s, state.hsv.v), 'hsv');
  });

  for (const key of ['r', 'g', 'b']) {
    sliders[key].addEventListener('input', () => {
      pick([Number(sliders.r.value), Number(sliders.g.value), Number(sliders.b.value)], 'rgb');
    });
  }

  function commitOklch() {
    const { L, C, H } = state.oklch;
    pick(spaces.gamutMapOklch([L, C, H]), 'oklch');
  }

  sliders.L.addEventListener('input', () => {
    state.oklch.L = Number(sliders.L.value) / 100;
    commitOklch();
  });
  sliders.C.addEventListener('input', () => {
    state.oklch.C = Number(sliders.C.value) / 1000;
    commitOklch();
  });
  sliders.H.addEventListener('input', () => {
    state.oklch.H = Number(sliders.H.value);
    commitOklch();
  });

  hexInput.addEventListener('input', () => {
    const rgb = parseHex(hexInput.value);
    if (!rgb) {
      hexInput.classList.add('invalid');
      return;
    }
    hexInput.classList.remove('invalid');
    pick(rgb, 'hex');
  });

  // ------------------------------------------------------------------- copy

  let toastTimer;
  function copy(text, label) {
    vscode.postMessage({ type: 'copy', text });
    toast.textContent = `${label} copied`;
    toast.dataset.shown = 'true';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.dataset.shown = 'false';
    }, 1400);
  }

  stepsSlider.addEventListener('input', () => setSteps(Number(stepsSlider.value)));
  $('lighten').addEventListener('click', () => setSteps(steps + 1));
  $('darken').addEventListener('click', () => setSteps(steps - 1));

  $('copy-hex').addEventListener('click', () => copy(currentHex(), 'Hex'));
  $('copy-rgb').addEventListener('click', () => copy(css(state.rgb), 'rgb()'));
  $('copy-oklch').addEventListener('click', () => copy(oklchCss(), 'oklch()'));

  // Chromium ships an eyedropper; VS Code's webview may or may not expose it.
  const eyedropper = $('eyedropper');
  if (typeof window.EyeDropper === 'function') {
    eyedropper.hidden = false;
    eyedropper.addEventListener('click', async () => {
      try {
        const result = await new window.EyeDropper().open();
        const rgb = parseHex(result.sRGBHex);
        if (rgb) {
          pick(rgb, 'eyedropper');
        }
      } catch {
        // The user dismissed it; nothing to do.
      }
    });
  }

  // -------------------------------------------------------------- lifecycle

  window.addEventListener('message', event => {
    const message = event.data;
    if (!message || message.type !== 'init') {
      return;
    }
    if (typeof message.percentage === 'number' && message.percentage > 0) {
      percentage = message.percentage;
    }
    const keys = message.keys || {};
    adjustKeys.textContent = keys.lighten || keys.darken ? `${keys.lighten || ''} / ${keys.darken || ''}`.trim() : '';
    adjustKeys.title = keys.lighten
      ? `Peacock: Lighten ${keys.lighten}, Darken ${keys.darken || ''}`
      : 'Peacock has no shortcut bound for Lighten or Darken';
    $('lighten').title = keys.lighten ? `Lighten (${keys.lighten})` : 'Lighten';
    $('darken').title = keys.darken ? `Darken (${keys.darken})` : 'Darken';

    const rgb = parseHex(message.color);
    if (rgb) {
      // Adopting Peacock's existing color is not a change to push back to it.
      suppressApply = true;
      pick(rgb, 'init');
      suppressApply = false;
    }
    measureWheel();
  });

  /*
   * `writing-mode: vertical-lr` only stands a range input on end from Chromium
   * 121, which is VS Code 1.87. On anything older the control lays out
   * horizontally, so fall back to the property that version does understand.
   */
  function checkVerticalSlider() {
    if (stepsSlider.offsetWidth > stepsSlider.offsetHeight) {
      stepsSlider.classList.add('legacy-vertical');
    }
  }

  new ResizeObserver(() => {
    measureWheel();
    // The first check can run before the panel has been given a size, where
    // both dimensions are zero and the test cannot tell either way.
    checkVerticalSlider();
  }).observe(document.body);

  buildGrid();
  checkVerticalSlider();
  // Webview state outlives the extension that wrote it, so a tab name from an
  // older version could name a pane that no longer exists — which would show
  // every pane as inactive, i.e. an empty picker.
  const previous = vscode.getState();
  const restored = previous && previous.tab;
  selectTab(TABS.includes(restored) ? restored : 'palette');
  renderAll();
  vscode.postMessage({ type: 'ready' });
})();
