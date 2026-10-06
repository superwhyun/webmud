import { COMMAND_ALIASES, COMMAND_NAMES, type CommandName } from '@mud/shared';
import { handleSay, handleShout, handleTell, handleWho } from './chat.js';
import { handleAttack, handleCast, handleFlee } from './combat.js';
import type { CommandContext } from './context.js';
import { handleConsider, handleExamine } from './inspect.js';
import { handleDrop, handleEquip, handleGet, handleGive, handleInventory, handleUse } from './items.js';
import { describeRoom, showHelp } from './misc.js';
import { handleEnter, handleMove, resolveDirection } from './movement.js';
import { handleBuy, handleSell, handleShop } from './npc.js';
import { handleRaid } from './raid.js';
import { handleRest } from '../rest.js';
import { handleSkill } from './skills.js';
import { handleStat } from './stats.js';
import { handleLeave, handleTravel, handleVillage } from './village.js';

import { createCommandRegistry, type CommandDefinition, type CommandHandler } from './registry.js';

const handlers: Record<CommandName, CommandHandler> = {
  look: (ctx) => describeRoom(ctx),
  help: (ctx) => showHelp(ctx),
  say: handleSay,
  shout: handleShout,
  tell: handleTell,
  who: (ctx) => handleWho(ctx),
  attack: handleAttack,
  flee: (ctx) => handleFlee(ctx),
  rest: (ctx) => handleRest(ctx),
  get: handleGet,
  drop: handleDrop,
  give: handleGive,
  examine: handleExamine,
  consider: handleConsider,
  inventory: (ctx) => handleInventory(ctx),
  equip: handleEquip,
  use: handleUse,
  shop: (ctx) => handleShop(ctx),
  buy: handleBuy,
  sell: handleSell,
  village: handleVillage,
  travel: handleTravel,
  leave: (ctx) => handleLeave(ctx),
  enter: handleEnter,
  raid: handleRaid,
  stat: handleStat,
  skill: handleSkill,
  cast: handleCast,
};

export const COMMAND_DEFINITIONS: readonly CommandDefinition[] = COMMAND_NAMES.map((name) => ({
  name,
  aliases: COMMAND_ALIASES[name],
  handle: handlers[name],
}));


const commands = createCommandRegistry(COMMAND_DEFINITIONS);

export function dispatchCommand(ctx: CommandContext, rawText: string): void {
  const trimmed = rawText.trim();
  if (!trimmed) return;
  const spaceIndex = trimmed.indexOf(' ');
  const verb = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  const rest = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1);
  const lowerVerb = verb.toLowerCase();
  const handler = commands.get(lowerVerb);
  if (handler) {
    handler(ctx, rest);
    return;
  }
  const direction = resolveDirection(lowerVerb);
  if (direction) {
    handleMove(ctx, direction);
    return;
  }
  ctx.send({ type: 'text', text: `알 수 없는 명령어입니다: ${verb}` });
}
