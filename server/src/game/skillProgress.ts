import {
  effectiveSkillPower,
  getSkillById,
  SKILLS,
  SKILLS_BY_JOB,
  SKILL_MAX_RANK,
  totalPassiveBonus,
  passiveRankDelta,
  type PassiveStat,
  type SkillDefinition,
} from '@mud/shared';
import { db } from '../db/client.js';
import type { CharacterRow, CharacterSkillRow } from '../db/types.js';

/** 스킬 id 또는 정확한 한글 이름으로 스킬 정의를 찾는다. */
export function resolveSkillArg(arg: string): SkillDefinition | undefined {
  const trimmed = arg.trim();
  if (!trimmed) return undefined;
  return (
    getSkillById(trimmed) ??
    SKILLS.find((skill) => skill.id.toLowerCase() === trimmed.toLowerCase()) ??
    SKILLS.find((skill) => skill.name === trimmed)
  );
}

const PASSIVE_STAT_COLUMNS: Record<PassiveStat, string> = {
  maxHp: 'max_hp',
  maxMp: 'max_mp',
  physicalDefense: 'physical_defense',
  magicDefense: 'magic_defense',
  strength: 'strength',
  dexterity: 'dexterity',
  intelligence: 'intelligence',
  vitality: 'vitality',
  wisdom: 'wisdom',
  luck: 'luck',
};

export function getLearnedSkillIds(characterId: number): Set<string> {
  const rows = db
    .prepare('SELECT skill_id FROM character_skills WHERE character_id = ?')
    .all(characterId) as Pick<CharacterSkillRow, 'skill_id'>[];
  return new Set(rows.map((row) => row.skill_id));
}

export function getLearnedSkillRanks(characterId: number): Map<string, number> {
  const rows = db
    .prepare('SELECT skill_id, rank FROM character_skills WHERE character_id = ?')
    .all(characterId) as Pick<CharacterSkillRow, 'skill_id' | 'rank'>[];
  return new Map(rows.map((row) => [row.skill_id, row.rank]));
}

export function hasLearnedSkill(characterId: number, skillId: string): boolean {
  return db
    .prepare('SELECT 1 FROM character_skills WHERE character_id = ? AND skill_id = ?')
    .get(characterId, skillId) !== undefined;
}

export function getSkillRank(characterId: number, skillId: string): number {
  const row = db
    .prepare('SELECT rank FROM character_skills WHERE character_id = ? AND skill_id = ?')
    .get(characterId, skillId) as Pick<CharacterSkillRow, 'rank'> | undefined;
  return row?.rank ?? 0;
}

/** 배운 "기 순환" 랭크만큼 쿨타임에 곱할 배율(1 = 그대로, 0.8 = 20% 감소). 최대 50%까지만 깎이도록 방어적으로 clamp. */
export function getCooldownMultiplier(character: Pick<CharacterRow, 'id' | 'job'>): number {
  if (!character.job) return 1;
  const skill = SKILLS_BY_JOB[character.job].find((candidate) => candidate.reducesCooldown);
  if (!skill) return 1;
  const rank = getSkillRank(character.id, skill.id);
  if (rank < 1) return 1;
  const reductionPercent = effectiveSkillPower(skill, rank);
  return Math.max(0.5, 1 - reductionPercent / 100);
}

function applyPassiveDelta(characterId: number, skill: SkillDefinition, rank: number): void {
  if (skill.kind !== 'passive' || !skill.passiveStat) return;
  const column = PASSIVE_STAT_COLUMNS[skill.passiveStat];
  const delta = passiveRankDelta(skill, rank);
  db.prepare(`UPDATE characters SET ${column} = ${column} + ? WHERE id = ?`).run(delta, characterId);
}

export interface LearnSkillResult {
  ok: boolean;
  message: string;
}

export function learnSkill(character: CharacterRow, skillId: string): LearnSkillResult {
  const skill = getSkillById(skillId);
  if (!skill) {
    return { ok: false, message: '존재하지 않는 스킬입니다.' };
  }
  if (!character.job) {
    return { ok: false, message: '직업이 없어 스킬을 배울 수 없습니다.' };
  }
  if (skill.job !== character.job) {
    return { ok: false, message: `${skill.name}은(는) 당신의 직업이 배울 수 없는 스킬입니다.` };
  }
  if (character.level < skill.requiredLevel) {
    return { ok: false, message: `${skill.name}은(는) 레벨 ${skill.requiredLevel} 이상부터 배울 수 있습니다.` };
  }
  if (skill.element && skill.element !== character.element) {
    return { ok: false, message: `${skill.name}은(는) 당신의 속성으로는 배울 수 없는 스킬입니다.` };
  }
  if (skill.requires && !hasLearnedSkill(character.id, skill.requires)) {
    const prereq = getSkillById(skill.requires);
    return { ok: false, message: `${skill.name}을(를) 배우려면 먼저 '${prereq?.name ?? skill.requires}'을(를) 배워야 합니다.` };
  }
  if (character.unallocated_skill_points < 1) {
    return { ok: false, message: '사용 가능한 스킬 포인트가 없습니다.' };
  }
  if (hasLearnedSkill(character.id, skillId)) {
    return { ok: false, message: '이미 배운 스킬입니다.' };
  }

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO character_skills (character_id, skill_id, rank) VALUES (?, ?, 1)').run(character.id, skillId);
    db.prepare('UPDATE characters SET unallocated_skill_points = unallocated_skill_points - 1 WHERE id = ?').run(
      character.id,
    );
    applyPassiveDelta(character.id, skill, 1);
  });
  tx();

  return { ok: true, message: `${skill.name}을(를) 배웠습니다.` };
}

