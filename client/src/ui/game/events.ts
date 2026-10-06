import { attachCommandBarListeners } from './commandBar';
import { closeCharacterSheet, openCharacterSheet } from './characterSheet';
import type { GameContext } from './context';
import { closeMacroModal, openMacroModal } from './macroPanel';
import { closeSuggestionModal, openSuggestionModal } from './suggestions';

export interface GameNavigation {
  openBuilder(): void;
  openAdmin(): void;
  logout(): void;
}

export function attachGameScreenListeners(ctx: GameContext, navigation: GameNavigation): void {
  const { container } = ctx;
  attachCommandBarListeners(ctx);

  const builderEntryButton = container.querySelector<HTMLButtonElement>('#builder-entry');
  builderEntryButton?.addEventListener('click', () => {
    navigation.openBuilder();
  });

  const adminEntryButton = container.querySelector<HTMLButtonElement>('#admin-entry');
  adminEntryButton?.addEventListener('click', () => {
    navigation.openAdmin();
  });

  const logoutButton = container.querySelector<HTMLButtonElement>('#logout-button')!;
  logoutButton.addEventListener('click', () => {
    navigation.logout();
  });

  const equipSwapButton = container.querySelector<HTMLButtonElement>('#equip-swap-button')!;
  equipSwapButton.addEventListener('click', () => openCharacterSheet(ctx, 'equip'));

  const skillButton = container.querySelector<HTMLButtonElement>('#skill-button')!;
  skillButton.addEventListener('click', () => openCharacterSheet(ctx, 'skill'));

  const inventoryButton = container.querySelector<HTMLButtonElement>('#inventory-button')!;
  inventoryButton.addEventListener('click', () => openCharacterSheet(ctx, 'equip'));

  const characterSheetCloseButton = container.querySelector<HTMLButtonElement>('#character-sheet-close')!;
  characterSheetCloseButton.addEventListener('click', () => closeCharacterSheet(ctx));

  ctx.characterSheetModal.addEventListener('click', (event) => {
    if (event.target === ctx.characterSheetModal) closeCharacterSheet(ctx);
  });

  const macroButton = container.querySelector<HTMLButtonElement>('#macro-button')!;
  macroButton.addEventListener('click', () => openMacroModal(ctx));

  const macroModalCloseButton = container.querySelector<HTMLButtonElement>('#macro-modal-close')!;
  macroModalCloseButton.addEventListener('click', () => closeMacroModal(ctx));

  ctx.macroModal.addEventListener('click', (event) => {
    if (event.target === ctx.macroModal) closeMacroModal(ctx);
  });

  const suggestionButton = container.querySelector<HTMLButtonElement>('#suggestion-button')!;
  suggestionButton.addEventListener('click', () => openSuggestionModal(ctx));

  const suggestionModalCloseButton = container.querySelector<HTMLButtonElement>('#suggestion-modal-close')!;
  suggestionModalCloseButton.addEventListener('click', () => closeSuggestionModal(ctx));

  ctx.suggestionModal.addEventListener('click', (event) => {
    if (event.target === ctx.suggestionModal) closeSuggestionModal(ctx);
  });

}
