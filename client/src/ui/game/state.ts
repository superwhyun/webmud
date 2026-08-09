import { ELEMENT_LABELS, JOB_LABELS, type CharacterState, type ClientMessage } from '@mud/shared';
import { escapeHtml } from '../../domUtils';
import { hpLevel, type GameContext } from './context';
import { renderSkillModal } from './skills';

const STAT_ALLOC_ENTRIES: { key: string; label: string; pick: (c: CharacterState) => number }[] = [
  { key: 'str', label: '힘', pick: (c) => c.strength },
  { key: 'dex', label: '민첩', pick: (c) => c.dexterity },
  { key: 'int', label: '지능', pick: (c) => c.intelligence },
  { key: 'vit', label: '체력', pick: (c) => c.vitality },
  { key: 'wis', label: '지혜', pick: (c) => c.wisdom },
  { key: 'luk', label: '행운', pick: (c) => c.luck },
];

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
    <div class="stat">Lv.${character.level} ${jobLabel} (EXP ${character.exp}) · gold ${character.gold}</div>
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
      const message: ClientMessage = { type: 'command', text: `stat ${button.dataset.statKey} 1` };
      ctx.socket.send(JSON.stringify(message));
    });
  });

  if (!ctx.skillModal.hidden) renderSkillModal(ctx);
}
