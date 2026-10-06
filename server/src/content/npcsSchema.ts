import { z } from 'zod';
import { NPC_DEAL_TYPE_VALUES, NPC_TYPE_VALUES } from '@mud/shared';

export const npcTemplateSchema = z.object({
  name: z.string().min(1, '이름을 입력하세요.').max(30, '이름은 30자 이하여야 합니다.'),
  description: z.string().min(1, '설명을 입력하세요.').max(200, '설명은 200자 이하여야 합니다.'),
  type: z.enum(NPC_TYPE_VALUES as [string, ...string[]], { message: '올바른 종류가 아닙니다.' }),
  dealType: z.enum(NPC_DEAL_TYPE_VALUES as [string, ...string[]], { message: '올바른 취급 품목이 아닙니다.' }),
});
