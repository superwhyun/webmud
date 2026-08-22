import {
  effectiveSkillPower,
  ELEMENT_LABELS,
  ELEMENT_VALUES,
  PASSIVE_STAT_LABELS,
  SKILLS_BY_JOB,
  SKILL_MAX_RANK,
  type ClientMessage,
  type ElementType,
  type SkillDefinition,
} from '@mud/shared';
import { escapeHtml } from '../../domUtils';
import type { GameContext } from './context';
import { skillArtPath } from './skillAssets';

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

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
  if (skill.kind === 'buff') {
    const durationSec = Math.round((skill.durationMs ?? 0) / 1000);
    const statLabel = skill.buffStat ? PASSIVE_STAT_LABELS[skill.buffStat] : '';
    return `${durationSec}초간 ${statLabel} +${Math.round(effectiveSkillPower(skill, rank))}`;
  }
  if (skill.kind === 'heal') return `HP ${Math.round(effectiveSkillPower(skill, rank))} 회복`;
  return `피해 ${effectiveSkillPower(skill, rank).toFixed(2)}배${skill.targeting === 'aoe' ? ' (광역)' : ''}`;
}

/** 직업/오행 문장 둘레에 랭크만큼 채워지는 원형 게이지를 두르고, 정확한 수치는 작은 배지로 겹쳐 표시한다. */
function renderSkillMedallion(skill: SkillDefinition, rank: number): string {
  const rankPct = (rank / SKILL_MAX_RANK) * 100;
  return `
    <span class="skill-medallion-ring" style="--rank-pct: ${rankPct}">
      <span class="skill-medallion">
        <img src="${skillArtPath(skill)}" alt="" aria-hidden="true" draggable="false">
      </span>
      <span class="skill-rank-badge">${rank}/${SKILL_MAX_RANK}</span>
    </span>
  `;
}

/** 스킬 노드 카드(문장 + 이름/상태 + 버튼). 트렁크/오행 분기 그리드 모두 이 카드를 그대로 쓴다. */
function renderSkillCard(ctx: GameContext, skill: SkillDefinition, jobSkills: SkillDefinition[], index: number): string {
  const rank = ctx.learnedSkillRanks[skill.id] ?? 0;
  const learned = rank > 0;
  const hasPoints = (ctx.currentCharacterState?.unallocatedSkillPoints ?? 0) > 0;
  const unlocking = ctx.lastSkillUnlockId === skill.id;
  const reason = learned ? undefined : lockReason(ctx, skill, jobSkills);
  const maxed = rank >= SKILL_MAX_RANK;

  let statusText: string;
  let actionHtml = '';

  if (learned) {
    statusText = maxed ? '최고 등급' : powerLabel(skill, rank);
    if (!maxed && hasPoints) {
      actionHtml = `<button type="button" class="skill-upgrade-btn" data-skill-id="${escapeHtmlAttribute(skill.id)}">강화</button>`;
    }
  } else {
    statusText = reason?.text ?? '습득 가능';
    if (!reason && hasPoints) {
      actionHtml = `<button type="button" class="skill-learn-btn" data-skill-id="${escapeHtmlAttribute(skill.id)}">배우기</button>`;
    }
  }

  const title = `${skill.description} (MP ${skill.mpCost})`;
  const stateClass = learned
    ? ` is-learned${maxed ? ' is-maxed' : ''}`
    : reason
      ? ` skill-node-locked-${reason.tier}`
      : ' is-available';
  const kindLabel = skill.kind === 'passive'
    ? '지속 효과'
    : skill.kind === 'buff'
      ? `${skill.buffStat ? PASSIVE_STAT_LABELS[skill.buffStat] : ''} 버프`
      : skill.kind === 'heal'
        ? '회복'
        : skill.targeting === 'aoe'
          ? '광역 공격'
          : '공격';

  return `
    <div class="hud-card hud-card-enter skill-node${stateClass}${unlocking ? ' is-unlocking' : ''}" style="animation-delay: ${index * 25}ms" title="${escapeHtmlAttribute(title)}">
      ${renderSkillMedallion(skill, rank)}
      <div class="skill-node-info">
        <span class="skill-row-name">${escapeHtml(skill.name)}</span>
        <span class="skill-row-status">${escapeHtml(statusText)}</span>
        <span class="skill-row-meta">Lv.${skill.requiredLevel} · ${kindLabel}${skill.mpCost > 0 ? ` · MP ${skill.mpCost}` : ''}</span>
      </div>
      ${actionHtml}
    </div>
  `;
}

/** 오행 분기 그리드 한 칸 수 — 지금은 원소당 3티어+캡스톤 4개뿐이지만, 나중에 티어가
 * 늘어날 걸 감안해 4x2(=8칸)로 잡고 남는 칸은 빈 칸으로 둔다. */
const BRANCH_GRID_SLOTS = 8;

