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

  if (subVerb.toLowerCase() === 'upgrade') {
    const skillArg = args.join(' ').trim();
    if (!skillArg) {
      ctx.send({ type: 'text', text: '사용법: skill upgrade <스킬 ID>' });
      return;
    }
    const character = loadCharacter(ctx.session.characterId);
    if (!character) return;

    const skill = resolveSkillArg(skillArg);
    const result = upgradeSkill(character, skill?.id ?? skillArg);
    ctx.send({ type: 'text', text: result.message });
    if (result.ok) {
      const state = loadCharacterState(character.id);
      if (state) ctx.send({ type: 'state', character: state });
      sendSkills(ctx);
    }
    return;
  }

  if (subVerb.toLowerCase() === 'reset') {
    const character = loadCharacter(ctx.session.characterId);
    if (!character) return;

    const result = resetSkills(character);
    ctx.send({ type: 'text', text: result.message });
    if (result.ok) {
      const state = loadCharacterState(character.id);
      if (state) ctx.send({ type: 'state', character: state });
      sendSkills(ctx);
    }
    return;
  }

  ctx.send({ type: 'text', text: '사용법: skill list | skill learn <스킬 ID> | skill upgrade <스킬 ID> | skill reset' });
}
