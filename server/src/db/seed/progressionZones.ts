import { FRONTIER_ROOM_ID } from './index.js';

/** 5종 몹의 mob_templates id — server/src/db/seed/mobs/base.ts에서 고정 배정한 id(3~7)와 맞아야 한다. */
const LEVELING_SPECIES_TEMPLATE_IDS = [3, 4, 5, 6, 7];

interface RoomText {
  name: string;
  description: string;
}

interface ZoneBlueprint {
  zoneId: number;
  zoneName: string;
  zoneDescription: string;
  /** 방 id는 roomBase+1 ~ roomBase+7. 기존/테스트 방 id(최대 294)와 겹치지 않는 존 전용 구간을 쓴다. */
  roomBase: number;
  /** 정확히 7개: 입구(안전) + 전투방 5개 + 다음 존으로 가는 관문방(안전). */
  rooms: [RoomText, RoomText, RoomText, RoomText, RoomText, RoomText, RoomText];
  /** 전투방 5개(rooms[1]~rooms[5]) 옆으로 하나씩 뻗어나가는 곁방. 일직선이 아니라 좌우로 퍼지도록 한다. roomBase+11 ~ +15. */
  branchRooms: [RoomText, RoomText, RoomText, RoomText, RoomText];
}

/** 홀수 번째 곁방은 동쪽, 짝수 번째는 서쪽으로 — 지그재그로 퍼져서 일직선이 아니라 넓게 보이게 한다. */
function branchDirection(index: number): 'east' | 'west' {
  return index % 2 === 0 ? 'east' : 'west';
}

/** 존 순서(늪지 정글=0)대로 정확히 6-10, 11-15, ..., 46-50 브라켓과 맞물린다. */
function zoneLevelRange(zoneIndex: number): { minLevel: number; maxLevel: number } {
  return { minLevel: zoneIndex * 5 + 6, maxLevel: zoneIndex * 5 + 10 };
}

const RESPAWN_SECONDS = 20;

