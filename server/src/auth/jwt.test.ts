import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from './jwt.js';

describe('jwt', () => {
  it('round-trips a valid token', () => {
    const token = signToken({ accountId: 1, username: 'alice' });
    const payload = verifyToken(token);
    expect(payload).toMatchObject({ accountId: 1, username: 'alice' });
  });

  it('rejects a tampered token', () => {
    const token = signToken({ accountId: 1, username: 'alice' });
    const tampered = `${token}tampered`;
    expect(verifyToken(tampered)).toBeNull();
  });

  it('rejects garbage input', () => {
    expect(verifyToken('not-a-token')).toBeNull();
  });
});
