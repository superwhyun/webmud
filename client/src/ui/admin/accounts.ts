import { fetchAccounts, grantGold, placeAccount, updateAccount } from '../../adminApi';
import { escapeHtml } from '../../domUtils';
import type { AdminContext } from './context';
import { roomOptionsHtml } from './sessions';

export async function refreshAccounts(ctx: AdminContext): Promise<void> {
  const { accounts } = await fetchAccounts(ctx.token);
  ctx.accountsBody.innerHTML = accounts
    .map(
      (account) => `
        <tr>
          <td>${escapeHtml(account.username)}</td>
          <td><input type="checkbox" class="admin-role-toggle" data-account-id="${account.id}" data-field="isBuilder" ${account.isBuilder ? 'checked' : ''} /></td>
          <td><input type="checkbox" class="admin-role-toggle" data-account-id="${account.id}" data-field="isAdmin" ${account.isAdmin ? 'checked' : ''} /></td>
          <td>${account.gold !== null ? account.gold : '-'}</td>
          <td>
            ${
              account.roomId !== null
                ? `
                  <span class="admin-row-actions">
                    <span class="admin-current-room">${escapeHtml(account.roomName ?? '-')}</span>
                    <select class="admin-place-target" data-account-id="${account.id}">${roomOptionsHtml(ctx, account.roomId)}</select>
                    <button type="button" class="admin-place-btn" data-account-id="${account.id}">이동</button>
                  </span>
                `
                : '<span class="admin-panel-empty">캐릭터 없음</span>'
            }
          </td>
          <td>
            ${
              account.gold !== null
                ? `
                  <span class="admin-row-actions">
                    <input type="number" class="admin-gold-amount" data-account-id="${account.id}" placeholder="지급량" min="1" value="100" />
                    <button type="button" class="admin-grant-gold-btn" data-account-id="${account.id}">지급</button>
                  </span>
                `
                : '<span class="admin-panel-empty">캐릭터 없음</span>'
            }
          </td>
        </tr>
      `,
    )
    .join('');

  ctx.accountsBody.querySelectorAll<HTMLInputElement>('.admin-role-toggle').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const accountId = Number(checkbox.dataset.accountId);
      const field = checkbox.dataset.field as 'isBuilder' | 'isAdmin';
      updateAccount(ctx.token, accountId, { [field]: checkbox.checked }).catch((error: unknown) => {
        ctx.accountsError.textContent = error instanceof Error ? error.message : '권한 변경에 실패했습니다.';
        checkbox.checked = !checkbox.checked;
      });
    });
  });

  ctx.accountsBody.querySelectorAll<HTMLButtonElement>('.admin-place-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const accountId = Number(button.dataset.accountId);
      const select = ctx.accountsBody.querySelector<HTMLSelectElement>(`.admin-place-target[data-account-id="${accountId}"]`)!;
      const targetRoomId = Number(select.value);
      ctx.accountsError.textContent = '';
      placeAccount(ctx.token, accountId, targetRoomId)
        .then(() => refreshAccounts(ctx))
        .catch((error: unknown) => {
          ctx.accountsError.textContent = error instanceof Error ? error.message : '위치 이동에 실패했습니다.';
        });
    });
  });

  ctx.accountsBody.querySelectorAll<HTMLButtonElement>('.admin-grant-gold-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const accountId = Number(button.dataset.accountId);
      const amountInput = ctx.accountsBody.querySelector<HTMLInputElement>(`.admin-gold-amount[data-account-id="${accountId}"]`)!;
      const amount = Number(amountInput.value);
      ctx.accountsError.textContent = '';
      if (!Number.isInteger(amount) || amount < 1) {
        ctx.accountsError.textContent = '지급할 골드는 1 이상의 정수여야 합니다.';
        return;
      }
      grantGold(ctx.token, accountId, amount)
        .then(() => refreshAccounts(ctx))
        .catch((error: unknown) => {
          ctx.accountsError.textContent = error instanceof Error ? error.message : '골드 지급에 실패했습니다.';
        });
    });
  });
}
