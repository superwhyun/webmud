import { db } from '../../db/client.js';
import type { VillageRow } from '../../db/types.js';
import { loadCharacter, loadCharacterState } from '../characterState.js';
import { defeatCharacter, mobCombatantStats, resolveAttack, type CombatantStats } from '../combat/CombatManager.js';
import { getEffectiveStats } from '../combatStats.js';
import type { CommandContext } from '../commands/context.js';
import { getMobsInRoom, killMob } from '../MobManager.js';
import { broadcastRoomSnapshot } from '../roomSnapshot.js';
import { broadcastToRoom } from '../sessionRegistry.js';

export const RAID_UNLOCK_LEVEL = 3;
export const RAID_PROTECTION_MS = 30 * 60 * 1000;
export const RAID_LOOT_PERCENT = 20;
const MAX_RAID_ROUNDS = 50;

export function isRaidProtected(village: VillageRow): boolean {
  if (!village.raid_protected_until) return false;
  return new Date(village.raid_protected_until).getTime() > Date.now();
}

export interface RaidEligibility {
  ok: boolean;
  error?: string;
}

export function canRaid(attacker: VillageRow, defender: VillageRow): RaidEligibility {
  if (attacker.id === defender.id) {
    return { ok: false, error: '자신의 마을은 습격할 수 없습니다.' };
  }
  if (attacker.level < RAID_UNLOCK_LEVEL || defender.level < RAID_UNLOCK_LEVEL) {
    return {
      ok: false,
      error: `양쪽 마을 모두 레벨 ${RAID_UNLOCK_LEVEL} 이상이어야 길이 연결되어 습격할 수 있습니다.`,
    };
  }
  if (isRaidProtected(defender)) {
    return { ok: false, error: '상대 마을은 지금 보호기간 중이라 습격할 수 없습니다.' };
  }
  return { ok: true };
}

function computeLoot(defender: VillageRow): { gold: number; wood: number; ore: number; food: number } {
  const pct = RAID_LOOT_PERCENT / 100;
  return {
    gold: Math.floor(defender.gold * pct),
    wood: Math.floor(defender.wood * pct),
    ore: Math.floor(defender.ore * pct),
    food: Math.floor(defender.food * pct),
  };
}

export function executeRaid(ctx: CommandContext, attackerVillage: VillageRow, defenderVillage: VillageRow): void {
  const character = loadCharacter(ctx.session.characterId);
  if (!character) return;

  ctx.send({ type: 'text', text: `${defenderVillage.name} 마을로 원정을 떠납니다!` });

  const attackerStats: CombatantStats = getEffectiveStats(character);
  let attackerHp = character.hp;

  const garrison = getMobsInRoom(defenderVillage.room_id);
  let defeatedCount = 0;
  let rounds = 0;

  for (const mob of garrison) {
    if (attackerHp <= 0 || rounds >= MAX_RAID_ROUNDS) break;

    while (mob.hp > 0 && attackerHp > 0 && rounds < MAX_RAID_ROUNDS) {
      rounds++;
      const mobStats = mobCombatantStats(mob);

      const playerAttack = resolveAttack(attackerStats, mobStats, 'physical');
      if (!playerAttack.evaded) {
        mob.hp = Math.max(0, mob.hp - playerAttack.damage);
      }
      if (mob.hp <= 0) break;

      const mobAttack = resolveAttack(mobStats, attackerStats, mob.damageType);
      if (!mobAttack.evaded) {
        attackerHp = Math.max(0, attackerHp - mobAttack.damage);
      }
    }

    if (mob.hp <= 0) {
      killMob(mob);
      defeatedCount++;
      ctx.send({ type: 'text', text: `${mob.name}을(를) 물리쳤습니다.` });
    }
  }

  db.prepare('UPDATE characters SET hp = ? WHERE id = ?').run(attackerHp, character.id);

  if (garrison.length > 0) broadcastRoomSnapshot(defenderVillage.room_id);

  if (attackerHp <= 0) {
    ctx.send({ type: 'text', text: `${defenderVillage.name} 마을의 수비대에게 격퇴당했습니다...` });
    defeatCharacter(ctx);
    return;
  }

  const victory = defeatedCount === garrison.length;
  if (!victory) {
    const state = loadCharacterState(character.id);
    if (state) ctx.send({ type: 'state', character: state });
    ctx.send({ type: 'text', text: `수비대를 뚫지 못하고 습격에 실패했습니다. (HP ${attackerHp}/${character.max_hp})` });
    return;
  }

  const loot = computeLoot(defenderVillage);
  db.prepare('UPDATE villages SET gold = gold - ?, wood = wood - ?, ore = ore - ?, food = food - ? WHERE id = ?').run(
    loot.gold,
    loot.wood,
    loot.ore,
    loot.food,
    defenderVillage.id,
  );
  db.prepare('UPDATE villages SET gold = gold + ?, wood = wood + ?, ore = ore + ?, food = food + ? WHERE id = ?').run(
    loot.gold,
    loot.wood,
    loot.ore,
    loot.food,
    attackerVillage.id,
  );

  const protectedUntil = new Date(Date.now() + RAID_PROTECTION_MS).toISOString();
  db.prepare('UPDATE villages SET raid_protected_until = ? WHERE id = ?').run(protectedUntil, defenderVillage.id);

  const state = loadCharacterState(character.id);
  if (state) ctx.send({ type: 'state', character: state });

  ctx.send({
    type: 'text',
    text: `${defenderVillage.name} 마을을 습격에 성공했습니다! 약탈: gold ${loot.gold}, 목재 ${loot.wood}, 광석 ${loot.ore}, 식량 ${loot.food}. 상대 마을은 30분간 보호기간에 들어갑니다.`,
  });

  broadcastToRoom(defenderVillage.room_id, {
    type: 'text',
    text: `${attackerVillage.name} 마을의 습격을 받아 자원을 약탈당했습니다. 보호기간이 시작됩니다.`,
  });
  broadcastRoomSnapshot(defenderVillage.room_id);
  broadcastRoomSnapshot(attackerVillage.room_id);
}
