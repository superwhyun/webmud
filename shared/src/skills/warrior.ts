import { buildElementBranches } from './branches.js';
import type { SkillDefinition } from './types.js';

const WARRIOR_TRUNK: SkillDefinition[] = [
  // 전사 — 근접 물리 딜/탱. 공통 트리는 초반 액티브 1개 + 이후 전부 패시브로, 특성화(원소 분기)에서 액티브를 더 배운다.
  {
    id: 'warrior_power_strike',
    job: 'warrior',
    name: '강타',
    description: '힘을 실어 적을 강하게 내려칩니다. (물리 피해 1.6배)',
    requiredLevel: 1,
    kind: 'damage',
    mpCost: 4,
    power: 1.6,
    damageType: 'physical',
    targeting: 'single',
    cooldownMs: 4000,
  },
  {
    id: 'warrior_iron_skin',
    job: 'warrior',
    name: '강철 피부',
    description: '피부를 강철처럼 단련합니다. (물리방어 영구 증가)',
    requiredLevel: 3,
    kind: 'passive',
    mpCost: 0,
    power: 4,
    passiveStat: 'physicalDefense',
    requires: 'warrior_power_strike',
  },
  {
    id: 'warrior_vigor',
    job: 'warrior',
    name: '불굴',
    description: '강인한 육체로 버텨냅니다. (최대 HP 영구 증가)',
    requiredLevel: 6,
    kind: 'passive',
    mpCost: 0,
    power: 15,
    passiveStat: 'maxHp',
    requires: 'warrior_iron_skin',
  },
  {
    id: 'warrior_brute_force',
    job: 'warrior',
    name: '완력 강화',
    description: '근력을 극한까지 단련합니다. (힘 영구 증가)',
    requiredLevel: 9,
    kind: 'passive',
    mpCost: 0,
    power: 6,
    passiveStat: 'strength',
    requires: 'warrior_vigor',
  },
  {
    id: 'warrior_mental_conditioning',
    job: 'warrior',
    name: '정신 단련',
    description: '정신을 단련해 마법 공격에도 흔들리지 않게 됩니다. (마법방어 영구 증가)',
    requiredLevel: 10,
    kind: 'passive',
    mpCost: 0,
    power: 10,
    passiveStat: 'magicDefense',
    requires: 'warrior_brute_force',
  },
  {
    id: 'warrior_combat_instinct',
    job: 'warrior',
    name: '전투 본능',
    description: '수많은 전투로 몸이 반응 속도를 기억합니다. (민첩 영구 증가)',
    requiredLevel: 12,
    kind: 'passive',
    mpCost: 0,
    power: 5,
    passiveStat: 'dexterity',
    requires: 'warrior_brute_force',
  },
  {
    id: 'warrior_earth_crush',
    job: 'warrior',
    name: '백전노장의 관록',
    description: '수많은 전장을 거치며 몸이 근본부터 단단해집니다. (체력 영구 증가)',
    requiredLevel: 16,
    kind: 'passive',
    mpCost: 0,
    power: 10,
    passiveStat: 'vitality',
    requires: 'warrior_combat_instinct',
  },
  {
    id: 'warrior_qi_circulation',
    job: 'warrior',
    name: '기 순환',
    description: '기를 순환시켜 스킬을 더 빨리 다시 쓸 수 있게 됩니다. (모든 스킬 재사용 대기시간 감소)',
    requiredLevel: 18,
    kind: 'passive',
    mpCost: 0,
    power: 10,
    reducesCooldown: true,
    requires: 'warrior_earth_crush',
  },
];

const WARRIOR_BRANCHES = buildElementBranches({
  job: 'warrior',
  idPrefix: 'warrior',
  activeKind: 'damage',
  damageType: 'physical',
  themes: {
    wood: {
      actives: [
        { name: '덩굴 강타', description: '무기에 덩굴의 생명력을 둘러 주변 적을 모두 내려칩니다.', aoe: true },
        { name: '가시 관통', description: '가시로 무기를 뒤덮어 적의 급소를 꿰뚫습니다.' },
        { name: '생명 흡수 베기', description: '생명력을 짓밟듯 베어 주변 적 전체에게 피해를 입힙니다.', aoe: true },
      ],
      capstone: { name: '생명의 나무', description: '목 기운이 육체에 뿌리내려 생명력이 깊어집니다.', passiveStat: 'vitality' },
    },
    fire: {
      actives: [
        { name: '화염 난무', description: '검에 불꽃을 둘러 주변 적을 모두 베어냅니다.', aoe: true },
        { name: '불꽃 관통', description: '불타는 검으로 적의 급소를 꿰뚫습니다.' },
        { name: '폭염 폭발', description: '검 끝에서 폭염을 터뜨려 주변 적 전체를 불태웁니다.', aoe: true },
      ],
      capstone: { name: '투혼의 불꽃', description: '화 기운이 근육에 타올라 힘이 폭증합니다.', passiveStat: 'strength' },
    },
    earth: {
      actives: [
        { name: '지진 강타', description: '대지의 기운을 담아 내려쳐 주변 적을 모두 뒤흔듭니다.', aoe: true },
        { name: '암석 관통', description: '바위처럼 단단한 일격으로 적의 급소를 꿰뚫습니다.' },
        { name: '대지 붕괴', description: '땅을 무너뜨려 주변 적 전체에게 충격파를 퍼붓습니다.', aoe: true },
      ],
      capstone: { name: '철벽의 의지', description: '토 기운이 몸을 감싸 방어가 굳건해집니다.', passiveStat: 'physicalDefense' },
    },
    metal: {
      actives: [
        { name: '강철 폭풍', description: '강철 조각을 흩뿌리며 주변 적을 모두 베어냅니다.', aoe: true },
        { name: '관통격', description: '강철처럼 벼려진 일격으로 적의 급소를 꿰뚫습니다.' },
        { name: '칼날 폭발', description: '무기에서 칼날 파편을 터뜨려 주변 적 전체를 벱니다.', aoe: true },
      ],
      capstone: { name: '무쇠의 육체', description: '금 기운이 뼈와 살에 스며들어 육체가 무쇠처럼 단단해집니다.', passiveStat: 'maxHp' },
    },
    water: {
      actives: [
        { name: '해일 베기', description: '파도처럼 밀려드는 연속 베기로 주변 적을 모두 휩씁니다.', aoe: true },
        { name: '급류 관통', description: '급류처럼 빠르게 파고들어 적의 급소를 꿰뚫습니다.' },
        { name: '폭포 강타', description: '폭포수 같은 연격을 퍼부어 주변 적 전체를 강타합니다.', aoe: true },
      ],
      capstone: { name: '유수의 흐름', description: '수 기운이 몸놀림에 스며들어 움직임이 물처럼 유연해집니다.', passiveStat: 'dexterity' },
    },
  },
});

export const WARRIOR_SKILLS: SkillDefinition[] = [...WARRIOR_TRUNK, ...WARRIOR_BRANCHES];
