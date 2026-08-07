import type Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import type { ElementType } from '@mud/shared';

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
    strengthBonus: 0,
    dexterityBonus: 0,
    physicalDefenseBonus: 0,
    magicDefenseBonus: 0,
    healAmount: 10,
    value: 5,
  },
];

const ROOM_ITEMS: RoomItemSeed[] = [
  { roomId: 3, itemId: 1, quantity: 1 },
  { roomId: 4, itemId: 2, quantity: 1 },
  { roomId: 2, itemId: 3, quantity: 2 },
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
    `INSERT INTO items (id, name, description, type, strength_bonus, dexterity_bonus, physical_defense_bonus, magic_defense_bonus, heal_amount, value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
