import {
  criticalChanceForLuck,
  defenseBonusFromAttribute,
  JOB_POWER_STAT,
  magicAttackPower,
  physicalAttackPower,
  restHpRecoveryPerTick,
  restMpRecoveryPerTick,
  type CharacterState,
  type ClientMessage,
  type InventoryItemInfo,
  type PassiveStat,
  type StatKey,
} from '@mud/shared';
import type { GameContext } from './context';

interface StatManagementEntry {
  key: StatKey;
  field: 'strength' | 'dexterity' | 'intelligence' | 'vitality' | 'wisdom' | 'luck';
  buffStat: PassiveStat;
  equipmentBonusKey?: keyof InventoryItemInfo;
  label: string;
}

export interface DerivedCombatResults {
  physicalAttackPower: number;
  magicAttackPower: number;
  criticalChancePercent: number;
  hpRestorationPerSecond: number;
  mpRestorationPerSecond: number;
}

export const STAT_MANAGEMENT_ENTRIES: readonly StatManagementEntry[] = [
  { key: 'str', field: 'strength', buffStat: 'strength', equipmentBonusKey: 'strengthBonus', label: '힘' },
  { key: 'dex', field: 'dexterity', buffStat: 'dexterity', equipmentBonusKey: 'dexterityBonus', label: '민첩' },
  { key: 'int', field: 'intelligence', buffStat: 'intelligence', equipmentBonusKey: 'intelligenceBonus', label: '지능' },
  { key: 'vit', field: 'vitality', buffStat: 'vitality', label: '체력' },
  { key: 'wis', field: 'wisdom', buffStat: 'wisdom', label: '지혜' },
  { key: 'luk', field: 'luck', buffStat: 'luck', label: '행운' },
];

export const STATS_TAB_STATE_KEYS: readonly (keyof CharacterState)[] = [
  'job',
  'strength',
  'dexterity',
  'intelligence',
  'vitality',
  'wisdom',
  'luck',
  'maxHp',
  'maxMp',
  'attackPower',
  'physicalDefense',
  'magicDefense',
  'unallocatedStatPoints',
];

export function buildStatAllocationMessage(statKey: StatKey): ClientMessage {
  return { type: 'allocateStat', statKey, amount: 1 };
}

function powerStatField(character: CharacterState): 'strength' | 'dexterity' | 'intelligence' | 'wisdom' {
  if (!character.job) return 'strength';
  return JOB_POWER_STAT[character.job];
}

function powerStatEquipmentBonus(ctx: GameContext, field: 'strength' | 'dexterity' | 'intelligence' | 'wisdom'): number {
  if (field === 'strength') return equipmentBonus(ctx, 'strengthBonus');
  if (field === 'dexterity') return equipmentBonus(ctx, 'dexterityBonus');
  if (field === 'intelligence') return equipmentBonus(ctx, 'intelligenceBonus');
  return 0;
}

export function buildDerivedCombatResults(
  character: CharacterState,
  permanentWisdom: number,
): DerivedCombatResults {
  return {
    physicalAttackPower: physicalAttackPower(character.job, character),
    magicAttackPower: magicAttackPower(character.job, character),
    criticalChancePercent: Math.round(criticalChanceForLuck(character.luck) * 100),
    hpRestorationPerSecond: restHpRecoveryPerTick(character.maxHp),
    mpRestorationPerSecond: restMpRecoveryPerTick(character.maxMp, permanentWisdom),
  };
}

function renderRecoveryStat(hpPerSecond: number, mpPerSecond: number): string {
  return `
    <article class="stats-final-card stats-recovery-card">
      <span class="stats-final-label">휴식 회복</span>
      <div class="stats-recovery-values">
        <span><small>HP</small><strong>+${hpPerSecond}/초</strong></span>
        <span><small>MP</small><strong>+${mpPerSecond}/초</strong></span>
      </div>
      <div class="stats-source-breakdown"><span>휴식 중 자동 회복</span></div>
    </article>
  `;
}

export function defenseBuffContribution(effectiveAttribute: number, buffAmount: number, level: number): number {
  if (buffAmount <= 0) return 0;
  const permanentAttribute = Math.max(0, effectiveAttribute - buffAmount);
  return (
    defenseBonusFromAttribute(effectiveAttribute, level) - defenseBonusFromAttribute(permanentAttribute, level)
  );
}