const ZONE_BLUEPRINTS: ZoneBlueprint[] = [
  {
    zoneId: 3,
    zoneName: '늪지 정글',
    zoneDescription: '구대륙 너머, 축축하고 무성한 늪지대. Lv 6-10 사냥터.',
    roomBase: 200,
    rooms: [
      { name: '늪지 어귀', description: '구대륙을 벗어나자 발밑이 질척해진다. 축축한 공기 속에 벌레 우는 소리가 가득하다.' },
      { name: '뒤엉킨 덩굴숲', description: '굵은 덩굴이 통로를 가로막듯 뒤엉켜 있다. 그 사이로 무언가 꿈틀거리는 기척이 느껴진다.' },
      { name: '김 오르는 온천지대', description: '땅 밑에서 뜨거운 김이 올라오는 늪지 한복판이다. 뜨거운 물웅덩이 사이로 붉은 비늘이 스쳐 지나간다.' },
      { name: '이끼 낀 돌무더기', description: '이끼로 뒤덮인 커다란 돌덩이들이 어지럽게 쌓여 있다. 돌 틈에서 육중한 발소리가 들린다.' },
      { name: '녹슨 사슬의 폐선착장', description: '버려진 나룻배와 녹슨 사슬이 뒤엉킨 선착장이다. 진흙 속에서 날카로운 집게가 번뜩인다.' },
      { name: '안개 낀 늪', description: '짙은 안개가 수면을 뒤덮은 늪이다. 물살이 일렁일 때마다 서늘한 눈빛이 스쳐 지나간다.' },
      { name: '늪 깊은 곳의 사당', description: '늪 가장 깊은 곳, 오래된 사당이 물 위로 겨우 지붕만 내밀고 있다. 사당 안쪽에서 낯선 기운이 흘러나온다.' },
    ],
    branchRooms: [
      { name: '가라앉은 오두막', description: '물에 반쯤 잠긴 낡은 오두막이 덩굴에 뒤덮여 있다.' },
      { name: '거품 이는 웅덩이', description: '쉴 새 없이 거품이 올라오는 작은 웅덩이가 있다.' },
      { name: '돌무더기 뒤편 굴', description: '돌무더기 뒤로 좁고 어두운 굴이 이어진다.' },
      { name: '가라앉은 화물칸', description: '물속에 낡은 화물칸이 반쯤 잠겨 있다.' },
      { name: '늪 속의 돌섬', description: '안개 사이로 작은 돌섬이 떠 있듯 솟아 있다.' },
    ],
  },
  {
    zoneId: 4,
    zoneName: '사막 유적',
    zoneDescription: '모래바람에 파묻힌 고대 유적. Lv 11-15 사냥터.',
    roomBase: 300,
    rooms: [
      { name: '사막의 관문', description: '늪을 벗어나자 눈앞이 아찔할 만큼 뜨거운 모래바람이 몰아친다. 저 멀리 무너진 성벽이 아른거린다.' },
      { name: '뒤엉킨 가시넝쿨 지대', description: '메마른 땅에서도 억척스럽게 자란 가시 넝쿨이 길을 막고 있다.' },
      { name: '불타는 모래언덕', description: '햇볕에 달궈진 모래가 발밑에서 이글거린다. 아지랑이 사이로 붉은 그림자가 스쳐 간다.' },
      { name: '무너진 석상의 뜰', description: '목이 잘린 거대한 석상들이 줄지어 서 있다. 그중 하나가 천천히 고개를 돌린다.' },
      { name: '도굴꾼의 진지', description: '버려진 발굴 도구와 부서진 상자들이 나뒹군다. 모래 속에서 갑각이 부딪히는 소리가 들린다.' },
      { name: '마른 우물 지대', description: '말라버린 우물들이 늘어서 있다. 그중 하나에서 축축한 비린내가 올라온다.' },
      { name: '유적의 심장부', description: '유적 가장 안쪽, 고대 문자가 새겨진 문이 은은한 빛을 뿜고 있다.' },
    ],
    branchRooms: [
      { name: '말라붙은 오아시스', description: '한때 오아시스였던 곳이 바싹 말라 갈라져 있다.' },
      { name: '무너진 감시탑', description: '모래에 반쯤 파묻힌 감시탑 잔해가 서 있다.' },
      { name: '부서진 제단방', description: '석상들 사이, 부서진 제단이 놓인 작은 방이다.' },
      { name: '숨겨진 보관고', description: '도굴꾼들이 숨겨둔 듯한 작은 보관고가 있다.' },
      { name: '지하로 이어진 우물', description: '마른 우물 하나가 유독 깊이 지하로 이어진다.' },
    ],
  },
  {
    zoneId: 5,
    zoneName: '얼어붙은 설원',
    zoneDescription: '냉기가 뼛속까지 스미는 설원 지대. Lv 16-20 사냥터.',
    roomBase: 400,
    rooms: [
      { name: '설원 어귀', description: '유적을 벗어나자 순식간에 냉기가 밀려온다. 눈 덮인 벌판이 끝없이 펼쳐진다.' },
      { name: '얼어붙은 넝쿨 골짜기', description: '서리가 낀 넝쿨들이 골짜기를 뒤덮고 있다. 얼음 속에서도 무언가 살아 꿈틀거린다.' },
      { name: '잔불 남은 화구', description: '눈밭 한가운데 이상하게도 김이 피어오르는 웅덩이가 있다. 붉은 기운이 눈 밑에서 아른거린다.' },
      { name: '만년설 바위지대', description: '거대한 얼음 바위들이 겹겹이 쌓여 있다. 그 틈에서 낮은 진동이 전해진다.' },
      { name: '얼음 갈라진 협곡', description: '발밑의 얼음이 쩍쩍 갈라지는 소리를 낸다. 갈라진 틈 사이로 날카로운 다리가 보인다.' },
      { name: '빙하 밑 습지', description: '얼음 아래로 검은 물이 흐르는 기이한 습지다. 수면 아래 그림자가 조용히 움직인다.' },
      { name: '설산 정상의 제단', description: '눈보라를 뚫고 오른 정상에 낡은 제단이 서 있다. 제단 너머로 뜨거운 기운이 느껴진다.' },
    ],
    branchRooms: [
      { name: '얼음에 갇힌 오두막', description: '두꺼운 얼음에 반쯤 갇힌 사냥꾼의 오두막이 있다.' },
      { name: '김 서린 동굴 입구', description: '따뜻한 김이 새어 나오는 작은 동굴 입구다.' },
      { name: '눈사태 흔적지', description: '커다란 눈사태가 휩쓸고 간 흔적이 남아있다.' },
      { name: '얼음 다리', description: '아슬아슬하게 걸쳐진 좁은 얼음 다리가 있다.' },
      { name: '얼어붙은 늪지대', description: '표면만 얼어붙은 위태로운 늪지대가 펼쳐진다.' },
    ],
  },
  {
    zoneId: 6,
    zoneName: '화산 지대',
    zoneDescription: '붉은 용암이 흐르는 뜨거운 지대. Lv 21-25 사냥터.',
    roomBase: 500,
    rooms: [
      { name: '용암 지대 입구', description: '설산을 넘어서자 발밑이 뜨겁게 달아오른다. 붉은 용암 줄기가 저 멀리 흐른다.' },
      { name: '불타는 넝쿨 지옥', description: '불에 그을렸는데도 여전히 자라나는 기이한 넝쿨들이 길을 뒤덮고 있다.' },
      { name: '유황 협곡', description: '코를 찌르는 유황 냄새가 가득한 협곡이다. 뜨거운 균열 사이로 붉은 형체가 오간다.' },
      { name: '굳어버린 용암 능선', description: '식어 굳은 용암이 거대한 바위 능선을 이루고 있다. 표면 곳곳이 여전히 붉게 빛난다.' },
      { name: '마그마 웅덩이', description: '부글거리는 마그마 웅덩이 주위로 뜨거운 열기가 소용돌이친다.' },
      { name: '증기 서린 늪지대', description: '화산 열기에 데워진 물웅덩이가 늪처럼 고여 있다. 뜨거운 증기 사이로 눈빛이 번뜩인다.' },
      { name: '분화구 가장자리', description: '분화구 끝자락, 아래로 내려가는 어두운 통로가 입을 벌리고 있다.' },
    ],
    branchRooms: [
      { name: '그을린 제단터', description: '새까맣게 그을린 오래된 제단 흔적이 있다.' },
      { name: '유황 결정 동굴', description: '노란 유황 결정이 벽을 뒤덮은 작은 동굴이다.' },
      { name: '용암 동굴 입구', description: '굳은 용암 아래로 이어지는 동굴 입구가 있다.' },
      { name: '갈라진 지각', description: '발밑 지각이 얕게 갈라져 붉은 빛이 새어 나온다.' },
      { name: '끓어오르는 진흙탕', description: '부글부글 끓어오르는 뜨거운 진흙탕이 있다.' },
    ],
  },
  {
    zoneId: 7,
    zoneName: '지하 대동굴',
    zoneDescription: '분화구 아래로 이어지는 거대한 동굴. Lv 26-30 사냥터.',
    roomBase: 600,
    rooms: [
      { name: '동굴 입구', description: '분화구 아래로 내려서자 서늘하고 축축한 어둠이 밀려온다. 물방울 떨어지는 소리만 울린다.' },
      { name: '뿌리 얽힌 통로', description: '천장을 뚫고 내려온 굵은 뿌리들이 통로를 가득 메우고 있다.' },
      { name: '붉은 광맥 지대', description: '벽면에 붉게 빛나는 광맥이 흐른다. 은은한 열기가 느껴진다.' },
      { name: '종유석의 방', description: '거대한 종유석이 빼곡히 자란 방이다. 그중 몇 개가 스스로 움직이는 듯 보인다.' },
      { name: '결정 갈라진 틈', description: '날카로운 결정들이 바닥에 촘촘히 박혀 있다. 그 사이로 무언가 빠르게 스친다.' },
      { name: '지저 호수', description: '칠흑같이 검은 지저 호수가 펼쳐진다. 수면 아래에서 눈빛이 떠올랐다 사라진다.' },
      { name: '심연으로 가는 길', description: '동굴 가장 깊은 곳, 좁은 길이 어둠 속으로 이어진다.' },
    ],
    branchRooms: [
      { name: '무너진 흙더미', description: '천장에서 무너진 흙더미가 통로를 반쯤 막고 있다.' },
      { name: '결정 채굴터', description: '누군가 파던 채굴 흔적과 흩어진 결정 조각들이 있다.' },
      { name: '울리는 공동', description: '소리가 유독 크게 울리는 넓은 공동이다.' },
      { name: '날카로운 통로', description: '날카로운 결정들이 벽에 촘촘히 돋아난 좁은 통로다.' },
      { name: '호숫가 동굴', description: '지저 호수와 맞닿은 작고 축축한 동굴이다.' },
    ],
  },
  {
    zoneId: 8,
    zoneName: '폐광',
    zoneDescription: '버려진 지 오래인 광산. Lv 31-35 사냥터.',
    roomBase: 700,
    rooms: [
      { name: '폐광 입구', description: '녹슨 팻말이 걸린 폐광 입구다. 안쪽에서 서늘한 바람이 불어온다.' },
      { name: '무너진 갱도', description: '천장이 무너져 내린 갱도에 뿌리와 넝쿨이 뒤엉켜 자라 있다.' },
      { name: '버려진 용광로', description: '오래전 꺼진 줄 알았던 용광로에서 여전히 열기가 뿜어져 나온다.' },
      { name: '광차 선로', description: '녹슨 광차 선로가 어둠 속으로 이어진다. 선로 옆으로 커다란 그림자가 움직인다.' },
      { name: '채굴꾼의 유해', description: '버려진 곡괭이와 장비들 사이로 오래된 유해가 흩어져 있다. 그 틈에서 갑각이 부딪히는 소리가 들린다.' },
      { name: '지하수 고인 막장', description: '지하수가 고여 늪처럼 변한 막장이다. 탁한 물속에서 무언가 미끄러진다.' },
      { name: '막장 끝의 갈라진 틈', description: '막장 끝, 벽에 사람 하나 겨우 지날 만한 틈이 갈라져 있다.' },
    ],
    branchRooms: [
      { name: '막힌 지지대', description: '부러진 나무 지지대가 통로 일부를 막고 있다.' },
      { name: '재로 뒤덮인 창고', description: '용광로에서 나온 재가 두껍게 쌓인 창고다.' },
      { name: '탈선한 광차', description: '선로를 벗어나 뒤집힌 광차 한 대가 놓여 있다.' },
      { name: '버려진 숙소', description: '광부들이 쓰던 낡은 숙소가 텅 비어 있다.' },
      { name: '물이 새는 갱도', description: '천장 틈으로 지하수가 끊임없이 새어 든다.' },
    ],
  },
  {
    zoneId: 9,
    zoneName: '저주받은 숲',
    zoneDescription: '검게 물든 하늘 아래 뒤틀린 숲. Lv 36-40 사냥터.',
    roomBase: 800,
    rooms: [
      { name: '저주받은 숲 어귀', description: '갈라진 틈을 지나자 뒤틀린 나무들이 늘어선 숲이 나타난다. 하늘조차 검게 물들어 있다.' },
      { name: '뒤틀린 거목 지대', description: '거대한 나무들이 기괴하게 뒤틀린 채 서 있다. 뿌리마다 검은 기운이 서려 있다.' },
      { name: '도깨비불 피어난 습지', description: '푸르고 붉은 도깨비불이 이곳저곳에서 피어오른다. 그 사이로 뜨거운 숨결이 느껴진다.' },
      { name: '이끼 낀 거석군', description: '검은 이끼로 뒤덮인 거대한 돌들이 원을 이루고 서 있다.' },
      { name: '안개의 미로', description: '짙은 안개가 방향 감각을 흐트러뜨리는 미로 같은 숲길이다.' },
      { name: '검은 늪의 제단', description: '새까만 늪 한가운데 낡은 제단이 잠겨 있다. 늪 아래에서 무언가 지켜보고 있다.' },
      { name: '봉인된 숲의 심장', description: '숲의 심장부, 두꺼운 봉인이 걸린 거대한 문이 서 있다.' },
    ],
    branchRooms: [
      { name: '속이 빈 고목', description: '속이 텅 빈 거대한 고목 안으로 들어갈 수 있다.' },
      { name: '빛바랜 무덤가', description: '오래된 무덤 몇 기가 습지 가장자리에 늘어서 있다.' },
      { name: '쓰러진 거석', description: '쓰러진 거석 하나가 길게 그림자를 드리운다.' },
      { name: '길 잃은 자의 흔적', description: '누군가 남긴 듯한 긁힌 표식들이 나무에 남아있다.' },
      { name: '잠긴 사당', description: '굳게 잠긴 작은 사당이 늪 가장자리에 서 있다.' },
    ],
  },
  {
    zoneId: 10,
    zoneName: '마계의 관문',
    zoneDescription: '봉인 너머 펼쳐진 이계의 땅. Lv 41-45 사냥터.',
    roomBase: 900,
    rooms: [
      { name: '균열의 관문', description: '봉인을 지나자 하늘이 붉게 갈라진 이계의 풍경이 펼쳐진다.' },
      { name: '마기 서린 가시숲', description: '검붉은 가시로 뒤덮인 넝쿨이 땅을 가득 메우고 있다. 마기가 짙게 배어 있다.' },
      { name: '지옥불 협곡', description: '협곡 아래로 검붉은 불길이 넘실댄다. 뜨거운 기운이 살갗을 태울 듯하다.' },
      { name: '악마의 진영터', description: '부서진 석상과 제단이 어지럽게 흩어진 진영터다. 그중 하나가 육중하게 움직인다.' },
      { name: '갈라진 지반의 틈', description: '땅이 갈라진 틈마다 검은 연기가 새어 나온다. 그 사이로 날카로운 집게가 번뜩인다.' },
      { name: '핏빛 늪지대', description: '핏빛으로 물든 늪이 펼쳐진다. 수면 아래 붉은 눈이 이쪽을 응시한다.' },
      { name: '관문 최심부', description: '이계의 가장 깊은 곳, 거대한 관문이 무겁게 닫혀 있다.' },
    ],
    branchRooms: [
      { name: '피어린 웅덩이', description: '붉게 물든 작은 웅덩이가 고여 있다.' },
      { name: '그을린 제단', description: '검게 그을린 제단이 협곡 한쪽에 놓여 있다.' },
      { name: '무기고 흔적', description: '부서진 무기와 방패들이 어지럽게 흩어져 있다.' },
      { name: '연기 자욱한 틈', description: '짙은 연기가 끊임없이 새어 나오는 틈이다.' },
      { name: '말라붙은 핏자국 길', description: '핏자국이 말라붙은 좁은 길이 이어진다.' },
    ],
  },
  {
    zoneId: 11,
    zoneName: '용의 둥지',
    zoneDescription: '구름 위로 솟은 용들의 산맥. Lv 46-50 사냥터.',
    roomBase: 1000,
    rooms: [
      { name: '용의 산맥 입구', description: '관문을 지나자 구름 위로 솟은 웅장한 산맥이 나타난다. 멀리서 포효 소리가 울려 퍼진다.' },
      { name: '뒤엉킨 태고의 넝쿨숲', description: '산맥 초입, 태고부터 자랐다는 거대한 넝쿨이 산길을 뒤덮고 있다.' },
      { name: '화염 서린 능선', description: '능선을 따라 뜨거운 불길이 스쳐 지나간 흔적이 가득하다.' },
      { name: '비늘 덮인 바위지대', description: '거대한 비늘 조각이 박힌 바위들이 늘어서 있다. 그 틈에서 육중한 그림자가 일어선다.' },
      { name: '용의 발톱 자국 협곡', description: '깊게 파인 발톱 자국이 협곡을 이루고 있다. 그 사이로 날카로운 갑각이 번뜩인다.' },
      { name: '안개 서린 태고의 늪', description: '산 정상 부근, 어울리지 않게 짙은 안개의 늪이 펼쳐진다. 그 아래 태고의 눈빛이 잠들어 있다.' },
      { name: '용왕의 옥좌', description: '산맥 정상, 텅 빈 거대한 옥좌가 놓여 있다. 아직 이 자리의 주인은 나타나지 않았다.' },
    ],
    branchRooms: [
      { name: '오래된 둥지터', description: '오래전 버려진 듯한 낡은 둥지 흔적이 있다.' },
      { name: '그을린 바위 턱', description: '불길에 그을린 넓은 바위 턱이 펼쳐진다.' },
      { name: '떨어진 비늘 더미', description: '커다란 비늘 조각들이 무더기로 쌓여 있다.' },
      { name: '부서진 갑주', description: '누군가의 부서진 갑주 잔해가 널려 있다.' },
      { name: '안개 속 그림자 길', description: '짙은 안개 속으로 흐릿한 길이 이어진다.' },
    ],
  },
];

