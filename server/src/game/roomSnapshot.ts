import type { WebSocket } from 'ws';
import { DIRECTION_LABELS, type ItemGrade, type RoomSnapshot, type VillageInfo } from '@mud/shared';
import { db } from '../db/client.js';
import type { CommandContext } from './commands/context.js';
import { getMobsInRoom } from './MobManager.js';
import { getNpcsInRoom } from './NpcManager.js';
import { getSessionsInRoom } from './sessionRegistry.js';
import { BUILDING_CATALOG, findVillageByRoomId, getVillagePlots } from './village/VillageService.js';
import { getRoom } from './World.js';
import { send } from './wsUtil.js';

interface RoomItemQueryRow {
  name: string;
  quantity: number;
  grade: ItemGrade;
}

function buildVillageInfo(roomId: number): VillageInfo | undefined {
  const village = findVillageByRoomId(roomId);
  if (!village) return undefined;

  const lord = db.prepare('SELECT name FROM characters WHERE id = ?').get(village.lord_character_id) as
    | { name: string }
    | undefined;

  const plots = getVillagePlots(village.id).map((plot) => ({
    index: plot.plot_index,
    buildingType: plot.building_type,
    buildingName: plot.building_type ? BUILDING_CATALOG[plot.building_type].name : null,
  }));

  return {
    name: village.name,
    lordName: lord?.name ?? '알 수 없음',
    level: village.level,
    gold: village.gold,
    wood: village.wood,
    ore: village.ore,
    food: village.food,
    tithePercent: village.tithe_percent,
    raidProtectedUntil: village.raid_protected_until,
    plots,
  };
}

export function buildRoomSnapshot(roomId: number, viewerWs?: WebSocket): RoomSnapshot | undefined {
  const room = getRoom(roomId);
  if (!room) return undefined;

  const exits = Object.entries(room.exits).map(([direction, exit]) => ({
    direction,
    label: DIRECTION_LABELS[direction] ?? direction,
    blocked: exit.blocked,
  }));

  const items = db
    .prepare(
      `SELECT i.name, i.grade, ri.quantity FROM room_items ri JOIN items i ON i.id = ri.item_id WHERE ri.room_id = ?`,
    )
    .all(roomId) as RoomItemQueryRow[];

  const mobs = getMobsInRoom(roomId).map((mob) => ({ name: mob.name, hp: mob.hp, maxHp: mob.maxHp, level: mob.level }));

  const npcs = getNpcsInRoom(roomId).map((npc) => ({ name: npc.name, type: npc.type }));

  const players = getSessionsInRoom(roomId)
    .filter((session) => session.ws !== viewerWs)
    .map((session) => session.characterName);

  const village = buildVillageInfo(roomId);

  return { id: room.id, name: room.name, description: room.description, exits, items, mobs, npcs, players, village };
}

export function sendRoomSnapshot(ctx: CommandContext): void {
  const snapshot = buildRoomSnapshot(ctx.session.roomId, ctx.session.ws);
  if (snapshot) ctx.send({ type: 'room', room: snapshot });
}

export function broadcastRoomSnapshot(roomId: number): void {
  for (const session of getSessionsInRoom(roomId)) {
    const snapshot = buildRoomSnapshot(roomId, session.ws);
    if (snapshot) send(session.ws, { type: 'room', room: snapshot });
  }
}
