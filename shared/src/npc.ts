export type NpcType = 'merchant' | 'blacksmith' | 'innkeeper' | 'trainer' | 'story';

export const NPC_TYPE_VALUES: NpcType[] = ['merchant', 'blacksmith', 'innkeeper', 'trainer', 'story'];

export const NPC_TYPE_LABELS: Record<NpcType, string> = {
  merchant: '상인',
  blacksmith: '대장장이',
  innkeeper: '여관 주인',
  trainer: '훈련관',
  story: '스토리',
};

export type NpcDealType = 'weapon' | 'armor' | 'consumable' | 'all';

export const NPC_DEAL_TYPE_VALUES: NpcDealType[] = ['weapon', 'armor', 'consumable', 'all'];

export const NPC_DEAL_TYPE_LABELS: Record<NpcDealType, string> = {
  weapon: '무기',
  armor: '방어구',
  consumable: '소모품',
  all: '전체',
};
