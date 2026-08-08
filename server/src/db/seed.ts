import type Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import type { ElementType, EquipmentSlot, ItemGrade } from '@mud/shared';

export const STARTING_ROOM_ID = 1;

const DEFAULT_ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USERNAME ?? 'admin';
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD ?? 'admin1234';
const SALT_ROUNDS = 10;

if (!process.env.DEFAULT_ADMIN_PASSWORD) {
  console.warn(
    `[db] DEFAULT_ADMIN_PASSWORD not set; seeding default admin account "${DEFAULT_ADMIN_USERNAME}" with a well-known password. Change it (or set DEFAULT_ADMIN_USERNAME/DEFAULT_ADMIN_PASSWORD) before exposing this server publicly.`,
  );
}

interface RoomSeed {
  id: number;
  name: string;
  description: string;
}

interface ExitSeed {
  roomId: number;
  direction: string;
  targetRoomId: number;
}

interface ItemSeed {
  id: number;
  name: string;
  description: string;
  type: 'weapon' | 'armor' | 'consumable';
  slot: EquipmentSlot | null;
  level: number;
  grade: ItemGrade;
  strengthBonus: number;
  dexterityBonus: number;
  physicalDefenseBonus: number;
  magicDefenseBonus: number;
  healAmount: number;
  value: number;
}

interface RoomItemSeed {
  roomId: number;
  itemId: number;
  quantity: number;
}

interface MobTemplateSeed {
  id: number;
  name: string;
  hp: number;
  strength: number;
  dexterity: number;
  physicalDefense: number;
  magicDefense: number;
  element: ElementType;
  damageType: 'physical' | 'magic';
  expReward: number;
  goldReward: number;
}

interface MobSpawnSeed {
  roomId: number;
  mobTemplateId: number;
  respawnSeconds: number;
}

const ROOMS: RoomSeed[] = [
  {
    id: 1,
    name: '마을 광장',
    description:
      '오래된 돌바닥이 깔린 마을 광장이다. 낡은 분수대에서 물이 졸졸 흐르고, 주위로 몇 채의 건물이 늘어서 있다.',
  },
  {
    id: 2,
    name: '여관',
    description: '나무 냄새가 은은하게 풍기는 아늑한 여관이다. 벽난로에서 장작이 타닥타닥 타오른다.',
  },
  {
    id: 3,
    name: '대장간',
    description: '쇠 두드리는 소리가 쩌렁쩌렁 울리는 대장간이다. 화로의 열기가 얼굴을 스친다.',
  },
  {
    id: 4,
    name: '상점',
    description: '온갖 잡화가 어지럽게 쌓여 있는 상점이다. 주인은 어디 갔는지 보이지 않는다.',
  },
  {
    id: 5,
    name: '마을 어귀',
    description: '마을을 벗어나는 길목이다. 저 멀리 숲의 초입이 보인다.',
  },
  {
    id: 6,
    name: '숲 입구',
    description: '커다란 나무들이 하늘을 가리기 시작하는 숲의 입구다.',
  },
  {
    id: 7,
    name: '어두운 숲',
    description: '햇빛이 거의 들지 않는 어두운 숲속이다. 어디선가 부스럭거리는 소리가 들린다.',
  },
  {
    id: 8,
    name: '오래된 다리',
    description: '금방이라도 무너질 듯한 낡은 나무다리가 계곡을 가로지르고 있다.',
  },
  {
    id: 9,
    name: '폐허',
    description: '누가 살았는지 알 수 없는 오래된 건물의 잔해가 남아있다.',
  },
  {
    id: 10,
    name: '미개척지',
    description:
      '황무지 너머, 아직 누구의 깃발도 꽂히지 않은 땅이 펼쳐진다. 이곳에서 새로운 마을을 세우거나(village found), 이미 세워진 마을 목록을 볼(village list) 수 있다.',
  },
];

export const FRONTIER_ROOM_ID = 10;

