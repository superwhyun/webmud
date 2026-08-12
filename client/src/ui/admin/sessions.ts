import { fetchAdminRooms, fetchSessions, moderationKick, moderationMove, type RoomOptionDto } from '../../adminApi';
import { escapeHtml } from '../../domUtils';
import type { AdminContext } from './context';

export async function refreshRooms(ctx: AdminContext): Promise<void> {
  ctx.rooms = (await fetchAdminRooms(ctx.token)).rooms;
}

/** 맵 빌더의 포털 추가 드롭다운과 같은 방식으로, 존별로 묶어서 어느 존의 방인지 한눈에 보이게 한다. */
export function roomOptionsHtml(ctx: AdminContext, selectedRoomId?: number | null): string {
  const groupedByZone = new Map<string, RoomOptionDto[]>();
  for (const room of ctx.rooms) {
    const list = groupedByZone.get(room.zoneName) ?? [];
    list.push(room);
    groupedByZone.set(room.zoneName, list);
  }

  return [...groupedByZone.entries()]
    .map(
      ([zoneName, rooms]) => `
        <optgroup label="${escapeHtml(zoneName)}">
          ${rooms
            .map(
              (room) =>
                `<option value="${room.id}" ${room.id === selectedRoomId ? 'selected' : ''}>${escapeHtml(room.name)}</option>`,
            )
            .join('')}
        </optgroup>
      `,
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
