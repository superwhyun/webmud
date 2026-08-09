import {
  getSkillById,
  SKILLS,
  type SkillCooldownInfo,
  type SkillDefinition,
} from '@mud/shared';
import { db } from '../../db/client.js';
import { getEffectiveStats } from '../combatStats.js';
import { loadCharacter, loadCharacterState } from '../characterState.js';
import type { CommandContext } from '../commands/context.js';
import { findMobInRoomByName } from '../MobManager.js';
import { hasLearnedSkill, resolveSkillArg } from '../skillProgress.js';
import { computeDamage } from './combatMath.js';
import { handleMobDefeat } from './combatRewards.js';
import { cleanupCombatForSession, getActiveCombat, sendCombatEnd, sendCombatStatus, startCombatInterval } from './combatState.js';

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
    let combat = getActiveCombat(ctx.session.ws);
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