export const LAST_PROGRESSION_ROOM_ID = ZONE_BLUEPRINTS[ZONE_BLUEPRINTS.length - 1].roomBase + 7;

/** 곁방 id는 roomBase+11 ~ +15. 존 전용 스핀(+1~+7) 및 다음 존 스핀과 겹치지 않는 구간이다. */
export const LAST_BRANCH_ROOM_ID = ZONE_BLUEPRINTS[ZONE_BLUEPRINTS.length - 1].roomBase + 15;

interface ProgressionRoom {
  id: number;
  name: string;
  description: string;
  x: number;
  y: number;
  zoneId: number;
}

interface ProgressionExit {
  roomId: number;
  direction: string;
  targetRoomId: number;
}

interface ProgressionMobSpawn {
  roomId: number;
  mobTemplateId: number;
  respawnSeconds: number;
  minLevel: number;
  maxLevel: number;
}

export const PROGRESSION_ZONES: { id: number; name: string; description: string; minLevel: number; maxLevel: number }[] =
  ZONE_BLUEPRINTS.map((zone, index) => ({
    id: zone.zoneId,
    name: zone.zoneName,
    description: zone.zoneDescription,
    ...zoneLevelRange(index),
  }));

export const PROGRESSION_ROOMS: ProgressionRoom[] = ZONE_BLUEPRINTS.flatMap((zone) =>
  zone.rooms.map((room, index) => ({
    id: zone.roomBase + index + 1,
    name: room.name,
    description: room.description,
    x: 0,
    y: index,
    zoneId: zone.zoneId,
  })),
);

