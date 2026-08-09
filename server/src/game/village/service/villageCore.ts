import { db } from '../../../db/client.js';
import type { BuildingType, VillagePlotRow, VillageRow } from '../../../db/types.js';
import { registerRoom } from '../../World.js';

export const FOUND_COST_GOLD = 100;
export const STARTING_PLOTS = 3;

export interface BuildingDefinition {
  type: BuildingType;
  name: string;
  cost: number;
  resource?: 'wood' | 'ore' | 'food';
  output?: number;
  garrisonSlots?: number;
}

export const BUILDING_CATALOG: Record<BuildingType, BuildingDefinition> = {
  lumber_camp: { type: 'lumber_camp', name: '벌목장', cost: 150, resource: 'wood', output: 2 },
  mine: { type: 'mine', name: '광산', cost: 200, resource: 'ore', output: 2 },
  farm: { type: 'farm', name: '농장', cost: 120, resource: 'food', output: 3 },
  watchtower: { type: 'watchtower', name: '초소', cost: 180, garrisonSlots: 2 },
};

const VILLAGE_NAME_PATTERN = /^[a-zA-Z0-9_가-힣 ]+$/;

export function isValidVillageName(name: string): boolean {
  return name.length >= 2 && name.length <= 20 && VILLAGE_NAME_PATTERN.test(name);
}

export function nextPlotCost(currentPlotCount: number): number {
  return 100 + 50 * currentPlotCount;
}

export function findVillageByRoomId(roomId: number): VillageRow | undefined {
  return db.prepare('SELECT * FROM villages WHERE room_id = ?').get(roomId) as VillageRow | undefined;
}

export function findVillageByName(name: string): VillageRow | undefined {
  return db.prepare('SELECT * FROM villages WHERE name = ?').get(name) as VillageRow | undefined;
}

export function findVillageByCharacterMembership(characterId: number): VillageRow | undefined {
  return db
    .prepare(
      `SELECT v.* FROM villages v
       JOIN village_members vm ON vm.village_id = v.id
       WHERE vm.character_id = ?`,
    )
    .get(characterId) as VillageRow | undefined;
}

export function listVillages(): VillageRow[] {
  return db.prepare('SELECT * FROM villages ORDER BY level DESC, name ASC').all() as VillageRow[];
}

export function getVillagePlots(villageId: number): VillagePlotRow[] {
  return db
    .prepare('SELECT * FROM village_plots WHERE village_id = ? ORDER BY plot_index ASC')
    .all(villageId) as VillagePlotRow[];
}

export interface FoundVillageResult {
  success: boolean;
  error?: string;
  village?: VillageRow;
  roomId?: number;
}

export function foundVillage(characterId: number, characterGold: number, name: string): FoundVillageResult {
  if (!isValidVillageName(name)) {
    return { success: false, error: '마을 이름은 2~20자의 영문/숫자/한글/공백만 가능합니다.' };
  }
  if (findVillageByCharacterMembership(characterId)) {
    return { success: false, error: '이미 소속된 마을이 있습니다.' };
  }
  if (findVillageByName(name)) {
    return { success: false, error: '이미 사용 중인 마을 이름입니다.' };
  }
  if (characterGold < FOUND_COST_GOLD) {
    return { success: false, error: `마을을 세우려면 gold ${FOUND_COST_GOLD}이 필요합니다.` };
  }

  const roomName = `${name} 영주관`;
  const roomDescription = `${name} 마을의 중심, 영주관이다. 이곳에서 마을을 다스릴 수 있다.`;

  let village: VillageRow | undefined;
  let roomId = 0;

  const tx = db.transaction(() => {
    const roomInfo = db.prepare('INSERT INTO rooms (name, description) VALUES (?, ?)').run(roomName, roomDescription);
    roomId = Number(roomInfo.lastInsertRowid);

    const villageInfo = db
      .prepare('INSERT INTO villages (name, room_id, lord_character_id) VALUES (?, ?, ?)')
      .run(name, roomId, characterId);
    const villageId = Number(villageInfo.lastInsertRowid);

    db.prepare('INSERT INTO village_members (village_id, character_id, role) VALUES (?, ?, ?)').run(
      villageId,
      characterId,
      'lord',
    );

    const insertPlot = db.prepare('INSERT INTO village_plots (village_id, plot_index) VALUES (?, ?)');
    for (let i = 0; i < STARTING_PLOTS; i++) insertPlot.run(villageId, i);

    db.prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(FOUND_COST_GOLD, characterId);

    village = db.prepare('SELECT * FROM villages WHERE id = ?').get(villageId) as VillageRow;
  });
  tx();

  registerRoom({ id: roomId, name: roomName, description: roomDescription, x: 0, y: 0, zoneId: 1, exits: {} });

  return { success: true, village, roomId };
}