const EXITS: ExitSeed[] = [
  { roomId: 1, direction: 'north', targetRoomId: 2 },
  { roomId: 2, direction: 'south', targetRoomId: 1 },
  { roomId: 1, direction: 'east', targetRoomId: 3 },
  { roomId: 3, direction: 'west', targetRoomId: 1 },
  { roomId: 1, direction: 'west', targetRoomId: 4 },
  { roomId: 4, direction: 'east', targetRoomId: 1 },
  { roomId: 1, direction: 'south', targetRoomId: 5 },
  { roomId: 5, direction: 'north', targetRoomId: 1 },
  { roomId: 5, direction: 'south', targetRoomId: 6 },
  { roomId: 6, direction: 'north', targetRoomId: 5 },
  { roomId: 6, direction: 'south', targetRoomId: 7 },
  { roomId: 7, direction: 'north', targetRoomId: 6 },
  { roomId: 7, direction: 'east', targetRoomId: 8 },
  { roomId: 8, direction: 'west', targetRoomId: 7 },
  { roomId: 8, direction: 'east', targetRoomId: 9 },
  { roomId: 9, direction: 'west', targetRoomId: 8 },
  { roomId: 9, direction: 'south', targetRoomId: 10 },
  { roomId: 10, direction: 'north', targetRoomId: 9 },
];

