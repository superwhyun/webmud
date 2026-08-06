import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password', () => {
  it('verifies a matching password against its hash', async () => {
    const hash = await hashPassword('correct-horse');
    await expect(verifyPassword('correct-horse', hash)).resolves.toBe(true);
  });

  it('rejects a non-matching password', async () => {
    const hash = await hashPassword('correct-horse');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('produces a different hash each time (salted)', async () => {
    const hash1 = await hashPassword('same-input');
    const hash2 = await hashPassword('same-input');
    expect(hash1).not.toBe(hash2);
  });
});
