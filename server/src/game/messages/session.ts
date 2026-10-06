import { createMessageDispatcher, type ClientMessage } from '@mud/shared';
import type { CommandContext } from '../commands/context.js';
import { dispatchCommand } from '../commands/index.js';
import { handleEquipItemMessage, handleUnequipItemMessage, handleReorderInventoryMessage } from '../commands/equipment.js';
import { handleDropItemMessage, handleUseItemMessage, handleSalvageItemMessage } from '../commands/items.js';
import { handleLearnSkillMessage, handleUpgradeSkillMessage, handleResetSkillsMessage } from '../commands/skills.js';
import { handleAllocateStatMessage } from '../commands/stats.js';

export type SessionMessage = Exclude<ClientMessage, { type: 'auth' | 'chooseJob' }>;

export const dispatchSessionMessage = createMessageDispatcher<CommandContext, SessionMessage>({
  command: (ctx, message) => dispatchCommand(ctx, message.text),
  equipItem: (ctx, message) => handleEquipItemMessage(ctx, message.inventoryId),
  unequipItem: (ctx, message) => handleUnequipItemMessage(ctx, message.slot),
  dropItem: (ctx, message) => handleDropItemMessage(ctx, message.inventoryId),
  useItem: (ctx, message) => handleUseItemMessage(ctx, message.inventoryId),
  salvageItem: (ctx, message) => handleSalvageItemMessage(ctx, message.inventoryId),
  reorderInventory: (ctx, message) => handleReorderInventoryMessage(ctx, message.inventoryIds),
  learnSkill: (ctx, message) => handleLearnSkillMessage(ctx, message.skillId),
  upgradeSkill: (ctx, message) => handleUpgradeSkillMessage(ctx, message.skillId),
  resetSkills: (ctx) => handleResetSkillsMessage(ctx),
  allocateStat: (ctx, message) => handleAllocateStatMessage(ctx, message.statKey, message.amount),
});
