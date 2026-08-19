import type { ElementType, JobType, SkillDefinition } from '@mud/shared';

export const JOB_SKILL_ART: Readonly<Record<JobType, string>> = {
  warrior: '/skills/job-warrior.png',
  rogue: '/skills/job-rogue.png',
  mage: '/skills/job-mage.png',
  priest: '/skills/job-priest.png',
};

export const ELEMENT_SKILL_ART: Readonly<Record<ElementType, string>> = {
  wood: '/skills/element-wood.png',
  fire: '/skills/element-fire.png',
  earth: '/skills/element-earth.png',
  metal: '/skills/element-metal.png',
  water: '/skills/element-water.png',
};

/** 공통 스킬은 직업 문장, 분기 스킬은 해당 오행 문장을 공유한다. */
export function skillArtPath(skill: Pick<SkillDefinition, 'element' | 'job'>): string {
  return skill.element ? ELEMENT_SKILL_ART[skill.element] : JOB_SKILL_ART[skill.job];
}
