import { describe, expect, it } from 'vitest';
import { resolveDirection } from './movement.js';

describe('resolveDirection', () => {
  it.each([
    ['north', 'north'],
    ['w', 'north'],
    ['south', 'south'],
    ['s', 'south'],
    ['east', 'east'],
    ['d', 'east'],
    ['west', 'west'],
    ['a', 'west'],
    ['up', 'up'],
    ['u', 'up'],
    ['down', 'down'],
  ])('resolves %s to %s', (input, expected) => {
    expect(resolveDirection(input)).toBe(expected);
  });

  it('no longer resolves the old n/e single-letter shortcuts (e is reserved for enter)', () => {
    expect(resolveDirection('n')).toBeUndefined();
    expect(resolveDirection('e')).toBeUndefined();
  });

  it('is case-insensitive', () => {
    expect(resolveDirection('NORTH')).toBe('north');
  });

  it('returns undefined for unknown input', () => {
    expect(resolveDirection('teleport')).toBeUndefined();
  });
});
