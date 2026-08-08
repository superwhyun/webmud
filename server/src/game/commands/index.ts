import { handleSay, handleShout, handleWho } from './chat.js';
import { handleAttack, handleCast, handleFlee } from './combat.js';
import type { CommandContext } from './context.js';
import { handleDrop, handleEquip, handleGet, handleInventory, handleUse } from './items.js';
import { describeRoom, showHelp } from './misc.js';
import { handleMove, resolveDirection } from './movement.js';
import { handleRaid } from './raid.js';
import { handleSkill } from './skills.js';
import { handleStat } from './stats.js';
import { handleLeave, handleTravel, handleVillage } from './village.js';

function splitVerb(text: string): { verb: string; rest: string } {
  const spaceIndex = text.indexOf(' ');
  if (spaceIndex === -1) return { verb: text, rest: '' };
  return { verb: text.slice(0, spaceIndex), rest: text.slice(spaceIndex + 1) };
}

export function dispatchCommand(ctx: CommandContext, rawText: string): void {
  const trimmed = rawText.trim();
  if (!trimmed) return;

  const { verb, rest } = splitVerb(trimmed);
  const lowerVerb = verb.toLowerCase();

  if (lowerVerb === 'look' || lowerVerb === 'l') {
    describeRoom(ctx);
    return;
  }

  if (lowerVerb === 'help') {
    showHelp(ctx);
    return;
  }

  if (lowerVerb === 'say') {
    handleSay(ctx, rest);
    return;
  }

  if (lowerVerb === 'shout') {
    handleShout(ctx, rest);
    return;
  }

  if (lowerVerb === 'who') {
    handleWho(ctx);
    return;
  }

  if (lowerVerb === 'attack') {
    handleAttack(ctx, rest);
    return;
  }

  if (lowerVerb === 'flee') {
    handleFlee(ctx);
    return;
  }

  if (lowerVerb === 'get') {
    handleGet(ctx, rest);
    return;
  }

  if (lowerVerb === 'drop') {
    handleDrop(ctx, rest);
    return;
  }

  if (lowerVerb === 'inventory' || lowerVerb === 'inv') {
    handleInventory(ctx);
    return;
  }

  if (lowerVerb === 'equip') {
    handleEquip(ctx, rest);
    return;
  }

  if (lowerVerb === 'use') {
    handleUse(ctx, rest);
    return;
  }

  if (lowerVerb === 'village') {
    handleVillage(ctx, rest);
    return;
  }

  if (lowerVerb === 'travel') {
    handleTravel(ctx, rest);
    return;
  }

  if (lowerVerb === 'leave') {
    handleLeave(ctx);
    return;
  }

  if (lowerVerb === 'raid') {
    handleRaid(ctx, rest);
    return;
  }

  if (lowerVerb === 'stat') {
    handleStat(ctx, rest);
    return;
  }

  if (lowerVerb === 'skill') {
    handleSkill(ctx, rest);
    return;
  }

  if (lowerVerb === 'cast' || lowerVerb === '마법') {
    handleCast(ctx, rest);
    return;
  }

  const direction = resolveDirection(lowerVerb);
  if (direction) {
    handleMove(ctx, direction);
    return;
  }

  ctx.send({ type: 'text', text: `알 수 없는 명령어입니다: ${verb}` });
}
