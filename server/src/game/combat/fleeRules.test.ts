import { describe, expect, it } from 'vitest';
import { fleeSuccessChance } from './fleeRules.js';

describe('fleeSuccessChance', () => {
  const player = { level: 20, dexterity: 20, intelligence: 20 };
  const opponent = { level: 20, dexterity: 20 };

  it('rewards both dexterity and intelligence', () => {
    const baseline = fleeSuccessChance(player, [opponent]);
    expect(baseline).toBeCloseTo(0.6);
    expect(fleeSuccessChance({ ...player, dexterity: 40 }, [opponent])).toBeGreaterThan(baseline);
    expect(fleeSuccessChance({ ...player, intelligence: 40 }, [opponent])).toBeGreaterThan(baseline);
  });

  it('makes higher-level and more agile enemies harder to escape', () => {
    const baseline = fleeSuccessChance(player, [opponent]);
    expect(fleeSuccessChance(player, [{ ...opponent, level: 30 }])).toBeLessThan(baseline);
    expect(fleeSuccessChance(player, [{ ...opponent, dexterity: 40 }])).toBeLessThan(baseline);
  });

  it('uses the hardest enemy regardless of target order', () => {
    const hard = { level: 30, dexterity: 60 };
    const expected = fleeSuccessChance(player, [hard]);
    expect(fleeSuccessChance(player, [opponent, hard])).toBe(expected);
    expect(fleeSuccessChance(player, [hard, opponent])).toBe(expected);
  });

  it('caps combat chances at 10 to 90 percent', () => {
    expect(fleeSuccessChance({ level: 1, dexterity: 0, intelligence: 0 }, [{ level: 100, dexterity: 1000 }])).toBe(0.1);
    expect(fleeSuccessChance({ level: 100, dexterity: 1000, intelligence: 1000 }, [{ level: 1, dexterity: 0 }])).toBe(0.9);
    expect(fleeSuccessChance(player, [])).toBe(1);
  });
});
