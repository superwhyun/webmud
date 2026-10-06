import { z } from 'zod';
import { EQUIPMENT_SLOTS, ITEM_GRADE_VALUES } from '@mud/shared';

const ITEM_TYPES = ['weapon', 'armor', 'consumable'] as const;

export const itemSchema = z.object({
  name: z.string().min(1, '이름을 입력하세요.').max(30, '이름은 30자 이하여야 합니다.'),
  description: z.string().min(1, '설명을 입력하세요.').max(200, '설명은 200자 이하여야 합니다.'),
  type: z.enum(ITEM_TYPES, { message: '올바른 종류가 아닙니다.' }),
  slot: z.enum(EQUIPMENT_SLOTS as [string, ...string[]]).nullable().optional(),
  level: z.number().int().min(1, '레벨은 1 이상이어야 합니다.').default(1),
  grade: z.enum(ITEM_GRADE_VALUES as [string, ...string[]], { message: '올바른 등급이 아닙니다.' }),
  strengthBonus: z.number().int().default(0),
  dexterityBonus: z.number().int().default(0),
  attackPowerBonus: z.number().int().default(0),
  intelligenceBonus: z.number().int().default(0),
  physicalDefenseBonus: z.number().int().default(0),
  magicDefenseBonus: z.number().int().default(0),
  healAmount: z.number().int().min(0).default(0),
  manaAmount: z.number().int().min(0).default(0),
  value: z.number().int().min(0).default(0),
});
