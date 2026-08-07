import { describe, expect, it } from 'vitest';
import type { VillageRow } from '../../db/types.js';
import { canRaid, isRaidProtected, RAID_UNLOCK_LEVEL } from './RaidService.js';

function village(overrides: Partial<VillageRow> = {}): VillageRow {
  return {
    id: 1,
    name: 'Test',
    room_id: 1,
    lord_character_id: 1,
    level: RAID_UNLOCK_LEVEL,
    gold: 0,
    wood: 0,
    ore: 0,
    food: 0,
    tithe_percent: 10,
    raid_protected_until: null,
    created_at: '',
    ...overrides,
  };
}

describe('isRaidProtected', () => {
  it('is false when there is no protection timestamp', () => {
    expect(isRaidProtected(village({ raid_protected_until: null }))).toBe(false);
  });

  it('is true while the timestamp is in the future', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isRaidProtected(village({ raid_protected_until: future }))).toBe(true);
  });

  it('is false once the timestamp has passed', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isRaidProtected(village({ raid_protected_until: past }))).toBe(false);
  });
});

describe('canRaid', () => {
  it('rejects raiding your own village', () => {
    const v = village({ id: 5 });
    expect(canRaid(v, v).ok).toBe(false);
  });

  it('rejects when the attacker is below the unlock level', () => {
    const attacker = village({ id: 1, level: RAID_UNLOCK_LEVEL - 1 });
    const defender = village({ id: 2, level: RAID_UNLOCK_LEVEL });
    expect(canRaid(attacker, defender).ok).toBe(false);
  });

  it('rejects when the defender is below the unlock level', () => {
    const attacker = village({ id: 1, level: RAID_UNLOCK_LEVEL });
    const defender = village({ id: 2, level: RAID_UNLOCK_LEVEL - 1 });
    expect(canRaid(attacker, defender).ok).toBe(false);
  });

  it('rejects when the defender is under raid protection', () => {
    const attacker = village({ id: 1, level: RAID_UNLOCK_LEVEL });
    const future = new Date(Date.now() + 60_000).toISOString();
    const defender = village({ id: 2, level: RAID_UNLOCK_LEVEL, raid_protected_until: future });
    expect(canRaid(attacker, defender).ok).toBe(false);
  });

  it('allows a raid when both villages are leveled up and the defender is unprotected', () => {
    const attacker = village({ id: 1, level: RAID_UNLOCK_LEVEL });
    const defender = village({ id: 2, level: RAID_UNLOCK_LEVEL + 2 });
    expect(canRaid(attacker, defender).ok).toBe(true);
  });
});
