import {
  ELEMENT_LABELS,
  expThresholdForLevel,
  JOB_LABELS,
  type CharacterState,
  type ClientMessage,
  type StatKey,
} from '@mud/shared';
import { escapeHtml } from '../../domUtils';
import { isCharacterSheetTabOpen, renderCharacterSheetBody } from './characterSheet';
import { hpLevel, type GameContext } from './context';

const STAT_ALLOC_ENTRIES: { key: StatKey; label: string; pick: (c: CharacterState) => number }[] = [
  { key: 'str', label: '힘', pick: (c) => c.strength },
  { key: 'dex', label: '민첩', pick: (c) => c.dexterity },
  { key: 'int', label: '지능', pick: (c) => c.intelligence },
  { key: 'vit', label: '체력', pick: (c) => c.vitality },
  { key: 'wis', label: '지혜', pick: (c) => c.wisdom },
  { key: 'luk', label: '행운', pick: (c) => c.luck },
];

const EXP_UNIT_SUFFIXES: [number, string][] = [
  [1_000_000_000, 'G'],
  [1_000_000, 'M'],
  [1_000, 'K'],
];

/** 숫자가 커지면 K/M/G로 줄여서 사이드바가 넘치지 않게 한다 (예: 1500 → 1.5K). */
function formatExpAmount(value: number): string {
  for (const [threshold, suffix] of EXP_UNIT_SUFFIXES) {
    if (value >= threshold) {
      const scaled = (value / threshold).toFixed(1);
      return `${scaled.endsWith('.0') ? scaled.slice(0, -2) : scaled}${suffix}`;
    }
  }
  return String(value);
}

export function renderCooldownPanel(ctx: GameContext): void {
  const now = Date.now();
  for (const [skillId, cooldown] of ctx.activeCooldowns) {
    if (cooldown.endsAt <= now) ctx.activeCooldowns.delete(skillId);
  }
  if (ctx.activeCooldowns.size === 0) {
    ctx.cooldownPanel.innerHTML = '';
    return;
  }
  ctx.cooldownPanel.innerHTML = [...ctx.activeCooldowns.entries()]
    .map(([skillId, cooldown]) => {
      const remainingMs = Math.max(0, cooldown.endsAt - now);
      const ratio = cooldown.totalMs > 0 ? remainingMs / cooldown.totalMs : 0;
      return `
        <div class="cooldown-row" data-skill-id="${skillId}">
          <span class="cooldown-label">${escapeHtml(cooldown.name)} ${(remainingMs / 1000).toFixed(1)}초</span>
          <div class="cooldown-bar" role="progressbar" aria-valuenow="${remainingMs}" aria-valuemin="0" aria-valuemax="${cooldown.totalMs}">
            <div class="cooldown-bar-fill" style="width: ${Math.max(0, ratio * 100)}%"></div>
          </div>
        </div>
      `;
    })
    .join('');
}

export function renderState(ctx: GameContext, character: CharacterState): void {
  ctx.currentCharacterState = character;
  const hpRatio = character.maxHp > 0 ? character.hp / character.maxHp : 0;
  const mpRatio = character.maxMp > 0 ? character.mp / character.maxMp : 0;
  const level = hpLevel(hpRatio);
  const jobLabel = character.job ? JOB_LABELS[character.job] : '미정';
  const canAllocate = character.unallocatedStatPoints > 0;
  const currentLevelExp = expThresholdForLevel(character.level);
  const nextLevelExp = expThresholdForLevel(character.level + 1);
  const expProgress = character.exp - currentLevelExp;
  const expNeeded = nextLevelExp - currentLevelExp;
  const expRatio = expNeeded > 0 ? expProgress / expNeeded : 0;
  ctx.sidebarStats.innerHTML = `
    <div class="stat stat-name">${character.name}</div>
    <div class="stat">HP ${character.hp}/${character.maxHp}</div>
    <div class="hp-bar" role="progressbar" aria-valuenow="${character.hp}" aria-valuemin="0" aria-valuemax="${character.maxHp}">
      <div class="hp-bar-fill" data-level="${level}" style="width: ${Math.max(0, hpRatio * 100)}%"></div>
    </div>
    <div class="stat">MP ${character.mp}/${character.maxMp}</div>
    <div class="mp-bar" role="progressbar" aria-valuenow="${character.mp}" aria-valuemin="0" aria-valuemax="${character.maxMp}">
      <div class="mp-bar-fill" style="width: ${Math.max(0, mpRatio * 100)}%"></div>
    </div>
    <div class="stat">EXP ${formatExpAmount(expProgress)}/${formatExpAmount(expNeeded)}</div>
    <div class="exp-bar" role="progressbar" aria-valuenow="${expProgress}" aria-valuemin="0" aria-valuemax="${expNeeded}">
      <div class="exp-bar-fill" style="width: ${Math.max(0, Math.min(100, expRatio * 100))}%"></div>
    </div>
    <div class="stat">Lv.${character.level} ${jobLabel} · gold ${character.gold}</div>
    <div class="stat-grid">
      ${STAT_ALLOC_ENTRIES.map(
        (entry) => `
        <span class="stat-grid-entry">
          ${entry.label} ${entry.pick(character)}
          ${canAllocate ? `<button type="button" class="stat-alloc-btn" data-stat-key="${entry.key}">+</button>` : ''}
        </span>
      `,
      ).join('')}
      <span>공격력 ${character.attackPower}</span>
      <span>물리방어 ${character.physicalDefense}</span>
      <span>마법방어 ${character.magicDefense}</span>
    </div>
    ${canAllocate ? `<div class="stat stat-highlight">분배 가능 스탯 포인트: ${character.unallocatedStatPoints}</div>` : ''}
    ${character.unallocatedSkillPoints > 0 ? `<div class="stat stat-highlight">사용 가능 스킬 포인트: ${character.unallocatedSkillPoints}</div>` : ''}
    <div class="stat">속성 ${ELEMENT_LABELS[character.element]}</div>
    <div class="stat stat-room">${character.roomName}</div>
  `;

  ctx.sidebarStats.querySelectorAll<HTMLButtonElement>('.stat-alloc-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const message: ClientMessage = { type: 'allocateStat', statKey: button.dataset.statKey as StatKey, amount: 1 };
      ctx.socket.send(JSON.stringify(message));
    });
  });

  if (isCharacterSheetTabOpen(ctx, 'skill')) renderCharacterSheetBody(ctx);
}
