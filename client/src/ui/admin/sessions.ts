import { fetchAdminRooms, fetchSessions, moderationKick, moderationMove } from '../../adminApi';
import { escapeHtml } from '../../domUtils';
import type { AdminContext } from './context';

export async function refreshRooms(ctx: AdminContext): Promise<void> {
  ctx.rooms = (await fetchAdminRooms(ctx.token)).rooms;
}

export function roomOptionsHtml(ctx: AdminContext, selectedRoomId?: number | null): string {
  return ctx.rooms
    .map(
      (room) =>
        `<option value="${room.id}" ${room.id === selectedRoomId ? 'selected' : ''}>${escapeHtml(room.name)}</option>`,
    )
    .join('');
}

export async function refreshSessions(ctx: AdminContext): Promise<void> {
  const { sessions } = await fetchSessions(ctx.token);
  ctx.sessionsList.innerHTML =
    sessions
      .map(
        (session) => `
          <div class="admin-session-row" data-character="${escapeHtml(session.characterName)}">
            <span>${escapeHtml(session.characterName)} — ${escapeHtml(session.roomName)}</span>
            <select class="admin-move-target">${roomOptionsHtml(ctx)}</select>
            <button type="button" class="admin-move-btn">이동</button>
            <button type="button" class="admin-kick-btn">추방</button>
          </div>
        `,
      )
      .join('') || '<p class="admin-panel-empty">접속 중인 유저가 없습니다.</p>';

  ctx.sessionsList.querySelectorAll<HTMLDivElement>('.admin-session-row').forEach((row) => {
    const characterName = row.dataset.character!;
    row.querySelector<HTMLButtonElement>('.admin-move-btn')!.addEventListener('click', () => {
      const targetRoomId = Number(row.querySelector<HTMLSelectElement>('.admin-move-target')!.value);
      moderationMove(ctx.token, characterName, targetRoomId)
        .then(() => refreshSessions(ctx))
        .catch((error: unknown) => {
          ctx.sessionsError.textContent = error instanceof Error ? error.message : '이동에 실패했습니다.';
        });
    });
    row.querySelector<HTMLButtonElement>('.admin-kick-btn')!.addEventListener('click', () => {
      moderationKick(ctx.token, characterName)
        .then(() => refreshSessions(ctx))
        .catch((error: unknown) => {
          ctx.sessionsError.textContent = error instanceof Error ? error.message : '추방에 실패했습니다.';
        });
    });
  });
}