function buffBonus(ctx: GameContext, stat: PassiveStat): number {
  let total = 0;
  for (const buff of ctx.activeBuffs.values()) {
    if (buff.buffStat === stat) total += buff.amount;
  }
  return total;
}

function equipmentBonus(ctx: GameContext, key: keyof InventoryItemInfo | undefined): number {
  if (!key) return 0;
  return Object.values(ctx.equipmentState).reduce((total, item) => total + Number(item?.[key] ?? 0), 0);
}

function renderSourceBreakdown(permanent: number, gear: number, activeBuff: number, permanentLabel = '기본·영구'): string {
  return `
    <div class="stats-source-breakdown">
      <span>${permanentLabel} ${permanent}</span>
      ${gear > 0 ? `<span class="is-gear">장비 +${gear}</span>` : ''}
      ${activeBuff > 0 ? `<span class="is-buff">버프 +${activeBuff}</span>` : ''}
    </div>
  `;
}

function renderFinalStat(
  label: string,
  value: number,
  gear: number,
  activeBuff: number,
  options: { suffix?: string; permanentLabel?: string } = {},
): string {
  const permanent = Math.max(0, value - gear - activeBuff);
  return `
    <article class="stats-final-card${activeBuff > 0 ? ' is-buffed' : ''}">
      <span class="stats-final-label">${label}</span>
      <strong>${value}${options.suffix ?? ''}</strong>
      ${renderSourceBreakdown(permanent, gear, activeBuff, options.permanentLabel ?? '기본·파생')}
    </article>
  `;
}

export function renderFinalCombatStatCards(args: {
  derivedCombatResults: DerivedCombatResults;
  character: Pick<CharacterState, 'maxHp' | 'maxMp' | 'physicalDefense' | 'magicDefense'>;
  physicalAttackGear: number;
  magicAttackGear: number;
  powerStatBuff: number;
  physicalDefenseGear: number;
  physicalDefenseBuff: number;
  magicDefenseGear: number;
  magicDefenseBuff: number;
  criticalChanceBuff: number;
}): string {
  return `
    ${renderFinalStat('기본 물리 공격력', args.derivedCombatResults.physicalAttackPower, args.physicalAttackGear, args.powerStatBuff)}
    ${renderFinalStat('기본 마법 공격력', args.derivedCombatResults.magicAttackPower, args.magicAttackGear, args.powerStatBuff)}
    ${renderFinalStat('최대 HP', args.character.maxHp, 0, 0)}
    ${renderFinalStat('최대 MP', args.character.maxMp, 0, 0)}
    ${renderFinalStat('물리방어', args.character.physicalDefense, args.physicalDefenseGear, args.physicalDefenseBuff)}
    ${renderFinalStat('마법방어', args.character.magicDefense, args.magicDefenseGear, args.magicDefenseBuff)}
    ${renderFinalStat('치명타율', args.derivedCombatResults.criticalChancePercent, 0, args.criticalChanceBuff, { suffix: '%' })}
    ${renderRecoveryStat(
      args.derivedCombatResults.hpRestorationPerSecond,
      args.derivedCombatResults.mpRestorationPerSecond,
    )}
  `;
}

