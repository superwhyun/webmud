import { broadcastToRoom, getAllSessions, getSessionByCharacterName } from '../sessionRegistry.js';
import { send } from '../wsUtil.js';
import type { CommandContext } from './context.js';

export function handleSay(ctx: CommandContext, message: string): void {
  const trimmed = message.trim();
  if (!trimmed) {
    ctx.send({ type: 'error', text: '무엇을 말하시겠습니까? 사용법: say <메시지>' });
    return;
  }

  ctx.send({ type: 'text', text: `당신이 말했습니다: "${trimmed}"`, channel: 'say' });
  broadcastToRoom(
    ctx.session.roomId,
    { type: 'text', text: `${ctx.session.characterName}님이 말했습니다: "${trimmed}"`, channel: 'say' },
    ctx.session.ws,
  );
}

export function handleShout(ctx: CommandContext, message: string): void {
  const trimmed = message.trim();
  if (!trimmed) {
    ctx.send({ type: 'error', text: '무엇을 외치시겠습니까? 사용법: shout <메시지>' });
    return;
  }

  ctx.send({ type: 'text', text: `당신이 외쳤습니다: "${trimmed}"`, channel: 'shout' });
  for (const session of getAllSessions()) {
    if (session.ws === ctx.session.ws) continue;
    send(session.ws, {
      type: 'text',
      text: `${ctx.session.characterName}님이 외쳤습니다: "${trimmed}"`,
      channel: 'shout',
    });
  }
}

export function handleTell(ctx: CommandContext, rest: string): void {
  const trimmed = rest.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (!trimmed || spaceIndex === -1) {
    ctx.send({ type: 'error', text: '사용법: tell <이름> <메시지>' });
    return;
  }

  const targetName = trimmed.slice(0, spaceIndex);
  const message = trimmed.slice(spaceIndex + 1).trim();
  if (!message) {
    ctx.send({ type: 'error', text: '사용법: tell <이름> <메시지>' });
    return;
  }

  if (targetName === ctx.session.characterName) {
    ctx.send({ type: 'error', text: '자기 자신에게는 귓속말을 할 수 없습니다.' });
    return;
  }

  const target = getSessionByCharacterName(targetName);
  if (!target) {
    ctx.send({ type: 'text', text: `'${targetName}'님은 접속 중이 아닙니다.` });
    return;
  }

  ctx.send({ type: 'text', text: `${targetName}님에게 귓속말: "${message}"`, channel: 'tell' });
  send(target.ws, {
    type: 'text',
    text: `${ctx.session.characterName}님의 귓속말: "${message}"`,
    channel: 'tell',
  });
}

export function handleWho(ctx: CommandContext): void {
  const names = getAllSessions().map((session) => session.characterName);
  ctx.send({ type: 'text', text: `현재 접속 중 (${names.length}명): ${names.join(', ')}` });
}
