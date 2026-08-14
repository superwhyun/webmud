import type { ChatChannel } from '@mud/shared';
import type { WebSocket } from 'ws';
import { db } from '../../db/client.js';
import { getEffectiveStats } from '../combatStats.js';
import { loadCharacter, loadCharacterState } from '../characterState.js';
import type { CommandContext } from '../commands/context.js';
import { getMobsInRoom, type MobInstance } from '../MobManager.js';
import { hasElementAdvantage, mobCombatantStats, resolveAttack } from './combatMath.js';
import { defeatCharacter, handleMobDefeat } from './combatRewards.js';
import { stopResting } from '../rest.js';

const COMBAT_TICK_MS = 2000;

interface Combat {
  ctx: CommandContext;
  mobs: MobInstance[];
  intervalId: NodeJS.Timeout;
}

const activeCombats = new Map<WebSocket, Combat>();

export function isInCombat(ws: WebSocket): boolean {
  return activeCombats.has(ws);
}

export function getActiveCombat(ws: WebSocket): { mobs: MobInstance[] } | undefined {
  return activeCombats.get(ws);
}

export function sendCombatStatus(ctx: CommandContext, combat: { mobs: MobInstance[] }): void {
  ctx.send({
    type: 'combat',
    mobs: combat.mobs.map((mob) => ({
      spawnId: mob.spawnId,
      name: mob.name,
      hp: mob.hp,
      maxHp: mob.maxHp,
      element: mob.element,
    })),
  });
}

export function sendCombatEnd(ctx: CommandContext): void {
  ctx.send({ type: 'combatEnd' });
}

export function cleanupCombatForSession(ws: WebSocket): void {
  const combat = activeCombats.get(ws);
  if (!combat) return;
  clearInterval(combat.intervalId);
  activeCombats.delete(ws);
}

export function startCombatInterval(ctx: CommandContext, mobs: MobInstance[]): Combat {
  stopResting(ctx.session.ws);
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
    ctx.send({ type: 'text', text: `${mob.name}에게도 싸움을 겁니다!`, channel: 'combat-engage' });
    sendCombatStatus(ctx, existing);
    return;
  }

  ctx.send({ type: 'text', text: `${mob.name}에게 싸움을 겁니다!`, channel: 'combat-engage' });
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
  ctx.send({ type: 'text', text: `${names}이(가) 상성 우위를 노리고 달려듭니다!`, channel: 'combat-engage' });
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
    ctx.send({ type: 'text', text: `${target.name}가 당신의 공격을 회피했습니다!`, channel: 'combat-evade' });
  } else {
    target.hp = Math.max(0, target.hp - playerAttack.damage);
    const critNote = playerAttack.isCrit ? ' 치명타!' : '';
    ctx.send({
      type: 'text',
      text: `당신이 ${target.name}에게 ${playerAttack.damage}의 피해를 입혔습니다.${critNote} (${target.hp}/${target.maxHp})`,
      channel: 'combat-hit',
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
  const attackMessages: { text: string; channel: ChatChannel }[] = [];
  for (const attacker of combat.mobs) {
    if (hp <= 0) break;
    const attackerStats = mobCombatantStats(attacker);
    const mobAttack = resolveAttack(attackerStats, playerStats, attacker.damageType);
    if (mobAttack.evaded) {
      attackMessages.push({ text: `당신이 ${attacker.name}의 공격을 회피했습니다!`, channel: 'combat-evade' });
      continue;
    }
    hp = Math.max(0, hp - mobAttack.damage);
    const critNote = mobAttack.isCrit ? ' 치명타!' : '';
    attackMessages.push({
      text: `${attacker.name}가 당신에게 ${mobAttack.damage}의 피해를 입혔습니다.${critNote} (${hp}/${character.max_hp})`,
      channel: 'combat-hurt',
    });
  }

  db.prepare('UPDATE characters SET hp = ? WHERE id = ?').run(hp, character.id);
  for (const message of attackMessages) ctx.send({ type: 'text', text: message.text, channel: message.channel });

  const state = loadCharacterState(character.id);
  if (state) ctx.send({ type: 'state', character: state });

  if (hp <= 0) {
    defeatCharacter(ctx);
    cleanupCombatForSession(ctx.session.ws);
    sendCombatEnd(ctx);
  }
}
