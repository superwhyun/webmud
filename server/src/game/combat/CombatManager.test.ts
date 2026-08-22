import { describe, expect, it } from 'vitest';
import type { CombatantStats } from './CombatManager.js';
import { hasElementAdvantage, resolveAttack } from './CombatManager.js';

function stats(overrides: Partial<CombatantStats> = {}): CombatantStats {
  return {
    strength: 10,
    dexterity: 5,
    attackPower: 0,
    physicalDefense: 2,
    magicDefense: 2,
    element: 'wood',
    ...overrides,
  };
}

describe('resolveAttack', () => {
  it('never deals less than 1 damage on a hit, even when defense exceeds strength', () => {
    const attacker = stats({ strength: 1, dexterity: 100 });
    const defender = stats({ physicalDefense: 50, magicDefense: 50, dexterity: 0 });

    for (let i = 0; i < 200; i++) {
      const result = resolveAttack(attacker, defender, 'physical');
      expect(result.evaded).toBe(false);
      expect(result.damage).toBeGreaterThanOrEqual(1);
    }
  });

  it('guarantees a hit when the attacker heavily outclasses the defender in dexterity', () => {
    const attacker = stats({ dexterity: 100 });
    const defender = stats({ dexterity: 0 });

    for (let i = 0; i < 200; i++) {
      expect(resolveAttack(attacker, defender, 'physical').evaded).toBe(false);
    }
  });

  it('applies the physical defense stat for physical attacks, not magic defense', () => {
    const attacker = stats({ strength: 10, dexterity: 100 });
    const defender = stats({ physicalDefense: 8, magicDefense: 0, dexterity: 0 });

    for (let i = 0; i < 100; i++) {
      const result = resolveAttack(attacker, defender, 'physical');
      // 10 - 8 = 2, +/-1 variance; on a (rare, luck 0 -> 5% base) crit, 10*1.5 - 8 = 7, +/-1
      expect(result.damage).toBeLessThanOrEqual(result.isCrit ? 8 : 3);
    }
  });

  it('applies the magic defense stat for magic attacks, not physical defense', () => {
    const attacker = stats({ strength: 10, dexterity: 100 });
    const defender = stats({ physicalDefense: 0, magicDefense: 8, dexterity: 0 });

    for (let i = 0; i < 100; i++) {
      const result = resolveAttack(attacker, defender, 'magic');
      expect(result.damage).toBeLessThanOrEqual(result.isCrit ? 8 : 3);
    }
  });

  it('deals more average damage on an elemental advantage (fire beats metal)', () => {
    const attacker = stats({ strength: 20, physicalDefense: 0, dexterity: 100, element: 'fire' });
    const advantaged = stats({ physicalDefense: 0, dexterity: 0, element: 'metal' });
    const neutral = stats({ physicalDefense: 0, dexterity: 0, element: 'fire' });

    const sample = (defender: CombatantStats) => {
      let total = 0;
      for (let i = 0; i < 500; i++) total += resolveAttack(attacker, defender, 'physical').damage;
      return total / 500;
    };

    expect(sample(advantaged)).toBeGreaterThan(sample(neutral));
  });

  it('crits more often and for more damage as luck increases', () => {
    const attacker = stats({ strength: 20, dexterity: 100, luck: 100 });
    const defender = stats({ physicalDefense: 0, dexterity: 0 });

    let critCount = 0;
    for (let i = 0; i < 500; i++) {
      if (resolveAttack(attacker, defender, 'physical').isCrit) critCount += 1;
    }
    // base 5% + 100 luck * 0.3% = 35%, capped at MAX_CRIT_CHANCE (35%)
    expect(critCount / 500).toBeGreaterThan(0.2);
  });

  it('deals less average damage on an elemental disadvantage (water beats fire)', () => {
    const attacker = stats({ strength: 20, physicalDefense: 0, dexterity: 100, element: 'fire' });
    const disadvantaged = stats({ physicalDefense: 0, dexterity: 0, element: 'water' });
    const neutral = stats({ physicalDefense: 0, dexterity: 0, element: 'fire' });

    const sample = (defender: CombatantStats) => {
      let total = 0;
      for (let i = 0; i < 500; i++) total += resolveAttack(attacker, defender, 'physical').damage;
      return total / 500;
    };

    expect(sample(disadvantaged)).toBeLessThan(sample(neutral));
  });
});

describe('hasElementAdvantage', () => {
  it('follows the fire > metal > wood > earth > water > fire cycle', () => {
    expect(hasElementAdvantage('fire', 'metal')).toBe(true);
    expect(hasElementAdvantage('metal', 'wood')).toBe(true);
    expect(hasElementAdvantage('wood', 'earth')).toBe(true);
    expect(hasElementAdvantage('earth', 'water')).toBe(true);
    expect(hasElementAdvantage('water', 'fire')).toBe(true);
  });

  it('is false in the reverse direction', () => {
    expect(hasElementAdvantage('metal', 'fire')).toBe(false);
  });

  it('is false for identical elements', () => {
    expect(hasElementAdvantage('fire', 'fire')).toBe(false);
  });
});
