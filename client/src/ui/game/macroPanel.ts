import { MACRO_SLOTS, saveMacro, type MacroSlot } from '../../macros';
import { escapeHtml } from '../../domUtils';
import type { GameContext } from './context';

export function renderMacroModal(ctx: GameContext): void {
  ctx.macroModalBody.innerHTML = `
    <p>숫자키 1~9를 입력창에 치고 <strong>Tab</strong>을 누르면 등록한 문구가 채워집니다.</p>
    <p>";"로 여러 명령을 이어붙이면 순서대로 실행됩니다. 사이에 "wait 초"를 넣으면 그만큼
      쉬었다 다음 명령이 나갑니다 — 예: <code>파이어볼;wait 2;치유</code></p>
    ${MACRO_SLOTS.map(
      (slot) => `
        <div class="macro-row">
          <span class="macro-row-key">${slot}</span>
          <input type="text" class="macro-row-input" data-macro-slot="${slot}" value="${escapeHtml(ctx.macros[slot])}" placeholder="예: 마법 파이어볼;wait 2;마법 치유" />
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
