import { SKILLS_BY_JOB, type ClientMessage } from '@mud/shared';
import type { GameContext } from './context';

export function renderSkillModal(ctx: GameContext): void {
  const character = ctx.currentCharacterState;
  const job = character?.job;
  if (!character || !job) {
    ctx.skillModalBody.innerHTML = '<p>아직 직업이 없어 스킬을 배울 수 없습니다.</p>';
    return;
  }
  const skills = SKILLS_BY_JOB[job];

  ctx.skillModalBody.innerHTML = `
    <p>사용 가능 스킬 포인트: ${character.unallocatedSkillPoints}</p>
    ${skills
      .map((skill) => {
        const learned = ctx.learnedSkillIds.includes(skill.id);
        const locked = character.level < skill.requiredLevel;
        const canLearn = !learned && !locked && character.unallocatedSkillPoints > 0;
        const status = learned ? '[습득]' : locked ? `[Lv.${skill.requiredLevel} 필요]` : '[습득 가능]';
        return `
          <div class="skill-row">
            <div class="skill-row-info">
              <span class="skill-row-name">${skill.name} <span class="skill-row-status">${status}</span></span>
              <span class="skill-row-desc">${skill.description} (MP ${skill.mpCost})</span>
            </div>
            ${canLearn ? `<button type="button" class="skill-learn-btn" data-skill-id="${skill.id}">배우기</button>` : ''}
          </div>
        `;
      })
      .join('')}
  `;

  ctx.skillModalBody.querySelectorAll<HTMLButtonElement>('.skill-learn-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const message: ClientMessage = { type: 'command', text: `skill learn ${button.dataset.skillId}` };
      ctx.socket.send(JSON.stringify(message));
    });
  });
}

export function openSkillModal(ctx: GameContext): void {
  renderSkillModal(ctx);
  ctx.skillModal.hidden = false;
}

export function closeSkillModal(ctx: GameContext): void {
  ctx.skillModal.hidden = true;
}