function renderEmptySkillSlot(): string {
  return `<div class="skill-node skill-node-empty" aria-hidden="true"></div>`;
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

  // 오행 분기는 항상 4x2 카드 그리드로 그린다 — 지금은 원소당 4개(3티어+캡스톤)뿐이라
  // 나머지 칸은 빈 칸으로 남아 "나중에 더 늘어날 수 있다"는 여지를 보여준다.
  const renderElementColumn = (element: ElementType): string => {
    const skills = jobSkills.filter((skill) => skill.element === element).sort((a, b) => a.requiredLevel - b.requiredLevel);
    const isOwnElement = element === character.element;
    const cards = skills.map((skill, index) => renderSkillCard(ctx, skill, jobSkills, index));
    const placeholders = Array.from({ length: Math.max(0, BRANCH_GRID_SLOTS - cards.length) }, renderEmptySkillSlot);
    return `
      <div class="skill-tree-column ${isOwnElement ? 'is-own-element' : ''}" data-element="${element}">
        <div class="skill-tree-column-header">${ELEMENT_LABELS[element]}${isOwnElement ? '' : ' <span class="skill-tree-column-sub">(다른 속성)</span>'}</div>
        <div class="skill-tree-column-grid">${[...cards, ...placeholders].join('')}</div>
      </div>
    `;
  };

  // 다른 속성은 4개를 한 서랍에 몰아 보여주지 않고, 속성별로 각자의 책갈피 탭 +
  // 전용 드로어 페이지를 둔다 — 한 번에 하나의 속성만 펼쳐 본다.
  const otherElements = ELEMENT_VALUES.filter((element: ElementType) => element !== character.element);
  const openElement = ctx.skillBranchOpenElement;

  ctx.characterSheetBody.innerHTML = `
    <div class="skill-modal-header">
      <p>사용 가능 스킬 포인트: <span class="skill-points-value">${character.unallocatedSkillPoints}</span> · 속성: <span class="skill-points-value">${ELEMENT_LABELS[character.element]}</span></p>
      <button type="button" id="skill-reset-btn">전체 초기화</button>
    </div>
    <div class="skill-tree">
      ${trunkSectionHtml}
      <div class="skill-tree-branches">
        <div class="skill-tree-branches-main">${renderElementColumn(character.element)}</div>
        <div class="skill-tree-branch-tabs">
          ${otherElements
            .map(
              (element) => `
            <button type="button" class="skill-tree-branch-tab${element === openElement ? ' is-active' : ''}"
                    data-element="${element}" aria-expanded="${element === openElement}">
              ${ELEMENT_LABELS[element]}
            </button>
          `,
            )
            .join('')}
        </div>
        <div class="skill-tree-branches-others${openElement ? ' is-open' : ''}" id="skill-branch-others">
          ${openElement ? renderElementColumn(openElement) : ''}
        </div>
      </div>
    </div>
  `;

  ctx.lastSkillUnlockId = null;

  // 탭을 눌러 서랍 내용을 통째로 새 HTML로 갈아끼우면 그 안의 배우기/강화 버튼은
  // 최초 렌더 때 한 번 돈 리스너 연결에 걸리지 않는다 — 스코프를 받아 어디서든
  // 다시 불러 연결할 수 있게 함수로 뺐다.
  const wireSkillButtons = (scope: ParentNode): void => {
    scope.querySelectorAll<HTMLButtonElement>('.skill-learn-btn').forEach((button) => {
      button.addEventListener('click', () => {
        ctx.lastSkillUnlockId = button.dataset.skillId!;
        const message: ClientMessage = { type: 'learnSkill', skillId: button.dataset.skillId! };
        ctx.socket.send(JSON.stringify(message));
      });
    });

    scope.querySelectorAll<HTMLButtonElement>('.skill-upgrade-btn').forEach((button) => {
      button.addEventListener('click', () => {
        ctx.lastSkillUnlockId = button.dataset.skillId!;
        const message: ClientMessage = { type: 'upgradeSkill', skillId: button.dataset.skillId! };
        ctx.socket.send(JSON.stringify(message));
      });
    });
  };

  const branchTabs = ctx.characterSheetBody.querySelectorAll<HTMLButtonElement>('.skill-tree-branch-tab');
  const branchOthersEl = ctx.characterSheetBody.querySelector<HTMLDivElement>('#skill-branch-others')!;
  branchTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      // 여기서 전체를 다시 그리면 서랍이 이미 열린/닫힌 상태로 새로 생성되어 트랜지션이
      // 재생되지 않는다 — 같은 노드의 클래스/내용만 바꿔서 실제로 슬라이딩되게 한다.
      const clickedElement = tab.dataset.element as ElementType;
      const closing = ctx.skillBranchOpenElement === clickedElement;
      ctx.skillBranchOpenElement = closing ? null : clickedElement;
      branchOthersEl.classList.toggle('is-open', !closing);
      branchOthersEl.innerHTML = closing ? '' : renderElementColumn(clickedElement);
      if (!closing) wireSkillButtons(branchOthersEl);
      branchTabs.forEach((t) => {
        const active = !closing && t.dataset.element === clickedElement;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-expanded', String(active));
      });
    });
  });

  wireSkillButtons(ctx.characterSheetBody);

  ctx.characterSheetBody.querySelector<HTMLButtonElement>('#skill-reset-btn')!.addEventListener('click', () => {
    if (!confirm('배운 스킬을 전부 초기화할까요? 사용한 스킬 포인트는 전액 돌려받습니다.')) return;
    const message: ClientMessage = { type: 'resetSkills' };
    ctx.socket.send(JSON.stringify(message));
  });
}
