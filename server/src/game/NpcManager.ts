import type { NpcDealType, NpcType } from '@mud/shared';
import { db } from '../db/client.js';
import type { NpcTemplateRow } from '../db/types.js';

export interface NpcInstance {
  spawnId: number;
  templateId: number;
  roomId: number;
  name: string;
  description: string;
  type: NpcType;
  level: number;
  dealType: NpcDealType;
}

interface NpcSpawnRow {
  spawn_id: number;
  room_id: number;
  template_id: number;
  name: string;
  description: string;
  type: NpcType;
  level: number;
  deal_type: NpcDealType;
}

const npcs = new Map<number, NpcInstance>();

function toNpcInstance(row: NpcSpawnRow): NpcInstance {
  return {
    spawnId: row.spawn_id,
    templateId: row.template_id,
    roomId: row.room_id,
    name: row.name,
    description: row.description,
    type: row.type,
    level: row.level,
    dealType: row.deal_type,
  };
}

export function loadNpcs(): void {
  npcs.clear();

  const rows = db
    .prepare(
      `SELECT ns.id as spawn_id, ns.room_id,
              nt.id as template_id, nt.name, nt.description, nt.type, nt.level, nt.deal_type
       FROM npc_spawns ns
       JOIN npc_templates nt ON nt.id = ns.npc_template_id`,
    )
    .all() as NpcSpawnRow[];

  for (const row of rows) {
    npcs.set(row.spawn_id, toNpcInstance(row));
  }
}

/** Registers a newly placed NPC spawn without reloading (and resetting) the rest of the world's NPCs. */
export function registerNpcSpawn(spawnId: number, roomId: number, template: NpcTemplateRow): NpcInstance {
  const instance = toNpcInstance({
    spawn_id: spawnId,
    room_id: roomId,
    template_id: template.id,
    name: template.name,
    description: template.description,
    type: template.type,
    level: template.level,
    deal_type: template.deal_type,
  });
  npcs.set(spawnId, instance);
  return instance;
}

export function despawnNpc(spawnId: number): void {
  npcs.delete(spawnId);
}

export function getNpcsInRoom(roomId: number): NpcInstance[] {
  return [...npcs.values()].filter((npc) => npc.roomId === roomId);
}

export function findNpcInRoomByName(roomId: number, nameQuery: string): NpcInstance | undefined {
  const lower = nameQuery.toLowerCase();
  return getNpcsInRoom(roomId).find((npc) => npc.name.toLowerCase().includes(lower));
}

loadNpcs();
