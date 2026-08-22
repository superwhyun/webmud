import { renderEquipTab } from './equipment';
import { renderSkillTab } from './skills';
import { renderStatsTab } from './statsTab';
import type { CharacterSheetTab, GameContext } from './context';

const TAB_LABELS: Record<CharacterSheetTab, string> = {
  equip: '장비',
  stats: '능력치',
  skill: '스킬',
};

const TAB_ORDER: CharacterSheetTab[] = ['equip', 'stats', 'skill'];

function renderTabBar(ctx: GameContext): void {
  ctx.characterSheetTabs.innerHTML = TAB_ORDER.map(
    (tab) =>
      `<button type="button" class="character-sheet-tab${tab === ctx.characterSheetActiveTab ? ' is-active' : ''}" data-sheet-tab="${tab}">${TAB_LABELS[tab]}</button>`,
  ).join('');

  ctx.characterSheetTabs.querySelectorAll<HTMLButtonElement>('[data-sheet-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      selectCharacterSheetTab(ctx, button.dataset.sheetTab as CharacterSheetTab);
    });
  });
}

/** 현재 활성 탭의 내용만 다시 그린다 — 웹소켓 갱신(장비/인벤토리/스킬 변경)이 열려있는 탭에만 반영되게 할 때 쓴다. */
export function renderCharacterSheetBody(ctx: GameContext): void {
  if (ctx.characterSheetActiveTab === 'equip') renderEquipTab(ctx);
  else if (ctx.characterSheetActiveTab === 'stats') renderStatsTab(ctx);
  else renderSkillTab(ctx);
}

export function selectCharacterSheetTab(ctx: GameContext, tab: CharacterSheetTab): void {
  if (tab === 'skill' && ctx.characterSheetActiveTab !== 'skill') ctx.activeSkillElement = null;
  ctx.characterSheetActiveTab = tab;
  renderTabBar(ctx);
  renderCharacterSheetBody(ctx);
}

export function openCharacterSheet(ctx: GameContext, tab: CharacterSheetTab): void {
  ctx.characterSheetModal.hidden = false;
  if (tab === 'skill') ctx.activeSkillElement = null;
  selectCharacterSheetTab(ctx, tab);
}

export function closeCharacterSheet(ctx: GameContext): void {
  ctx.characterSheetModal.hidden = true;
}

export function isCharacterSheetTabOpen(ctx: GameContext, tab: CharacterSheetTab): boolean {
  return !ctx.characterSheetModal.hidden && ctx.characterSheetActiveTab === tab;
}
