import { z } from 'zod';
import { ELEMENT_VALUES } from '@mud/shared';

const DAMAGE_TYPES = ['physical', 'magic'] as const;

export const mobTemplateBaseSchema = z.object({
  name: z.string().min(1, '이름을 입력하세요.').max(30, '이름은 30자 이하여야 합니다.'),
  hp: z.number().int().min(1),
  hpMax: z.number().int().min(1),
  strength: z.number().int().min(0),
  strengthMax: z.number().int().min(0),
  dexterity: z.number().int().min(0),
  dexterityMax: z.number().int().min(0),
  physicalDefense: z.number().int().min(0),
  physicalDefenseMax: z.number().int().min(0),
  magicDefense: z.number().int().min(0),
  magicDefenseMax: z.number().int().min(0),
  element: z.enum(ELEMENT_VALUES as [string, ...string[]], { message: '속성을 선택해주세요.' }),
  damageType: z.enum(DAMAGE_TYPES, { message: '올바른 피해 유형이 아닙니다.' }),
  expReward: z.number().int().min(0),
  expRewardMax: z.number().int().min(0),
  goldReward: z.number().int().min(0),
  goldRewardMax: z.number().int().min(0),
  minLevel: z.number().int().min(1, '최소 레벨은 1 이상이어야 합니다.').default(1),
  maxLevel: z.number().int().min(1, '최대 레벨은 1 이상이어야 합니다.').default(1),
  hostile: z.boolean().default(true),
  isBoss: z.boolean().default(false),
});

interface MobTemplateRangeFields {
  minLevel: number;
  maxLevel: number;
  hp: number;
  hpMax: number;
  strength: number;
  strengthMax: number;
  dexterity: number;
  dexterityMax: number;
  physicalDefense: number;
  physicalDefenseMax: number;
  magicDefense: number;
  magicDefenseMax: number;
  expReward: number;
  expRewardMax: number;
  goldReward: number;
  goldRewardMax: number;
}

/** min~max 필드 쌍마다 "최대값은 최소값 이상"을 검증한다. mobTemplateBaseSchema와 그 extend본 모두에 재사용한다. */
export function applyMobTemplateRangeChecks<Schema extends z.ZodType<MobTemplateRangeFields>>(schema: Schema) {
  return schema
    .refine((d) => d.maxLevel >= d.minLevel, { message: '최대 레벨은 최소 레벨 이상이어야 합니다.', path: ['maxLevel'] })
    .refine((d) => d.hpMax >= d.hp, { message: '최대 HP는 최소 HP 이상이어야 합니다.', path: ['hpMax'] })
    .refine((d) => d.strengthMax >= d.strength, { message: '최대 힘은 최소 힘 이상이어야 합니다.', path: ['strengthMax'] })
    .refine((d) => d.dexterityMax >= d.dexterity, { message: '최대 민첩은 최소 민첩 이상이어야 합니다.', path: ['dexterityMax'] })
    .refine((d) => d.physicalDefenseMax >= d.physicalDefense, {
      message: '최대 물리방어는 최소 물리방어 이상이어야 합니다.',
      path: ['physicalDefenseMax'],
    })
    .refine((d) => d.magicDefenseMax >= d.magicDefense, {
      message: '최대 마법방어는 최소 마법방어 이상이어야 합니다.',
      path: ['magicDefenseMax'],
    })
    .refine((d) => d.expRewardMax >= d.expReward, { message: '최대 경험치는 최소 경험치 이상이어야 합니다.', path: ['expRewardMax'] })
    .refine((d) => d.goldRewardMax >= d.goldReward, { message: '최대 골드는 최소 골드 이상이어야 합니다.', path: ['goldRewardMax'] });
}

export const mobTemplateSchema = applyMobTemplateRangeChecks(mobTemplateBaseSchema);