export function renderStatsTab(ctx: GameContext): void {
  const character = ctx.currentCharacterState;
  if (!character) {
    ctx.characterSheetBody.innerHTML = '<p>캐릭터 정보를 불러오는 중입니다.</p>';
    return;
  }

  const remainingPoints = character.unallocatedStatPoints;
  const canAllocate = remainingPoints > 0;
  const powerStat = character.job ? JOB_POWER_STAT[character.job] : null;
  const resolvedPowerStat = powerStatField(character);
  const wisdomBuff = buffBonus(ctx, 'wisdom');
  const permanentWisdom = Math.max(0, character.wisdom - wisdomBuff);
  const derivedCombatResults = buildDerivedCombatResults(character, permanentWisdom);
  const attackGear = equipmentBonus(ctx, 'attackPowerBonus');
  const powerStatGear = powerStatEquipmentBonus(ctx, resolvedPowerStat);
  const powerStatBuff = buffBonus(ctx, resolvedPowerStat);
  const physicalDefenseGear = equipmentBonus(ctx, 'physicalDefenseBonus');
  const magicDefenseGear = equipmentBonus(ctx, 'magicDefenseBonus');
  const luckBuff = buffBonus(ctx, 'luck');
  const vitalityBuff = buffBonus(ctx, 'vitality');
  const directPhysicalDefenseBuff = buffBonus(ctx, 'physicalDefense');
  const directMagicDefenseBuff = buffBonus(ctx, 'magicDefense');
  const physicalDefenseBuff =
    directPhysicalDefenseBuff + defenseBuffContribution(character.vitality, vitalityBuff, character.level);
  const magicDefenseBuff =
    directMagicDefenseBuff + defenseBuffContribution(character.wisdom, wisdomBuff, character.level);
  const criticalChanceWithoutBuff = buildDerivedCombatResults(
    { ...character, luck: Math.max(0, character.luck - luckBuff) },
    permanentWisdom,
  ).criticalChancePercent;
  const criticalChanceBuff = derivedCombatResults.criticalChancePercent - criticalChanceWithoutBuff;
  const physicalAttackGear = powerStatGear + attackGear;
  const magicAttackGear = powerStatGear;

  const allocationCards = STAT_MANAGEMENT_ENTRIES.map((entry) => {
    const value = character[entry.field];
    const gear = equipmentBonus(ctx, entry.equipmentBonusKey);
    const activeBuff = buffBonus(ctx, entry.buffStat);
    const permanent = Math.max(0, value - gear - activeBuff);
    const isPowerStat = entry.field === powerStat;
    return `
      <article class="stats-allocation-card${isPowerStat ? ' is-power-stat' : ''}">
        <div class="stats-allocation-glyph" aria-hidden="true">${entry.label.slice(0, 1)}</div>
        <div class="stats-allocation-info">
          <div class="stats-allocation-title">
            <span>${entry.label}</span>
            ${isPowerStat ? '<span class="stats-primary-badge">주 능력</span>' : ''}
          </div>
          <strong>${value}</strong>
          ${renderSourceBreakdown(permanent, gear, activeBuff)}
        </div>
        <button
          type="button"
          class="stats-allocation-btn"
          data-stat-key="${entry.key}"
          ${canAllocate ? '' : 'disabled'}
          aria-label="${entry.label} 1 올리기"
        >+1</button>
      </article>
    `;
  }).join('');

  ctx.characterSheetBody.innerHTML = `
    <div class="stats-tab">
      <header class="stats-hero">
        <div>
          <span class="stats-eyebrow">CHARACTER GROWTH</span>
          <h2>능력치 관리</h2>
          <p>기본 능력치를 성장시키고 현재 적용된 전투 결과를 확인합니다.</p>
        </div>
        <div class="stats-point-medallion${canAllocate ? ' has-points' : ''}">
          <strong>${remainingPoints}</strong>
          <span>남은 포인트</span>
        </div>
      </header>

      <section class="stats-final-section" aria-labelledby="stats-final-heading">
        <div class="stats-section-heading">
          <div>
            <span class="stats-section-kicker">FINAL STATS</span>
            <h3 id="stats-final-heading">최종 전투 능력치</h3>
          </div>
          <p>장비와 활성 버프가 반영된 고정 수치입니다. 상대 민첩에 따라 달라지는 회피율은 제외했습니다.</p>
        </div>
        <div class="stats-final-grid">
          ${renderFinalCombatStatCards({
            derivedCombatResults,
            character,
            physicalAttackGear,
            magicAttackGear,
            powerStatBuff,
            physicalDefenseGear,
            physicalDefenseBuff,
            magicDefenseGear,
            magicDefenseBuff,
            criticalChanceBuff,
          })}
        </div>
      </section>

      <section class="stats-allocation-section" aria-labelledby="stats-allocation-heading">
        <div class="stats-section-heading">
          <div>
            <span class="stats-section-kicker">BASE ATTRIBUTES</span>
            <h3 id="stats-allocation-heading">기본 능력치 배분</h3>
          </div>
          <p>${canAllocate ? '원하는 능력치에 포인트를 배분하세요.' : '현재 분배 가능한 포인트가 없습니다.'}</p>
        </div>
        <div class="stats-allocation-grid">${allocationCards}</div>
      </section>
    </div>
  `;

  ctx.characterSheetBody.querySelectorAll<HTMLButtonElement>('[data-stat-key]').forEach((button) => {
    button.addEventListener('click', () => {
      ctx.socket.send(JSON.stringify(buildStatAllocationMessage(button.dataset.statKey as StatKey)));
    });
  });
}
