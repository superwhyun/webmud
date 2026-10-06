import { describe, expect, it, vi } from 'vitest';
import { COMMAND_ALIASES, COMMAND_NAMES, CARDINAL_ALIASES } from '@mud/shared';
import { COMMAND_DEFINITIONS } from './index.js';
import { createCommandRegistry } from './registry.js';
import { resolveDirection } from './movement.js';

describe('command extension contract', () => {
  it('exposes every shared command and alias to the server', () => {
    const registry = createCommandRegistry(COMMAND_DEFINITIONS);
    for (const name of COMMAND_NAMES) {
      expect(registry.has(name)).toBe(true);
      for (const alias of COMMAND_ALIASES[name]) expect(registry.get(alias)).toBe(registry.get(name));
    }
    for (const [alias, direction] of Object.entries(CARDINAL_ALIASES)) expect(resolveDirection(alias)).toBe(direction);
    expect(resolveDirection('e')).toBeUndefined();
    expect(resolveDirection('constructor')).toBeUndefined();
  });

  it('rejects aliases that would silently shadow another command', () => {
    expect(() => createCommandRegistry([
      { name: 'custom', aliases: ['TEST'], handle: vi.fn() },
      { name: 'test', handle: vi.fn() },
    ])).toThrow('Duplicate command');
  });
});
