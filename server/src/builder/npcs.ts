import { z } from 'zod';
import { db } from '../db/client.js';
import { toNpcTemplateDto } from '../db/dto.js';
import type { NpcTemplateRow } from '../db/types.js';
import { despawnNpc, registerNpcSpawn } from '../game/NpcManager.js';
import { broadcastRoomSnapshot } from '../game/roomSnapshot.js';
import { getRoom } from '../game/World.js';
import { builderRouter } from './router.js';

builderRouter.get('/npc-templates', (_req, res) => {
  const rows = db.prepare('SELECT * FROM npc_templates ORDER BY id').all() as NpcTemplateRow[];
  res.json({ npcTemplates: rows.map(toNpcTemplateDto) });
});

builderRouter.get('/npc-spawns', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT ns.id, ns.room_id, ns.npc_template_id, r.name as room_name, nt.name as npc_name
       FROM npc_spawns ns JOIN rooms r ON r.id = ns.room_id JOIN npc_templates nt ON nt.id = ns.npc_template_id
       ORDER BY ns.id`,
    )
    .all() as {
    id: number;
    room_id: number;
    npc_template_id: number;
    room_name: string;
    npc_name: string;
  }[];

  res.json({
    npcSpawns: rows.map((row) => ({
      id: row.id,
      roomId: row.room_id,
      roomName: row.room_name,
      npcTemplateId: row.npc_template_id,
      npcName: row.npc_name,
    })),
  });
});

const npcSpawnSchema = z.object({
  roomId: z.number().int(),
  npcTemplateId: z.number().int(),
});

builderRouter.post('/npc-spawns', (req, res) => {
  const parsed = npcSpawnSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const { roomId, npcTemplateId } = parsed.data;
  if (!getRoom(roomId)) {
    res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    return;
  }

  const template = db.prepare('SELECT * FROM npc_templates WHERE id = ?').get(npcTemplateId) as
    | NpcTemplateRow
    | undefined;
  if (!template) {
    res.status(404).json({ error: 'NPC 템플릿을 찾을 수 없습니다.' });
    return;
  }

  const info = db.prepare('INSERT INTO npc_spawns (room_id, npc_template_id) VALUES (?, ?)').run(roomId, npcTemplateId);
  const spawnId = Number(info.lastInsertRowid);

  registerNpcSpawn(spawnId, roomId, template);
  broadcastRoomSnapshot(roomId);

  res.status(201).json({ spawnId });
});

builderRouter.delete('/npc-spawns/:id', (req, res) => {
  const spawnId = Number(req.params.id);
  const row = db.prepare('SELECT room_id FROM npc_spawns WHERE id = ?').get(spawnId) as { room_id: number } | undefined;

  db.prepare('DELETE FROM npc_spawns WHERE id = ?').run(spawnId);
  despawnNpc(spawnId);
  if (row) broadcastRoomSnapshot(row.room_id);

  res.status(204).send();
});
