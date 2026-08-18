import {
  effectiveSkillPower,
  ELEMENT_LABELS,
  ELEMENT_VALUES,
  SKILLS_BY_JOB,
  SKILL_MAX_RANK,
  type ClientMessage,
  type ElementType,
  type SkillDefinition,
} from '@mud/shared';
import { escapeHtml } from '../../domUtils';
import type { GameContext } from './context';

function findSkillByIdInList(skills: SkillDefinition[], id: string): SkillDefinition | undefined {
  return skills.find((skill) => skill.id === id);
}

interface LockReason {
  text: string;
  /** 'level'은 레벨만 오르면 곧 배울 수 있어 옅은 경고색, 'blocked'는 선행/속성 문제라 더 멀게(수수하게) 표시한다. */
  tier: 'level' | 'blocked';
}

function lockReason(ctx: GameContext, skill: SkillDefinition, jobSkills: SkillDefinition[]): LockReason | undefined {
  const character = ctx.currentCharacterState!;
  if (character.level < skill.requiredLevel) return { text: `Lv.${skill.requiredLevel} 필요`, tier: 'level' };
  if (skill.element && skill.element !== character.element) return { text: '다른 속성 전용', tier: 'blocked' };
  if (skill.requires && !ctx.learnedSkillIds.includes(skill.requires)) {
    const prereq = findSkillByIdInList(jobSkills, skill.requires);
    return { text: `'${prereq?.name ?? skill.requires}' 선행 필요`, tier: 'blocked' };
  }
  return undefined;
}

function powerLabel(skill: SkillDefinition, rank: number): string {
  if (skill.kind === 'passive') return `+${Math.round(effectiveSkillPower(skill, rank))}`;
  if (skill.kind === 'heal') return `HP ${Math.round(effectiveSkillPower(skill, rank))} 회복`;
  return `피해 ${effectiveSkillPower(skill, rank).toFixed(2)}배${skill.targeting === 'aoe' ? ' (광역)' : ''}`;
}

/** 랭크(0~20)를 conic-gradient 링으로 표시한다 — 텍스트 "[Lv3/20]" 대신 한눈에 진행률이 보이게. */
function renderRankRing(rank: number): string {
  const pct = Math.round((rank / SKILL_MAX_RANK) * 100);
  return `
    <span class="skill-rank-ring" style="--rank-pct: ${pct}">
      <span class="skill-rank-ring-inner">${rank > 0 ? rank : '-'}</span>
    </span>
  `;
}

/** 스킬 노드 카드 자체(랭크 링 + 이름/상태 + 버튼). 트렁크 그리드에서는 이 카드만, 분기 칼럼에서는 이걸 점+선 래퍼로 감싼다. */
function renderSkillCard(ctx: GameContext, skill: SkillDefinition, jobSkills: SkillDefinition[], index: number): string {
  const rank = ctx.learnedSkillRanks[skill.id] ?? 0;
  const learned = rank > 0;
  const hasPoints = (ctx.currentCharacterState?.unallocatedSkillPoints ?? 0) > 0;
  const unlocking = ctx.lastSkillUnlockId === skill.id;

  let statusText: string;
  let actionHtml = '';
  let lockTierClass = '';

  if (learned) {
    const maxed = rank >= SKILL_MAX_RANK;
    statusText = maxed ? '만렙' : powerLabel(skill, rank);
    if (!maxed && hasPoints) {
      actionHtml = `<button type="button" class="skill-upgrade-btn" data-skill-id="${skill.id}">강화</button>`;
    }
  } else {
    const reason = lockReason(ctx, skill, jobSkills);
    statusText = reason?.text ?? '습득 가능';
    lockTierClass = reason ? ` skill-node-locked-${reason.tier}` : '';
    if (!reason && hasPoints) {
      actionHtml = `<button type="button" class="skill-learn-btn" data-skill-id="${skill.id}">배우기</button>`;
    }
  }

  const title = `${skill.description} (MP ${skill.mpCost})`;

  return `
    <div class="hud-card hud-card-enter skill-node${lockTierClass}${unlocking ? ' is-unlocking' : ''}" style="animation-delay: ${index * 25}ms" title="${escapeHtml(title)}">
      ${renderRankRing(rank)}
      <div class="skill-node-info">
        <span class="skill-row-name">${escapeHtml(skill.name)}</span>
        <span class="skill-row-status">${statusText}</span>
      </div>
      ${actionHtml}
    </div>
  `;
}

