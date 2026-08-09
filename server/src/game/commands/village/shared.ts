import { db } from '../../../db/client.js';
import type { VillageRow } from '../../../db/types.js';
import { findVillageByCharacterMembership } from '../../village/VillageService.js';
import type { CommandContext } from '../context.js';

export type LordCheck = { ok: true; village: VillageRow } | { ok: false; error: string };

export function requireLord(ctx: CommandContext): LordCheck {
  const village = findVillageByCharacterMembership(ctx.session.characterId);
  if (!village) return { ok: false, error: '소속된 마을이 없습니다.' };
  if (village.lord_character_id !== ctx.session.characterId) {
    return { ok: false, error: '영주만 사용할 수 있는 명령입니다.' };
  }
  return { ok: true, village };
}

export function lordName(characterId: number): string {
  const row = db.prepare('SELECT name FROM characters WHERE id = ?').get(characterId) as { name: string } | undefined;
  return row?.name ?? '알 수 없음';
}
