import { sendAnnouncement } from '../../adminApi';
import { escapeHtml } from '../../domUtils';
import type { AdminContext } from './context';

const ANNOUNCE_TEMPLATES: { label: string; text: string }[] = [
  { label: '점검 안내', text: '서버 점검이 예정되어 있습니다. 잠시 후 서버가 재시작될 수 있으니 안전한 곳으로 이동해주세요.' },
  { label: '점검 완료', text: '서버 점검이 완료되었습니다. 이용해주셔서 감사합니다.' },
  { label: '이벤트 안내', text: '지금부터 특별 이벤트가 진행됩니다! 자세한 내용은 공지를 확인해주세요.' },
  { label: '긴급 공지', text: '긴급 공지: ' },
];

export function wireAnnounce(ctx: AdminContext): void {
  ctx.announceTemplates.innerHTML = ANNOUNCE_TEMPLATES.map(
    (template, index) => `<button type="button" class="admin-announce-template-btn" data-template-index="${index}">${escapeHtml(template.label)}</button>`,
  ).join('');

  ctx.announceTemplates.querySelectorAll<HTMLButtonElement>('.admin-announce-template-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const template = ANNOUNCE_TEMPLATES[Number(button.dataset.templateIndex)];
      ctx.announceInput.value = template.text;
      updateCharCount(ctx);
      ctx.announceInput.focus();
    });
  });

  ctx.announceInput.addEventListener('input', () => updateCharCount(ctx));
  updateCharCount(ctx);

  ctx.container.querySelector<HTMLButtonElement>('#admin-announce-send')!.addEventListener('click', () => {
    const message = ctx.announceInput.value.trim();
    ctx.announceError.textContent = '';
    ctx.announceSuccess.textContent = '';
    if (!message) {
      ctx.announceError.textContent = '메시지를 입력하세요.';
      return;
    }
    sendAnnouncement(ctx.token, message)
      .then(() => {
        ctx.announceInput.value = '';
        updateCharCount(ctx);
        ctx.announceSuccess.textContent = '공지를 전송했습니다.';
      })
      .catch((error: unknown) => {
        ctx.announceError.textContent = error instanceof Error ? error.message : '공지 전송에 실패했습니다.';
      });
  });
}

function updateCharCount(ctx: AdminContext): void {
  ctx.announceCharCount.textContent = `${ctx.announceInput.value.length}/500`;
}