/**
 * 전투방(rooms[1]~rooms[5])마다 테마에 맞는 종을 하나씩 고정 배치한다(예: 덩굴숲엔 덩굴괴수).
 * 실제 레벨은 고정하지 않고 존의 레벨 범위만 저장 — 스폰될 때(최초 배치+리스폰마다) 그 범위
 * 안에서 매번 새로 굴려 레벨과 스탯을 정한다.
 */
export const PROGRESSION_MOB_SPAWNS: ProgressionMobSpawn[] = ZONE_BLUEPRINTS.flatMap((zone, zoneIndex) =>
  zone.rooms.slice(1, 6).map((_, index) => ({
    // 전투방은 입구(+1) 다음인 +2 ~ +6.
    roomId: zone.roomBase + index + 2,
    mobTemplateId: LEVELING_SPECIES_TEMPLATE_IDS[index],
    respawnSeconds: RESPAWN_SECONDS,
    ...zoneLevelRange(zoneIndex),
  })),
);

function inZoneChainExits(zone: ZoneBlueprint): ProgressionExit[] {
  const exits: ProgressionExit[] = [];
  for (let index = 0; index < zone.rooms.length - 1; index += 1) {
    const fromId = zone.roomBase + index + 1;
    const toId = zone.roomBase + index + 2;
    exits.push({ roomId: fromId, direction: 'south', targetRoomId: toId });
    exits.push({ roomId: toId, direction: 'north', targetRoomId: fromId });
  }
  return exits;
}

