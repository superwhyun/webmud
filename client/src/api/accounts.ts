import type { AccountDto } from '@mud/shared';
import { authenticatedRequest } from './transport';

export function fetchAccounts(token: string): Promise<{ accounts: AccountDto[] }> {
  return authenticatedRequest(token, '/admin/accounts');
}

export function updateAccount(
  token: string,
  id: number,
  patch: { isBuilder?: boolean; isAdmin?: boolean },
): Promise<{ account: AccountDto }> {
  return authenticatedRequest(token, `/admin/accounts/${id}`, 'PATCH', patch);
}

export function grantGold(token: string, accountId: number, amount: number): Promise<{ gold: number }> {
  return authenticatedRequest(token, `/admin/accounts/${accountId}/grant-gold`, 'POST', { amount });
}

export function placeAccount(
  token: string,
  accountId: number,
  targetRoomId: number,
): Promise<{ roomId: number; roomName: string }> {
  return authenticatedRequest(token, `/admin/accounts/${accountId}/place`, 'POST', { targetRoomId });
}
