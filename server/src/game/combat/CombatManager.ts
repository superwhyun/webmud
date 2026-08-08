import type { WebSocket } from 'ws';
import { ELEMENT_ADVANTAGE, type ElementType } from '@mud/shared';
import { db } from '../../db/client.js';
import { STARTING_ROOM_ID } from '../../db/seed.js';
import { getEffectiveStats } from '../combatStats.js';
import { loadCharacter, loadCharacterState } from '../characterState.js';
import type { CommandContext } from '../commands/context.js';
import { applyLevelUps } from '../leveling.js';
import { killMob, type DamageType, type MobInstance } from '../MobManager.js';
import { broadcastRoomSnapshot } from '../roomSnapshot.js';
import { broadcastToRoom } from '../sessionRegistry.js';
import { hasLearnedSkill, resolveSkillArg } from '../skillProgress.js';
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

function computeDamage(
  attackStat: number,
  defense: number,
  attackerElement: ElementType,
  defenderElement: ElementType,
  powerMultiplier: number,
): number {
  const elementMultiplier = getElementMultiplier(attackerElement, defenderElement);
  const variance = Math.floor(Math.random() * (DAMAGE_VARIANCE * 2 + 1)) - DAMAGE_VARIANCE;
  const rawDamage = Math.round((attackStat * powerMultiplier - defense) * elementMultiplier) + variance;
  return Math.max(MIN_DAMAGE, rawDamage);
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
  const damage = computeDamage(attacker.strength, defense, attacker.element, defender.element, 1);

  return { damage, evaded: false };
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

function sendCombatStatus(ctx: CommandContext, mob: MobInstance): void {
  ctx.send({ type: 'combat', mobName: mob.name, mobHp: mob.hp, mobMaxHp: mob.maxHp });
}

function sendCombatEnd(ctx: CommandContext): void {
  ctx.send({ type: 'combatEnd' });
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
  sendCombatStatus(ctx, mob);
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
  sendCombatEnd(ctx);
}

/** characterId -> skillId -> 재사용 가능 시각(ms). */
const skillCooldowns = new Map<number, Map<string, number>>();

function remainingCooldownMs(characterId: number, skillId: string): number {
  const readyAt = skillCooldowns.get(characterId)?.get(skillId) ?? 0;
  return Math.max(0, readyAt - Date.now());
}

function startCooldown(characterId: number, skillId: string, cooldownMs: number): void {
  const characterCooldowns = skillCooldowns.get(characterId) ?? new Map<string, number>();
  characterCooldowns.set(skillId, Date.now() + cooldownMs);
  skillCooldowns.set(characterId, characterCooldowns);
}

/**
 * 스킬 시전은 2초 전투 틱과 별개의 즉시 행동으로 처리한다(몬스터 반격을 유발하지 않음).
 * 몬스터 반격은 기존 자동 공격 틱에서만 발생한다.
 */
export function handleCast(ctx: CommandContext, rest: string): void {
  const skill = resolveSkillArg(rest);
  if (!skill) {
    ctx.send({ type: 'text', text: '사용법: cast <스킬 ID>' });
    return;
  }

  const character = loadCharacter(ctx.session.characterId);
  if (!character) return;

  if (!hasLearnedSkill(character.id, skill.id)) {
    ctx.send({ type: 'text', text: `아직 배우지 않은 스킬입니다: ${skill.name}` });
    return;
  }

  if (skill.kind === 'passive') {
    ctx.send({ type: 'text', text: `${skill.name}은(는) 습득 즉시 적용되는 패시브 스킬입니다.` });
    return;
  }

  const remainingMs = remainingCooldownMs(character.id, skill.id);
  if (remainingMs > 0) {
    ctx.send({ type: 'text', text: `${skill.name}은(는) 재사용 대기 중입니다. (${Math.ceil(remainingMs / 1000)}초 남음)` });
    return;
  }

  if (character.mp < skill.mpCost) {
    ctx.send({ type: 'text', text: `MP가 부족합니다. (필요 MP ${skill.mpCost}, 보유 MP ${character.mp})` });
    return;
  }

  if (skill.kind === 'damage') {
    const combat = activeCombats.get(ctx.session.ws);
    if (!combat) {
      ctx.send({ type: 'text', text: '전투 중에만 사용할 수 있는 스킬입니다.' });
      return;
    }
    const mob = combat.mob;

    const playerStats = getEffectiveStats(character);
    const attackStat = skill.damageType === 'magic' ? playerStats.intelligence : playerStats.strength;
    const defense = skill.damageType === 'magic' ? mob.magicDefense : mob.physicalDefense;
    const damage = computeDamage(attackStat, defense, playerStats.element, mob.element, skill.power);

    db.prepare('UPDATE characters SET mp = mp - ? WHERE id = ?').run(skill.mpCost, character.id);
    startCooldown(character.id, skill.id, skill.cooldownMs ?? 0);
    mob.hp = Math.max(0, mob.hp - damage);

    ctx.send({
      type: 'text',
      text: `${skill.name}! ${mob.name}에게 ${damage}의 피해를 입혔습니다. (${mob.hp}/${mob.maxHp})`,
    });

    if (mob.hp <= 0) {
      handleMobDefeat(ctx, mob, character.id);
      cleanupCombatForSession(ctx.session.ws);
      sendCombatEnd(ctx);
      return;
    }

    sendCombatStatus(ctx, mob);
    const state = loadCharacterState(character.id);
    if (state) ctx.send({ type: 'state', character: state });
    return;
  }

  // kind === 'heal'
  const previousHp = character.hp;
  const healedHp = Math.min(character.max_hp, character.hp + skill.power);
  db.prepare('UPDATE characters SET hp = ?, mp = mp - ? WHERE id = ?').run(healedHp, skill.mpCost, character.id);
  startCooldown(character.id, skill.id, skill.cooldownMs ?? 0);

  ctx.send({
    type: 'text',
    text: `${skill.name}! HP를 ${healedHp - previousHp} 회복했습니다. (${healedHp}/${character.max_hp})`,
  });

  const state = loadCharacterState(character.id);
  if (state) ctx.send({ type: 'state', character: state });
}

function performRound(ctx: CommandContext, mob: MobInstance): void {
  if (!activeCombats.has(ctx.session.ws)) return;

  if (!mob.alive) {
    cleanupCombatForSession(ctx.session.ws);
    sendCombatEnd(ctx);
    return;
  }

  const character = loadCharacter(ctx.session.characterId);
  if (!character) {
    cleanupCombatForSession(ctx.session.ws);
    sendCombatEnd(ctx);
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
    sendCombatEnd(ctx);
    return;
  }

  sendCombatStatus(ctx, mob);

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
    sendCombatEnd(ctx);
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
