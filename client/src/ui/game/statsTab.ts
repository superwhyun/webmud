import {
  JOB_POWER_STAT,
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
  'attackPower',
  'physicalDefense',
  'magicDefense',
  'unallocatedStatPoints',
];

export function buildStatAllocationMessage(statKey: StatKey): ClientMessage {
  return { type: 'allocateStat', statKey, amount: 1 };
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

function renderFinalStat(label: string, value: number, gear: number, activeBuff: number): string {
  const permanent = Math.max(0, value - gear - activeBuff);
  return `
    <article class="stats-final-card${activeBuff > 0 ? ' is-buffed' : ''}">
      <span class="stats-final-label">${label}</span>
      <strong>${value}</strong>
      ${renderSourceBreakdown(permanent, gear, activeBuff, '기본·파생')}
    </article>
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
  const attackGear = equipmentBonus(ctx, 'attackPowerBonus');
  const physicalDefenseGear = equipmentBonus(ctx, 'physicalDefenseBonus');
  const magicDefenseGear = equipmentBonus(ctx, 'magicDefenseBonus');

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
            <span class="stats-section-kicker">FINAL RESULT</span>
            <h3 id="stats-final-heading">현재 전투 결과</h3>
          </div>
          <p>장비와 활성 버프가 반영된 최종 수치입니다.</p>
        </div>
        <div class="stats-final-grid">
          ${renderFinalStat('공격력', character.attackPower, attackGear, 0)}
          ${renderFinalStat('물리방어', character.physicalDefense, physicalDefenseGear, buffBonus(ctx, 'physicalDefense'))}
          ${renderFinalStat('마법방어', character.magicDefense, magicDefenseGear, buffBonus(ctx, 'magicDefense'))}
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
