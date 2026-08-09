import { db } from '../../../db/client.js';
import type { VillageMemberRow, VillageRow } from '../../../db/types.js';
import { despawnMob, getMobsInRoom } from '../../MobManager.js';
import { unregisterRoom } from '../../World.js';
import { findVillageByCharacterMembership, findVillageByName } from './villageCore.js';

export interface JoinResult {
  success: boolean;
  error?: string;
  village?: VillageRow;
}

export function joinVillage(characterId: number, villageName: string): JoinResult {
  const trimmed = villageName.trim();
  if (!trimmed) {
    return { success: false, error: '가입할 마을 이름을 입력하세요. 사용법: village join <마을이름>' };
  }

  const village = findVillageByName(trimmed);
  if (!village) {
    return { success: false, error: '그런 이름의 마을이 없습니다.' };
  }
  if (findVillageByCharacterMembership(characterId)) {
    return { success: false, error: '이미 소속된 마을이 있습니다. 먼저 village quit으로 탈퇴하세요.' };
  }

  db.prepare('INSERT INTO village_members (village_id, character_id, role) VALUES (?, ?, ?)').run(
    village.id,
    characterId,
    'member',
  );

  return { success: true, village };
}

export interface QuitResult {
  success: boolean;
  error?: string;
  village?: VillageRow;
}

export function quitVillage(characterId: number): QuitResult {
  const village = findVillageByCharacterMembership(characterId);
  if (!village) {
    return { success: false, error: '소속된 마을이 없습니다.' };
  }
  if (village.lord_character_id === characterId) {
    return { success: false, error: '영주는 마을을 탈퇴할 수 없습니다.' };
  }

  db.prepare('DELETE FROM village_members WHERE character_id = ?').run(characterId);

  return { success: true, village };
}

export interface VillageMemberWithName extends VillageMemberRow {
  character_name: string;
}

export function getVillageMembers(villageId: number): VillageMemberWithName[] {
  return db
    .prepare(
      `SELECT vm.*, c.name as character_name FROM village_members vm
       JOIN characters c ON c.id = vm.character_id
       WHERE vm.village_id = ?
       ORDER BY (vm.role = 'lord') DESC, vm.joined_at ASC`,
    )
    .all(villageId) as VillageMemberWithName[];
}

export interface TransferResult {
  success: boolean;
  error?: string;
  newLordName?: string;
}

export function transferLordship(village: VillageRow, toName: string): TransferResult {
  const trimmed = toName.trim();
  if (!trimmed) {
    return { success: false, error: '위임할 마을원 이름을 입력하세요. 사용법: village transfer <이름>' };
  }

  const targetCharacter = db.prepare('SELECT id, name FROM characters WHERE name = ?').get(trimmed) as
    | { id: number; name: string }
    | undefined;
  if (!targetCharacter) {
    return { success: false, error: '그런 캐릭터가 없습니다.' };
  }
  if (targetCharacter.id === village.lord_character_id) {
    return { success: false, error: '이미 영주입니다.' };
  }

  const targetMembership = db
    .prepare('SELECT id FROM village_members WHERE village_id = ? AND character_id = ?')
    .get(village.id, targetCharacter.id);
  if (!targetMembership) {
    return { success: false, error: `${targetCharacter.name}님은 이 마을 소속이 아닙니다.` };
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE villages SET lord_character_id = ? WHERE id = ?').run(targetCharacter.id, village.id);
    db.prepare("UPDATE village_members SET role = 'member' WHERE village_id = ? AND character_id = ?").run(
      village.id,
      village.lord_character_id,
    );
    db.prepare("UPDATE village_members SET role = 'lord' WHERE village_id = ? AND character_id = ?").run(
      village.id,
      targetCharacter.id,
    );
  });
  tx();

  return { success: true, newLordName: targetCharacter.name };
}

/** Fully dissolves a village: garrison, plots, membership, the DB row, and the world's in-memory room. */
export function disbandVillage(village: VillageRow): void {
  for (const mob of getMobsInRoom(village.room_id)) {
    despawnMob(mob.spawnId);
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM village_garrison WHERE village_id = ?').run(village.id);
    db.prepare('DELETE FROM village_plots WHERE village_id = ?').run(village.id);
    db.prepare('DELETE FROM village_members WHERE village_id = ?').run(village.id);
    db.prepare('DELETE FROM villages WHERE id = ?').run(village.id);
  });
  tx();

  unregisterRoom(village.room_id);
}
