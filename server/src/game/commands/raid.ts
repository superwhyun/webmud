import { isInCombat } from '../combat/CombatManager.js';
import { canRaid, executeRaid } from '../village/RaidService.js';
import { findVillageByName } from '../village/VillageService.js';
import type { CommandContext } from './context.js';
import { requireLord } from './village.js';

export function handleRaid(ctx: CommandContext, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) {
    ctx.send({ type: 'error', text: '사용법: raid <마을이름>' });
    return;
  }

  if (isInCombat(ctx.session.ws)) {
    ctx.send({ type: 'text', text: '전투 중에는 습격을 보낼 수 없습니다.' });
    return;
  }

  const check = requireLord(ctx);
  if (!check.ok) {
    ctx.send({ type: 'text', text: check.error });
    return;
  }

  const defenderVillage = findVillageByName(trimmed);
  if (!defenderVillage) {
    ctx.send({ type: 'text', text: '그런 이름의 마을이 없습니다.' });
    return;
  }

  const eligibility = canRaid(check.village, defenderVillage);
  if (!eligibility.ok) {
    ctx.send({ type: 'text', text: eligibility.error ?? '습격할 수 없습니다.' });
    return;
  }

  executeRaid(ctx, check.village, defenderVillage);
}
