import type { ElementType, ItemGrade, JobType, NpcDealType, NpcType } from '@mud/shared';

export interface CharacterRow {
  id: number;
  account_id: number;
  name: string;
  room_id: number;
  hp: number;
  max_hp: number;
  mp: number;
  max_mp: number;
  level: number;
  exp: number;
  job: JobType | null;
  strength: number;
  dexterity: number;
  intelligence: number;
  vitality: number;
  wisdom: number;
  luck: number;
  physical_defense: number;
  magic_defense: number;
  element: ElementType;
  gold: number;
  unallocated_stat_points: number;
  unallocated_skill_points: number;
  created_at: string;
}

export interface CharacterWithRoomRow extends CharacterRow {
  room_name: string;
}

export interface CharacterSkillRow {
  id: number;
  character_id: number;
  skill_id: string;
  rank: number;
  learned_at: string;
}

export interface ItemRow {
  id: number;
  name: string;
  description: string;
  type: string;
  slot: string | null;
  level: number;
  grade: ItemGrade;
  strength_bonus: number;
  dexterity_bonus: number;
  attack_power_bonus: number;
  intelligence_bonus: number;
  physical_defense_bonus: number;
  magic_defense_bonus: number;
  heal_amount: number;
  mana_amount: number;
  value: number;
}

export type BuildingType = 'lumber_camp' | 'mine' | 'farm' | 'watchtower';

export interface MobTemplateRow {
  id: number;
  name: string;
  hp: number;
  hp_max: number;
  strength: number;
  strength_max: number;
  dexterity: number;
  dexterity_max: number;
  physical_defense: number;
  physical_defense_max: number;
  magic_defense: number;
  magic_defense_max: number;
  element: ElementType;
  damage_type: 'physical' | 'magic';
  exp_reward: number;
  exp_reward_max: number;
  gold_reward: number;
  gold_reward_max: number;
  min_level: number;
  max_level: number;
  hostile: number;
}

export interface MobLootPoolRow {
  id: number;
  mob_template_id: number;
  item_id: number;
  weight: number;
}

export interface VillageRow {
  id: number;
  name: string;
  room_id: number;
  lord_character_id: number;
  level: number;
  gold: number;
  wood: number;
  ore: number;
  food: number;
  tithe_percent: number;
  raid_protected_until: string | null;
  created_at: string;
}

export interface VillagePlotRow {
  id: number;
  village_id: number;
  plot_index: number;
  building_type: BuildingType | null;
}

export type VillageMemberRole = 'lord' | 'member';

export interface VillageMemberRow {
  id: number;
  village_id: number;
  character_id: number;
  role: VillageMemberRole;
  joined_at: string;
}

export interface VillageGarrisonRow {
  id: number;
  village_id: number;
  mob_template_id: number;
}

export interface NpcTemplateRow {
  id: number;
  name: string;
  description: string;
  type: NpcType;
  deal_type: NpcDealType;
}
