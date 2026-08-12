import { db } from '../../db/client.js';

/** Village anchor rooms are excluded from the assistant just like the builder grid (see rooms.ts). */
const NON_VILLAGE_ROOMS_SQL = 'id NOT IN (SELECT room_id FROM villages)';

export interface ZoneSnapshotRoomDto {
  id: number;
  name: string;
  description: string;
  x: number;
  y: number;
  mobs: { mobTemplateId: number; name: string; respawnSeconds: number }[];
  items: { itemId: number; name: string; grade: string; quantity: number }[];
  npcs: { npcTemplateId: number; name: string }[];
}

export interface ZoneSnapshotMobTemplateDto {
  id: number;
  name: string;
  minLevel: number;
  maxLevel: number;
}

export interface ZoneSnapshotItemTemplateDto {
  id: number;
  name: string;
  grade: string;
  level: number;
}

export interface ZoneSnapshotNpcTemplateDto {
  id: number;
  name: string;
  description: string;
  type: string;
  dealType: string;
}

export interface ZoneSnapshotDto {
  zoneId: number;
  zoneName: string;
  zoneDescription: string;
  zoneMinLevel: number | null;
  zoneMaxLevel: number | null;
  rooms: ZoneSnapshotRoomDto[];
  /** Pre-filtered to templates whose level range overlaps the zone's level range (when the zone has one set), so the LLM doesn't have to guess which mobs belong here. */
  availableMobTemplates: ZoneSnapshotMobTemplateDto[];
  availableItemTemplates: ZoneSnapshotItemTemplateDto[];
  availableNpcTemplates: ZoneSnapshotNpcTemplateDto[];
}

/** Builds a compact JSON view of a zone's current room/mob/item/npc layout, plus the template catalogs the LLM may reference by id. */
export function buildZoneSnapshot(zoneId: number): ZoneSnapshotDto | null {
  const zone = db.prepare('SELECT id, name, description, min_level, max_level FROM zones WHERE id = ?').get(zoneId) as
    | { id: number; name: string; description: string; min_level: number | null; max_level: number | null }
    | undefined;
  if (!zone) return null;

  const roomRows = db
    .prepare(`SELECT id, name, description, x, y FROM rooms WHERE zone_id = ? AND ${NON_VILLAGE_ROOMS_SQL}`)
    .all(zoneId) as { id: number; name: string; description: string; x: number; y: number }[];

  const roomIds = roomRows.map((r) => r.id);
  const mobsByRoom = new Map<number, ZoneSnapshotRoomDto['mobs']>();
  const itemsByRoom = new Map<number, ZoneSnapshotRoomDto['items']>();
  const npcsByRoom = new Map<number, ZoneSnapshotRoomDto['npcs']>();

  if (roomIds.length > 0) {
    const placeholders = roomIds.map(() => '?').join(',');

    const mobRows = db
      .prepare(
        `SELECT ms.room_id, ms.mob_template_id, ms.respawn_seconds, mt.name as mob_name
         FROM mob_spawns ms JOIN mob_templates mt ON mt.id = ms.mob_template_id
         WHERE ms.room_id IN (${placeholders})`,
      )
      .all(...roomIds) as { room_id: number; mob_template_id: number; respawn_seconds: number; mob_name: string }[];
    for (const row of mobRows) {
      const list = mobsByRoom.get(row.room_id) ?? [];
      list.push({ mobTemplateId: row.mob_template_id, name: row.mob_name, respawnSeconds: row.respawn_seconds });
      mobsByRoom.set(row.room_id, list);
    }

    const itemRows = db
      .prepare(
        `SELECT ri.room_id, ri.item_id, ri.quantity, i.name as item_name, i.grade as item_grade
         FROM room_items ri JOIN items i ON i.id = ri.item_id
         WHERE ri.room_id IN (${placeholders})`,
      )
      .all(...roomIds) as { room_id: number; item_id: number; quantity: number; item_name: string; item_grade: string }[];
    for (const row of itemRows) {
      const list = itemsByRoom.get(row.room_id) ?? [];
      list.push({ itemId: row.item_id, name: row.item_name, grade: row.item_grade, quantity: row.quantity });
      itemsByRoom.set(row.room_id, list);
    }

    const npcRows = db
      .prepare(
        `SELECT ns.room_id, ns.npc_template_id, nt.name as npc_name
         FROM npc_spawns ns JOIN npc_templates nt ON nt.id = ns.npc_template_id
         WHERE ns.room_id IN (${placeholders})`,
      )
      .all(...roomIds) as { room_id: number; npc_template_id: number; npc_name: string }[];
    for (const row of npcRows) {
      const list = npcsByRoom.get(row.room_id) ?? [];
      list.push({ npcTemplateId: row.npc_template_id, name: row.npc_name });
      npcsByRoom.set(row.room_id, list);
    }
  }

  const rooms: ZoneSnapshotRoomDto[] = roomRows.map((room) => ({
    id: room.id,
    name: room.name,
    description: room.description,
    x: room.x,
    y: room.y,
    mobs: mobsByRoom.get(room.id) ?? [],
    items: itemsByRoom.get(room.id) ?? [],
    npcs: npcsByRoom.get(room.id) ?? [],
  }));

  const allMobTemplates = db
    .prepare('SELECT id, name, min_level, max_level FROM mob_templates ORDER BY min_level, id')
    .all() as { id: number; name: string; min_level: number; max_level: number }[];

  // Only offer mobs whose level range overlaps the zone's level range. Zones without a level range
  // configured (minLevel/maxLevel both null) get the full roster since there's nothing to filter against.
  const levelFilteredMobTemplates =
    zone.min_level !== null && zone.max_level !== null
      ? allMobTemplates.filter((t) => t.max_level >= zone.min_level! && t.min_level <= zone.max_level!)
      : allMobTemplates;

  const availableItemTemplates = db.prepare('SELECT id, name, grade, level FROM items ORDER BY id').all() as {
    id: number;
    name: string;
    grade: string;
    level: number;
  }[];

  const availableNpcTemplates = db
    .prepare('SELECT id, name, description, type, deal_type FROM npc_templates ORDER BY id')
    .all() as { id: number; name: string; description: string; type: string; deal_type: string }[];

  return {
    zoneId: zone.id,
    zoneName: zone.name,
    zoneDescription: zone.description,
    zoneMinLevel: zone.min_level,
    zoneMaxLevel: zone.max_level,
    rooms,
    availableMobTemplates: levelFilteredMobTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      minLevel: t.min_level,
      maxLevel: t.max_level,
    })),
    availableItemTemplates,
    availableNpcTemplates: availableNpcTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      type: t.type,
      dealType: t.deal_type,
    })),
  };
}
