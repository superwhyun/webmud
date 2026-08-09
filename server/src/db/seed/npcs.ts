import type { NpcSpawnSeed, NpcTemplateSeed } from './types.js';

export const NPC_TEMPLATES: NpcTemplateSeed[] = [
  {
    id: 1,
    name: '잡화상 마리아',
    description: '온갖 잡화를 취급하는 상인이다. 낮은 레벨의 아이템이라면 무엇이든 사고판다.',
    type: 'merchant',
    level: 10,
    dealType: 'all',
  },
  {
    id: 2,
    name: '무기 상인 브루노',
    description: '대장간에서 직접 벼려낸 무기만 취급하는 상인이다.',
    type: 'merchant',
    level: 20,
    dealType: 'weapon',
  },
];

export const NPC_SPAWNS: NpcSpawnSeed[] = [
  { roomId: 4, npcTemplateId: 1 },
  { roomId: 3, npcTemplateId: 2 },
];
