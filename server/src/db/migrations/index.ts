import type Database from 'better-sqlite3';
import { migrateSchema } from './schema.js';
import { seed } from '../seed/index.js';
import { backfillMissingItems } from './items.js';
import {
  backfillMissingMobTemplates,
  collapseLevelingSpeciesAnchors,
  backfillNarrowLevelingSpeciesTier1,
  backfillZoneSpeciesTiers,
  backfillLevelScaledLootPool,
  backfillGoblinManaPotionLoot,
  backfillRemoveLegacyInterpolatedMobTemplates,
} from './mobs.js';
import { backfillRoomPositions } from './positions.js';
import { backfillProgressionZones, backfillZoneLevelRanges, backfillZoneEnrichment } from './world.js';
import { backfillNpcTemplates } from './npcs.js';

/** Order is part of the migration contract: schema, initial seed, then legacy backfills. */
export function initializeDatabase(target: Database.Database): void {
  migrateSchema(target);
  seed(target);
  backfillMissingItems(target);
  backfillMissingMobTemplates(target);
  backfillRoomPositions(target);
  backfillProgressionZones(target);
  backfillZoneLevelRanges(target);
  backfillZoneEnrichment(target);
  collapseLevelingSpeciesAnchors(target);
  backfillNarrowLevelingSpeciesTier1(target);
  backfillZoneSpeciesTiers(target);
  backfillLevelScaledLootPool(target);
  backfillGoblinManaPotionLoot(target);
  backfillRemoveLegacyInterpolatedMobTemplates(target);
  backfillNpcTemplates(target);
}
