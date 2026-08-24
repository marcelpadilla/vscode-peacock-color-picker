/**
 * Working out which key actually runs a command.
 *
 * VS Code exposes no API for this: an extension can see the keybindings other
 * extensions *declare*, but not what the user has since remapped. So the
 * declared defaults are read from Peacock's manifest and then reconciled
 * against the user's own `keybindings.json`, the same file the keyboard
 * shortcuts editor writes.
 *
 * Everything here except the file read is pure, so the resolution rules are
 * testable without a user profile.
 */

export type Platform = 'mac' | 'win' | 'linux';

export interface KeybindingEntry {
  key?: string;
  mac?: string;
  win?: string;
  linux?: string;
  command?: string;
}

export function currentPlatform(): Platform {
  if (process.platform === 'darwin') {
    return 'mac';
  }
  return process.platform === 'win32' ? 'win' : 'linux';
}

/** The key an entry uses on this platform, preferring a platform-specific one. */
function keyFor(entry: KeybindingEntry, platform: Platform): string | undefined {
  return entry[platform] ?? entry.key;
}

/**
 * `keybindings.json` is JSONC: comments are allowed, and VS Code seeds the file
 * with a commented-out example. `JSON.parse` cannot read it, and there is no
 * public parser, so comments and trailing commas are stripped first — taking
 * care not to touch anything inside a string, where `//` is just characters.
 */
export function stripJsonComments(text: string): string {
  let result = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inLine) {
      if (char === '\n') {
        inLine = false;
        result += char;
      }
      continue;
    }
    if (inBlock) {
      if (char === '*' && next === '/') {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inString) {
      result += char;
      if (char === '\\') {
        result += next ?? '';
        i++;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }
    if (char === '/' && next === '/') {
      inLine = true;
      i++;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlock = true;
      i++;
      continue;
    }
    result += char;
  }

  // Trailing commas before a closing bracket or brace.
  return result.replace(/,(\s*[\]}])/g, '$1');
}

export function parseKeybindingsFile(text: string): KeybindingEntry[] {
  try {
    const parsed = JSON.parse(stripJsonComments(text));
    return Array.isArray(parsed) ? parsed.filter(entry => entry && typeof entry === 'object') : [];
  } catch {
    // A half-edited keybindings file is the user's business, not a reason to
    // fail; fall back to the declared defaults.
    return [];
  }
}

/**
 * Which key runs `command`, given an extension's declared defaults and the
 * user's overrides.
 *
 * User entries are applied in order: `command` adds a binding, and the same
 * command prefixed with `-` removes one, which is how VS Code records an
 * unbound or rebound shortcut.
 */
export function resolveKeybinding(
  command: string,
  defaults: KeybindingEntry[],
  user: KeybindingEntry[],
  platform: Platform,
): string | undefined {
  const keys: string[] = [];

  for (const entry of defaults) {
    if (entry.command === command) {
      const key = keyFor(entry, platform);
      if (key) {
        keys.push(key);
      }
    }
  }

  for (const entry of user) {
    if (entry.command === `-${command}`) {
      const key = keyFor(entry, platform);
      // A removal with no key strikes every binding for that command.
      const index = key ? keys.indexOf(key) : -1;
      if (!key) {
        keys.length = 0;
      } else if (index !== -1) {
        keys.splice(index, 1);
      }
    } else if (entry.command === command) {
      const key = keyFor(entry, platform);
      if (key) {
        keys.push(key);
      }
    }
  }

  // The Command key exists only on macOS, so a binding that needs it is simply
  // not in effect anywhere else. Peacock's defaults are in exactly this shape.
  const usable = keys.filter(key => platform === 'mac' || !/\b(cmd|meta)\b/i.test(key));
  return usable.length ? usable[usable.length - 1] : undefined;
}

const MAC_SYMBOLS: Record<string, string> = {
  ctrl: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧',
  cmd: '⌘',
  meta: '⌘',
  win: '⌘',
};

const NAMED_KEYS: Record<string, string> = {
  left: '←',
  up: '↑',
  right: '→',
  down: '↓',
  enter: '↵',
  escape: 'Esc',
  backspace: '⌫',
  delete: 'Del',
  space: 'Space',
  tab: 'Tab',
};

function formatKey(part: string): string {
  const lower = part.toLowerCase();
  if (NAMED_KEYS[lower]) {
    return NAMED_KEYS[lower];
  }
  return lower.length === 1 ? lower.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1);
}

/** Render a keybinding the way VS Code shows it: symbols on macOS, words elsewhere. */
export function formatKeybinding(binding: string, platform: Platform): string {
  // A chord is two strokes separated by a space, e.g. "ctrl+k ctrl+c".
  return binding
    .trim()
    .split(/\s+/)
    .map(stroke => {
      const parts = stroke.split('+').filter(Boolean);
      const key = parts.pop() ?? '';
      const modifiers = parts.map(p => p.toLowerCase());

      if (platform === 'mac') {
        // macOS renders modifiers in a fixed order regardless of how written.
        const order = ['ctrl', 'alt', 'option', 'shift', 'cmd', 'meta', 'win'];
        const symbols = order
          .filter(name => modifiers.includes(name))
          .map(name => MAC_SYMBOLS[name])
          .filter((symbol, index, all) => all.indexOf(symbol) === index);
        return symbols.join('') + formatKey(key);
      }

      const words = modifiers.map(name => name.charAt(0).toUpperCase() + name.slice(1));
      return [...words, formatKey(key)].join('+');
    })
    .join(' ');
}
