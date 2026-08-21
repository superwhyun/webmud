import { JOB_POWER_STAT, type ChatChannel, type JobType } from '@mud/shared';
import type { WebSocket } from 'ws';
import { db } from '../../db/client.js';
import { getEffectiveStats, type EffectiveStats } from '../combatStats.js';
import { loadCharacter, loadCharacterState } from '../characterState.js';
import type { CommandContext } from '../commands/context.js';
import { getMobsInRoom, type DamageType, type MobInstance } from '../MobManager.js';
import { hasElementAdvantage, mobCombatantStats, resolveAttack } from './combatMath.js';
import { defeatCharacter, handleMobDefeat } from './combatRewards.js';
import { stopResting } from '../rest.js';

const COMBAT_TICK_MS = 2000;

/** 직업별 평타(자동 공격 틱)의 피해 타입 — 캐스터는 체감상 자기 스킬과 같은 자원(지능)을 쓰는 게 맞다. */
const JOB_BASIC_ATTACK_DAMAGE_TYPE: Record<JobType, DamageType> = {
  warrior: 'physical',
  rogue: 'physical',
  mage: 'magic',
  priest: 'magic',
};

/** 직업의 위력 스탯 값을 뽑아온다 — job이 없는 예외 상황(있을 수 없지만 타입상 optional)엔 힘으로 폴백. */
export function playerPowerStat(job: JobType | null, stats: EffectiveStats): number {
  if (!job) return stats.strength;
  return stats[JOB_POWER_STAT[job]];
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
 * 상성 우위만으로 어그로를 걸면, 낮은 레벨대 몹이 유난히 몰려있는 속성을 상극으로 둔 캐릭터는
 * 훨씬 강해진 뒤에도 사실상 위협이 안 되는 몹에게 방을 지날 때마다 계속 붙잡힌다(밸런스 조사용
 * 플레이봇으로 실측: 화염 전사가 마을의 물 속성 몹에게 무단 전투 53회, 다른 직업의 3~4배).
 * `consider` 명령이 이미 "상대가 되지 않을 만큼 압도적으로 약함"으로 분류하는 레벨차
 * (inspect.ts의 CONSIDER_THRESHOLDS 첫 구간)와 같은 기준을 여기도 적용해서, 그 정도로 트리비얼한
 * 몹은 상성이 유리해도 자동으로 달려들지 않게 한다.
 */
const AGGRO_TRIVIAL_LEVEL_DIFF = -8;

/**
 * 방에 입장했을 때, 적대적이며 플레이어의 속성에 상성 우위를 가진 몹들이 자동으로 달려들게 한다.
 * 이미 싸우고 있는 몹은 중복으로 추가하지 않는다.
 */
export function triggerAggro(ctx: CommandContext): void {
  const character = loadCharacter(ctx.session.characterId);
  if (!character) return;

  const advantaged = getMobsInRoom(ctx.session.roomId).filter(
    (mob) =>
      mob.hostile &&
      hasElementAdvantage(mob.element, character.element) &&
      mob.level - character.level > AGGRO_TRIVIAL_LEVEL_DIFF,
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

  const basicAttackDamageType = character.job ? JOB_BASIC_ATTACK_DAMAGE_TYPE[character.job] : 'physical';
  const attackStat = playerPowerStat(character.job, playerStats) + (basicAttackDamageType === 'physical' ? playerStats.attackPower : 0);
  const playerAttack = resolveAttack(playerStats, targetStats, basicAttackDamageType, attackStat);
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
    const damageTypeLabel = attacker.damageType === 'magic' ? '마법' : '물리';
    attackMessages.push({
      text: `${attacker.name}가 당신에게 ${damageTypeLabel} 공격으로 ${mobAttack.damage}의 피해를 입혔습니다.${critNote} (${hp}/${character.max_hp})`,
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
