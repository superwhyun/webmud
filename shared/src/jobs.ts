export type JobType = 'warrior' | 'rogue' | 'mage' | 'priest';

export const JOB_VALUES: JobType[] = ['warrior', 'rogue', 'mage', 'priest'];

export const JOB_LABELS: Record<JobType, string> = {
  warrior: '전사',
  rogue: '도적',
  mage: '마법사',
  priest: '사제',
};

export const JOB_DESCRIPTIONS: Record<JobType, string> = {
  warrior: '강인한 육체로 앞에서 적을 막아내는 근접 전투가.',
  rogue: '날렵한 몸놀림으로 적을 회피하고 급소를 노리는 전투가.',
  mage: '속성 마법으로 강력한 원거리 피해를 입히는 술사.',
  priest: '치유와 축복으로 동료를 돕는 지원가.',
};

export interface JobStatBlock {
  strength: number;
  dexterity: number;
  intelligence: number;
  vitality: number;
  wisdom: number;
  luck: number;
  hp: number;
  mp: number;
}

/**
 * 직업별 캐릭터 생성 시 시작 스탯.
 * 도적 HP/체력은 마법사(순수 후방 캐스터) 다음으로 낮았는데, 회피(민첩)와 치명타(행운)로 버티는
 * 근접 스킬미셔 컨셉인데도 그 보너스가 누적되기 전인 초반 레벨엔 거의 도움이 안 돼서 저레벨
 * 몹에게도 자주 죽는 게 플레이봇으로 확인됐다 — 전사보단 여전히 약하지만 사제 수준으로 올려서
 * 회피/치명타가 쌓이기 전까지 버틸 여력을 준다.
 */
export const JOB_BASE_STATS: Record<JobType, JobStatBlock> = {
  warrior: { strength: 7, dexterity: 3, intelligence: 1, vitality: 6, wisdom: 1, luck: 2, hp: 30, mp: 5 },
  rogue: { strength: 4, dexterity: 7, intelligence: 2, vitality: 4, wisdom: 2, luck: 4, hp: 28, mp: 8 },
  mage: { strength: 1, dexterity: 3, intelligence: 7, vitality: 2, wisdom: 5, luck: 2, hp: 16, mp: 20 },
  priest: { strength: 2, dexterity: 2, intelligence: 4, vitality: 4, wisdom: 7, luck: 1, hp: 20, mp: 18 },
};

/** 직업별 레벨업 1회당 자동 성장치. */
export const JOB_GROWTH_PER_LEVEL: Record<JobType, JobStatBlock> = {
  warrior: { strength: 3, dexterity: 1, intelligence: 0, vitality: 3, wisdom: 0, luck: 1, hp: 12, mp: 2 },
  rogue: { strength: 1, dexterity: 3, intelligence: 1, vitality: 1, wisdom: 1, luck: 2, hp: 8, mp: 4 },
  mage: { strength: 0, dexterity: 1, intelligence: 3, vitality: 1, wisdom: 2, luck: 1, hp: 6, mp: 8 },
  priest: { strength: 0, dexterity: 1, intelligence: 1, vitality: 2, wisdom: 3, luck: 1, hp: 8, mp: 7 },
};

/**
 * 직업별 평타/스킬 피해량 계산에 실제로 쓰이는 "위력 스탯". 전사<->도적은 힘/민첩을,
 * 마법사<->사제는 지능/지혜를 서로 뒤바꿔 성장치를 몰아주도록 설계돼 있었는데(위 두 테이블 참고),
 * 정작 전투 공식은 이 설계를 반영하지 않고 물리=힘, 마법=지능만 고정으로 써서 도적/사제가
 * 자기 성장 스탯으로는 전혀 피해를 못 늘리는 채로 방치돼 있었다. 밸런스 조사용 플레이봇으로
 * 4직업을 실제로 굴려본 뒤 발견한 문제라 여기서 바로잡는다.
 */
export const JOB_POWER_STAT: Record<JobType, 'strength' | 'dexterity' | 'intelligence' | 'wisdom'> = {
  warrior: 'strength',
  rogue: 'dexterity',
  mage: 'intelligence',
  priest: 'wisdom',
};

/** 레벨업 시 자유 분배로 지급되는 스탯 포인트 수. */
export const STAT_POINTS_PER_LEVEL = 3;

/** 레벨업 시 지급되는 스킬 포인트 수. */
export const SKILL_POINTS_PER_LEVEL = 1;

/** stat 명령/스탯 분배 UI에서 쓰는 6개 자유 분배 스탯 키. */
export type StatKey = 'str' | 'dex' | 'int' | 'vit' | 'wis' | 'luk';

export const STAT_KEY_VALUES: StatKey[] = ['str', 'dex', 'int', 'vit', 'wis', 'luk'];

export const STAT_KEY_LABELS: Record<StatKey, string> = {
  str: '힘',
  dex: '민첩',
  int: '지능',
  vit: '체력',
  wis: '지혜',
  luk: '행운',
};