const ITEMS: ItemSeed[] = [
  {
    id: 1,
    name: '낡은 검',
    description: '날이 조금 무뎌졌지만 여전히 쓸만한 검이다.',
    type: 'weapon',
    slot: 'weapon',
    level: 1,
    grade: 'low',
    strengthBonus: 3,
    dexterityBonus: 0,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 0,
    healAmount: 0,
    value: 10,
  },
  {
    id: 2,
    name: '나무 방패',
    description: '투박하지만 튼튼한 나무 방패다.',
    type: 'armor',
    slot: 'shield',
    level: 1,
    grade: 'low',
    strengthBonus: 0,
    dexterityBonus: 0,
    physicalDefenseBonus: 2,
    magicDefenseBonus: 0,
    healAmount: 0,
    value: 8,
  },
  {
    id: 3,
    name: '체력 물약',
    description: '마시면 체력이 회복되는 붉은 물약이다.',
    type: 'consumable',
    slot: null,
    level: 1,
    grade: 'low',
    strengthBonus: 0,
    dexterityBonus: 0,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 0,
    healAmount: 10,
    value: 5,
  },
  {
    id: 4,
    name: '가죽 모자',
    description: '가볍게 머리를 보호해주는 가죽 모자다.',
    type: 'armor',
    slot: 'hat',
    level: 1,
    grade: 'low',
    strengthBonus: 0,
    dexterityBonus: 0,
    physicalDefenseBonus: 1,
    magicDefenseBonus: 0,
    healAmount: 0,
    value: 6,
  },
  {
    id: 5,
    name: '은귀걸이',
    description: '은은하게 빛나는 은귀걸이다.',
    type: 'armor',
    slot: 'earring',
    level: 1,
    grade: 'low',
    strengthBonus: 0,
    dexterityBonus: 1,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 0,
    healAmount: 0,
    value: 7,
  },
  {
    id: 6,
    name: '수호의 목걸이',
    description: '마법 기운이 감도는 목걸이다.',
    type: 'armor',
    slot: 'necklace',
    level: 1,
    grade: 'low',
    strengthBonus: 0,
    dexterityBonus: 0,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 2,
    healAmount: 0,
    value: 9,
  },
  {
    id: 7,
    name: '가죽 갑옷',
    description: '몸통을 감싸는 튼튼한 가죽 갑옷이다.',
    type: 'armor',
    slot: 'top',
    level: 1,
    grade: 'low',
    strengthBonus: 0,
    dexterityBonus: 0,
    physicalDefenseBonus: 2,
    magicDefenseBonus: 1,
    healAmount: 0,
    value: 10,
  },
  {
    id: 8,
    name: '가죽 각반',
    description: '다리를 보호하는 가죽 각반이다.',
    type: 'armor',
    slot: 'bottom',
    level: 1,
    grade: 'low',
    strengthBonus: 0,
    dexterityBonus: 1,
    physicalDefenseBonus: 1,
    magicDefenseBonus: 0,
    healAmount: 0,
    value: 8,
  },
  {
    id: 9,
    name: '가죽 장갑',
    description: '손놀림을 가볍게 해주는 가죽 장갑이다.',
    type: 'armor',
    slot: 'gloves',
    level: 1,
    grade: 'low',
    strengthBonus: 1,
    dexterityBonus: 1,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 0,
    healAmount: 0,
    value: 7,
  },
  {
    id: 10,
    name: '가죽 신발',
    description: '발걸음을 가볍게 해주는 가죽 신발이다.',
    type: 'armor',
    slot: 'shoes',
    level: 1,
    grade: 'low',
    strengthBonus: 0,
    dexterityBonus: 2,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 0,
    healAmount: 0,
    value: 7,
  },
  {
    id: 11,
    name: '힘의 반지',
    description: '착용자의 힘을 북돋아주는 반지다.',
    type: 'armor',
    slot: 'ring',
    level: 1,
    grade: 'low',
    strengthBonus: 2,
    dexterityBonus: 0,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 0,
    healAmount: 0,
    value: 12,
  },
  {
    id: 12,
    name: '강철 검',
    description: '단단하게 벼려진 강철 검이다.',
    type: 'weapon',
    slot: 'weapon',
    level: 5,
    grade: 'mid',
    strengthBonus: 5,
    dexterityBonus: 0,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 0,
    healAmount: 0,
    value: 40,
  },
  {
    id: 13,
    name: '사슬 갑옷',
    description: '촘촘히 엮은 사슬로 만든 갑옷이다.',
    type: 'armor',
    slot: 'top',
    level: 5,
    grade: 'mid',
    strengthBonus: 0,
    dexterityBonus: 0,
    physicalDefenseBonus: 3,
    magicDefenseBonus: 2,
    healAmount: 0,
    value: 35,
  },
  {
    id: 14,
    name: '마나 물약',
    description: '푸르게 빛나는 회복 물약이다.',
    type: 'consumable',
    slot: null,
    level: 5,
    grade: 'mid',
    strengthBonus: 0,
    dexterityBonus: 0,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 0,
    healAmount: 20,
    value: 15,
  },
  {
    id: 15,
    name: '강철 방패',
    description: '묵직하지만 방어력이 뛰어난 강철 방패다.',
    type: 'armor',
    slot: 'shield',
    level: 5,
    grade: 'mid',
    strengthBonus: 0,
    dexterityBonus: 0,
    physicalDefenseBonus: 4,
    magicDefenseBonus: 0,
    healAmount: 0,
    value: 30,
  },
  {
    id: 16,
    name: '미스릴 검',
    description: '가볍고 예리한 미스릴로 벼린 검이다.',
    type: 'weapon',
    slot: 'weapon',
    level: 10,
    grade: 'high',
    strengthBonus: 8,
    dexterityBonus: 2,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 0,
    healAmount: 0,
    value: 90,
  },
  {
    id: 17,
    name: '기사의 갑옷',
    description: '왕실 기사단이 착용하던 정교한 갑옷이다.',
    type: 'armor',
    slot: 'top',
    level: 10,
    grade: 'high',
    strengthBonus: 0,
    dexterityBonus: 0,
    physicalDefenseBonus: 6,
    magicDefenseBonus: 3,
    healAmount: 0,
    value: 80,
  },
  {
    id: 18,
    name: '상급 회복 물약',
    description: '진한 붉은빛을 띠는 강력한 회복 물약이다.',
    type: 'consumable',
    slot: null,
    level: 10,
    grade: 'high',
    strengthBonus: 0,
    dexterityBonus: 0,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 0,
    healAmount: 40,
    value: 35,
  },
  {
    id: 19,
    name: '은빛 반지',
    description: '은은한 은빛으로 빛나는 민첩의 반지다.',
    type: 'armor',
    slot: 'ring',
    level: 10,
    grade: 'high',
    strengthBonus: 0,
    dexterityBonus: 3,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 0,
    healAmount: 0,
    value: 70,
  },
  {
    id: 20,
    name: '용의 발톱',
    description: '고대 용의 발톱으로 벼려낸 무기다.',
    type: 'weapon',
    slot: 'weapon',
    level: 20,
    grade: 'rare',
    strengthBonus: 12,
    dexterityBonus: 4,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 0,
    healAmount: 0,
    value: 200,
  },
  {
    id: 21,
    name: '수호자의 방패',
    description: '고대 수호자가 사용하던 견고한 방패다.',
    type: 'armor',
    slot: 'shield',
    level: 20,
    grade: 'rare',
    strengthBonus: 0,
    dexterityBonus: 0,
    physicalDefenseBonus: 10,
    magicDefenseBonus: 5,
    healAmount: 0,
    value: 180,
  },
  {
    id: 22,
    name: '엘릭서',
    description: '희귀한 재료로 정제한 만능 회복약이다.',
    type: 'consumable',
    slot: null,
    level: 20,
    grade: 'rare',
    strengthBonus: 0,
    dexterityBonus: 0,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 0,
    healAmount: 80,
    value: 90,
  },
  {
    id: 23,
    name: '바람의 신발',
    description: '신은 이의 발걸음을 바람처럼 가볍게 만든다.',
    type: 'armor',
    slot: 'shoes',
    level: 20,
    grade: 'rare',
    strengthBonus: 0,
    dexterityBonus: 6,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 0,
    healAmount: 0,
    value: 160,
  },
  {
    id: 24,
    name: '전설의 대검',
    description: '수많은 영웅담에 등장하는 전설의 대검이다.',
    type: 'weapon',
    slot: 'weapon',
    level: 35,
    grade: 'legend',
    strengthBonus: 20,
    dexterityBonus: 0,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 0,
    healAmount: 0,
    value: 500,
  },
  {
    id: 25,
    name: '드래곤 스케일 갑옷',
    description: '용의 비늘로 만든 전설적인 갑옷이다.',
    type: 'armor',
    slot: 'top',
    level: 35,
    grade: 'legend',
    strengthBonus: 0,
    dexterityBonus: 0,
    physicalDefenseBonus: 15,
    magicDefenseBonus: 10,
    healAmount: 0,
    value: 450,
  },
  {
    id: 26,
    name: '천상의 물약',
    description: '하늘의 축복이 담긴 신비로운 물약이다.',
    type: 'consumable',
    slot: null,
    level: 35,
    grade: 'legend',
    strengthBonus: 0,
    dexterityBonus: 0,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 0,
    healAmount: 150,
    value: 220,
  },
  {
    id: 27,
    name: '불사조 깃털 목걸이',
    description: '불사조의 깃털로 만든 신비한 목걸이다.',
    type: 'armor',
    slot: 'necklace',
    level: 35,
    grade: 'legend',
    strengthBonus: 0,
    dexterityBonus: 0,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 12,
    healAmount: 0,
    value: 400,
  },
  {
    id: 28,
    name: '종말의 검',
    description: '세상의 종말을 부른다는 금단의 무기다.',
    type: 'weapon',
    slot: 'weapon',
    level: 50,
    grade: 'epic',
    strengthBonus: 30,
    dexterityBonus: 10,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 0,
    healAmount: 0,
    value: 1200,
  },
  {
    id: 29,
    name: '창세의 방패',
    description: '세상이 시작될 때부터 존재했다는 방패다.',
    type: 'armor',
    slot: 'shield',
    level: 50,
    grade: 'epic',
    strengthBonus: 0,
    dexterityBonus: 0,
    physicalDefenseBonus: 20,
    magicDefenseBonus: 15,
    healAmount: 0,
    value: 1100,
  },
  {
    id: 30,
    name: '신들의 축복 물약',
    description: '신들이 직접 축복을 내렸다는 전설의 물약이다.',
    type: 'consumable',
    slot: null,
    level: 50,
    grade: 'epic',
    strengthBonus: 0,
    dexterityBonus: 0,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 0,
    healAmount: 300,
    value: 600,
  },
  {
    id: 31,
    name: '무한의 반지',
    description: '착용자에게 무한한 힘을 부여한다는 반지다.',
    type: 'armor',
    slot: 'ring',
    level: 50,
    grade: 'epic',
    strengthBonus: 10,
    dexterityBonus: 10,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 0,
    healAmount: 0,
    value: 900,
  },
];

