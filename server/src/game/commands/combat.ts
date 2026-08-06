import { handleFlee as fleeCombat, startCombat } from '../combat/CombatManager.js';
import { findMobInRoomByName } from '../MobManager.js';
import type { CommandContext } from './context.js';

export function handleAttack(ctx: CommandContext, targetName: string): void {
  const trimmed = targetName.trim();
  if (!trimmed) {
    ctx.send({ type: 'error', text: '누구를 공격하시겠습니까? 사용법: attack <대상>' });
    return;
  }

  const mob = findMobInRoomByName(ctx.session.roomId, trimmed);
  if (!mob) {
    ctx.send({ type: 'text', text: '그런 대상이 이곳에 없습니다.' });
    return;
  }

  startCombat(ctx, mob);
}

export const handleFlee = fleeCombat;
