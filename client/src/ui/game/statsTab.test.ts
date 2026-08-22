import { describe, expect, it } from 'vitest';
import {
  basicAttackPower,
  criticalChanceForLuck,
  defenseBonusFromAttribute,
  magicAttackPower,
  physicalAttackPower,
  restHpRecoveryPerTick,
  restMpRecoveryPerTick,
  type CharacterState,
} from '@mud/shared';
import {
  buildDerivedCombatResults,
  buildStatAllocationMessage,
  defenseBuffContribution,
  renderFinalCombatStatCards,
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
    // 물리 공격력은 힘(+장비 공격력) 기준, 마법 공격력은 지능(사제만 지혜) 기준 — 직업의 실전투
    // 파워스탯을 그대로 재사용하지 않는다(전사의 "마법 공격력"에 힘이 새던 버그의 회귀 방지).
    expect(buildDerivedCombatResults(character, character.wisdom)).toEqual({
      physicalAttackPower: 25,
      magicAttackPower: 7,
      criticalChancePercent: 7,
      hpRestorationPerSecond: 4,
      mpRestorationPerSecond: 2,
    });
  });

  it('separates physical and magic base attack power for a magic job and caps critical chance', () => {
    // 마법사의 "물리 공격력"은 지능이 아니라 힘 기준이어야 한다(마법사의 물리 공격력에 지능이
    // 새던 버그의 회귀 방지) — 힘은 캐릭터 기본값 20에서 안 바뀌었으므로 20+공격력5=25.
    expect(buildDerivedCombatResults({ ...character, job: 'mage', intelligence: 30, luck: 150 }, character.wisdom)).toMatchObject({
      physicalAttackPower: 25,
      magicAttackPower: 30,
      criticalChancePercent: 35,
    });
  });

  it('uses dexterity for a rogue\'s physical display power, not the class\'s real power stat', () => {
    expect(buildDerivedCombatResults({ ...character, job: 'rogue' }, character.wisdom)).toMatchObject({
      physicalAttackPower: character.dexterity + character.attackPower,
      magicAttackPower: character.intelligence,
    });
  });

  it("uses wisdom for a priest's magic display power, not intelligence", () => {
    expect(buildDerivedCombatResults({ ...character, job: 'priest' }, character.wisdom)).toMatchObject({
      physicalAttackPower: character.strength + character.attackPower,
      magicAttackPower: character.wisdom,
    });
  });

  it('uses permanent wisdom for rest recovery because active buffs do not affect the server rest formula', () => {
    expect(buildDerivedCombatResults({ ...character, wisdom: 80 }, 10).mpRestorationPerSecond).toBe(2);
  });

  it('uses shared authoritative formulas for combat and recovery results', () => {
    expect(basicAttackPower(character.job, character)).toBe(25);
    expect(physicalAttackPower(character.job, character)).toBe(25);
    expect(magicAttackPower(character.job, character)).toBe(20);
    expect(criticalChanceForLuck(character.luck)).toBeCloseTo(0.074);
    expect(restHpRecoveryPerTick(character.maxHp)).toBe(4);
    expect(restMpRecoveryPerTick(character.maxMp, character.wisdom)).toBe(2);
  });

  it('renders exactly eight final stat cards and combines rest recovery into one card', () => {
    const markup = renderFinalCombatStatCards({
      derivedCombatResults: buildDerivedCombatResults(character, character.wisdom),
      character,
      physicalAttackGear: 5,
      magicAttackGear: 0,
      physicalPowerBuff: 0,
      magicPowerBuff: 0,
      physicalDefenseGear: 0,
      physicalDefenseBuff: 0,
      magicDefenseGear: 0,
      magicDefenseBuff: 0,
      criticalChanceBuff: 0,
    });

    expect(markup.match(/class=\"stats-final-card/g)?.length ?? 0).toBe(8);
    expect(markup.match(/stats-recovery-card/g)?.length ?? 0).toBe(1);
    expect(markup).toContain('기본 물리 공격력');
    expect(markup).toContain('기본 마법 공격력');
    expect(markup).toContain('휴식 회복');
    expect(markup).toContain('<small>HP</small><strong>+4/초</strong>');
    expect(markup).toContain('<small>MP</small><strong>+2/초</strong>');
    expect(markup).not.toContain('휴식 HP 회복');
    expect(markup).not.toContain('휴식 MP 회복');
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
