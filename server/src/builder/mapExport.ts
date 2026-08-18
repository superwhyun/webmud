import { z } from 'zod';
import { db } from '../db/client.js';
import { loadMobs } from '../game/MobManager.js';
import { loadNpcs } from '../game/NpcManager.js';
import { loadWorld } from '../game/World.js';
import { requireAdmin } from '../auth/middleware.js';
import { builderRouter } from './router.js';

/**
 * 계정/캐릭터 등 플레이어 데이터는 절대 포함하지 않는다 — 이 export/import는 존/방/포털/스폰과
 * 그것들이 참조하는 템플릿(아이템/몹/NPC)만을 대상으로 하는 "콘텐츠" 스냅샷이다.
 * INSERT 순서 = 부모 먼저(zones/items/mob_templates/npc_templates -> rooms -> 나머지 스폰류).
 * DELETE는 정확히 이 반대 순서로 해야 FK가 걸린 자식 행이 먼저 지워진다.
 */
const CONTENT_TABLES_INSERT_ORDER = [
  'zones',
  'items',
  'mob_templates',
  'npc_templates',
  'rooms',
  'room_exits',
  'mob_spawns',
  'npc_spawns',
  'room_items',
  'mob_loot_pool',
] as const;

type ContentTable = (typeof CONTENT_TABLES_INSERT_ORDER)[number];
type TableRow = Record<string, unknown>;
type MapExportPayload = Record<ContentTable, TableRow[]>;

const mapImportSchema = z.object({
  version: z.number().int(),
  exportedAt: z.string(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

builderRouter.get('/map-export', (_req, res) => {
  const tables = {} as MapExportPayload;
  for (const table of CONTENT_TABLES_INSERT_ORDER) {
    tables[table] = db.prepare(`SELECT * FROM ${table}`).all() as TableRow[];
  }

  res.json({ version: 1, exportedAt: new Date().toISOString(), tables });
});

/** 가져오기 이후 새로 만드는 콘텐츠가 옛 id와 충돌하지 않도록, id 컬럼을 쓰는 테이블은 시퀀스를 가져온 최대 id로 맞춰준다. */
function resyncAutoIncrement(table: string): void {
  const row = db.prepare(`SELECT MAX(id) as maxId FROM ${table}`).get() as { maxId: number | null };
  if (row.maxId === null) return;
  db.prepare('UPDATE sqlite_sequence SET seq = ? WHERE name = ?').run(row.maxId, table);
}

builderRouter.post('/map-import', requireAdmin, (req, res) => {
  const parsed = mapImportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? '올바르지 않은 파일입니다.' });
    return;
  }

  const { tables } = parsed.data;
  for (const table of CONTENT_TABLES_INSERT_ORDER) {
    if (!Array.isArray(tables[table])) {
      res.status(400).json({ error: `"${table}" 데이터가 없습니다. 맵 export 파일이 맞는지 확인하세요.` });
      return;
    }
  }

  const tx = db.transaction(() => {
    // characters.room_id, inventory_items.item_id 등 콘텐츠 테이블 밖에서 걸어오는 FK가 있어서,
    // 삭제 시점엔 일시적으로 끊어졌다가 같은 id로 다시 채워 넣으면 맞아떨어진다. defer_foreign_keys는
    // 검사를 커밋 시점으로 미뤄줘서 이 delete-then-reinsert 패턴이 statement 단위로 막히지 않게 한다.
    db.pragma('defer_foreign_keys = ON');
    for (const table of [...CONTENT_TABLES_INSERT_ORDER].reverse()) {
      db.prepare(`DELETE FROM ${table}`).run();
    }

    for (const table of CONTENT_TABLES_INSERT_ORDER) {
      const rows = tables[table] as TableRow[];
      if (rows.length === 0) continue;
      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const insert = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);
      for (const row of rows) insert.run(...columns.map((column) => row[column]));
      if (columns.includes('id')) resyncAutoIncrement(table);
    }
  });
  tx();

  // 방/몹/NPC는 인메모리 캐시로도 관리되므로, DB를 통째로 갈아끼운 뒤엔 재시작 없이 다시 로드해줘야 한다.
  loadWorld();
  loadMobs();
  loadNpcs();

  res.status(200).json({ ok: true });
});
