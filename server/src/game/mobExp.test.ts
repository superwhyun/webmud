import { describe, expect, it } from 'vitest';
import { computeMobExpReward } from './mobExp.js';

const level20Profile = {
  level: 20,
  maxHp: 3618,
  strength: 145,
  physicalDefense: 96,
  magicDefense: 54,
  expReward: 609,
};

describe('computeMobExpReward', () => {
  it('uses the configured reward for a boss', () => {
    expect(computeMobExpReward({ ...level20Profile, isBoss: true })).toBe(609);
  });

  it('keeps the combat-power formula for a normal mob', () => {
    expect(computeMobExpReward({ ...level20Profile, isBoss: false })).toBe(120);
  });
});