function portalExits(): ProgressionExit[] {
  const exits: ProgressionExit[] = [];
  let previousLastRoomId = FRONTIER_ROOM_ID;
  let previousZoneName = '구대륙';

  for (const zone of ZONE_BLUEPRINTS) {
    const entranceRoomId = zone.roomBase + 1;
    const lastRoomId = zone.roomBase + zone.rooms.length;

    exits.push({ roomId: previousLastRoomId, direction: zone.zoneName, targetRoomId: entranceRoomId });
    exits.push({ roomId: entranceRoomId, direction: previousZoneName, targetRoomId: previousLastRoomId });

    previousLastRoomId = lastRoomId;
    previousZoneName = zone.zoneName;
  }

  return exits;
}

export const PROGRESSION_EXITS: ProgressionExit[] = [
  ...ZONE_BLUEPRINTS.flatMap((zone) => inZoneChainExits(zone)),
  ...portalExits(),
];

export function oppositeBranchDirection(direction: 'east' | 'west'): 'east' | 'west' {
  return direction === 'east' ? 'west' : 'east';
}

/** 전투방 index(0~4, rooms[1]~rooms[5])에 대응하는 곁방 id를 계산한다. */
function branchRoomId(zone: ZoneBlueprint, index: number): number {
  return zone.roomBase + 11 + index;
}

