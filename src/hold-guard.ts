/**
 * Makes a command survive having its key held down.
 *
 * A held key auto-repeats, and every repeat is a full command invocation. The
 * rate is the operating system's, not ours: macOS goes as low as 15ms between
 * repeats, Windows and Linux around 30ms. A command that rewrites the workbench
 * colors then fires thirty to sixty times a second, which strobes the window and
 * writes to `settings.json` just as often.
 *
 * Two things make this harder than a plain throttle. The extension host sees
 * each repeat when it *processes* it, not when the key was pressed, and it can
 * fall a second or more behind while the workbench repaints — a burst measured
 * at 15ms between key events arrives with gaps of 400ms between invocations. So
 * a window wide enough to cover that lag would also swallow deliberate presses.
 *
 * Hence two thresholds. Ordinarily an invocation runs unless it lands within
 * `windowMs` of the previous one, which is short enough that two deliberate
 * presses are two colors. But once several invocations in a row have been
 * suppressed — something no hand can produce — the guard concludes the key is
 * held and holds out for `settleMs` of silence instead, which rides out any
 * stall in the drain. One deliberate press is never affected by this, because
 * one press suppresses nothing.
 */

/** A repeat this close to the last invocation is never a second press. */
export const HOLD_WINDOW_MS = 250;

/** Consecutive suppressed invocations that mean a key is being held. */
export const HOLD_BURST_ATTEMPTS = 4;

/** Silence required to end a held-key burst, generous enough to outlast a stall. */
export const HOLD_SETTLE_MS = 1000;

export interface HoldGuardOptions {
  windowMs?: number;
  settleMs?: number;
  burstAttempts?: number;
  /** Injectable so the guard can be tested without waiting in real time. */
  now?: () => number;
}

export function guardHeldKey(
  run: () => Promise<unknown>,
  options: HoldGuardOptions = {},
): () => Promise<void> {
  const windowMs = options.windowMs ?? HOLD_WINDOW_MS;
  const settleMs = options.settleMs ?? HOLD_SETTLE_MS;
  const burstAttempts = options.burstAttempts ?? HOLD_BURST_ATTEMPTS;
  const now = options.now ?? (() => Date.now());

  let lastAttempt = Number.NEGATIVE_INFINITY;
  let running = false;
  let suppressed = 0;
  let held = false;

  return async () => {
    const at = now();
    const quiet = at - lastAttempt;
    // Recorded before the early return: a held key must keep pushing the window
    // out, or the burst would break through as soon as it outlasted one window.
    lastAttempt = at;

    // `running` covers a command slower than the window, which would otherwise
    // be re-entered by the next repeat.
    if (quiet < (held ? settleMs : windowMs) || running) {
      suppressed += 1;
      if (suppressed >= burstAttempts) {
        held = true;
      }
      return;
    }

    suppressed = 0;
    held = false;
    running = true;
    try {
      await run();
    } finally {
      running = false;
    }
  };
}
