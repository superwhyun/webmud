import {
  effectiveSkillPower,
  ELEMENT_LABELS,
  SKILLS_BY_JOB,
  SKILL_MAX_RANK,
  type ClientMessage,
  type SkillDefinition,
} from '@mud/shared';
import { escapeHtml } from '../../domUtils';
import type { GameContext } from './context';

function findSkillByIdInList(skills: SkillDefinition[], id: string): SkillDefinition | undefined {
  return skills.find((skill) => skill.id === id);
}

function lockReason(ctx: GameContext, skill: SkillDefinition, jobSkills: SkillDefinition[]): string | undefined {
  const character = ctx.currentCharacterState!;
  if (character.level < skill.requiredLevel) return `Lv.${skill.requiredLevel} 필요`;
  if (skill.element && skill.element !== character.element) return '다른 속성 전용';
  if (skill.requires && !ctx.learnedSkillIds.includes(skill.requires)) {
    const prereq = findSkillByIdInList(jobSkills, skill.requires);
    return `'${prereq?.name ?? skill.requires}' 선행 필요`;
  }
  return undefined;
}

function powerLabel(skill: SkillDefinition, rank: number): string {
  if (skill.kind === 'passive') return `+${Math.round(effectiveSkillPower(skill, rank))}`;
  if (skill.kind === 'heal') return `HP ${Math.round(effectiveSkillPower(skill, rank))} 회복`;
  return `피해 ${effectiveSkillPower(skill, rank).toFixed(2)}배${skill.targeting === 'aoe' ? ' (광역)' : ''}`;
}

function renderSkillRow(ctx: GameContext, skill: SkillDefinition, jobSkills: SkillDefinition[]): string {
  const rank = ctx.learnedSkillRanks[skill.id] ?? 0;
  const learned = rank > 0;
  const hasPoints = (ctx.currentCharacterState?.unallocatedSkillPoints ?? 0) > 0;

  let statusHtml: string;
  let actionHtml = '';

  if (learned) {
    const maxed = rank >= SKILL_MAX_RANK;
    statusHtml = `<span class="skill-row-status">[Lv${rank}/${SKILL_MAX_RANK}${maxed ? ' 만렙' : ''}] ${powerLabel(skill, rank)}</span>`;
    if (!maxed && hasPoints) {
      actionHtml = `<button type="button" class="skill-upgrade-btn" data-skill-id="${skill.id}">강화</button>`;
    }
  } else {
    const reason = lockReason(ctx, skill, jobSkills);
    statusHtml = `<span class="skill-row-status">[${reason ?? '습득 가능'}]</span>`;
    if (!reason && hasPoints) {
      actionHtml = `<button type="button" class="skill-learn-btn" data-skill-id="${skill.id}">배우기</button>`;
    }
  }

  return `
    <div class="skill-row">
      <div class="skill-row-info">
        <span class="skill-row-name">${escapeHtml(skill.name)} ${statusHtml}</span>
        <span class="skill-row-desc">${escapeHtml(skill.description)} (MP ${skill.mpCost})</span>
      </div>
      ${actionHtml}
    </div>
  `;
}

export function renderSkillModal(ctx: GameContext): void {
  const character = ctx.currentCharacterState;
  const job = character?.job;
  if (!character || !job) {
    ctx.skillModalBody.innerHTML = '<p>아직 직업이 없어 스킬을 배울 수 없습니다.</p>';
    return;
  }

  const jobSkills = SKILLS_BY_JOB[job];
  const trunkSkills = jobSkills.filter((skill) => !skill.element).sort((a, b) => a.requiredLevel - b.requiredLevel);
  const branchByElement = new Map<string, SkillDefinition[]>();
  for (const skill of jobSkills) {
    if (!skill.element) continue;
    const list = branchByElement.get(skill.element) ?? [];
    list.push(skill);
    branchByElement.set(skill.element, list);
  }
  for (const list of branchByElement.values()) list.sort((a, b) => a.requiredLevel - b.requiredLevel);

  const branchSectionsHtml = [...branchByElement.entries()]
    .map(
      ([element, skills]) => `
        <div class="skill-tier-title">${ELEMENT_LABELS[element as keyof typeof ELEMENT_LABELS]} 계열${element === character.element ? '' : ' (다른 속성)'}</div>
        ${skills.map((skill) => renderSkillRow(ctx, skill, jobSkills)).join('')}
      `,
    )
    .join('');

  ctx.skillModalBody.innerHTML = `
    <div class="skill-modal-header">
      <p>사용 가능 스킬 포인트: ${character.unallocatedSkillPoints}</p>
      <button type="button" id="skill-reset-btn">전체 초기화</button>
    </div>
    <div class="skill-tier-title">공통</div>
    ${trunkSkills.map((skill) => renderSkillRow(ctx, skill, jobSkills)).join('')}
    ${branchSectionsHtml}
  `;

  ctx.skillModalBody.querySelectorAll<HTMLButtonElement>('.skill-learn-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const message: ClientMessage = { type: 'command', text: `skill learn ${button.dataset.skillId}` };
      ctx.socket.send(JSON.stringify(message));
    });
  });

  ctx.skillModalBody.querySelectorAll<HTMLButtonElement>('.skill-upgrade-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const message: ClientMessage = { type: 'command', text: `skill upgrade ${button.dataset.skillId}` };
      ctx.socket.send(JSON.stringify(message));
    });
  });

  ctx.skillModalBody.querySelector<HTMLButtonElement>('#skill-reset-btn')!.addEventListener('click', () => {
    if (!confirm('배운 스킬을 전부 초기화할까요? 사용한 스킬 포인트는 전액 돌려받습니다.')) return;
    const message: ClientMessage = { type: 'command', text: 'skill reset' };
    ctx.socket.send(JSON.stringify(message));
  });
}

export function openSkillModal(ctx: GameContext): void {
  renderSkillModal(ctx);
  ctx.skillModal.hidden = false;
}

export function closeSkillModal(ctx: GameContext): void {
  ctx.skillModal.hidden = true;
}
