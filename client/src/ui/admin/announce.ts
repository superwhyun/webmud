import { sendAnnouncement } from '../../adminApi';
import type { AdminContext } from './context';

export function wireAnnounce(ctx: AdminContext): void {
  ctx.container.querySelector<HTMLButtonElement>('#admin-announce-send')!.addEventListener('click', () => {
    const message = ctx.announceInput.value.trim();
    ctx.announceError.textContent = '';
    if (!message) {
      ctx.announceError.textContent = '메시지를 입력하세요.';
      return;
    }
    sendAnnouncement(ctx.token, message)
      .then(() => {
        ctx.announceInput.value = '';
      })
      .catch((error: unknown) => {
        ctx.announceError.textContent = error instanceof Error ? error.message : '공지 전송에 실패했습니다.';
      });
  });
}
