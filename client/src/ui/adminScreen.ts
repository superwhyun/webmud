import { ELEMENT_LABELS, ELEMENT_VALUES } from '@mud/shared';
import { refreshAccounts } from './admin/accounts';
import { wireAnnounce } from './admin/announce';
import { wireBackup } from './admin/backup';
import { createAdminContext } from './admin/context';
import { refreshItems, wireItemForm } from './admin/items';
import { refreshMobs, wireMobForm } from './admin/mobs';
import { refreshNpcs, wireNpcForm } from './admin/npcs';
import { refreshRooms, refreshSessions } from './admin/sessions';

export function renderAdminScreen(container: HTMLElement, token: string, onBack: () => void): void {
  const ctx = createAdminContext(container, token, onBack);

  ctx.mobElementSelect.innerHTML = ELEMENT_VALUES.map(
    (value) => `<option value="${value}">${ELEMENT_LABELS[value]}</option>`,
  ).join('');

  wireAnnounce(ctx);
  wireItemForm(ctx);
  wireMobForm(ctx);
  wireNpcForm(ctx);
  wireBackup(ctx);

  ctx.container.querySelector<HTMLButtonElement>('#admin-back')!.addEventListener('click', onBack);

  const adminMainTabButtons = ctx.container.querySelectorAll<HTMLButtonElement>('.admin-main-tab-btn');
  const adminTabPanels = ctx.container.querySelectorAll<HTMLElement>('[data-admin-tab-panel]');

  function selectAdminTab(tab: string): void {
    adminMainTabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.adminTab === tab));
    adminTabPanels.forEach((panel) => {
      panel.hidden = panel.dataset.adminTabPanel !== tab;
    });
  }

  adminMainTabButtons.forEach((btn) => {
    btn.addEventListener('click', () => selectAdminTab(btn.dataset.adminTab!));
  });

  selectAdminTab('accounts');

  void (async () => {
    await refreshRooms(ctx);
    await refreshItems(ctx);
    await Promise.all([refreshAccounts(ctx), refreshSessions(ctx), refreshMobs(ctx), refreshNpcs(ctx)]);
  })().catch((error: unknown) => {
    ctx.accountsError.textContent = error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.';
  });
}
