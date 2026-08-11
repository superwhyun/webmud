import type { NpcSpawnSeed, NpcTemplateSeed } from './types.js';

export const NPC_TEMPLATES: NpcTemplateSeed[] = [
  {
    id: 1,
    name: '잡화상 마리아',
    description: '온갖 잡화를 취급하는 상인이다. 낮은 레벨의 아이템이라면 무엇이든 사고판다.',
    type: 'merchant',
    dealType: 'all',
  },
  {
    id: 2,
    name: '무기 상인 브루노',
    description: '대장간에서 직접 벼려낸 무기만 취급하는 상인이다.',
    type: 'merchant',
    dealType: 'weapon',
  },
  {
    id: 3,
    name: '방어구 상인 그레타',
    description: '튼튼한 갑옷과 방패를 취급하는 상인이다. 손님의 몸에 맞는 장비를 정성껏 골라준다.',
    type: 'merchant',
    dealType: 'armor',
  },
  {
    id: 4,
    name: '물약 상인 노아',
    description: '치유 물약과 마나 물약을 파는 떠돌이 상인이다. 여행자들 사이에서 입소문이 자자하다.',
    type: 'merchant',
    dealType: 'consumable',
  },
  {
    id: 5,
    name: '대장장이 두칸',
    description: '우락부락한 팔뚝을 가진 대장장이다. 화로 앞에서 쉴 새 없이 망치를 두드린다.',
    type: 'blacksmith',
    dealType: 'all',
  },
  {
    id: 6,
    name: '여관지기 한나',
    description: '여관을 운영하는 인심 좋은 주인장이다. 지친 모험자들에게 따뜻한 잠자리를 내어준다.',
    type: 'innkeeper',
    dealType: 'all',
  },
  {
    id: 7,
    name: '훈련관 파비안',
    description: '신참 모험자들을 단련시키는 노련한 훈련관이다. 기초 전투 요령을 가르쳐준다.',
    type: 'trainer',
    dealType: 'all',
  },
  {
    id: 8,
    name: '마을 원로 셀리아',
    description: '마을의 오랜 역사를 알고 있는 원로다. 옛이야기와 전설을 들려주곤 한다.',
    type: 'story',
    dealType: 'all',
  },
  {
    id: 9,
    name: '문지기 로건',
    description: '마을 어귀를 지키는 문지기다. 숲 너머의 위험을 여행자들에게 경고한다.',
    type: 'story',
    dealType: 'all',
  },
];

export const NPC_SPAWNS: NpcSpawnSeed[] = [
  { roomId: 4, npcTemplateId: 1 },
  { roomId: 3, npcTemplateId: 2 },
  { roomId: 4, npcTemplateId: 3 },
  { roomId: 1, npcTemplateId: 4 },
  { roomId: 3, npcTemplateId: 5 },
  { roomId: 2, npcTemplateId: 6 },
  { roomId: 1, npcTemplateId: 7 },
  { roomId: 1, npcTemplateId: 8 },
  { roomId: 5, npcTemplateId: 9 },
];
