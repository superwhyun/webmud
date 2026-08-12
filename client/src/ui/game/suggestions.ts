import {
  createSuggestion,
  deleteSuggestion,
  fetchSuggestions,
  updateSuggestion,
  voteSuggestion,
  type SuggestionDto,
} from '../../suggestionApi';
import { escapeHtml } from '../../domUtils';
import type { GameContext } from './context';

let currentPage = 1;
let editingId: number | null = null;

function formatSuggestionDate(iso: string): string {
  return iso.replace('T', ' ').slice(0, 16);
}

function renderSuggestionRow(suggestion: SuggestionDto): string {
  if (editingId === suggestion.id) {
    return `
      <div class="suggestion-row">
        <div class="suggestion-edit-form">
          <input type="text" class="suggestion-edit-title" maxlength="50" value="${escapeHtml(suggestion.title)}" />
          <textarea class="suggestion-edit-content" maxlength="1000" rows="3">${escapeHtml(suggestion.content)}</textarea>
          <div class="suggestion-edit-actions">
            <button type="button" class="suggestion-save-btn" data-suggestion-id="${suggestion.id}">저장</button>
            <button type="button" class="suggestion-cancel-btn">취소</button>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="suggestion-row">
      <div class="suggestion-row-header">
        <span class="suggestion-title">${escapeHtml(suggestion.title)}</span>
        <span class="suggestion-meta">${escapeHtml(suggestion.authorName)} · ${formatSuggestionDate(suggestion.createdAt)}</span>
      </div>
      <p class="suggestion-content">${escapeHtml(suggestion.content)}</p>
      <div class="suggestion-row-footer">
        <div class="suggestion-votes">
          <button
            type="button"
            class="suggestion-vote-btn suggestion-vote-up ${suggestion.myVote === 'up' ? 'active' : ''}"
            data-suggestion-id="${suggestion.id}"
            data-vote="up"
          >👍 ${suggestion.upCount}</button>
          <button
            type="button"
            class="suggestion-vote-btn suggestion-vote-down ${suggestion.myVote === 'down' ? 'active' : ''}"
            data-suggestion-id="${suggestion.id}"
            data-vote="down"
          >👎 ${suggestion.downCount}</button>
        </div>
        ${
          suggestion.isOwner
            ? `<div class="suggestion-owner-actions">
                <button type="button" class="suggestion-edit-btn" data-suggestion-id="${suggestion.id}">수정</button>
                <button type="button" class="suggestion-delete-btn" data-suggestion-id="${suggestion.id}">삭제</button>
              </div>`
            : ''
        }
      </div>
    </div>
  `;
}

export async function renderSuggestionModal(ctx: GameContext): Promise<void> {
  ctx.suggestionModalBody.innerHTML = '<p class="suggestion-empty">불러오는 중...</p>';
  try {
    const { suggestions, total, pageSize } = await fetchSuggestions(ctx.token, currentPage);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const listHtml =
      suggestions.length > 0
        ? suggestions.map(renderSuggestionRow).join('')
        : '<p class="suggestion-empty">아직 등록된 개선 제안이 없습니다.</p>';

    ctx.suggestionModalBody.innerHTML = `
      <div class="suggestion-form">
        <input id="suggestion-title-input" type="text" maxlength="50" placeholder="제목" />
        <textarea id="suggestion-content-input" maxlength="1000" rows="3" placeholder="개선하면 좋을 점을 적어주세요"></textarea>
        <button type="button" id="suggestion-submit-btn">등록</button>
        <p class="suggestion-form-error" id="suggestion-form-error"></p>
      </div>
      <div class="suggestion-list">
        ${listHtml}
      </div>
      <div class="suggestion-pagination">
        <button type="button" id="suggestion-prev-btn" ${currentPage <= 1 ? 'disabled' : ''}>이전</button>
        <span class="suggestion-page-label">${currentPage} / ${totalPages}</span>
        <button type="button" id="suggestion-next-btn" ${currentPage >= totalPages ? 'disabled' : ''}>다음</button>
      </div>
    `;

    const errorEl = ctx.suggestionModalBody.querySelector<HTMLParagraphElement>('#suggestion-form-error')!;
    ctx.suggestionModalBody.querySelector<HTMLButtonElement>('#suggestion-submit-btn')!.addEventListener('click', () => {
      const titleInput = ctx.suggestionModalBody.querySelector<HTMLInputElement>('#suggestion-title-input')!;
      const contentInput = ctx.suggestionModalBody.querySelector<HTMLTextAreaElement>('#suggestion-content-input')!;
      const title = titleInput.value.trim();
      const content = contentInput.value.trim();
      errorEl.textContent = '';
      if (!title || !content) {
        errorEl.textContent = '제목과 내용을 모두 입력하세요.';
        return;
      }
      createSuggestion(ctx.token, title, content)
        .then(() => {
          currentPage = 1;
          return renderSuggestionModal(ctx);
        })
        .catch((error: unknown) => {
          errorEl.textContent = error instanceof Error ? error.message : '등록에 실패했습니다.';
        });
    });

    ctx.suggestionModalBody.querySelectorAll<HTMLButtonElement>('.suggestion-vote-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const id = Number(button.dataset.suggestionId);
        const vote = button.dataset.vote as 'up' | 'down';
        void voteSuggestion(ctx.token, id, vote).then(() => renderSuggestionModal(ctx));
      });
    });

    ctx.suggestionModalBody.querySelectorAll<HTMLButtonElement>('.suggestion-edit-btn').forEach((button) => {
      button.addEventListener('click', () => {
        editingId = Number(button.dataset.suggestionId);
        void renderSuggestionModal(ctx);
      });
    });

    ctx.suggestionModalBody.querySelectorAll<HTMLButtonElement>('.suggestion-cancel-btn').forEach((button) => {
      button.addEventListener('click', () => {
        editingId = null;
        void renderSuggestionModal(ctx);
      });
    });

    ctx.suggestionModalBody.querySelectorAll<HTMLButtonElement>('.suggestion-save-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const id = Number(button.dataset.suggestionId);
        const row = button.closest('.suggestion-row')!;
        const title = row.querySelector<HTMLInputElement>('.suggestion-edit-title')!.value.trim();
        const content = row.querySelector<HTMLTextAreaElement>('.suggestion-edit-content')!.value.trim();
        if (!title || !content) return;
        updateSuggestion(ctx.token, id, title, content).then(() => {
          editingId = null;
          return renderSuggestionModal(ctx);
        });
      });
    });

    ctx.suggestionModalBody.querySelectorAll<HTMLButtonElement>('.suggestion-delete-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const id = Number(button.dataset.suggestionId);
        if (!confirm('이 개선 제안을 삭제할까요?')) return;
        void deleteSuggestion(ctx.token, id).then(() => renderSuggestionModal(ctx));
      });
    });

    ctx.suggestionModalBody.querySelector<HTMLButtonElement>('#suggestion-prev-btn')!.addEventListener('click', () => {
      if (currentPage <= 1) return;
      currentPage -= 1;
      void renderSuggestionModal(ctx);
    });

    ctx.suggestionModalBody.querySelector<HTMLButtonElement>('#suggestion-next-btn')!.addEventListener('click', () => {
      if (currentPage >= totalPages) return;
      currentPage += 1;
      void renderSuggestionModal(ctx);
    });
  } catch (error) {
    ctx.suggestionModalBody.innerHTML = `<p class="suggestion-empty">${escapeHtml(error instanceof Error ? error.message : '불러오지 못했습니다.')}</p>`;
  }
}

export function openSuggestionModal(ctx: GameContext): void {
  currentPage = 1;
  editingId = null;
  ctx.suggestionModal.hidden = false;
  void renderSuggestionModal(ctx);
}

export function closeSuggestionModal(ctx: GameContext): void {
  ctx.suggestionModal.hidden = true;
}