const ROOM_ITEMS: RoomItemSeed[] = [
  { roomId: 3, itemId: 1, quantity: 1 },
  { roomId: 4, itemId: 2, quantity: 1 },
  { roomId: 2, itemId: 3, quantity: 2 },
  { roomId: 4, itemId: 4, quantity: 1 },
  { roomId: 4, itemId: 5, quantity: 1 },
  { roomId: 4, itemId: 6, quantity: 1 },
  { roomId: 4, itemId: 7, quantity: 1 },
  { roomId: 4, itemId: 8, quantity: 1 },
  { roomId: 4, itemId: 9, quantity: 1 },
  { roomId: 4, itemId: 10, quantity: 1 },
  { roomId: 4, itemId: 11, quantity: 1 },
];

const MOB_TEMPLATES: MobTemplateSeed[] = [
  {
    id: 1,
    name: '쥐',
    hp: 8,
    strength: 2,
    dexterity: 1,
    physicalDefense: 0,
    magicDefense: 0,
    element: 'water',
    damageType: 'physical',
    expReward: 5,
    goldReward: 2,
  },
  {
    id: 2,
    name: '고블린',
    hp: 15,
    strength: 4,
    dexterity: 2,
    physicalDefense: 1,
    magicDefense: 1,
    element: 'fire',
    damageType: 'magic',
    expReward: 12,
    goldReward: 5,
  },
];

