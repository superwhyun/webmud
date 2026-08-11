import { z } from 'zod';
import { NPC_DEAL_TYPE_VALUES, NPC_TYPE_VALUES } from '@mud/shared';
import { db } from '../db/client.js';
import { toNpcTemplateDto } from '../db/dto.js';
import type { NpcTemplateRow } from '../db/types.js';
import { adminRouter } from './router.js';

adminRouter.get('/npc-templates', (_req, res) => {
  const rows = db.prepare('SELECT * FROM npc_templates ORDER BY id').all() as NpcTemplateRow[];
  res.json({ npcTemplates: rows.map(toNpcTemplateDto) });
});

const npcTemplateSchema = z.object({
  name: z.string().min(1, '이름을 입력하세요.').max(30, '이름은 30자 이하여야 합니다.'),
  description: z.string().min(1, '설명을 입력하세요.').max(200, '설명은 200자 이하여야 합니다.'),
  type: z.enum(NPC_TYPE_VALUES as [string, ...string[]], { message: '올바른 종류가 아닙니다.' }),
  dealType: z.enum(NPC_DEAL_TYPE_VALUES as [string, ...string[]], { message: '올바른 취급 품목이 아닙니다.' }),
});

adminRouter.post('/npc-templates', (req, res) => {
  const parsed = npcTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const d = parsed.data;
  const info = db
    .prepare('INSERT INTO npc_templates (name, description, type, deal_type) VALUES (?, ?, ?, ?)')
    .run(d.name, d.description, d.type, d.dealType);

  const row = db.prepare('SELECT * FROM npc_templates WHERE id = ?').get(Number(info.lastInsertRowid)) as NpcTemplateRow;
  res.status(201).json({ npcTemplate: toNpcTemplateDto(row) });
});

adminRouter.patch('/npc-templates/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM npc_templates WHERE id = ?').get(id)) {
    res.status(404).json({ error: 'NPC를 찾을 수 없습니다.' });
    return;
  }

  const parsed = npcTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const d = parsed.data;
  db.prepare('UPDATE npc_templates SET name = ?, description = ?, type = ?, deal_type = ? WHERE id = ?').run(
    d.name,
    d.description,
    d.type,
    d.dealType,
    id,
  );

  const row = db.prepare('SELECT * FROM npc_templates WHERE id = ?').get(id) as NpcTemplateRow;
  res.json({ npcTemplate: toNpcTemplateDto(row) });
});

adminRouter.delete('/npc-templates/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM npc_templates WHERE id = ?').get(id)) {
    res.status(404).json({ error: 'NPC를 찾을 수 없습니다.' });
    return;
  }

  const inUse = db.prepare('SELECT COUNT(*) as count FROM npc_spawns WHERE npc_template_id = ?').get(id) as {
    count: number;
  };
  if (inUse.count > 0) {
    res.status(409).json({ error: '맵에 배치된 NPC는 삭제할 수 없습니다. 먼저 배치를 제거하세요.' });
    return;
  }

  db.prepare('DELETE FROM npc_templates WHERE id = ?').run(id);
  res.status(204).send();
});
