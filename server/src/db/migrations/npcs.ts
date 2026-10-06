import type Database from 'better-sqlite3';
import { NPC_SPAWNS, NPC_TEMPLATES } from '../seed/npcs.js';

/**
 * npcs.ts가 상인 1명짜리 구성에서 5개 타입(상인/대장장이/여관지기/훈련관/원로 및 문지기)을 아우르는
 * 9명 구성으로 새로 짜였는데, seed()는 rooms가 이미 있는 기존 DB에서는 다시 실행되지 않아 npc_templates/
 * npc_spawns가 옛날 값(구대륙 초기 상인 1명 + 테스트용 NPC)에 머물러 있었다. 두 테이블 다 이 9명
 * 구성 하나만 쓰므로, 통째로 비우고 새로 채운다. 이미 적용됐으면(문지기 로건이 있으면) 건너뛴다.
 */
export function backfillNpcTemplates(target: Database.Database): void {
  const alreadyApplied = target.prepare("SELECT id FROM npc_templates WHERE name = '문지기 로건'").get();
  if (alreadyApplied) return;

  const insertTemplate = target.prepare(
    'INSERT INTO npc_templates (id, name, description, type, deal_type) VALUES (?, ?, ?, ?, ?)',
  );
  const insertSpawn = target.prepare('INSERT INTO npc_spawns (room_id, npc_template_id) VALUES (?, ?)');

  const tx = target.transaction(() => {
    target.prepare('DELETE FROM npc_spawns').run();
    target.prepare('DELETE FROM npc_templates').run();
    for (const template of NPC_TEMPLATES) {
      insertTemplate.run(template.id, template.name, template.description, template.type, template.dealType);
    }
    for (const spawn of NPC_SPAWNS) insertSpawn.run(spawn.roomId, spawn.npcTemplateId);
  });
  tx();
}
