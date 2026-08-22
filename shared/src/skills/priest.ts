import { buildElementBranches } from './branches.js';
import type { SkillDefinition } from './types.js';

const PRIEST_TRUNK: SkillDefinition[] = [
  // 사제 — 회복/지원. 트리 전체(트렁크+원소 분기)에 데미지 스킬이 하나도 없어서 평타(지혜 기반
  // 마법)만으로 싸워야 했다 — 밸런스 조사용 플레이봇 실측 결과 Lv10 이후 한 레벨 업에 9~10분씩
  // 걸릴 만큼 딜이 부족했다. priest_smite를 추가해서 다른 직업처럼 평타+스킬 콤보로 딜이
  // 나오게 하되, 힐(priest_heal)과 같은 갈래(둘 다 lv3에서 갈라짐)로 둬서 지원형으로 계속
  // 키우고 싶으면 축복 쪽만 타도 되게 했다.
  {
    id: 'priest_heal',
    job: 'priest',
    name: '소생의 손길',
    description: '따뜻한 빛으로 상처를 치유합니다. (HP 12 회복)',
    requiredLevel: 1,
    kind: 'heal',
    mpCost: 6,
    power: 12,
    cooldownMs: 2000,
  },
  {
    id: 'priest_smite',
    job: 'priest',
    name: '심판의 빛',
    description: '성스러운 빛으로 적을 심판합니다. (마법 피해 1.8배)',
    requiredLevel: 3,
    kind: 'damage',
    mpCost: 5,
    power: 1.8,
    damageType: 'magic',
    targeting: 'single',
    cooldownMs: 2000,
    requires: 'priest_heal',
  },
  {
    id: 'priest_blessing',
    job: 'priest',
    name: '축복',
    description: '몸에 성스러운 가호를 두릅니다. (20초간 마법방어 증가, 자신 또는 대상에게 시전)',
    requiredLevel: 3,
    kind: 'buff',
    mpCost: 6,
    power: 5,
    buffStat: 'magicDefense',
    durationMs: 20000,
    cooldownMs: 8000,
    requires: 'priest_heal',
  },
  {
    id: 'priest_endurance',
    job: 'priest',
    name: '인내',
    description: '고통을 견디는 법을 체득합니다. (최대 HP 영구 증가)',
    requiredLevel: 6,
    kind: 'passive',
    mpCost: 0,
    power: 10,
    passiveStat: 'maxHp',
    requires: 'priest_blessing',
  },
  {
    id: 'priest_holy_patience',
    job: 'priest',
    name: '신성한 인내',
    description: '기도로 마음을 집중해 지혜를 끌어올립니다. (30초간 지혜 증가, 자신 또는 대상에게 시전)',
    requiredLevel: 9,
    kind: 'buff',
    mpCost: 7,
    power: 6,
    buffStat: 'wisdom',
    durationMs: 30000,
    cooldownMs: 10000,
    requires: 'priest_endurance',
  },
  {
    id: 'priest_body_conditioning',
    job: 'priest',
    name: '체술 연마',
    description: '몸을 단련해 물리적인 충격에도 버틸 수 있게 됩니다. (30초간 물리방어 증가, 자신 또는 대상에게 시전)',
    requiredLevel: 10,
    kind: 'buff',
    mpCost: 7,
    power: 25,
    buffStat: 'physicalDefense',
    durationMs: 30000,
    cooldownMs: 10000,
    requires: 'priest_holy_patience',
  },
  {
    id: 'priest_mental_fortitude',
    job: 'priest',
    name: '정신력 강화',
    description: '정신력을 신성한 힘으로 화하여 마법 공격을 막아냅니다. (35초간 마법방어 증가, 자신 또는 대상에게 시전)',
    requiredLevel: 12,
    kind: 'buff',
    mpCost: 8,
    power: 8,
    buffStat: 'magicDefense',
    durationMs: 35000,
    cooldownMs: 12000,
    requires: 'priest_holy_patience',
  },
  {
    id: 'priest_divine_grace',
    job: 'priest',
    name: '성스러운 은총',
    description: '성스러운 은총이 온몸을 감싸 육체가 튼튼해집니다. (최대 HP 영구 증가)',
    requiredLevel: 16,
    kind: 'passive',
    mpCost: 0,
    power: 30,
    passiveStat: 'maxHp',
    requires: 'priest_mental_fortitude',
  },
  {
    id: 'priest_qi_circulation',
    job: 'priest',
    name: '기 순환',
    description: '기를 순환시켜 스킬을 더 빨리 다시 쓸 수 있게 됩니다. (모든 스킬 재사용 대기시간 감소)',
    requiredLevel: 18,
    kind: 'passive',
    mpCost: 0,
    power: 10,
    reducesCooldown: true,
    requires: 'priest_divine_grace',
  },
];

