import { describe, expect, it } from 'vitest';
import type { CombatantStats } from './CombatManager.js';
import { resolveAttack } from './CombatManager.js';

function stats(overrides: Partial<CombatantStats> = {}): CombatantStats {
  return {
    strength: 10,
    dexterity: 5,
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
      expect(result.damage).toBeLessThanOrEqual(3); // 10 - 8 = 2, +/-1 variance
    }
  });

  it('applies the magic defense stat for magic attacks, not physical defense', () => {
    const attacker = stats({ strength: 10, dexterity: 100 });
    const defender = stats({ physicalDefense: 0, magicDefense: 8, dexterity: 0 });

    for (let i = 0; i < 100; i++) {
      const result = resolveAttack(attacker, defender, 'magic');
      expect(result.damage).toBeLessThanOrEqual(3);
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
