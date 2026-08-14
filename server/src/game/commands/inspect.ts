import {
  EQUIPMENT_SLOT_LABELS,
  ELEMENT_LABELS,
  formatItemMention,
  ITEM_GRADE_LABELS,
  NPC_TYPE_LABELS,
  type EquipmentSlot,
  type ItemGrade,
} from '@mud/shared';
import { db } from '../../db/client.js';
import { loadCharacter } from '../characterState.js';
import { hasElementAdvantage } from '../combat/combatMath.js';
import { findMobInRoomByName, getMobsInRoom } from '../MobManager.js';
import { findNpcInRoomByName } from '../NpcManager.js';
import type { CommandContext } from './context.js';

interface DescribableItemRow {
  name: string;
  description: string;
  type: string;
  slot: EquipmentSlot | null;
  level: number;
  grade: ItemGrade;
  strength_bonus: number;
  dexterity_bonus: number;
  attack_power_bonus: number;
  intelligence_bonus: number;
  physical_defense_bonus: number;
  magic_defense_bonus: number;
  heal_amount: number;
  mana_amount: number;
}

function describeItem(item: DescribableItemRow): string {
  const lines = [
    `${formatItemMention(item.name, item.grade)} (${ITEM_GRADE_LABELS[item.grade]}, Lv.${item.level})`,
    item.description,
  ];

  const bonuses: string[] = [];
  if (item.strength_bonus) bonuses.push(`힘 +${item.strength_bonus}`);
  if (item.dexterity_bonus) bonuses.push(`민첩 +${item.dexterity_bonus}`);
  if (item.attack_power_bonus) bonuses.push(`공격력 +${item.attack_power_bonus}`);
  if (item.intelligence_bonus) bonuses.push(`지능 +${item.intelligence_bonus}`);
  if (item.physical_defense_bonus) bonuses.push(`물리방어 +${item.physical_defense_bonus}`);
  if (item.magic_defense_bonus) bonuses.push(`마법방어 +${item.magic_defense_bonus}`);
  if (item.heal_amount) bonuses.push(`체력 회복 +${item.heal_amount}`);
  if (item.mana_amount) bonuses.push(`마나 회복 +${item.mana_amount}`);
  if (bonuses.length > 0) lines.push(bonuses.join(', '));

  if (item.slot) lines.push(`착용 부위: ${EQUIPMENT_SLOT_LABELS[item.slot]}`);

  return lines.join('\n');
}

export function handleExamine(ctx: CommandContext, target: string): void {
  const trimmed = target.trim();
  if (!trimmed) {
    ctx.send({ type: 'error', text: '무엇을 살펴보시겠습니까? 사용법: examine <대상>' });
    return;
  }
  const lower = trimmed.toLowerCase();

  const mob = findMobInRoomByName(ctx.session.roomId, trimmed);
  if (mob) {
    const character = loadCharacter(ctx.session.characterId);
    const advantageNote = character
      ? hasElementAdvantage(character.element, mob.element)
        ? ' (당신에게 상성 우위가 있습니다)'
        : hasElementAdvantage(mob.element, character.element)
          ? ' (상대에게 상성 우위가 있습니다)'
          : ''
      : '';
    ctx.send({
      type: 'text',
      text: [
        `${mob.name} Lv.${mob.level} (HP ${mob.hp}/${mob.maxHp})`,
        `속성: ${ELEMENT_LABELS[mob.element]}${advantageNote}`,
        `물리방어 ${mob.physicalDefense}, 마법방어 ${mob.magicDefense}`,
        mob.hostile ? '적대적인 몬스터입니다.' : '적대적이지 않은 몬스터입니다.',
      ].join('\n'),
    });
    return;
  }

  const npc = findNpcInRoomByName(ctx.session.roomId, trimmed);
  if (npc) {
    ctx.send({
      type: 'text',
      text: [`${npc.name} (${NPC_TYPE_LABELS[npc.type]})`, npc.description].join('\n'),
    });
    return;
  }

  const roomItem = db
    .prepare(
      `SELECT i.name, i.description, i.type, i.slot, i.level, i.grade, i.strength_bonus, i.dexterity_bonus,
        i.attack_power_bonus, i.intelligence_bonus, i.physical_defense_bonus, i.magic_defense_bonus,
        i.heal_amount, i.mana_amount
       FROM room_items ri JOIN items i ON i.id = ri.item_id
       WHERE ri.room_id = ?`,
    )
    .all(ctx.session.roomId) as DescribableItemRow[];
  const foundRoomItem = roomItem.find((item) => item.name.toLowerCase().includes(lower));
  if (foundRoomItem) {
    ctx.send({ type: 'text', text: describeItem(foundRoomItem) });
    return;
  }

  const inventoryItem = db
    .prepare(
      `SELECT i.name, i.description, i.type, i.slot, i.level, i.grade, i.strength_bonus, i.dexterity_bonus,
        i.attack_power_bonus, i.intelligence_bonus, i.physical_defense_bonus, i.magic_defense_bonus,
        i.heal_amount, i.mana_amount
       FROM inventory_items inv JOIN items i ON i.id = inv.item_id
       WHERE inv.character_id = ?`,
    )
    .all(ctx.session.characterId) as DescribableItemRow[];
  const foundInventoryItem = inventoryItem.find((item) => item.name.toLowerCase().includes(lower));
  if (foundInventoryItem) {
    ctx.send({ type: 'text', text: describeItem(foundInventoryItem) });
    return;
  }

  ctx.send({ type: 'text', text: '그런 대상이 보이지 않습니다.' });
}

const CONSIDER_THRESHOLDS: { maxDiff: number; message: string }[] = [
  { maxDiff: -8, message: '상대가 되지 않을 만큼 압도적으로 약합니다.' },
  { maxDiff: -3, message: '가볍게 이길 수 있는 상대입니다.' },
  { maxDiff: 1, message: '비슷한 실력의 상대입니다.' },
  { maxDiff: 4, message: '꽤 위험한 상대입니다. 조심하세요.' },
  { maxDiff: Infinity, message: '승산이 없습니다. 도망치는 것을 추천합니다.' },
];

export function handleConsider(ctx: CommandContext, target: string): void {
  const trimmed = target.trim();
  if (!trimmed) {
    ctx.send({ type: 'error', text: '무엇을 가늠해보시겠습니까? 사용법: consider <대상>' });
    return;
  }

  const mob = findMobInRoomByName(ctx.session.roomId, trimmed);
  if (!mob) {
    const anyMob = getMobsInRoom(ctx.session.roomId).length > 0;
    ctx.send({ type: 'text', text: anyMob ? '그런 대상이 이곳에 없습니다.' : '이곳에는 몬스터가 없습니다.' });
    return;
  }

  const character = loadCharacter(ctx.session.characterId);
  if (!character) return;

  const diff = mob.level - character.level;
  const verdict = CONSIDER_THRESHOLDS.find((tier) => diff <= tier.maxDiff)!.message;
  const advantageNote = hasElementAdvantage(character.element, mob.element)
    ? ' 속성 상성에서 당신이 유리합니다.'
    : hasElementAdvantage(mob.element, character.element)
      ? ' 속성 상성에서 상대가 유리합니다.'
      : '';

  ctx.send({ type: 'text', text: `${mob.name} (Lv.${mob.level})을(를) 가늠해봅니다... ${verdict}${advantageNote}` });
}
