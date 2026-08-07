import type { WebSocket } from 'ws';
import { ELEMENT_ADVANTAGE, type ElementType } from '@mud/shared';
import { db } from '../../db/client.js';
import { STARTING_ROOM_ID } from '../../db/seed.js';
import { getEffectiveStats } from '../combatStats.js';
import { loadCharacter, loadCharacterState } from '../characterState.js';
import type { CommandContext } from '../commands/context.js';
import { killMob, type DamageType, type MobInstance } from '../MobManager.js';
import { broadcastRoomSnapshot } from '../roomSnapshot.js';
import { broadcastToRoom } from '../sessionRegistry.js';
import { applyGoldEarnings } from '../village/VillageService.js';
import { getRoom } from '../World.js';

const COMBAT_TICK_MS = 2000;
const DAMAGE_VARIANCE = 1;
const MIN_DAMAGE = 1;
const BASE_EVASION = 0.05;
const EVASION_PER_DEX = 0.02;
const MAX_EVASION = 0.35;
const ELEMENT_ADVANTAGE_MULTIPLIER = 1.3;
const ELEMENT_DISADVANTAGE_MULTIPLIER = 0.7;

export interface CombatantStats {
  strength: number;
  dexterity: number;
  physicalDefense: number;
  magicDefense: number;
  element: ElementType;
}

export interface AttackResult {
  damage: number;
  evaded: boolean;
}

function getElementMultiplier(attackerElement: ElementType, defenderElement: ElementType): number {
  if (ELEMENT_ADVANTAGE[attackerElement] === defenderElement) return ELEMENT_ADVANTAGE_MULTIPLIER;
  if (ELEMENT_ADVANTAGE[defenderElement] === attackerElement) return ELEMENT_DISADVANTAGE_MULTIPLIER;
  return 1;
}

export function resolveAttack(
  attacker: CombatantStats,
  defender: CombatantStats,
  damageType: DamageType,
): AttackResult {
  const evasionChance = Math.min(
    MAX_EVASION,
    Math.max(0, BASE_EVASION + (defender.dexterity - attacker.dexterity) * EVASION_PER_DEX),
  );
  if (Math.random() < evasionChance) {
    return { damage: 0, evaded: true };
  }

  const defense = damageType === 'magic' ? defender.magicDefense : defender.physicalDefense;
  const elementMultiplier = getElementMultiplier(attacker.element, defender.element);
  const variance = Math.floor(Math.random() * (DAMAGE_VARIANCE * 2 + 1)) - DAMAGE_VARIANCE;
  const rawDamage = Math.round((attacker.strength - defense) * elementMultiplier) + variance;

  return { damage: Math.max(MIN_DAMAGE, rawDamage), evaded: false };
}

export function mobCombatantStats(mob: MobInstance): CombatantStats {
  return {
    strength: mob.strength,
    dexterity: mob.dexterity,
    physicalDefense: mob.physicalDefense,
    magicDefense: mob.magicDefense,
    element: mob.element,
  };
}

interface Combat {
  ctx: CommandContext;
  mob: MobInstance;
  intervalId: NodeJS.Timeout;
}

const activeCombats = new Map<WebSocket, Combat>();

export function isInCombat(ws: WebSocket): boolean {
  return activeCombats.has(ws);
}

export function cleanupCombatForSession(ws: WebSocket): void {
  const combat = activeCombats.get(ws);
  if (!combat) return;
  clearInterval(combat.intervalId);
  activeCombats.delete(ws);
}

export function startCombat(ctx: CommandContext, mob: MobInstance): void {
  if (activeCombats.has(ctx.session.ws)) {
    ctx.send({ type: 'text', text: '이미 전투 중입니다.' });
    return;
  }

  ctx.send({ type: 'text', text: `${mob.name}에게 싸움을 겁니다!` });
  const intervalId = setInterval(() => performRound(ctx, mob), COMBAT_TICK_MS);
  activeCombats.set(ctx.session.ws, { ctx, mob, intervalId });
  performRound(ctx, mob);
}