function combatRoomId(zone: ZoneBlueprint, index: number): number {
  return zone.roomBase + index + 2;
}

export interface BranchBlueprint {
  roomId: number;
  name: string;
  description: string;
  zoneId: number;
  preferredDirection: 'east' | 'west';
  combatRoomId: number;
  minLevel: number;
  maxLevel: number;
  respawnSeconds: number;
}

/**
 * 실제로 방을 만들지, 어느 방향(east/west)으로 붙일지는 백필 시점에 해당 전투방의 기존 출구를
 * 조회해서 결정한다 — 라이브 DB에는 빌더로 수동 추가한 출구(예: 포털 테스트)가 이미 있을 수 있어
 * 여기서 좌표/방향을 고정해버리면 충돌할 수 있기 때문이다.
 */
export const PROGRESSION_BRANCH_BLUEPRINTS: BranchBlueprint[] = ZONE_BLUEPRINTS.flatMap((zone, zoneIndex) =>
  zone.branchRooms.map((room, index) => ({
    roomId: branchRoomId(zone, index),
    name: room.name,
    description: room.description,
    zoneId: zone.zoneId,
    preferredDirection: branchDirection(index),
    combatRoomId: combatRoomId(zone, index),
    ...zoneLevelRange(zoneIndex),
    respawnSeconds: RESPAWN_SECONDS,
  })),
);
