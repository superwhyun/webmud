import { db } from '../../db/client.js';
import type { BuildingType, VillageMemberRow, VillagePlotRow, VillageRow } from '../../db/types.js';
import { registerRoom } from '../World.js';

export const FOUND_COST_GOLD = 100;
export const STARTING_PLOTS = 3;

export interface BuildingDefinition {
  type: BuildingType;
  name: string;
  cost: number;
  resource: 'wood' | 'ore' | 'food';
  output: number;
}

export const BUILDING_CATALOG: Record<BuildingType, BuildingDefinition> = {
  lumber_camp: { type: 'lumber_camp', name: '벌목장', cost: 150, resource: 'wood', output: 2 },
  mine: { type: 'mine', name: '광산', cost: 200, resource: 'ore', output: 2 },
  farm: { type: 'farm', name: '농장', cost: 120, resource: 'food', output: 3 },
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

export function foundVillage(
  characterId: number,
  characterGold: number,
  name: string,
): FoundVillageResult {
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
    const roomInfo = db
      .prepare('INSERT INTO rooms (name, description) VALUES (?, ?)')
      .run(roomName, roomDescription);
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

  registerRoom({ id: roomId, name: roomName, description: roomDescription, exits: {} });

  return { success: true, village, roomId };
}

export interface BuyLandResult {
  success: boolean;
  error?: string;
  cost?: number;
  plotIndex?: number;
}

export function buyLand(village: VillageRow): BuyLandResult {
  const plots = getVillagePlots(village.id);
  const cost = nextPlotCost(plots.length);

  if (village.gold < cost) {
    return { success: false, error: `땅을 사려면 국고에 gold ${cost}이 필요합니다. (현재 ${village.gold})` };
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE villages SET gold = gold - ? WHERE id = ?').run(cost, village.id);
    db.prepare('INSERT INTO village_plots (village_id, plot_index) VALUES (?, ?)').run(
      village.id,
      plots.length,
    );
  });
  tx();

  return { success: true, cost, plotIndex: plots.length };
}

export interface DepositResult {
  success: boolean;
  error?: string;
}

export function depositGold(
  village: VillageRow,
  characterId: number,
  characterGold: number,
  amount: number,
): DepositResult {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { success: false, error: '기부할 금액은 1 이상의 정수여야 합니다.' };
  }
  if (characterGold < amount) {
    return { success: false, error: `gold가 부족합니다. (보유 ${characterGold})` };
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE characters SET gold = gold - ? WHERE id = ?').run(amount, characterId);
    db.prepare('UPDATE villages SET gold = gold + ? WHERE id = ?').run(amount, village.id);
  });
  tx();

  return { success: true };
}

export interface BuildResult {
  success: boolean;
  error?: string;
  building?: BuildingDefinition;
}

export function buildOnPlot(village: VillageRow, plotIndex: number, buildingType: string): BuildResult {
  const definition = BUILDING_CATALOG[buildingType as BuildingType];
  if (!definition) {
    const options = Object.values(BUILDING_CATALOG)
      .map((b) => `${b.type}(${b.name})`)
      .join(', ');
    return { success: false, error: `알 수 없는 건물 종류입니다. 가능한 종류: ${options}` };
  }

  const plot = db
    .prepare('SELECT * FROM village_plots WHERE village_id = ? AND plot_index = ?')
    .get(village.id, plotIndex) as VillagePlotRow | undefined;

  if (!plot) {
    return { success: false, error: '그런 땅 칸이 없습니다.' };
  }
  if (plot.building_type) {
    return { success: false, error: '이미 건물이 있는 칸입니다.' };
  }
  if (village.gold < definition.cost) {
    return {
      success: false,
      error: `건설하려면 국고에 gold ${definition.cost}이 필요합니다. (현재 ${village.gold})`,
    };
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE villages SET gold = gold - ? WHERE id = ?').run(definition.cost, village.id);
    db.prepare('UPDATE village_plots SET building_type = ? WHERE id = ?').run(definition.type, plot.id);
  });
  tx();

  return { success: true, building: definition };
}

export interface JoinResult {
  success: boolean;
  error?: string;
  village?: VillageRow;
}

export function joinVillage(characterId: number, roomId: number): JoinResult {
  const village = findVillageByRoomId(roomId);
  if (!village) {
    return { success: false, error: '이곳은 마을이 아닙니다.' };
  }
  if (findVillageByCharacterMembership(characterId)) {
    return { success: false, error: '이미 소속된 마을이 있습니다. 먼저 village quit으로 탈퇴하세요.' };
  }

  db.prepare('INSERT INTO village_members (village_id, character_id, role) VALUES (?, ?, ?)').run(
    village.id,
    characterId,
    'member',
  );

  return { success: true, village };
}

export interface QuitResult {
  success: boolean;
  error?: string;
  village?: VillageRow;
}

export function quitVillage(characterId: number): QuitResult {
  const village = findVillageByCharacterMembership(characterId);
  if (!village) {
    return { success: false, error: '소속된 마을이 없습니다.' };
  }
  if (village.lord_character_id === characterId) {
    return { success: false, error: '영주는 마을을 탈퇴할 수 없습니다.' };
  }

  db.prepare('DELETE FROM village_members WHERE character_id = ?').run(characterId);

  return { success: true, village };
}

export interface VillageMemberWithName extends VillageMemberRow {
  character_name: string;
}

export function getVillageMembers(villageId: number): VillageMemberWithName[] {
  return db
    .prepare(
      `SELECT vm.*, c.name as character_name FROM village_members vm
       JOIN characters c ON c.id = vm.character_id
       WHERE vm.village_id = ?
       ORDER BY (vm.role = 'lord') DESC, vm.joined_at ASC`,
    )
    .all(villageId) as VillageMemberWithName[];
}

export function splitTithe(
  totalAmount: number,
  tithePercent: number,
): { personalAmount: number; titheAmount: number } {
  const titheAmount = Math.floor((totalAmount * tithePercent) / 100);
  return { personalAmount: totalAmount - titheAmount, titheAmount };
}

export interface GoldEarningsResult {
  personalAmount: number;
  titheAmount: number;
  village?: VillageRow;
}

/** Credits gold earned by a character, redirecting a tithe cut to their village's treasury if they're a member. */
export function applyGoldEarnings(characterId: number, totalAmount: number): GoldEarningsResult {
  const village = findVillageByCharacterMembership(characterId);
  if (!village) {
    return { personalAmount: totalAmount, titheAmount: 0 };
  }

  const { personalAmount, titheAmount } = splitTithe(totalAmount, village.tithe_percent);
  if (titheAmount > 0) {
    db.prepare('UPDATE villages SET gold = gold + ? WHERE id = ?').run(titheAmount, village.id);
  }

  return { personalAmount, titheAmount, village };
}
