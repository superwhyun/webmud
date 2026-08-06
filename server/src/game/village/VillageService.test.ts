import { describe, expect, it } from 'vitest';
import { isValidVillageName, nextPlotCost } from './VillageService.js';

describe('isValidVillageName', () => {
  it.each(['불꽃마을', 'IronHold', 'Camp 7', 'ab'])('accepts %s', (name) => {
    expect(isValidVillageName(name)).toBe(true);
  });

  it.each(['a', '', '<script>', 'x'.repeat(21)])('rejects %s', (name) => {
    expect(isValidVillageName(name)).toBe(false);
  });
});

describe('nextPlotCost', () => {
  it('increases linearly with the current plot count', () => {
    expect(nextPlotCost(0)).toBe(100);
    expect(nextPlotCost(3)).toBe(250);
    expect(nextPlotCost(10)).toBe(600);
  });
});
