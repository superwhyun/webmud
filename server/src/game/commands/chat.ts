import { broadcastToRoom, getAllSessions } from '../sessionRegistry.js';
import { send } from '../wsUtil.js';
import type { CommandContext } from './context.js';

export function handleSay(ctx: CommandContext, message: string): void {
  const trimmed = message.trim();
  if (!trimmed) {
    ctx.send({ type: 'error', text: '무엇을 말하시겠습니까? 사용법: say <메시지>' });
    return;
  }

  ctx.send({ type: 'text', text: `당신이 말했습니다: "${trimmed}"` });
  broadcastToRoom(
    ctx.session.roomId,
    { type: 'text', text: `${ctx.session.characterName}님이 말했습니다: "${trimmed}"` },
    ctx.session.ws,
  );
}

export function handleShout(ctx: CommandContext, message: string): void {
  const trimmed = message.trim();
  if (!trimmed) {
    ctx.send({ type: 'error', text: '무엇을 외치시겠습니까? 사용법: shout <메시지>' });
    return;
  }

  ctx.send({ type: 'text', text: `당신이 외쳤습니다: "${trimmed}"` });
  for (const session of getAllSessions()) {
    if (session.ws === ctx.session.ws) continue;
    send(session.ws, { type: 'text', text: `${ctx.session.characterName}님이 외쳤습니다: "${trimmed}"` });
  }
}

export function handleWho(ctx: CommandContext): void {
  const names = getAllSessions().map((session) => session.characterName);
  ctx.send({ type: 'text', text: `현재 접속 중 (${names.length}명): ${names.join(', ')}` });
}