const MOB_SPAWNS: MobSpawnSeed[] = [
  { roomId: 6, mobTemplateId: 1, respawnSeconds: 20 },
  { roomId: 7, mobTemplateId: 2, respawnSeconds: 30 },
  { roomId: 9, mobTemplateId: 1, respawnSeconds: 20 },
];

export function seed(db: Database.Database): void {
  const existing = db.prepare('SELECT id FROM rooms WHERE id = ?').get(STARTING_ROOM_ID);
  if (existing) return;

  const insertRoom = db.prepare('INSERT INTO rooms (id, name, description) VALUES (?, ?, ?)');
  const insertExit = db.prepare(
    'INSERT INTO room_exits (room_id, direction, target_room_id) VALUES (?, ?, ?)',
  );
  const insertItem = db.prepare(
    `INSERT INTO items (id, name, description, type, slot, level, grade, strength_bonus, dexterity_bonus, physical_defense_bonus, magic_defense_bonus, heal_amount, value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertRoomItem = db.prepare(
    'INSERT INTO room_items (room_id, item_id, quantity) VALUES (?, ?, ?)',
  );
  const insertMobTemplate = db.prepare(
    `INSERT INTO mob_templates (id, name, hp, strength, dexterity, physical_defense, magic_defense, element, damage_type, exp_reward, gold_reward)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertMobSpawn = db.prepare(
    'INSERT INTO mob_spawns (room_id, mob_template_id, respawn_seconds) VALUES (?, ?, ?)',
  );
  const insertAdminAccount = db.prepare(
    'INSERT INTO accounts (username, password_hash, is_builder, is_admin) VALUES (?, ?, 1, 1)',
  );

  const seedTx = db.transaction(() => {
    insertAdminAccount.run(DEFAULT_ADMIN_USERNAME, bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, SALT_ROUNDS));
    for (const room of ROOMS) insertRoom.run(room.id, room.name, room.description);
    for (const exit of EXITS) insertExit.run(exit.roomId, exit.direction, exit.targetRoomId);
    for (const item of ITEMS) {
      insertItem.run(
        item.id,
        item.name,
        item.description,
        item.type,
        item.slot,
        item.level,
        item.grade,
        item.strengthBonus,
        item.dexterityBonus,
        item.physicalDefenseBonus,
        item.magicDefenseBonus,
        item.healAmount,
        item.value,
      );
    }
    for (const roomItem of ROOM_ITEMS) {
      insertRoomItem.run(roomItem.roomId, roomItem.itemId, roomItem.quantity);
    }
    for (const template of MOB_TEMPLATES) {
      insertMobTemplate.run(
        template.id,
        template.name,
        template.hp,
        template.strength,
        template.dexterity,
        template.physicalDefense,
        template.magicDefense,
        template.element,
        template.damageType,
        template.expReward,
        template.goldReward,
      );
    }
    for (const spawn of MOB_SPAWNS) {
      insertMobSpawn.run(spawn.roomId, spawn.mobTemplateId, spawn.respawnSeconds);
    }
  });
  seedTx();
}
