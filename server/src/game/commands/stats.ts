import { db } from '../../db/client.js';
import { loadCharacter, loadCharacterState } from '../characterState.js';
import type { CommandContext } from './context.js';

const STAT_COLUMNS = {
  str: 'strength',
  dex: 'dexterity',
  int: 'intelligence',
  vit: 'vitality',
  wis: 'wisdom',
  luk: 'luck',
} as const;

type StatKey = keyof typeof STAT_COLUMNS;

const STAT_LABELS: Record<StatKey, string> = {
  str: '힘',
  dex: '민첩',
  int: '지능',
  vit: '체력',
  wis: '지혜',
  luk: '행운',
};

/** 전사/사제의 레벨업 성장 비율(HP+4당 체력+1)과 맞춘 값 — 체력 분배도 같은 비율로 최대HP를 올린다. */
const HP_PER_VITALITY_POINT = 4;

export function handleStat(ctx: CommandContext, rest: string): void {
  const [statArg, amountArg] = rest.trim().split(/\s+/);
  const statKey = statArg?.toLowerCase() as StatKey | undefined;

  if (!statKey || !(statKey in STAT_COLUMNS)) {
    ctx.send({
      type: 'text',
      text: '사용법: stat <str|dex|int|vit|wis|luk> <수치> (힘/민첩/지능/체력/지혜/행운)',
    });
    return;
  }

  const amount = Number(amountArg);
  if (!Number.isInteger(amount) || amount <= 0) {
    ctx.send({ type: 'text', text: '1 이상의 정수를 입력하세요.' });
    return;
  }

  const character = loadCharacter(ctx.session.characterId);
  if (!character) return;

  if (character.unallocated_stat_points < amount) {
    ctx.send({
      type: 'text',
      text: `분배 가능한 스탯 포인트가 부족합니다. (보유 ${character.unallocated_stat_points})`,
    });
    return;
  }

  const column = STAT_COLUMNS[statKey];
  if (statKey === 'vit') {
    const hpGain = amount * HP_PER_VITALITY_POINT;
    db.prepare(
      `UPDATE characters SET vitality = vitality + ?, max_hp = max_hp + ?, hp = hp + ?, unallocated_stat_points = unallocated_stat_points - ? WHERE id = ?`,
    ).run(amount, hpGain, hpGain, amount, character.id);
  } else {
    db.prepare(
      `UPDATE characters SET ${column} = ${column} + ?, unallocated_stat_points = unallocated_stat_points - ? WHERE id = ?`,
    ).run(amount, amount, character.id);
  }

  ctx.send({ type: 'text', text: `${STAT_LABELS[statKey]}에 스탯 포인트 ${amount}을(를) 분배했습니다.` });

  const state = loadCharacterState(character.id);
  if (state) ctx.send({ type: 'state', character: state });
}
