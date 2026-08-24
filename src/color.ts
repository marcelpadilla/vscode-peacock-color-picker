const HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Normalize a user- or webview-supplied color to `#rrggbb`.
 * Returns undefined for anything we would not want to hand to Peacock.
 */
export function normalizeHex(input: unknown): string | undefined {
  if (typeof input !== 'string') {
    return undefined;
  }
  const value = input.trim();
  if (!HEX_PATTERN.test(value)) {
    return undefined;
  }
  const digits = value.slice(1);
  if (digits.length === 3) {
    return `#${digits
      .split('')
      .map(d => d + d)
      .join('')}`.toLowerCase();
  }
  // Drop an alpha channel: Peacock's colors are opaque.
  return `#${digits.slice(0, 6)}`.toLowerCase();
}
