import { loadCharacter, loadCharacterState } from '../characterState.js';
import {
  describeAvailableSkills,
  getLearnedSkillIds,
  getLearnedSkillRanks,
  learnSkill,
  resetSkills,
  resolveSkillArg,
  upgradeSkill,
} from '../skillProgress.js';
import type { CommandContext } from './context.js';

export function sendSkills(ctx: CommandContext): void {
  ctx.send({
    type: 'skills',
    learnedSkillIds: [...getLearnedSkillIds(ctx.session.characterId)],
    learnedSkillRanks: Object.fromEntries(getLearnedSkillRanks(ctx.session.characterId)),
  });
}

/**
 * 스킬 UI 전용 메시지(learnSkill/upgradeSkill/resetSkills)와 텍스트 명령(skill learn/upgrade/reset)이
 * 공통으로 쓰는 실행부. skillId는 이미 확정된 값(UI 버튼의 data-skill-id 또는 텍스트 명령에서
 * resolveSkillArg로 해석된 id)이어야 한다.
 */
export function handleLearnSkillMessage(ctx: CommandContext, skillId: string): void {
  const character = loadCharacter(ctx.session.characterId);
  if (!character) return;

  const result = learnSkill(character, skillId);
  ctx.send({ type: 'text', text: result.message });
  if (result.ok) {
    const state = loadCharacterState(character.id);
    if (state) ctx.send({ type: 'state', character: state });
    sendSkills(ctx);
  }
}

export function handleUpgradeSkillMessage(ctx: CommandContext, skillId: string): void {
  const character = loadCharacter(ctx.session.characterId);
  if (!character) return;

  const result = upgradeSkill(character, skillId);
  ctx.send({ type: 'text', text: result.message });
  if (result.ok) {
    const state = loadCharacterState(character.id);
    if (state) ctx.send({ type: 'state', character: state });
    sendSkills(ctx);
  }
}

export function handleResetSkillsMessage(ctx: CommandContext): void {
  const character = loadCharacter(ctx.session.characterId);
  if (!character) return;

  const result = resetSkills(character);
  ctx.send({ type: 'text', text: result.message });
  if (result.ok) {
    const state = loadCharacterState(character.id);
    if (state) ctx.send({ type: 'state', character: state });
    sendSkills(ctx);
  }
}

export function handleSkill(ctx: CommandContext, rest: string): void {
  const [subVerb, ...args] = rest.trim().split(/\s+/);

  if (!subVerb || subVerb.toLowerCase() === 'list') {
    const character = loadCharacter(ctx.session.characterId);
    if (!character) return;
    ctx.send({ type: 'text', text: describeAvailableSkills(character) });
    return;
  }

  if (subVerb.toLowerCase() === 'learn') {
    const skillArg = args.join(' ').trim();
    if (!skillArg) {
      ctx.send({ type: 'text', text: '사용법: skill learn <스킬 ID>' });
      return;
    }
    const skill = resolveSkillArg(skillArg);
    handleLearnSkillMessage(ctx, skill?.id ?? skillArg);
    return;
  }

  if (subVerb.toLowerCase() === 'upgrade') {
    const skillArg = args.join(' ').trim();
    if (!skillArg) {
      ctx.send({ type: 'text', text: '사용법: skill upgrade <스킬 ID>' });
      return;
    }
    const skill = resolveSkillArg(skillArg);
    handleUpgradeSkillMessage(ctx, skill?.id ?? skillArg);
    return;
  }

  if (subVerb.toLowerCase() === 'reset') {
    handleResetSkillsMessage(ctx);
    return;
  }

  ctx.send({ type: 'text', text: '사용법: skill list | skill learn <스킬 ID> | skill upgrade <스킬 ID> | skill reset' });
}