export function upgradeSkill(character: CharacterRow, skillId: string): LearnSkillResult {
  const skill = getSkillById(skillId);
  if (!skill) {
    return { ok: false, message: '존재하지 않는 스킬입니다.' };
  }

  const currentRank = getSkillRank(character.id, skillId);
  if (currentRank < 1) {
    return { ok: false, message: '아직 배우지 않은 스킬입니다.' };
  }
  if (currentRank >= SKILL_MAX_RANK) {
    return { ok: false, message: `${skill.name}은(는) 이미 최대 랭크(${SKILL_MAX_RANK})입니다.` };
  }
  if (character.unallocated_skill_points < 1) {
    return { ok: false, message: '사용 가능한 스킬 포인트가 없습니다.' };
  }

  const newRank = currentRank + 1;
  const tx = db.transaction(() => {
    db.prepare('UPDATE character_skills SET rank = ? WHERE character_id = ? AND skill_id = ?').run(
      newRank,
      character.id,
      skillId,
    );
    db.prepare('UPDATE characters SET unallocated_skill_points = unallocated_skill_points - 1 WHERE id = ?').run(
      character.id,
    );
    applyPassiveDelta(character.id, skill, newRank);
  });
  tx();

  return { ok: true, message: `${skill.name}을(를) 랭크 ${newRank}(으)로 강화했습니다.` };
}

export function resetSkills(character: CharacterRow): LearnSkillResult {
  const ranks = getLearnedSkillRanks(character.id);
  if (ranks.size === 0) {
    return { ok: false, message: '배운 스킬이 없습니다.' };
  }

  let refund = 0;
  const tx = db.transaction(() => {
    for (const [skillId, rank] of ranks) {
      const skill = getSkillById(skillId);
      refund += rank;
      if (skill && skill.kind === 'passive' && skill.passiveStat) {
        const column = PASSIVE_STAT_COLUMNS[skill.passiveStat];
        const bonus = totalPassiveBonus(skill, rank);
        db.prepare(`UPDATE characters SET ${column} = ${column} - ? WHERE id = ?`).run(bonus, character.id);
      }
    }
    db.prepare('DELETE FROM character_skills WHERE character_id = ?').run(character.id);
    db.prepare('UPDATE characters SET unallocated_skill_points = unallocated_skill_points + ? WHERE id = ?').run(
      refund,
      character.id,
    );
  });
  tx();

  return { ok: true, message: `모든 스킬을 초기화했습니다. 스킬 포인트 ${refund}개를 돌려받았습니다.` };
}

function skillLockReason(character: CharacterRow, skill: SkillDefinition, learned: Set<string>): string | undefined {
  if (character.level < skill.requiredLevel) return `Lv.${skill.requiredLevel} 필요`;
  if (skill.element && skill.element !== character.element) return '다른 속성 전용';
  if (skill.requires && !learned.has(skill.requires)) {
    const prereq = getSkillById(skill.requires);
    return `'${prereq?.name ?? skill.requires}' 선행 필요`;
  }
  return undefined;
}

export function describeAvailableSkills(character: CharacterRow): string {
  if (!character.job) return '직업이 없어 스킬을 확인할 수 없습니다.';

  const learned = getLearnedSkillIds(character.id);
  const ranks = getLearnedSkillRanks(character.id);
  const lines = SKILLS_BY_JOB[character.job].map((skill) => {
    if (learned.has(skill.id)) {
      const rank = ranks.get(skill.id) ?? 1;
      const status = rank >= SKILL_MAX_RANK ? `[Lv${rank}/${SKILL_MAX_RANK} 만렙]` : `[Lv${rank}/${SKILL_MAX_RANK}]`;
      return `${status} ${skill.name} (MP ${skill.mpCost}) - ${skill.description}`;
    }
    const lockReason = skillLockReason(character, skill, learned);
    const status = lockReason ? `[${lockReason}]` : '[습득 가능]';
    return `${status} ${skill.name} (Lv.${skill.requiredLevel}, MP ${skill.mpCost}) - ${skill.description}`;
  });

  return [`스킬 포인트: ${character.unallocated_skill_points}`, ...lines].join('\n');
}
