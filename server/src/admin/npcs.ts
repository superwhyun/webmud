import type { Router } from 'express';
import { parseBody } from '../http/validation.js';
import { npcTemplateSchema } from '../content/npcsSchema.js';
import { db } from '../db/client.js';
import { toNpcTemplateDto } from '../db/dto.js';
import type { NpcTemplateRow } from '../db/types.js';

export function registerNpcsRoutes(adminRouter: Router): void {
  adminRouter.get('/npc-templates', (_req, res) => {
    const rows = db.prepare('SELECT * FROM npc_templates ORDER BY id').all() as NpcTemplateRow[];
    res.json({ npcTemplates: rows.map(toNpcTemplateDto) });
  });

  adminRouter.post('/npc-templates', (req, res) => {
    const parsed = parseBody(npcTemplateSchema, req.body, res);
    if (!parsed) return;

    const d = parsed;
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

    const parsed = parseBody(npcTemplateSchema, req.body, res);
    if (!parsed) return;

    const d = parsed;
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
}
