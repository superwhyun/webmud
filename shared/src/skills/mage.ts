import { buildElementBranches } from './branches.js';
import type { SkillDefinition } from './types.js';

const MAGE_TRUNK: SkillDefinition[] = [
  // 마법사 — 원거리 마법 딜. 공통 트리는 초반 액티브 1개 + 이후 전부 패시브로, 특성화(원소 분기)에서 액티브를 더 배운다.
  {
    id: 'mage_firebolt',
    job: 'mage',
    name: '파이어볼',
    description: '불꽃 구체를 쏘아 보냅니다. (마법 피해 2.0배)',
    requiredLevel: 1,
    kind: 'damage',
    mpCost: 6,
    power: 2.0,
    damageType: 'magic',
    targeting: 'single',
    cooldownMs: 2000,
  },
  {
    id: 'mage_mana_flow',
    job: 'mage',
    name: '마나 순환',
    description: '마나 회로를 확장합니다. (최대 MP 영구 증가)',
    requiredLevel: 3,
    kind: 'passive',
    mpCost: 0,
    power: 10,
    passiveStat: 'maxMp',
    requires: 'mage_firebolt',
  },
  {
    id: 'mage_arcane_mastery',
    job: 'mage',
    name: '대마법',
    description: '마법 이해도가 극에 달합니다. (지능 영구 증가)',
    requiredLevel: 6,
    kind: 'passive',
    mpCost: 0,
    power: 8,
    passiveStat: 'intelligence',
    requires: 'mage_mana_flow',
  },
  {
    id: 'mage_mind_discipline',
    job: 'mage',
    name: '정신 수양',
    description: '정신을 수양해 마법에 대한 이해를 넓힙니다. (지혜 영구 증가)',
    requiredLevel: 9,
    kind: 'passive',
    mpCost: 0,
    power: 6,
    passiveStat: 'wisdom',
    requires: 'mage_arcane_mastery',
  },
  {
    id: 'mage_body_conditioning',
    job: 'mage',
    name: '체술 연마',
    description: '몸을 단련해 물리적인 충격에도 버틸 수 있게 됩니다. (물리방어 영구 증가)',
    requiredLevel: 10,
    kind: 'passive',
    mpCost: 0,
    power: 25,
    passiveStat: 'physicalDefense',
    requires: 'mage_mind_discipline',
  },
  {
    id: 'mage_earth_spikes',
    job: 'mage',
    name: '정신 방벽',
    description: '정신력으로 보이지 않는 방벽을 두릅니다. (마법방어 영구 증가)',
    requiredLevel: 12,
    kind: 'passive',
    mpCost: 0,
    power: 6,
    passiveStat: 'magicDefense',
    requires: 'mage_mind_discipline',
  },
  {
    id: 'mage_mana_engraving',
    job: 'mage',
    name: '마력 각인',
    description: '마법 회로를 몸에 각인시킵니다. (최대 MP 영구 증가)',
    requiredLevel: 16,
    kind: 'passive',
    mpCost: 0,
    power: 20,
    passiveStat: 'maxMp',
    requires: 'mage_earth_spikes',
  },
  {
    id: 'mage_qi_circulation',
    job: 'mage',
    name: '기 순환',
    description: '기를 순환시켜 스킬을 더 빨리 다시 쓸 수 있게 됩니다. (모든 스킬 재사용 대기시간 감소)',
    requiredLevel: 18,
    kind: 'passive',
    mpCost: 0,
    power: 10,
    reducesCooldown: true,
    requires: 'mage_mana_engraving',
  },
];

const MAGE_BRANCHES = buildElementBranches({
  job: 'mage',
  idPrefix: 'mage',
  activeKind: 'damage',
  damageType: 'magic',
  themes: {
    wood: {
      actives: [
        { name: '가시넝쿨 폭발', description: '가시 덩굴을 폭발시켜 주변 적 전체에게 마법 피해를 입힙니다.', aoe: true },
        { name: '관통하는 가시', description: '날카로운 가시를 압축해 적의 급소를 꿰뚫습니다.' },
        { name: '숲의 진노', description: '숲의 분노를 응축시켜 주변 적 전체를 휩씁니다.', aoe: true },
      ],
      capstone: { name: '심록의 활력', description: '목 기운이 생명력을 북돋아 육체가 강해집니다.', passiveStat: 'vitality' },
    },
    fire: {
      actives: [
        { name: '인페르노', description: '거대한 화염을 일으켜 주변 적 전체를 불태웁니다.', aoe: true },
        { name: '화염창 관통', description: '압축한 화염창으로 적의 급소를 꿰뚫습니다.' },
        { name: '대폭염', description: '폭발적인 화염을 퍼부어 주변 적 전체를 태웁니다.', aoe: true },
      ],
      capstone: { name: '타오르는 지성', description: '화 기운이 사고를 예리하게 다듬어 마법 이해가 깊어집니다.', passiveStat: 'intelligence' },
    },
    earth: {
      actives: [
        { name: '지각붕괴', description: '대지를 뒤흔들어 주변 적 전체에게 마법 피해를 입힙니다.', aoe: true },
        { name: '암석창 관통', description: '압축한 암석창으로 적의 급소를 꿰뚫습니다.' },
        { name: '지반폭쇄', description: '지반을 통째로 터뜨려 주변 적 전체를 강타합니다.', aoe: true },
      ],
      capstone: { name: '대지의 결계', description: '토 기운이 몸을 감싸 마법 방벽을 두릅니다.', passiveStat: 'magicDefense' },
    },
    metal: {
      actives: [
        { name: '금속폭풍', description: '금속 파편을 폭풍처럼 퍼부어 주변 적 전체를 가격합니다.', aoe: true },
        { name: '강침 관통', description: '압축한 금속 침으로 적의 급소를 꿰뚫습니다.' },
        { name: '칼날 마법진', description: '칼날로 이루어진 마법진을 터뜨려 주변 적 전체를 벱니다.', aoe: true },
      ],
      capstone: { name: '마나의 광맥', description: '금 기운이 몸속에 마나의 광맥을 새겨 넣습니다.', passiveStat: 'maxMp' },
    },
    water: {
      actives: [
        { name: '해빙폭발', description: '얼음을 일제히 터뜨려 주변 적 전체에게 냉기 피해를 입힙니다.', aoe: true },
        { name: '빙창 관통', description: '얼음창을 압축해 적의 급소를 꿰뚫습니다.' },
        { name: '해일마법', description: '거대한 물의 파도를 일으켜 주변 적 전체를 휩씁니다.', aoe: true },
      ],
      capstone: { name: '심연의 통찰', description: '수 기운이 마음을 가라앉혀 깊은 통찰을 얻습니다.', passiveStat: 'wisdom' },
    },
  },
});

export const MAGE_SKILLS: SkillDefinition[] = [...MAGE_TRUNK, ...MAGE_BRANCHES];
