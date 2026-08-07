import { describe, expect, it } from 'vitest';
import { isValidVillageName, nextPlotCost, splitTithe } from './VillageService.js';

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

describe('splitTithe', () => {
  it('rounds the tithe down and gives the remainder to the earner', () => {
    expect(splitTithe(5, 10)).toEqual({ personalAmount: 5, titheAmount: 0 });
    expect(splitTithe(12, 10)).toEqual({ personalAmount: 11, titheAmount: 1 });
    expect(splitTithe(100, 10)).toEqual({ personalAmount: 90, titheAmount: 10 });
  });

  it('takes nothing at 0% and everything at 100%', () => {
    expect(splitTithe(50, 0)).toEqual({ personalAmount: 50, titheAmount: 0 });
    expect(splitTithe(50, 100)).toEqual({ personalAmount: 0, titheAmount: 50 });
  });

  it('always adds back up to the original total', () => {
    for (let amount = 0; amount <= 20; amount++) {
      for (let percent = 0; percent <= 100; percent += 25) {
        const { personalAmount, titheAmount } = splitTithe(amount, percent);
        expect(personalAmount + titheAmount).toBe(amount);
      }
    }
  });
});
