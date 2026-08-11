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
  deal_type: NpcDealType;
  zone_max_level: number | null;
}

/** 존에 레벨 범위가 지정되지 않았을 때(예: 백필 전) NPC에 적용할 기본 레벨. */
const DEFAULT_NPC_LEVEL = 1;

const npcs = new Map<number, NpcInstance>();

function toNpcInstance(row: NpcSpawnRow): NpcInstance {
  return {
    spawnId: row.spawn_id,
    templateId: row.template_id,
    roomId: row.room_id,
    name: row.name,
    description: row.description,
    type: row.type,
    level: row.zone_max_level ?? DEFAULT_NPC_LEVEL,
    dealType: row.deal_type,
  };
}

/** NPC는 자체 레벨을 갖지 않고, 배치된 방이 속한 존의 최대 레벨을 그대로 따른다. */
function getRoomZoneMaxLevel(roomId: number): number | null {
  const row = db
    .prepare(`SELECT z.max_level as max_level FROM rooms r JOIN zones z ON z.id = r.zone_id WHERE r.id = ?`)
    .get(roomId) as { max_level: number | null } | undefined;
  return row?.max_level ?? null;
}

export function loadNpcs(): void {
  npcs.clear();

  const rows = db
    .prepare(
      `SELECT ns.id as spawn_id, ns.room_id,
              nt.id as template_id, nt.name, nt.description, nt.type, nt.deal_type,
              z.max_level as zone_max_level
       FROM npc_spawns ns
       JOIN npc_templates nt ON nt.id = ns.npc_template_id
       JOIN rooms r ON r.id = ns.room_id
       JOIN zones z ON z.id = r.zone_id`,
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
    deal_type: template.deal_type,
    zone_max_level: getRoomZoneMaxLevel(roomId),
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
