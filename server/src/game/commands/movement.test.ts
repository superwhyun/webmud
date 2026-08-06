import { describe, expect, it } from 'vitest';
import { resolveDirection } from './movement.js';

describe('resolveDirection', () => {
  it.each([
    ['n', 'north'],
    ['north', 'north'],
    ['s', 'south'],
    ['south', 'south'],
    ['e', 'east'],
    ['east', 'east'],
    ['w', 'west'],
    ['west', 'west'],
    ['u', 'up'],
    ['up', 'up'],
    ['d', 'down'],
    ['down', 'down'],
  ])('resolves %s to %s', (input, expected) => {
    expect(resolveDirection(input)).toBe(expected);
  });

  it('is case-insensitive', () => {
    expect(resolveDirection('NORTH')).toBe('north');
  });

  it('returns undefined for unknown input', () => {
    expect(resolveDirection('teleport')).toBeUndefined();
  });
});
