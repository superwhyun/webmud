import { buildElementBranches } from './branches.js';
import type { SkillDefinition } from './types.js';

const ROGUE_TRUNK: SkillDefinition[] = [
  // 도적 — 민첩 물리 딜. 공통 트리는 초반 액티브 1개 + 이후 전부 패시브로, 특성화(원소 분기)에서 액티브를 더 배운다.
  {
    id: 'rogue_backstab',
    job: 'rogue',
    name: '급소 찌르기',
    description: '적의 급소를 정확히 노립니다. (물리 피해 1.8배)',
    requiredLevel: 1,
    kind: 'damage',
    mpCost: 5,
    power: 1.8,
    damageType: 'physical',
    targeting: 'single',
    cooldownMs: 2000,
  },
  {
    // 민첩은 도적의 공격력과 회피율을 동시에 올려주는 유일한 스탯인데, 그 보너스가 레벨을 타고
    // 쌓이기 전(초반)엔 존재감이 없어서 저레벨 몹에게도 자주 죽는 문제가 있었다 — 습득 레벨을
    // 3→2로 낮추고 증가량도 키워서 초반부터 확실히 체감되게 했다.
    id: 'rogue_shadow_step',
    job: 'rogue',
    name: '그림자 걸음',
    description: '그림자처럼 가볍게 움직입니다. (민첩 영구 증가)',
    requiredLevel: 2,
    kind: 'passive',
    mpCost: 0,
    power: 5,
    passiveStat: 'dexterity',
    requires: 'rogue_backstab',
  },
  {
    id: 'rogue_deadly_precision',
    job: 'rogue',
    name: '백발백중',
    description: '치명적인 순간을 놓치지 않습니다. (행운 영구 증가)',
    requiredLevel: 6,
    kind: 'passive',
    mpCost: 0,
    power: 5,
    passiveStat: 'luck',
    requires: 'rogue_shadow_step',
  },
  {
    id: 'rogue_swift_feet',
    job: 'rogue',
    name: '쾌속 이동',
    description: '발걸음이 바람처럼 가벼워집니다. (민첩 영구 증가)',
    requiredLevel: 9,
    kind: 'passive',
    mpCost: 0,
    power: 6,
    passiveStat: 'dexterity',
    requires: 'rogue_deadly_precision',
  },
  {
    id: 'rogue_mental_conditioning',
    job: 'rogue',
    name: '정신 단련',
    description: '정신을 단련해 마법 공격에도 흔들리지 않게 됩니다. (마법방어 영구 증가)',
    requiredLevel: 10,
    kind: 'passive',
    mpCost: 0,
    power: 25,
    passiveStat: 'magicDefense',
    requires: 'rogue_swift_feet',
  },
  {
    id: 'rogue_beast_sense',
    job: 'rogue',
    name: '야수의 감각',
    description: '야수와 같은 감각으로 약점을 간파합니다. (행운 영구 증가)',
    requiredLevel: 12,
    kind: 'passive',
    mpCost: 0,
    power: 6,
    passiveStat: 'luck',
    requires: 'rogue_swift_feet',
  },
  {
    id: 'rogue_stealth_ambush',
    job: 'rogue',
    name: '암살자의 완숙',
    description: '수많은 암살을 거치며 육체가 완숙한 경지에 이릅니다. (힘 영구 증가)',
    requiredLevel: 16,
    kind: 'passive',
    mpCost: 0,
    power: 8,
    passiveStat: 'strength',
    requires: 'rogue_beast_sense',
  },
  {
    id: 'rogue_qi_circulation',
    job: 'rogue',
    name: '기 순환',
    description: '기를 순환시켜 스킬을 더 빨리 다시 쓸 수 있게 됩니다. (모든 스킬 재사용 대기시간 감소)',
    requiredLevel: 18,
    kind: 'passive',
    mpCost: 0,
    power: 10,
    reducesCooldown: true,
    requires: 'rogue_stealth_ambush',
  },
];

const ROGUE_BRANCHES = buildElementBranches({
  job: 'rogue',
  idPrefix: 'rogue',
  activeKind: 'damage',
  damageType: 'physical',
  themes: {
    wood: {
      actives: [
        { name: '가시덫 난사', description: '가시 덫을 사방에 뿌려 주변 적 전체에게 피해를 입힙니다.', aoe: true },
        { name: '독가시 찌르기', description: '독을 바른 가시로 적의 급소를 정확히 찌릅니다.' },
        { name: '가시덩굴 결박', description: '가시덩굴을 폭발시켜 주변 적 전체를 옭아매며 벱니다.', aoe: true },
      ],
      capstone: { name: '은밀한 생명력', description: '목 기운이 은밀하게 몸에 스며들어 생명력이 강해집니다.', passiveStat: 'vitality' },
    },
    fire: {
      actives: [
        { name: '화염 표창', description: '불타는 표창을 흩뿌려 주변 적 전체를 가격합니다.', aoe: true },
        { name: '작열 급소격', description: '불타는 칼날로 적의 급소를 정확히 찌릅니다.' },
        { name: '연쇄 폭발표창', description: '표창을 연쇄 폭발시켜 주변 적 전체를 불태웁니다.', aoe: true },
      ],
      capstone: { name: '불타는 본능', description: '화 기운이 근력에 타올라 완력이 강해집니다.', passiveStat: 'strength' },
    },
    earth: {
      actives: [
        { name: '함정 폭발', description: '숨겨둔 함정을 일제히 터뜨려 주변 적 전체에게 피해를 입힙니다.', aoe: true },
        { name: '암석 표창', description: '단단한 암석 표창으로 적의 급소를 정확히 찌릅니다.' },
        { name: '지뢰 연쇄폭발', description: '숨겨둔 지뢰를 연쇄로 터뜨려 주변 적 전체를 강타합니다.', aoe: true },
      ],
      capstone: { name: '그림자 갑주', description: '토 기운이 그림자처럼 몸을 감싸 방어가 단단해집니다.', passiveStat: 'physicalDefense' },
    },
    metal: {
      actives: [
        { name: '칼날폭풍', description: '단검을 폭풍처럼 흩뿌려 주변 적 전체를 베어냅니다.', aoe: true },
        { name: '은침 관절격', description: '가느다란 은침으로 적의 급소를 정확히 찌릅니다.' },
        { name: '단검 난사', description: '수십 개의 단검을 흩뿌려 주변 적 전체를 벱니다.', aoe: true },
      ],
      capstone: { name: '은신자의 육체', description: '금 기운이 뼈마디에 스며들어 육체가 단단해집니다.', passiveStat: 'maxHp' },
    },
    water: {
      actives: [
        { name: '급류난도', description: '급류처럼 빠른 연속 베기로 주변 적 전체를 휩씁니다.', aoe: true },
        { name: '물방울 관통', description: '압축한 물방울로 적의 급소를 정확히 꿰뚫습니다.' },
        { name: '해류 연격', description: '해류처럼 휘몰아치는 연속 공격으로 주변 적 전체를 벱니다.', aoe: true },
      ],
      capstone: { name: '물처럼 유연함', description: '수 기운이 몸놀림에 스며들어 움직임이 물처럼 유연해집니다.', passiveStat: 'dexterity' },
    },
  },
});

export const ROGUE_SKILLS: SkillDefinition[] = [...ROGUE_TRUNK, ...ROGUE_BRANCHES];