function renderSkillNode(ctx: GameContext, skill: SkillDefinition, jobSkills: SkillDefinition[], index: number): string {
  const learned = (ctx.learnedSkillRanks[skill.id] ?? 0) > 0;
  return `
    <div class="skill-tree-node ${learned ? 'is-learned' : ''}">
      ${renderSkillCard(ctx, skill, jobSkills, index)}
    </div>
  `;
}

export function renderSkillTab(ctx: GameContext): void {
  const character = ctx.currentCharacterState;
  const job = character?.job;
  if (!character || !job) {
    ctx.characterSheetBody.innerHTML = '<p>아직 직업이 없어 스킬을 배울 수 없습니다.</p>';
    return;
  }

  const jobSkills = SKILLS_BY_JOB[job];
  const trunkSkills = jobSkills.filter((skill) => !skill.element).sort((a, b) => a.requiredLevel - b.requiredLevel);

  const trunkSectionHtml = `
    <div class="skill-tree-trunk-section">
      <div class="skill-tree-column-header">공통</div>
      <div class="skill-tree-trunk-grid">
        ${trunkSkills.map((skill, index) => renderSkillCard(ctx, skill, jobSkills, index)).join('')}
      </div>
    </div>
  `;

  const branchColumnsHtml = ELEMENT_VALUES.map((element: ElementType) => {
    const skills = jobSkills.filter((skill) => skill.element === element).sort((a, b) => a.requiredLevel - b.requiredLevel);
    const isOwnElement = element === character.element;
    return `
      <div class="skill-tree-column ${isOwnElement ? 'is-own-element' : ''}" data-element="${element}">
        <div class="skill-tree-column-header">${ELEMENT_LABELS[element]}${isOwnElement ? '' : ' <span class="skill-tree-column-sub">(다른 속성)</span>'}</div>
        ${skills.map((skill, index) => renderSkillNode(ctx, skill, jobSkills, index)).join('')}
      </div>
    `;
  }).join('');

  ctx.characterSheetBody.innerHTML = `
    <div class="skill-modal-header">
      <p>사용 가능 스킬 포인트: <span class="skill-points-value">${character.unallocatedSkillPoints}</span> · 속성: <span class="skill-points-value">${ELEMENT_LABELS[character.element]}</span></p>
      <button type="button" id="skill-reset-btn">전체 초기화</button>
    </div>
    <div class="skill-tree">
      ${trunkSectionHtml}
      <div class="skill-tree-branches">
        ${branchColumnsHtml}
      </div>
    </div>
  `;

  ctx.lastSkillUnlockId = null;

  ctx.characterSheetBody.querySelectorAll<HTMLButtonElement>('.skill-learn-btn').forEach((button) => {
    button.addEventListener('click', () => {
      ctx.lastSkillUnlockId = button.dataset.skillId!;
      const message: ClientMessage = { type: 'learnSkill', skillId: button.dataset.skillId! };
      ctx.socket.send(JSON.stringify(message));
    });
  });

  ctx.characterSheetBody.querySelectorAll<HTMLButtonElement>('.skill-upgrade-btn').forEach((button) => {
    button.addEventListener('click', () => {
      ctx.lastSkillUnlockId = button.dataset.skillId!;
      const message: ClientMessage = { type: 'upgradeSkill', skillId: button.dataset.skillId! };
      ctx.socket.send(JSON.stringify(message));
    });
  });

  ctx.characterSheetBody.querySelector<HTMLButtonElement>('#skill-reset-btn')!.addEventListener('click', () => {
    if (!confirm('배운 스킬을 전부 초기화할까요? 사용한 스킬 포인트는 전액 돌려받습니다.')) return;
    const message: ClientMessage = { type: 'resetSkills' };
    ctx.socket.send(JSON.stringify(message));
  });
}
