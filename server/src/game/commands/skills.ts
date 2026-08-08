import { loadCharacter, loadCharacterState } from '../characterState.js';
import { describeAvailableSkills, getLearnedSkillIds, learnSkill, resolveSkillArg } from '../skillProgress.js';
import type { CommandContext } from './context.js';

export function sendSkills(ctx: CommandContext): void {
  ctx.send({ type: 'skills', learnedSkillIds: [...getLearnedSkillIds(ctx.session.characterId)] });
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
    const character = loadCharacter(ctx.session.characterId);
    if (!character) return;

    const skill = resolveSkillArg(skillArg);
    const result = learnSkill(character, skill?.id ?? skillArg);
    ctx.send({ type: 'text', text: result.message });
    if (result.ok) {
      const state = loadCharacterState(character.id);
      if (state) ctx.send({ type: 'state', character: state });
      sendSkills(ctx);
    }
    return;
  }

  ctx.send({ type: 'text', text: '사용법: skill list | skill learn <스킬 ID>' });
}
