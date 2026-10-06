import { z } from 'zod';
import { EQUIPMENT_SLOTS, JOB_VALUES, STAT_KEY_VALUES, type ClientMessage } from '@mud/shared';

const inventoryId = z.number().int().positive();
const skillId = z.string().min(1);

/** Validate untrusted WebSocket payloads before they reach game handlers. */
export const clientMessageSchema: z.ZodType<ClientMessage> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), token: z.string() }),
  z.object({ type: z.literal('command'), text: z.string() }),
  z.object({ type: z.literal('equipItem'), inventoryId }),
  z.object({ type: z.literal('unequipItem'), slot: z.enum(EQUIPMENT_SLOTS) }),
  z.object({ type: z.literal('dropItem'), inventoryId }),
  z.object({ type: z.literal('useItem'), inventoryId }),
  z.object({ type: z.literal('salvageItem'), inventoryId }),
  z.object({ type: z.literal('reorderInventory'), inventoryIds: z.array(inventoryId) }),
  z.object({ type: z.literal('learnSkill'), skillId }),
  z.object({ type: z.literal('upgradeSkill'), skillId }),
  z.object({ type: z.literal('resetSkills') }),
  z.object({ type: z.literal('allocateStat'), statKey: z.enum(STAT_KEY_VALUES), amount: z.number().int().positive() }),
  z.object({ type: z.literal('chooseJob'), job: z.enum(JOB_VALUES) }),
]);
