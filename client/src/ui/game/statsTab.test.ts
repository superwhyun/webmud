import { describe, expect, it } from 'vitest';
import {
  basicAttackPower,
  criticalChanceForLuck,
  defenseBonusFromAttribute,
  restHpRecoveryPerTick,
  restMpRecoveryPerTick,
  type CharacterState,
} from '@mud/shared';
import {
  buildDerivedCombatResults,
  buildStatAllocationMessage,
  defenseBuffContribution,
  STAT_MANAGEMENT_ENTRIES,
  STATS_TAB_STATE_KEYS,
} from './statsTab';

const character: CharacterState = {
  name: '테스터',
  hp: 100,
  maxHp: 120,
  mp: 40,
  maxMp: 40,
  level: 10,
  exp: 0,
  roomName: '훈련장',
  job: 'warrior',
  strength: 20,
  dexterity: 11,
  intelligence: 7,
  vitality: 12,
  wisdom: 10,
  luck: 8,
  attackPower: 5,
  physicalDefense: 9,
  magicDefense: 7,
  element: 'wood',
  gold: 0,
  unallocatedStatPoints: 1,
  unallocatedSkillPoints: 0,
};

describe('stat management tab', () => {
  it('lists all six allocatable stats in a stable order', () => {
    expect(STAT_MANAGEMENT_ENTRIES.map(({ key, label }) => [key, label])).toEqual([
      ['str', '힘'],
      ['dex', '민첩'],
      ['int', '지능'],
      ['vit', '체력'],
      ['wis', '지혜'],
      ['luk', '행운'],
    ]);
  });

  it('builds the existing allocateStat protocol message', () => {
    expect(buildStatAllocationMessage('int')).toEqual({ type: 'allocateStat', statKey: 'int', amount: 1 });
  });

  it('refreshes the tab when the job changes because the primary stat badge depends on it', () => {
    expect(STATS_TAB_STATE_KEYS).toContain('job');
  });

  it('refreshes when maximum HP or MP changes', () => {
    expect(STATS_TAB_STATE_KEYS).toEqual(expect.arrayContaining(['maxHp', 'maxMp']));
  });

  it('derives every fixed combat result affected by allocated stats', () => {
    expect(buildDerivedCombatResults(character, character.wisdom)).toEqual({
      combatPower: 25,
      criticalChancePercent: 13,
      hpRestorationPerSecond: 4,
      mpRestorationPerSecond: 2,
    });
  });

  it('does not apply physical equipment attack power to a magic job and caps critical chance', () => {
    expect(buildDerivedCombatResults({ ...character, job: 'mage', intelligence: 30, luck: 80 }, character.wisdom)).toMatchObject({
      combatPower: 30,
      criticalChancePercent: 35,
    });
  });

  it('uses permanent wisdom for rest recovery because active buffs do not affect the server rest formula', () => {
    expect(buildDerivedCombatResults({ ...character, wisdom: 80 }, 10).mpRestorationPerSecond).toBe(2);
  });

  it('uses shared authoritative formulas for combat and recovery results', () => {
    expect(basicAttackPower(character.job, character)).toBe(25);
    expect(criticalChanceForLuck(character.luck)).toBe(0.13);
    expect(restHpRecoveryPerTick(character.maxHp)).toBe(4);
    expect(restMpRecoveryPerTick(character.maxMp, character.wisdom)).toBe(2);
  });

  it('counts the indirect defense gained from vitality or wisdom buffs', () => {
    const level = 17;
    const effectiveAttribute = 39;
    const buffAmount = 5;
    expect(defenseBuffContribution(effectiveAttribute, buffAmount, level)).toBe(
      defenseBonusFromAttribute(effectiveAttribute, level) -
        defenseBonusFromAttribute(effectiveAttribute - buffAmount, level),
    );
  });
});
