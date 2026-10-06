import type { ElementType } from '../elements.js';
import type { JobType } from '../jobs.js';

export interface CharacterDto {
  id: number;
  name: string;
  room_id: number;
  room_name: string;
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
}

export interface MeResponse {
  username: string;
  character: CharacterDto | null;
  isBuilder: boolean;
  isAdmin: boolean;
}
