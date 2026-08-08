import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_SQL } from './schema.js';
import { seed } from './seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', '..', 'data');
mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH ?? join(dataDir, 'mud.sqlite');

export const db = new Database(dbPath);
db.pragma('busy_timeout = 5000');
db.pragma('journal_mode = WAL');
db.exec(SCHEMA_SQL);

function ensureColumn(target: Database.Database, table: string, column: string, ddl: string): void {
  const columns = target.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) target.exec(ddl);
}

function migrate(target: Database.Database): void {
  ensureColumn(target, 'room_exits', 'blocked', 'ALTER TABLE room_exits ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0');
  ensureColumn(target, 'rooms', 'x', 'ALTER TABLE rooms ADD COLUMN x INTEGER NOT NULL DEFAULT 0');
  ensureColumn(target, 'rooms', 'y', 'ALTER TABLE rooms ADD COLUMN y INTEGER NOT NULL DEFAULT 0');
  ensureColumn(target, 'items', 'slot', 'ALTER TABLE items ADD COLUMN slot TEXT');
  ensureColumn(target, 'items', 'level', 'ALTER TABLE items ADD COLUMN level INTEGER NOT NULL DEFAULT 1');
  ensureColumn(target, 'items', 'grade', "ALTER TABLE items ADD COLUMN grade TEXT NOT NULL DEFAULT 'low'");
  ensureColumn(
    target,
    'items',
    'attack_power_bonus',
    'ALTER TABLE items ADD COLUMN attack_power_bonus INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(target, 'items', 'mana_amount', 'ALTER TABLE items ADD COLUMN mana_amount INTEGER NOT NULL DEFAULT 0');
  ensureColumn(target, 'characters', 'mp', 'ALTER TABLE characters ADD COLUMN mp INTEGER NOT NULL DEFAULT 0');
  ensureColumn(target, 'characters', 'max_mp', 'ALTER TABLE characters ADD COLUMN max_mp INTEGER NOT NULL DEFAULT 0');
  ensureColumn(target, 'characters', 'job', 'ALTER TABLE characters ADD COLUMN job TEXT');
  ensureColumn(
    target,
    'characters',
    'intelligence',
    'ALTER TABLE characters ADD COLUMN intelligence INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(
    target,
    'characters',
    'vitality',
    'ALTER TABLE characters ADD COLUMN vitality INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(target, 'characters', 'wisdom', 'ALTER TABLE characters ADD COLUMN wisdom INTEGER NOT NULL DEFAULT 0');
  ensureColumn(target, 'characters', 'luck', 'ALTER TABLE characters ADD COLUMN luck INTEGER NOT NULL DEFAULT 0');
  ensureColumn(
    target,
    'characters',
    'unallocated_stat_points',
    'ALTER TABLE characters ADD COLUMN unallocated_stat_points INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(
    target,
    'characters',
    'unallocated_skill_points',
    'ALTER TABLE characters ADD COLUMN unallocated_skill_points INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(target, 'mob_templates', 'level', 'ALTER TABLE mob_templates ADD COLUMN level INTEGER NOT NULL DEFAULT 1');
  ensureColumn(target, 'mob_templates', 'hostile', 'ALTER TABLE mob_templates ADD COLUMN hostile INTEGER NOT NULL DEFAULT 1');
  ensureColumn(target, 'mob_loot_pool', 'weight', 'ALTER TABLE mob_loot_pool ADD COLUMN weight INTEGER NOT NULL DEFAULT 1');
}

interface ExitEdgeRow {
  room_id: number;
  direction: string;
  target_room_id: number;
}

const GRID_OFFSET: Record<string, [number, number]> = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
};

/** One-time backfill: derives grid coordinates from the existing cardinal exit graph for rooms created before positions existed. */
function backfillRoomPositions(target: Database.Database): void {
  const positioned = target.prepare('SELECT COUNT(*) as c FROM rooms WHERE x != 0 OR y != 0').get() as { c: number };
  if (positioned.c > 0) return;

  const rooms = target.prepare('SELECT id FROM rooms').all() as { id: number }[];
  if (rooms.length === 0) return;

  const edges = target
    .prepare(
      `SELECT room_id, direction, target_room_id FROM room_exits WHERE direction IN ('north','south','east','west')`,
    )
    .all() as ExitEdgeRow[];

  const edgesByRoom = new Map<number, ExitEdgeRow[]>();
  for (const edge of edges) {
    const list = edgesByRoom.get(edge.room_id) ?? [];
    list.push(edge);
    edgesByRoom.set(edge.room_id, list);
  }

  const positions = new Map<number, [number, number]>();
  positions.set(rooms[0].id, [0, 0]);
  const queue = [rooms[0].id];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const [cx, cy] = positions.get(currentId)!;
    for (const edge of edgesByRoom.get(currentId) ?? []) {
      if (positions.has(edge.target_room_id)) continue;
      const [dx, dy] = GRID_OFFSET[edge.direction];
      positions.set(edge.target_room_id, [cx + dx, cy + dy]);
      queue.push(edge.target_room_id);
    }
  }

  let nextRow = 0;
  for (const [, y] of positions.values()) nextRow = Math.max(nextRow, y + 2);
  let col = 0;
  for (const room of rooms) {
    if (!positions.has(room.id)) {
      positions.set(room.id, [col, nextRow]);
      col += 1;
    }
  }

  const updatePosition = target.prepare('UPDATE rooms SET x = ?, y = ? WHERE id = ?');
  const tx = target.transaction(() => {
    for (const [id, [x, y]] of positions) updatePosition.run(x, y, id);
  });
  tx();
}

migrate(db);
seed(db);
backfillRoomPositions(db);
