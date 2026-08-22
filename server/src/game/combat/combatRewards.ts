import { formatItemMention, josaEulReul, withJosa, type ItemGrade } from '@mud/shared';
import { db } from '../../db/client.js';
import { STARTING_ROOM_ID } from '../../db/seed/index.js';
import { loadCharacterState } from '../characterState.js';
import type { CommandContext } from '../commands/context.js';
import { applyLevelUps } from '../leveling.js';
import { killMob, type MobInstance } from '../MobManager.js';
import { computeMobExpReward } from '../mobExp.js';
import { broadcastRoomSnapshot } from '../roomSnapshot.js';
import { broadcastToRoom } from '../sessionRegistry.js';
import { applyGoldEarnings } from '../village/VillageService.js';
import { getRoom, getZoneEntranceRoomId } from '../World.js';

/** 몹이 죽었을 때 들고 있던 아이템을 현재 방에 떨어뜨린다. */
function dropMobLoot(ctx: CommandContext, mob: MobInstance): void {
  if (mob.carriedItemIds.length === 0) return;

  const placeholders = mob.carriedItemIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT id, name, grade FROM items WHERE id IN (${placeholders})`)
    .all(...mob.carriedItemIds) as { id: number; name: string; grade: ItemGrade }[];
  if (rows.length === 0) return;

  const dropTx = db.transaction(() => {
    for (const item of rows) {
      const existing = db
        .prepare('SELECT id FROM room_items WHERE room_id = ? AND item_id = ?')
        .get(ctx.session.roomId, item.id) as { id: number } | undefined;
      if (existing) {
        db.prepare('UPDATE room_items SET quantity = quantity + 1 WHERE id = ?').run(existing.id);
      } else {
        db.prepare('INSERT INTO room_items (room_id, item_id, quantity) VALUES (?, ?, 1)').run(
          ctx.session.roomId,
          item.id,
        );
      }
    }
  });
  dropTx();

  const mentions = rows.map((item) => formatItemMention(item.name, item.grade)).join(', ');
  const text = `${mob.name}이(가) ${mentions}을(를) 떨어뜨렸습니다.`;
  ctx.send({ type: 'text', text });
  broadcastToRoom(ctx.session.roomId, { type: 'text', text }, ctx.session.ws);
}

export function handleMobDefeat(ctx: CommandContext, mob: MobInstance, characterId: number): void {
  const expReward = computeMobExpReward(mob);
  ctx.send({
    type: 'text',
    text: `${withJosa(mob.name, josaEulReul)} 물리쳤습니다! (경험치 +${expReward}, 골드 +${mob.goldReward})`,
    channel: 'combat-victory',
  });
  broadcastToRoom(
    ctx.session.roomId,
    {
      type: 'text',
      text: `${ctx.session.characterName}님이 ${withJosa(mob.name, josaEulReul)} 물리쳤습니다.`,
      channel: 'combat-victory',
    },
    ctx.session.ws,
  );

  const earnings = applyGoldEarnings(characterId, mob.goldReward);
  db.prepare('UPDATE characters SET exp = exp + ?, gold = gold + ? WHERE id = ?').run(
    expReward,
    earnings.personalAmount,
    characterId,
  );

  if (earnings.titheAmount > 0 && earnings.village) {
    ctx.send({
      type: 'text',
      text: `${earnings.village.name} 마을에 gold ${earnings.titheAmount}을(를) 상납했습니다.`,
    });
    broadcastRoomSnapshot(earnings.village.room_id);
  }

  dropMobLoot(ctx, mob);
  killMob(mob);
  broadcastRoomSnapshot(ctx.session.roomId);

  const levelUp = applyLevelUps(characterId);
  if (levelUp) {
    ctx.send({
      type: 'text',
      text: `레벨업! Lv.${levelUp.newLevel}이(가) 되었습니다. (스탯 포인트 +${levelUp.statPointsGained}, 스킬 포인트 +${levelUp.skillPointsGained})`,
    });
  }

  const state = loadCharacterState(characterId);
  if (state) ctx.send({ type: 'state', character: state });
}

/** 사망한 방이 속한 존의 입구방으로 되살아난다. 존을 찾지 못하면(이상 상황) 최초 마을로 대신 보낸다. */
export function defeatCharacter(ctx: CommandContext): void {
  const oldRoomId = ctx.session.roomId;
  const diedInRoom = getRoom(oldRoomId);
  const respawnRoomId =
    (diedInRoom && getZoneEntranceRoomId(diedInRoom.zoneId)) ?? STARTING_ROOM_ID;

  ctx.send({ type: 'text', text: '☠ 당신은 쓰러졌습니다...', channel: 'death' });
  ctx.send({ type: 'death', roomId: oldRoomId });
  broadcastToRoom(
    oldRoomId,
    { type: 'text', text: `${ctx.session.characterName}님이 쓰러졌습니다.` },
    ctx.session.ws,
  );

  db.prepare('UPDATE characters SET hp = max_hp, mp = max_mp, room_id = ? WHERE id = ?').run(
    respawnRoomId,
    ctx.session.characterId,
  );
  ctx.session.roomId = respawnRoomId;

  const state = loadCharacterState(ctx.session.characterId);
  if (state) ctx.send({ type: 'state', character: state });

  const room = getRoom(respawnRoomId);
  if (room) ctx.send({ type: 'text', text: `정신을 차려보니 ${room.name}입니다.`, channel: 'death' });

  broadcastRoomSnapshot(oldRoomId);
  broadcastRoomSnapshot(respawnRoomId);
}
