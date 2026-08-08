import type { WebSocket } from 'ws';
import {
  ELEMENT_ADVANTAGE,
  formatItemMention,
  getSkillById,
  SKILLS,
  type ElementType,
  type ItemGrade,
  type SkillCooldownInfo,
  type SkillDefinition,
} from '@mud/shared';
import { db } from '../../db/client.js';
import { STARTING_ROOM_ID } from '../../db/seed.js';
import { getEffectiveStats } from '../combatStats.js';
import { loadCharacter, loadCharacterState } from '../characterState.js';
import type { CommandContext } from '../commands/context.js';
import { applyLevelUps } from '../leveling.js';
import { findMobInRoomByName, getMobsInRoom, killMob, type DamageType, type MobInstance } from '../MobManager.js';
import { computeMobExpReward } from '../mobExp.js';
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
  attackPower: number;
  physicalDefense: number;
  magicDefense: number;
  element: ElementType;
}

export interface AttackResult {
  damage: number;
  evaded: boolean;
}

/** attackerElement가 defenderElement에 상성 우위(오행 상극)를 가지는지. */
export function hasElementAdvantage(attackerElement: ElementType, defenderElement: ElementType): boolean {
  return ELEMENT_ADVANTAGE[attackerElement] === defenderElement;
}

function getElementMultiplier(attackerElement: ElementType, defenderElement: ElementType): number {
  if (hasElementAdvantage(attackerElement, defenderElement)) return ELEMENT_ADVANTAGE_MULTIPLIER;
  if (hasElementAdvantage(defenderElement, attackerElement)) return ELEMENT_DISADVANTAGE_MULTIPLIER;
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
  const damage = computeDamage(attacker.strength + attacker.attackPower, defense, attacker.element, defender.element, 1);

  return { damage, evaded: false };
}

export function mobCombatantStats(mob: MobInstance): CombatantStats {
  return {
    strength: mob.strength,
    dexterity: mob.dexterity,
    attackPower: 0,
    physicalDefense: mob.physicalDefense,
    magicDefense: mob.magicDefense,
    element: mob.element,
  };
}

interface Combat {
  ctx: CommandContext;
  mobs: MobInstance[];
  intervalId: NodeJS.Timeout;
}

const activeCombats = new Map<WebSocket, Combat>();

export function isInCombat(ws: WebSocket): boolean {
  return activeCombats.has(ws);
}

