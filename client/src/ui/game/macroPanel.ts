import { MACRO_SLOTS, saveMacro, type MacroSlot } from '../../macros';
import { escapeHtml } from '../../domUtils';
import type { GameContext } from './context';

export function renderMacroModal(ctx: GameContext): void {
  ctx.macroModalBody.innerHTML = `
    <p>숫자키 1~9를 입력창에 치고 <strong>Tab</strong>을 누르면 등록한 문구가 채워집니다.</p>
    ${MACRO_SLOTS.map(
      (slot) => `
        <div class="macro-row">
          <span class="macro-row-key">${slot}</span>
          <input type="text" class="macro-row-input" data-macro-slot="${slot}" value="${escapeHtml(ctx.macros[slot])}" placeholder="예: 마법 파이어볼 " />
        </div>
      `,
    ).join('')}
  `;

  ctx.macroModalBody.querySelectorAll<HTMLInputElement>('.macro-row-input').forEach((input) => {
    input.addEventListener('change', () => {
      const slot = input.dataset.macroSlot as MacroSlot;
      ctx.macros = saveMacro(ctx.macros, slot, input.value);
    });
  });
}

export function openMacroModal(ctx: GameContext): void {
  renderMacroModal(ctx);
  ctx.macroModal.hidden = false;
}

export function closeMacroModal(ctx: GameContext): void {
  ctx.macroModal.hidden = true;
}
