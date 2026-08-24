import { normalizeHex } from './color';
import { applyColor } from './peacock';

/**
 * Applies colors to Peacock one at a time.
 *
 * Previews arrive far faster than a settings write completes — arrowing through
 * a menu or dragging on the wheel both fire continuously — so we keep at most
 * one write in flight and remember only the newest color. Intermediate values
 * are dropped rather than queued: they would be overwritten a moment later.
 */
export class ApplyQueue {
  private draining: Promise<void> | undefined;
  private pending: string | undefined;

  constructor(private readonly onError: (error: unknown) => void = () => {}) {}

  /**
   * Resolves once the queue is empty, so the color asked for here — or a newer
   * one that superseded it — has actually landed in Peacock's settings.
   *
   * Callers that run something afterwards depend on this. Returning early while
   * a write was still in flight would let the next command act on the color
   * being replaced rather than the one that replaced it.
   */
  public push(rawColor: string): Promise<void> {
    const color = normalizeHex(rawColor);
    if (!color) {
      return this.draining ?? Promise.resolve();
    }

    this.pending = color;
    this.draining ??= this.drain();
    return this.draining;
  }

  private async drain(): Promise<void> {
    try {
      while (this.pending) {
        const next = this.pending;
        this.pending = undefined;
        await applyColor(next);
      }
    } catch (error) {
      this.onError(error);
    } finally {
      this.draining = undefined;
    }
  }
}
