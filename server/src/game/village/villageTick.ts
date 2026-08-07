import { db } from '../../db/client.js';
import type { BuildingType, VillageRow } from '../../db/types.js';
import { broadcastRoomSnapshot } from '../roomSnapshot.js';
import { BUILDING_CATALOG } from './VillageService.js';

const TICK_MS = 60_000;

interface PlotBuildingRow {
  building_type: BuildingType;
}

export function runVillageProductionTick(): void {
  const villages = db.prepare('SELECT * FROM villages').all() as VillageRow[];

  for (const village of villages) {
    const plots = db
      .prepare('SELECT building_type FROM village_plots WHERE village_id = ? AND building_type IS NOT NULL')
      .all(village.id) as PlotBuildingRow[];

    const produced = { wood: 0, ore: 0, food: 0 };
    for (const plot of plots) {
      const definition = BUILDING_CATALOG[plot.building_type];
      if (definition?.resource && definition.output) {
        produced[definition.resource] += definition.output;
      }
    }

    if (produced.wood === 0 && produced.ore === 0 && produced.food === 0) continue;

    db.prepare('UPDATE villages SET wood = wood + ?, ore = ore + ?, food = food + ? WHERE id = ?').run(
      produced.wood,
      produced.ore,
      produced.food,
      village.id,
    );
    broadcastRoomSnapshot(village.room_id);
  }
}

export function startVillageTick(): void {
  setInterval(runVillageProductionTick, TICK_MS);
}
