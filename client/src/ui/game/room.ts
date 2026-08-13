import {
  DIRECTION_VALUES,
  JOB_DESCRIPTIONS,
  JOB_LABELS,
  JOB_VALUES,
  NPC_TYPE_LABELS,
  type CombatMobInfo,
  type RoomSnapshot,
  type VillageInfo,
} from '@mud/shared';
import { escapeHtml } from '../../domUtils';
import { icon } from '../icons';
import { hpLevel, type GameContext } from './context';

function raidStatusText(raidProtectedUntil: string | null): string {
  if (!raidProtectedUntil) return '무방비';
  const protectedUntil = new Date(raidProtectedUntil);
  if (protectedUntil.getTime() <= Date.now()) return '무방비';
  return `보호 중 (${protectedUntil.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}까지)`;
}

function renderVillageSection(village: VillageInfo): string {
  const plotsText = village.plots.map((plot) => `${plot.index}:${plot.buildingName ?? '빈 땅'}`).join(', ');

  return `
    <div class="village-panel">
      <div class="village-title">${icon('castle')} ${village.name} (영주: ${village.lordName}, Lv.${village.level})</div>
      <div class="room-meta">
        <span><strong>국고</strong>gold ${village.gold}</span>
        <span><strong>목재</strong>${village.wood}</span>
        <span><strong>광석</strong>${village.ore}</span>
        <span><strong>식량</strong>${village.food}</span>
      </div>
      <div class="room-meta">
        <span><strong>상납율</strong>${village.tithePercent}%</span>
        <span><strong>침공 상태</strong>${raidStatusText(village.raidProtectedUntil)}</span>
      </div>
      <div class="room-meta">
        <span><strong>땅</strong>${plotsText || '없음'}</span>
      </div>
    </div>
  `;
}

export function renderRoom(ctx: GameContext, room: RoomSnapshot): void {
  const mobsText =
    room.mobs.length > 0
      ? room.mobs.map((mob) => `${mob.name} Lv.${mob.level} (${mob.hp}/${mob.maxHp})`).join(', ')
      : '-';
  const itemsText =
    room.items.length > 0
      ? room.items
          .map((item) => `<span class="item-grade-${item.grade}">${escapeHtml(item.name)}</span> x${item.quantity}`)
          .join(', ')
      : '-';
  const npcsText =
    room.npcs.length > 0
      ? room.npcs.map((npc) => `${escapeHtml(npc.name)} (${NPC_TYPE_LABELS[npc.type]})`).join(', ')
      : '-';
  const playersText = room.players.length > 0 ? room.players.join(', ') : '-';
  const portals = room.exits.filter((exit) => !DIRECTION_VALUES.includes(exit.direction));
  const portalsText = portals.length > 0 ? portals.map((exit) => escapeHtml(exit.direction)).join(', ') : '-';

  ctx.roomHeader.innerHTML = `
    <div class="room-zone-label">${escapeHtml(room.zoneName)}</div>
    <div class="room-name">${room.name}</div>
    <p class="room-desc">${room.description}</p>
  `;
  ctx.roomMeta.innerHTML = `
    <span><strong>몬스터</strong>${mobsText}</span>
    <span><strong>아이템</strong>${itemsText}</span>
    <span><strong>NPC</strong>${npcsText}</span>
    <span><strong>유저</strong>${playersText}</span>
    <span><strong>포털</strong>${portalsText}</span>
  `;
  ctx.roomVillage.innerHTML = room.village ? renderVillageSection(room.village) : '';
}

export function renderCombat(ctx: GameContext, mobs: CombatMobInfo[]): void {
  ctx.combatPanel.hidden = false;
  ctx.combatPanel.innerHTML = mobs
    .map((mob) => {
      const ratio = mob.maxHp > 0 ? mob.hp / mob.maxHp : 0;
      return `
        <div class="combat-mob-row">
          <div class="combat-mob-name"></div>
          <div class="hp-bar" role="progressbar" aria-valuenow="${mob.hp}" aria-valuemin="0" aria-valuemax="${mob.maxHp}">
            <div class="hp-bar-fill" data-level="${hpLevel(ratio)}" style="width: ${Math.max(0, ratio * 100)}%"></div>
          </div>
        </div>
      `;
    })
    .join('');
  ctx.combatPanel.querySelectorAll<HTMLDivElement>('.combat-mob-name').forEach((el, index) => {
    el.textContent = mobs[index].name;
  });
}

export function hideCombat(ctx: GameContext): void {
  ctx.combatPanel.hidden = true;
  ctx.combatPanel.innerHTML = '';
}

export function showJobModal(ctx: GameContext, onChoose: (job: (typeof JOB_VALUES)[number]) => void): void {
  ctx.jobModalBody.innerHTML = `
    <p>이 캐릭터는 아직 직업이 없습니다. 직업을 선택해주세요.</p>
    <div class="job-choice-list">
      ${JOB_VALUES.map(
        (job) => `
        <button type="button" class="job-choice-btn" data-job="${job}">
          <span class="job-choice-name">${JOB_LABELS[job]}</span>
          <span class="job-choice-desc">${JOB_DESCRIPTIONS[job]}</span>
        </button>
      `,
      ).join('')}
    </div>
  `;
  ctx.jobModal.hidden = false;
  ctx.jobModalBody.querySelectorAll<HTMLButtonElement>('.job-choice-btn').forEach((button) => {
    button.addEventListener('click', () => {
      ctx.jobModal.hidden = true;
      onChoose(button.dataset.job as (typeof JOB_VALUES)[number]);
    });
  });
}
