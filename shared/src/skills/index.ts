import type { JobType } from '../jobs.js';
import { JOB_VALUES } from '../jobs.js';
import type { SkillDefinition } from './types.js';
import { WARRIOR_SKILLS } from './warrior.js';
import { ROGUE_SKILLS } from './rogue.js';
import { MAGE_SKILLS } from './mage.js';
import { PRIEST_SKILLS } from './priest.js';

export * from './types.js';

export const SKILLS: SkillDefinition[] = [...WARRIOR_SKILLS, ...ROGUE_SKILLS, ...MAGE_SKILLS, ...PRIEST_SKILLS];

export const SKILLS_BY_JOB: Record<JobType, SkillDefinition[]> = Object.fromEntries(
  JOB_VALUES.map((job) => [job, SKILLS.filter((skill) => skill.job === job)]),
) as Record<JobType, SkillDefinition[]>;

export function getSkillById(id: string): SkillDefinition | undefined {
  return SKILLS.find((skill) => skill.id === id);
}
