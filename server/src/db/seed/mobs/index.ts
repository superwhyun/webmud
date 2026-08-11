import type { MobTemplateSeed } from '../types.js';
import { MOB_TEMPLATES_TIER1 } from './tier1.js';
import { MOB_TEMPLATES_TIER2 } from './tier2.js';
import { MOB_TEMPLATES_TIER3 } from './tier3.js';
import { MOB_LOOT_POOL_BASE } from './lootPool.js';

export const MOB_TEMPLATES: MobTemplateSeed[] = [...MOB_TEMPLATES_TIER1, ...MOB_TEMPLATES_TIER2, ...MOB_TEMPLATES_TIER3];
export { MOB_SPAWNS } from './spawns.js';
export const MOB_LOOT_POOL = MOB_LOOT_POOL_BASE;
export { suffixForLevel } from '@mud/shared';
export {
  computeMobStatsForLevel,
  randomLevelInRange,
  randomSpeciesSelection,
  SPECIES_NAMES,
  speciesAnchorId,
} from './interpolated.js';