export function handleFlee(ctx: CommandContext): void {
  const combat = activeCombats.get(ctx.session.ws);
  if (!combat) {
    ctx.send({ type: 'text', text: '전투 중이 아닙니다.' });
    return;
  }
  cleanupCombatForSession(ctx.session.ws);
  ctx.send({ type: 'text', text: `${combat.mob.name}에게서 도망쳤습니다.` });
}

function performRound(ctx: CommandContext, mob: MobInstance): void {
  if (!activeCombats.has(ctx.session.ws)) return;

  if (!mob.alive) {
    cleanupCombatForSession(ctx.session.ws);
    return;
  }

  const character = loadCharacter(ctx.session.characterId);
  if (!character) {
    cleanupCombatForSession(ctx.session.ws);
    return;
  }

  const playerStats = getEffectiveStats(character);
  const mobStats = mobCombatantStats(mob);

  const playerAttack = resolveAttack(playerStats, mobStats, 'physical');
  if (playerAttack.evaded) {
    ctx.send({ type: 'text', text: `${mob.name}가 당신의 공격을 회피했습니다!` });
  } else {
    mob.hp = Math.max(0, mob.hp - playerAttack.damage);
    ctx.send({
      type: 'text',
      text: `당신이 ${mob.name}에게 ${playerAttack.damage}의 피해를 입혔습니다. (${mob.hp}/${mob.maxHp})`,
    });
  }

  if (mob.hp <= 0) {
    handleMobDefeat(ctx, mob, character.id);
    cleanupCombatForSession(ctx.session.ws);
    return;
  }

  const mobAttack = resolveAttack(mobStats, playerStats, mob.damageType);
  if (mobAttack.evaded) {
    ctx.send({ type: 'text', text: `당신이 ${mob.name}의 공격을 회피했습니다!` });
    return;
  }

  const newHp = Math.max(0, character.hp - mobAttack.damage);
  db.prepare('UPDATE characters SET hp = ? WHERE id = ?').run(newHp, character.id);
  ctx.send({
    type: 'text',
    text: `${mob.name}가 당신에게 ${mobAttack.damage}의 피해를 입혔습니다. (${newHp}/${character.max_hp})`,
  });

  const state = loadCharacterState(character.id);
  if (state) ctx.send({ type: 'state', character: state });

  if (newHp <= 0) {
    defeatCharacter(ctx);
    cleanupCombatForSession(ctx.session.ws);
  }
}

function handleMobDefeat(ctx: CommandContext, mob: MobInstance, characterId: number): void {
  ctx.send({
    type: 'text',
    text: `${mob.name}를 물리쳤습니다! (경험치 +${mob.expReward}, 골드 +${mob.goldReward})`,
  });
  broadcastToRoom(
    ctx.session.roomId,
    { type: 'text', text: `${ctx.session.characterName}님이 ${mob.name}를 물리쳤습니다.` },
    ctx.session.ws,
  );

  const earnings = applyGoldEarnings(characterId, mob.goldReward);
  db.prepare('UPDATE characters SET exp = exp + ?, gold = gold + ? WHERE id = ?').run(
    mob.expReward,
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

  killMob(mob);
  broadcastRoomSnapshot(ctx.session.roomId);

  const state = loadCharacterState(characterId);
  if (state) ctx.send({ type: 'state', character: state });
}

export function defeatCharacter(ctx: CommandContext): void {
  const oldRoomId = ctx.session.roomId;

  ctx.send({ type: 'text', text: '당신은 쓰러졌습니다...' });
  broadcastToRoom(
    oldRoomId,
    { type: 'text', text: `${ctx.session.characterName}님이 쓰러졌습니다.` },
    ctx.session.ws,
  );

  db.prepare('UPDATE characters SET hp = max_hp, room_id = ? WHERE id = ?').run(
    STARTING_ROOM_ID,
    ctx.session.characterId,
  );
  ctx.session.roomId = STARTING_ROOM_ID;

  const state = loadCharacterState(ctx.session.characterId);
  if (state) ctx.send({ type: 'state', character: state });

  const room = getRoom(STARTING_ROOM_ID);
  if (room) ctx.send({ type: 'text', text: `정신을 차려보니 ${room.name}입니다.` });

  broadcastRoomSnapshot(oldRoomId);
  broadcastRoomSnapshot(STARTING_ROOM_ID);
}
