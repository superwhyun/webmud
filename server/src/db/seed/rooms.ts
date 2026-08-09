import type { ExitSeed, RoomItemSeed, RoomSeed } from './types.js';

export const ROOMS: RoomSeed[] = [
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

export const EXITS: ExitSeed[] = [
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

export const ROOM_ITEMS: RoomItemSeed[] = [
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