const PRIEST_BRANCHES = buildElementBranches({
  job: 'priest',
  idPrefix: 'priest',
  activeKind: 'heal',
  themes: {
    wood: {
      actives: [
        { name: '생명의 축복', description: '목 기운의 생명력을 담아 큰 상처를 치유합니다.' },
        { name: '치유의 새싹', description: '새싹이 돋듯 상처가 서서히 아뭅니다.' },
        { name: '태고의 치유', description: '태고의 생명력을 빌려 깊은 상처까지 치유합니다.' },
      ],
      capstone: { name: '만물의 생명력', description: '목 기운이 육체 깊이 뿌리내려 생명력이 강해집니다.', passiveStat: 'vitality' },
    },
    fire: {
      actives: [
        { name: '불사조의 빛', description: '불사조의 온기를 담은 빛으로 큰 상처를 치유합니다.' },
        { name: '정화의 불꽃', description: '정화의 불꽃으로 상처를 태우듯 아물게 합니다.' },
        { name: '불사조의 부활', description: '불사조의 힘을 빌려 죽음 직전의 상처마저 되돌립니다.' },
      ],
      capstone: { name: '타오르는 신앙', description: '화 기운이 신앙심을 밝혀 마법의 이해가 깊어집니다.', passiveStat: 'intelligence' },
    },
    earth: {
      actives: [
        { name: '대지의 치유', description: '대지의 기운을 빌려 큰 상처를 치유합니다.' },
        { name: '대지의 포옹', description: '대지가 감싸안듯 상처를 어루만집니다.' },
        { name: '대지모신의 가호', description: '대지모신의 가호로 깊은 상처까지 치유합니다.' },
      ],
      capstone: { name: '대지의 축복', description: '토 기운이 몸을 감싸 마법 방벽을 두릅니다.', passiveStat: 'magicDefense' },
    },
    metal: {
      actives: [
        { name: '은빛 치유', description: '은빛으로 빛나는 신성한 힘으로 큰 상처를 치유합니다.' },
        { name: '순은의 성흔', description: '순은의 성흔이 상처를 빠르게 아물게 합니다.' },
        { name: '천상의 은검', description: '천상의 은검이 발하는 빛으로 깊은 상처까지 치유합니다.' },
      ],
      capstone: { name: '성스러운 갑주', description: '금 기운이 갑주처럼 몸을 감싸 육체가 튼튼해집니다.', passiveStat: 'maxHp' },
    },
    water: {
      actives: [
        { name: '생명의 샘물', description: '맑은 샘물의 기운을 담아 큰 상처를 치유합니다.' },
        { name: '이슬의 축복', description: '맑은 이슬이 상처에 스며들어 서서히 아물게 합니다.' },
        { name: '심연의 성수', description: '심연 깊은 곳의 성수로 깊은 상처까지 치유합니다.' },
      ],
      capstone: { name: '심연의 자비', description: '수 기운이 마음을 가라앉혀 깊은 지혜를 얻습니다.', passiveStat: 'wisdom' },
    },
  },
});

export const PRIEST_SKILLS: SkillDefinition[] = [...PRIEST_TRUNK, ...PRIEST_BRANCHES];
