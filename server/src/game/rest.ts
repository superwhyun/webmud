import { restHpRecoveryPerTick, restMpRecoveryPerTick } from '@mud/shared';
import type { WebSocket } from 'ws';
import { db } from '../db/client.js';
import { loadCharacter, loadCharacterState } from './characterState.js';
import { isInCombat } from './combat/CombatManager.js';
import type { CommandContext } from './commands/context.js';
import { getSession } from './sessionRegistry.js';
import { send } from './wsUtil.js';

/**
 * 완전히 빈 상태에서 가득 찰 때까지 이만큼의 틱(각 1초, worldTick 주기와 동일)이 걸리도록 초당 회복량을
 * 최대치에 비례해서 계산한다. 이미 어느 정도 차 있었다면 그만큼 더 빨리 끝난다 — 물약처럼 즉시 채워주는
 * 대신 "시간"을 들이는 게 rest의 대가라서, 전투 중 응급 회복이나 쉴 틈 없이 계속 사냥할 땐 물약이 여전히 값어치를 한다.
 */
const restingSessions = new Set<WebSocket>();

export function isResting(ws: WebSocket): boolean {
  return restingSessions.has(ws);
}

export function stopResting(ws: WebSocket): void {
  restingSessions.delete(ws);
}

export function handleRest(ctx: CommandContext): void {
  if (isInCombat(ctx.session.ws)) {
    ctx.send({ type: 'error', text: '전투 중에는 쉴 수 없습니다.' });
    return;
  }
  if (isResting(ctx.session.ws)) {
    ctx.send({ type: 'text', text: '이미 쉬고 있습니다.' });
    return;
  }

  const character = loadCharacter(ctx.session.characterId);
  if (!character) return;
  if (character.hp >= character.max_hp && character.mp >= character.max_mp) {
    ctx.send({ type: 'text', text: '이미 체력과 마나가 가득 찼습니다.' });
    return;
  }

  restingSessions.add(ctx.session.ws);
  ctx.send({ type: 'text', text: '자리를 잡고 휴식을 취합니다. (전투하거나 이동하면 중단됩니다)' });
}

/** worldTick에서 1초마다 호출된다. 쉬고 있는 세션들의 체력/마나를 채우고, 다 차면 자동으로 멈춘다. */
export function tickResting(): void {
  for (const ws of [...restingSessions]) {
    const session = getSession(ws);
    if (!session) {
      restingSessions.delete(ws);
      continue;
    }

    const character = loadCharacter(session.characterId);
    if (!character) {
      restingSessions.delete(ws);
      continue;
    }

    const hpStep = restHpRecoveryPerTick(character.max_hp);
    const mpStep = restMpRecoveryPerTick(character.max_mp, character.wisdom);
    const newHp = Math.min(character.max_hp, character.hp + hpStep);
    const newMp = Math.min(character.max_mp, character.mp + mpStep);

    db.prepare('UPDATE characters SET hp = ?, mp = ? WHERE id = ?').run(newHp, newMp, character.id);

    const state = loadCharacterState(session.characterId);
    if (state) send(ws, { type: 'state', character: state });

    if (newHp >= character.max_hp && newMp >= character.max_mp) {
      restingSessions.delete(ws);
      send(ws, { type: 'text', text: '체력과 마나가 가득 차서 휴식을 마쳤습니다.' });
    }
  }
}
