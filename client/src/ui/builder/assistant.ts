import { applyMapAssistantChanges, proposeMapAssistantChanges, type MapAssistantOperation } from '../../builderApi';
import { escapeHtml } from '../../domUtils';
import { showToolbarError, type BuilderContext } from './context';

function operationLabel(op: MapAssistantOperation): string {
  if (op.type === 'add_room') return `방 추가: "${op.name}" (${op.x}, ${op.y})`;
  if (op.type === 'add_mob_spawn') return `몹 배치: "${op.roomLabel}"에 ${op.mobName} (리스폰 ${op.respawnSeconds}초)`;
  if (op.type === 'add_room_item') return `아이템 배치: "${op.roomLabel}"에 ${op.itemName} x${op.quantity}`;
  return `NPC 배치: "${op.roomLabel}"에 ${op.npcName}`;
}

export function renderAssistantResults(ctx: BuilderContext): void {
  if (ctx.assistantLoading) {
    ctx.assistantResults.innerHTML = `<p class="builder-panel-hint">AI가 제안을 생성하는 중입니다...</p>`;
    return;
  }

  if (ctx.assistantOperations.length === 0) {
    ctx.assistantResults.innerHTML = ctx.assistantSummary
      ? `<p class="builder-panel-hint">${escapeHtml(ctx.assistantSummary)}</p>`
      : '';
    return;
  }

  const items = ctx.assistantOperations
    .map(
      (op, index) => `
        <li class="builder-assistant-item">
          <label>
            <input type="checkbox" data-assistant-index="${index}" ${ctx.assistantSelected[index] ? 'checked' : ''} />
            ${escapeHtml(operationLabel(op))}
          </label>
        </li>
      `,
    )
    .join('');

  ctx.assistantResults.innerHTML = `
    <p class="builder-panel-hint">${escapeHtml(ctx.assistantSummary)}</p>
    <ul class="builder-assistant-list">${items}</ul>
    <div class="builder-form-row">
      <button type="button" id="builder-assistant-apply">선택한 항목 적용</button>
      <button type="button" id="builder-assistant-cancel">취소</button>
    </div>
  `;

  ctx.assistantResults.querySelectorAll<HTMLInputElement>('input[data-assistant-index]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const index = Number(checkbox.dataset.assistantIndex);
      ctx.assistantSelected[index] = checkbox.checked;
    });
  });

  ctx.assistantResults.querySelector<HTMLButtonElement>('#builder-assistant-cancel')!.addEventListener('click', () => {
    ctx.assistantOperations = [];
    ctx.assistantSelected = [];
    ctx.assistantSummary = '';
    renderAssistantResults(ctx);
  });

  const applyButton = ctx.assistantResults.querySelector<HTMLButtonElement>('#builder-assistant-apply')!;
  applyButton.addEventListener('click', () => {
    if (ctx.selectedZoneId === null) {
      showToolbarError(ctx, '존을 먼저 선택하세요.');
      return;
    }

    const selectedOperations = ctx.assistantOperations.filter((_, index) => ctx.assistantSelected[index]);
    if (selectedOperations.length === 0) {
      showToolbarError(ctx, '적용할 항목을 선택하세요.');
      return;
    }

    applyButton.disabled = true;
    applyMapAssistantChanges(ctx.token, ctx.selectedZoneId, selectedOperations)
      .then((result) => {
        const failures = result.results.filter((r) => !r.success);
        ctx.assistantOperations = [];
        ctx.assistantSelected = [];
        ctx.assistantSummary =
          failures.length > 0
            ? `일부 항목이 실패했습니다: ${failures.map((f) => `${operationLabel(f.operation)} (${f.error})`).join(', ')}`
            : `${result.results.length}개 항목을 적용했습니다.`;
        void ctx.refresh();
      })
      .catch((error) => {
        showToolbarError(ctx, error instanceof Error ? error.message : '적용 중 오류가 발생했습니다.');
      })
      .finally(() => {
        applyButton.disabled = false;
      });
  });
}

export function setupAssistant(ctx: BuilderContext): void {
  ctx.assistantProposeButton.addEventListener('click', () => {
    const prompt = ctx.assistantPromptInput.value.trim();
    if (!prompt) {
      showToolbarError(ctx, '프롬프트를 입력하세요.');
      return;
    }
    if (ctx.selectedZoneId === null) {
      showToolbarError(ctx, '존을 먼저 선택하세요.');
      return;
    }

    ctx.assistantLoading = true;
    ctx.assistantOperations = [];
    ctx.assistantSelected = [];
    ctx.assistantSummary = '';
    ctx.assistantProposeButton.disabled = true;
    renderAssistantResults(ctx);

    const zoneId = ctx.selectedZoneId;
    proposeMapAssistantChanges(ctx.token, zoneId, prompt)
      .then((result) => {
        ctx.assistantOperations = result.operations;
        ctx.assistantSelected = result.operations.map(() => true);
        ctx.assistantSummary = result.summary;
      })
      .catch((error) => {
        showToolbarError(ctx, error instanceof Error ? error.message : 'AI 제안 생성에 실패했습니다.');
      })
      .finally(() => {
        ctx.assistantLoading = false;
        ctx.assistantProposeButton.disabled = false;
        renderAssistantResults(ctx);
      });
  });
}