function sendCombatStatus(ctx: CommandContext, combat: Combat): void {
  ctx.send({
    type: 'combat',
    mobs: combat.mobs.map((mob) => ({ spawnId: mob.spawnId, name: mob.name, hp: mob.hp, maxHp: mob.maxHp })),
  });
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

function startCombatInterval(ctx: CommandContext, mobs: MobInstance[]): Combat {
  const intervalId = setInterval(() => performRound(ctx), COMBAT_TICK_MS);
  const combat: Combat = { ctx, mobs, intervalId };
  activeCombats.set(ctx.session.ws, combat);
  return combat;
}

export function startCombat(ctx: CommandContext, mob: MobInstance): void {
  const existing = activeCombats.get(ctx.session.ws);
  if (existing) {
    if (existing.mobs.some((m) => m.spawnId === mob.spawnId)) {
      ctx.send({ type: 'text', text: '이미 전투 중입니다.' });
      return;
    }
    existing.mobs.push(mob);
    ctx.send({ type: 'text', text: `${mob.name}에게도 싸움을 겁니다!` });
    sendCombatStatus(ctx, existing);
    return;
  }

  ctx.send({ type: 'text', text: `${mob.name}에게 싸움을 겁니다!` });
  const combat = startCombatInterval(ctx, [mob]);
  sendCombatStatus(ctx, combat);
  performRound(ctx);
}

/**
 * 방에 입장했을 때, 적대적이며 플레이어의 속성에 상성 우위를 가진 몹들이 자동으로 달려들게 한다.
 * 이미 싸우고 있는 몹은 중복으로 추가하지 않는다.
 */
export function triggerAggro(ctx: CommandContext): void {
  const character = loadCharacter(ctx.session.characterId);
  if (!character) return;

  const advantaged = getMobsInRoom(ctx.session.roomId).filter(
    (mob) => mob.hostile && hasElementAdvantage(mob.element, character.element),
  );
  if (advantaged.length === 0) return;

  const existing = activeCombats.get(ctx.session.ws);
  const newMobs = advantaged.filter((mob) => !existing?.mobs.some((m) => m.spawnId === mob.spawnId));
  if (newMobs.length === 0) return;

  const combat = existing ?? startCombatInterval(ctx, []);
  combat.mobs.push(...newMobs);

  const names = newMobs.map((mob) => mob.name).join(', ');
  ctx.send({ type: 'text', text: `${names}이(가) 상성 우위를 노리고 달려듭니다!` });
  sendCombatStatus(ctx, combat);
  performRound(ctx);
}

export function handleFlee(ctx: CommandContext): void {
  const combat = activeCombats.get(ctx.session.ws);
  if (!combat) {
    ctx.send({ type: 'text', text: '전투 중이 아닙니다.' });
    return;
  }
  cleanupCombatForSession(ctx.session.ws);
  const names = combat.mobs.map((mob) => mob.name).join(', ');
  ctx.send({ type: 'text', text: `${names}에게서 도망쳤습니다.` });
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

/** 캐릭터의 재사용 대기 중인 스킬 목록을 클라이언트가 쿨타임 바를 그릴 수 있는 형태로 스냅샷한다. */
export function getActiveSkillCooldowns(characterId: number): SkillCooldownInfo[] {
  const now = Date.now();
  const cooldowns: SkillCooldownInfo[] = [];
  for (const [skillId, readyAt] of skillCooldowns.get(characterId) ?? []) {
    const remainingMs = readyAt - now;
    if (remainingMs <= 0) continue;
    const skill = getSkillById(skillId);
    if (!skill) continue;
    cooldowns.push({ skillId, name: skill.name, remainingMs, totalMs: skill.cooldownMs ?? 0 });
  }
  return cooldowns;
}

export function sendSkillCooldowns(ctx: CommandContext, characterId: number): void {
  ctx.send({ type: 'skillCooldowns', cooldowns: getActiveSkillCooldowns(characterId) });
}

interface ResolvedCast {
  skill: SkillDefinition;
  targetHint: string;
}

/**
 * "마법 <스킬 이름> [군더더기/대상]" 형태의 입력에서 스킬 이름을 접두어로 찾는다.
 * 이름 뒤에 남는 텍스트는 대상 몹 이름 힌트로 취급하고, "써"/"쥐" 같은 오타 섞인
 * 군더더기 동사는 어차피 몹 이름과 매치되지 않으므로 자연히 무시된다.
 */
function resolveCastInput(rest: string): ResolvedCast | undefined {
  const trimmed = rest.trim();
  if (!trimmed) return undefined;

  const exact = resolveSkillArg(trimmed);
  if (exact) return { skill: exact, targetHint: '' };

  let best: ResolvedCast | undefined;
  for (const skill of SKILLS) {
    if (trimmed === skill.name || trimmed.startsWith(`${skill.name} `)) {
      if (!best || skill.name.length > best.skill.name.length) {
        best = { skill, targetHint: trimmed.slice(skill.name.length).trim() };
      }
    }
  }
  return best;
}

/**
 * 스킬 시전은 2초 전투 틱과 별개의 즉시 행동으로 처리한다(몬스터 반격을 유발하지 않음).
 * 몬스터 반격은 기존 자동 공격 틱에서만 발생한다.
 */
export function handleCast(ctx: CommandContext, rest: string): void {
  const resolved = resolveCastInput(rest);
  if (!resolved) {
    ctx.send({ type: 'text', text: '사용법: cast <스킬 ID>' });
    return;
  }
  const { skill, targetHint } = resolved;

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
    let combat = activeCombats.get(ctx.session.ws);
    if (!combat || combat.mobs.length === 0) {
      if (!targetHint) {
        ctx.send({ type: 'text', text: `전투 중이 아닙니다. 사용법: 마법 ${skill.name} <대상>` });
        return;
      }
      const targetMob = findMobInRoomByName(ctx.session.roomId, targetHint);
      if (!targetMob) {
        ctx.send({ type: 'text', text: '그런 대상이 이곳에 없습니다.' });
        return;
      }
      ctx.send({ type: 'text', text: `${targetMob.name}에게 싸움을 겁니다!` });
      combat = startCombatInterval(ctx, [targetMob]);
    }
    const mob = (targetHint && combat.mobs.find((m) => m.name.includes(targetHint))) || combat.mobs[0];

    const playerStats = getEffectiveStats(character);
    const attackStat =
      skill.damageType === 'magic' ? playerStats.intelligence : playerStats.strength + playerStats.attackPower;
    const defense = skill.damageType === 'magic' ? mob.magicDefense : mob.physicalDefense;
    const damage = computeDamage(attackStat, defense, playerStats.element, mob.element, skill.power);

    db.prepare('UPDATE characters SET mp = mp - ? WHERE id = ?').run(skill.mpCost, character.id);
    startCooldown(character.id, skill.id, skill.cooldownMs ?? 0);
    sendSkillCooldowns(ctx, character.id);
    mob.hp = Math.max(0, mob.hp - damage);

    ctx.send({
      type: 'text',
      text: `${skill.name}! ${mob.name}에게 ${damage}의 피해를 입혔습니다. (${mob.hp}/${mob.maxHp})`,
    });

    if (mob.hp <= 0) {
      handleMobDefeat(ctx, mob, character.id);
      combat.mobs = combat.mobs.filter((m) => m.spawnId !== mob.spawnId);
    }

    if (combat.mobs.length === 0) {
      cleanupCombatForSession(ctx.session.ws);
      sendCombatEnd(ctx);
      return;
    }

    sendCombatStatus(ctx, combat);
    const state = loadCharacterState(character.id);
    if (state) ctx.send({ type: 'state', character: state });
    return;
  }

  // kind === 'heal'
  const previousHp = character.hp;
  const healedHp = Math.min(character.max_hp, character.hp + skill.power);
  db.prepare('UPDATE characters SET hp = ?, mp = mp - ? WHERE id = ?').run(healedHp, skill.mpCost, character.id);
  startCooldown(character.id, skill.id, skill.cooldownMs ?? 0);
  sendSkillCooldowns(ctx, character.id);

  ctx.send({
    type: 'text',
    text: `${skill.name}! HP를 ${healedHp - previousHp} 회복했습니다. (${healedHp}/${character.max_hp})`,
  });

  const state = loadCharacterState(character.id);
  if (state) ctx.send({ type: 'state', character: state });
}

function performRound(ctx: CommandContext): void {
  const combat = activeCombats.get(ctx.session.ws);
  if (!combat) return;

  combat.mobs = combat.mobs.filter((mob) => mob.alive);
  if (combat.mobs.length === 0) {
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
  const target = combat.mobs[0];
  const targetStats = mobCombatantStats(target);

  const playerAttack = resolveAttack(playerStats, targetStats, 'physical');
  if (playerAttack.evaded) {
    ctx.send({ type: 'text', text: `${target.name}가 당신의 공격을 회피했습니다!` });
  } else {
    target.hp = Math.max(0, target.hp - playerAttack.damage);
    ctx.send({
      type: 'text',
      text: `당신이 ${target.name}에게 ${playerAttack.damage}의 피해를 입혔습니다. (${target.hp}/${target.maxHp})`,
    });
  }

  if (target.hp <= 0) {
    handleMobDefeat(ctx, target, character.id);
    combat.mobs = combat.mobs.filter((mob) => mob.spawnId !== target.spawnId);
  }

  if (combat.mobs.length === 0) {
    cleanupCombatForSession(ctx.session.ws);
    sendCombatEnd(ctx);
    return;
  }

  sendCombatStatus(ctx, combat);

  // 전투 중인 모든 몹이(상성 우위로 가세한 몹 포함) 매 라운드 동시에 반격한다.
  let hp = character.hp;
  const attackMessages: string[] = [];
  for (const attacker of combat.mobs) {
    if (hp <= 0) break;
    const attackerStats = mobCombatantStats(attacker);
    const mobAttack = resolveAttack(attackerStats, playerStats, attacker.damageType);
    if (mobAttack.evaded) {
      attackMessages.push(`당신이 ${attacker.name}의 공격을 회피했습니다!`);
      continue;
    }
    hp = Math.max(0, hp - mobAttack.damage);
    attackMessages.push(`${attacker.name}가 당신에게 ${mobAttack.damage}의 피해를 입혔습니다. (${hp}/${character.max_hp})`);
  }

  db.prepare('UPDATE characters SET hp = ? WHERE id = ?').run(hp, character.id);
  for (const message of attackMessages) ctx.send({ type: 'text', text: message });

  const state = loadCharacterState(character.id);
  if (state) ctx.send({ type: 'state', character: state });

  if (hp <= 0) {
    defeatCharacter(ctx);
    cleanupCombatForSession(ctx.session.ws);
    sendCombatEnd(ctx);
  }
}

function handleMobDefeat(ctx: CommandContext, mob: MobInstance, characterId: number): void {
  const expReward = computeMobExpReward(mob);
  ctx.send({
    type: 'text',
    text: `${mob.name}를 물리쳤습니다! (경험치 +${expReward}, 골드 +${mob.goldReward})`,
  });
  broadcastToRoom(
    ctx.session.roomId,
    { type: 'text', text: `${ctx.session.characterName}님이 ${mob.name}를 물리쳤습니다.` },
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
