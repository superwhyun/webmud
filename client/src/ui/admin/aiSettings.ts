import { clearOpenAiKey, fetchOpenAiKeyStatus, saveOpenAiKey } from '../../adminApi';
import type { AdminContext } from './context';

export async function refreshAiSettings(ctx: AdminContext): Promise<void> {
  try {
    const { configured } = await fetchOpenAiKeyStatus(ctx.token);
    ctx.aiKeyStatus.textContent = configured ? '현재 키가 설정되어 있습니다.' : '설정된 키가 없습니다.';
  } catch (error) {
    ctx.aiKeyStatus.textContent = '상태를 확인하지 못했습니다.';
    ctx.aiKeyError.textContent = error instanceof Error ? error.message : '상태 조회에 실패했습니다.';
  }
}

export function wireAiSettings(ctx: AdminContext): void {
  ctx.container.querySelector<HTMLButtonElement>('#admin-ai-key-save')!.addEventListener('click', () => {
    const apiKey = ctx.aiKeyInput.value.trim();
    ctx.aiKeyError.textContent = '';
    ctx.aiKeySuccess.textContent = '';
    if (!apiKey) {
      ctx.aiKeyError.textContent = 'API 키를 입력하세요.';
      return;
    }

    saveOpenAiKey(ctx.token, apiKey)
      .then(() => {
        ctx.aiKeyInput.value = '';
        ctx.aiKeySuccess.textContent = '저장했습니다.';
        return refreshAiSettings(ctx);
      })
      .catch((error: unknown) => {
        ctx.aiKeyError.textContent = error instanceof Error ? error.message : '저장에 실패했습니다.';
      });
  });

  ctx.container.querySelector<HTMLButtonElement>('#admin-ai-key-clear')!.addEventListener('click', () => {
    ctx.aiKeyError.textContent = '';
    ctx.aiKeySuccess.textContent = '';

    clearOpenAiKey(ctx.token)
      .then(() => {
        ctx.aiKeyInput.value = '';
        ctx.aiKeySuccess.textContent = '삭제했습니다.';
        return refreshAiSettings(ctx);
      })
      .catch((error: unknown) => {
        ctx.aiKeyError.textContent = error instanceof Error ? error.message : '삭제에 실패했습니다.';
      });
  });
}
