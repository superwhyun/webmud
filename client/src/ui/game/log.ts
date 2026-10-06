import { ITEM_MENTION_PATTERN } from '@mud/shared';
import type { GameContext } from './types';

function appendItemMentions(target: HTMLElement, text: string): void {
  ITEM_MENTION_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ITEM_MENTION_PATTERN.exec(text))) {
    if (match.index > lastIndex) {
      target.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const [, grade, name] = match;
    const span = document.createElement('span');
    span.className = `item-grade-${grade}`;
    span.textContent = name;
    target.appendChild(span);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    target.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

const MAX_LOG_LINES = 500;
export const persistedLog: { text: string; channel?: string }[] = [];

export function renderLine(terminal: HTMLDivElement, text: string, channel?: string): void {
  const line = document.createElement('div');
  line.className = `line line-${channel ?? 'system'}`;
  appendItemMentions(line, text);
  terminal.prepend(line);
  while (terminal.children.length > MAX_LOG_LINES) terminal.lastElementChild?.remove();
  terminal.scrollTop = 0;
}

export function appendLine(ctx: GameContext, text: string, channel?: string): void {
  persistedLog.push({ text, channel });
  if (persistedLog.length > MAX_LOG_LINES) persistedLog.shift();
  renderLine(ctx.terminal, text, channel);
}

export function clearGameLog(): void {
  persistedLog.length = 0;
}
