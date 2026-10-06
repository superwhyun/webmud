import type { ClientMessage, ServerMessage } from '@mud/shared';
import { closeCharacterSheet } from './characterSheet';
import { appendLine, type GameContext } from './context';
import { closeMacroModal } from './macroPanel';
import { dispatchServerMessage } from './messages';
import { renderBuffPanel, renderCooldownPanel } from './state';
import { closeSuggestionModal } from './suggestions';

/** One connection owns its listeners and timer, even while its screen is rebuilt. */
export function bindGameSession(
  socket: WebSocket,
  token: string,
  getContext: () => GameContext | null,
): () => void {
  const onOpen = () => {
    const message: ClientMessage = { type: 'auth', token };
    socket.send(JSON.stringify(message));
  };
  const onClose = () => {
    const ctx = getContext();
    if (ctx) appendLine(ctx, '[연결 종료됨]');
  };
  const onMessage = (event: MessageEvent<string>) => {
    const ctx = getContext();
    if (!ctx) return;
    let message: ServerMessage;
    try {
      message = JSON.parse(event.data) as ServerMessage;
      if (!message || typeof message.type !== 'string') throw new Error('Invalid message');
    } catch {
      appendLine(ctx, '서버 응답을 처리하지 못했습니다.', 'error');
      return;
    }
    dispatchServerMessage(ctx, message);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const ctx = getContext();
    if (event.key !== 'Escape' || !ctx) return;
    if (!ctx.characterSheetModal.hidden) closeCharacterSheet(ctx);
    else if (!ctx.macroModal.hidden) closeMacroModal(ctx);
    else if (!ctx.suggestionModal.hidden) closeSuggestionModal(ctx);
  };
  const timer = setInterval(() => {
    const ctx = getContext();
    if (ctx) {
      renderCooldownPanel(ctx);
      renderBuffPanel(ctx);
    }
  }, 100);

  socket.addEventListener('open', onOpen);
  socket.addEventListener('close', onClose);
  socket.addEventListener('message', onMessage);
  document.addEventListener('keydown', onKeyDown);

  return () => {
    clearInterval(timer);
    socket.removeEventListener('open', onOpen);
    socket.removeEventListener('close', onClose);
    socket.removeEventListener('message', onMessage);
    document.removeEventListener('keydown', onKeyDown);
  };
}
