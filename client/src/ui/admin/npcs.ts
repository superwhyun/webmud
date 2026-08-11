import { NPC_DEAL_TYPE_LABELS, NPC_TYPE_LABELS, type NpcDealType, type NpcType } from '@mud/shared';
import { createNpcTemplate, deleteNpcTemplate, fetchNpcTemplates, updateNpcTemplate, type NpcTemplateDto } from '../../adminApi';
import { escapeHtml } from '../../domUtils';
import type { AdminContext } from './context';

function fillNpcForm(ctx: AdminContext, npc: NpcTemplateDto): void {
  ctx.container.querySelector<HTMLInputElement>('#admin-npc-name')!.value = npc.name;
  ctx.container.querySelector<HTMLInputElement>('#admin-npc-desc')!.value = npc.description;
  ctx.container.querySelector<HTMLSelectElement>('#admin-npc-type')!.value = npc.type;
  ctx.container.querySelector<HTMLSelectElement>('#admin-npc-deal-type')!.value = npc.dealType;
}

function resetNpcForm(ctx: AdminContext): void {
  ctx.editingNpcId = null;
  ctx.npcCreateBtn.textContent = 'NPC 생성';
  ctx.npcCancelBtn.hidden = true;
  ctx.npcError.textContent = '';
  ctx.container.querySelector<HTMLInputElement>('#admin-npc-name')!.value = '';
  ctx.container.querySelector<HTMLInputElement>('#admin-npc-desc')!.value = '';
}

export async function refreshNpcs(ctx: AdminContext): Promise<void> {
  const { npcTemplates: fetched } = await fetchNpcTemplates(ctx.token);
  ctx.npcTemplates = fetched;

  ctx.npcTemplatesList.innerHTML =
    ctx.npcTemplates
      .map(
        (npc) => `
          <li>
            <span>${escapeHtml(npc.name)} (${NPC_TYPE_LABELS[npc.type]}, ${NPC_DEAL_TYPE_LABELS[npc.dealType]})</span>
            <span class="admin-row-actions">
              <button type="button" class="admin-edit-btn" data-npc-id="${npc.id}">수정</button>
              <button type="button" class="admin-delete-btn" data-npc-id="${npc.id}">삭제</button>
            </span>
          </li>
        `,
      )
      .join('') || '<li class="admin-panel-empty">없음</li>';

  ctx.npcTemplatesList.querySelectorAll<HTMLButtonElement>('.admin-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const npc = ctx.npcTemplates.find((entry) => entry.id === Number(btn.dataset.npcId));
      if (!npc) return;
      ctx.editingNpcId = npc.id;
      fillNpcForm(ctx, npc);
      ctx.npcCreateBtn.textContent = '저장';
      ctx.npcCancelBtn.hidden = false;
      ctx.npcError.textContent = '';
    });
  });

  ctx.npcTemplatesList.querySelectorAll<HTMLButtonElement>('.admin-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const npc = ctx.npcTemplates.find((entry) => entry.id === Number(btn.dataset.npcId));
      if (!npc) return;
      if (!confirm(`"${npc.name}" NPC를 삭제할까요?`)) return;
      deleteNpcTemplate(ctx.token, npc.id)
        .then(() => {
          if (ctx.editingNpcId === npc.id) resetNpcForm(ctx);
          return refreshNpcs(ctx);
        })
        .catch((error: unknown) => {
          ctx.npcError.textContent = error instanceof Error ? error.message : 'NPC 삭제에 실패했습니다.';
        });
    });
  });
}

export function wireNpcForm(ctx: AdminContext): void {
  ctx.npcCreateBtn.addEventListener('click', () => {
    const name = ctx.container.querySelector<HTMLInputElement>('#admin-npc-name')!.value.trim();
    const description = ctx.container.querySelector<HTMLInputElement>('#admin-npc-desc')!.value.trim();
    ctx.npcError.textContent = '';
    if (!name || !description) {
      ctx.npcError.textContent = '이름과 설명을 입력하세요.';
      return;
    }
    const data = {
      name,
      description,
      type: ctx.container.querySelector<HTMLSelectElement>('#admin-npc-type')!.value as NpcType,
      dealType: ctx.container.querySelector<HTMLSelectElement>('#admin-npc-deal-type')!.value as NpcDealType,
    };
    const request = ctx.editingNpcId ? updateNpcTemplate(ctx.token, ctx.editingNpcId, data) : createNpcTemplate(ctx.token, data);
    request
      .then(() => {
        resetNpcForm(ctx);
        return refreshNpcs(ctx);
      })
      .catch((error: unknown) => {
        ctx.npcError.textContent = error instanceof Error ? error.message : 'NPC 저장에 실패했습니다.';
      });
  });

  ctx.npcCancelBtn.addEventListener('click', () => resetNpcForm(ctx));
}
