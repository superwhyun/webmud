import {
  ELEMENT_LABELS,
  expThresholdForLevel,
  JOB_LABELS,
  PASSIVE_STAT_LABELS,
  type CharacterState,
  type ClientMessage,
  type PassiveStat,
  type StatKey,
} from '@mud/shared';
import { escapeHtml } from '../../domUtils';
import { isCharacterSheetTabOpen, renderCharacterSheetBody } from './characterSheet';
import { hpLevel, type GameContext } from './context';

const STAT_ALLOC_ENTRIES: { key: StatKey; buffStat: PassiveStat; label: string; pick: (c: CharacterState) => number }[] = [
  { key: 'str', buffStat: 'strength', label: '힘', pick: (c) => c.strength },
  { key: 'dex', buffStat: 'dexterity', label: '민첩', pick: (c) => c.dexterity },
  { key: 'int', buffStat: 'intelligence', label: '지능', pick: (c) => c.intelligence },
  { key: 'vit', buffStat: 'vitality', label: '체력', pick: (c) => c.vitality },
  { key: 'wis', buffStat: 'wisdom', label: '지혜', pick: (c) => c.wisdom },
  { key: 'luk', buffStat: 'luck', label: '행운', pick: (c) => c.luck },
];

/** buffStat이 이 CharacterState 필드 이름과 항상 같으므로(strength/.../physicalDefense/magicDefense),
 * 버프가 자연 만료될 때 서버 왕복 없이 클라이언트에서 바로 델타를 되돌릴 수 있다. maxHp/maxMp는
 * 버프 대상에서 제외돼 있어 매핑하지 않는다. */
const BUFFABLE_CHARACTER_FIELDS: Partial<Record<PassiveStat, keyof CharacterState>> = {
  strength: 'strength',
  dexterity: 'dexterity',
  intelligence: 'intelligence',
  vitality: 'vitality',
  wisdom: 'wisdom',
  luck: 'luck',
  physicalDefense: 'physicalDefense',
  magicDefense: 'magicDefense',
};

/** 특정 스탯에 지금 걸려 있는 버프 보너스의 합(보통 0 또는 1개, 이론상 여러 스킬이 같은 스탯을 buff하면 합산). */
function buffBonusForStat(ctx: GameContext, stat: PassiveStat): number {
  let total = 0;
  for (const buff of ctx.activeBuffs.values()) {
    if (buff.buffStat === stat) total += buff.amount;
  }
  return total;
}

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

export function renderBuffPanel(ctx: GameContext): void {
  const now = Date.now();
  let expiredStatsChanged = false;
  for (const [skillId, buff] of ctx.activeBuffs) {
    if (buff.endsAt <= now) {
      ctx.activeBuffs.delete(skillId);
      // 서버가 시간 경과만으로는 새 state를 밀어주지 않으므로, 버프가 자연 만료될 때 사이드바
      // 숫자가 그대로 부풀려진 채 남지 않도록 걸었던 만큼 클라이언트에서 바로 빼서 되돌린다.
      const field = BUFFABLE_CHARACTER_FIELDS[buff.buffStat];
      if (field && ctx.currentCharacterState) {
        (ctx.currentCharacterState[field] as number) -= buff.amount;
        expiredStatsChanged = true;
      }
    }
  }
  if (expiredStatsChanged && ctx.currentCharacterState) renderState(ctx, ctx.currentCharacterState);
  if (ctx.activeBuffs.size === 0) {
    ctx.buffPanel.innerHTML = '';
    return;
  }
  ctx.buffPanel.innerHTML = [...ctx.activeBuffs.entries()]
    .map(([skillId, buff]) => {
      const remainingMs = Math.max(0, buff.endsAt - now);
      const ratio = buff.totalMs > 0 ? remainingMs / buff.totalMs : 0;
      return `
        <div class="buff-row" data-skill-id="${skillId}">
          <span class="buff-label">${escapeHtml(buff.name)} (${PASSIVE_STAT_LABELS[buff.buffStat]} +${buff.amount}) ${(remainingMs / 1000).toFixed(1)}초</span>
          <div class="buff-bar" role="progressbar" aria-valuenow="${remainingMs}" aria-valuemin="0" aria-valuemax="${buff.totalMs}">
            <div class="buff-bar-fill" style="width: ${Math.max(0, ratio * 100)}%"></div>
          </div>
        </div>
      `;
    })
    .join('');
}

export function renderState(ctx: GameContext, character: CharacterState): void {
  const previousCharacter = ctx.currentCharacterState;
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
      ${STAT_ALLOC_ENTRIES.map((entry) => {
        const buffBonus = buffBonusForStat(ctx, entry.buffStat);
        return `
        <span class="stat-grid-entry${buffBonus > 0 ? ' stat-buffed' : ''}">
          ${entry.label} ${entry.pick(character)}${buffBonus > 0 ? ` <span class="stat-buff-delta">(+${buffBonus})</span>` : ''}
          ${canAllocate ? `<button type="button" class="stat-alloc-btn" data-stat-key="${entry.key}">+</button>` : ''}
        </span>
      `;
      }).join('')}
      <span>공격력 ${character.attackPower}</span>
      <span${buffBonusForStat(ctx, 'physicalDefense') > 0 ? ' class="stat-buffed"' : ''}>물리방어 ${character.physicalDefense}${buffBonusForStat(ctx, 'physicalDefense') > 0 ? ` <span class="stat-buff-delta">(+${buffBonusForStat(ctx, 'physicalDefense')})</span>` : ''}</span>
      <span${buffBonusForStat(ctx, 'magicDefense') > 0 ? ' class="stat-buffed"' : ''}>마법방어 ${character.magicDefense}${buffBonusForStat(ctx, 'magicDefense') > 0 ? ` <span class="stat-buff-delta">(+${buffBonusForStat(ctx, 'magicDefense')})</span>` : ''}</span>
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

  // 스킬 탭 갱신은 레벨/스킬 포인트가 실제로 바뀌었을 때만 한다 — 안 그러면 휴식 중
  // 1초마다 오는 HP/MP state에도 매번 카드가 통째로 다시 그려져(진입 애니메이션까지
  // 재생되어) 스킬창을 켜둔 채 쉴 때 계속 반짝거리는 문제가 있었다.
  const skillTabRelevantChanged =
    !previousCharacter ||
    previousCharacter.level !== character.level ||
    previousCharacter.unallocatedSkillPoints !== character.unallocatedSkillPoints;
  if (skillTabRelevantChanged && isCharacterSheetTabOpen(ctx, 'skill')) renderCharacterSheetBody(ctx);
}
