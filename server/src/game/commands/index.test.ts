import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandContext } from './context.js';

const combatHandlers = vi.hoisted(() => ({
  handleAttack: vi.fn(),
  handleCast: vi.fn(),
  handleFlee: vi.fn(),
}));

vi.mock('./combat.js', () => combatHandlers);

import { dispatchCommand } from './index.js';

describe('combat command aliases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('dispatches 도망 to the same handler as flee', () => {
    const ctx = { send: vi.fn() } as unknown as CommandContext;

    dispatchCommand(ctx, '도망');

    expect(combatHandlers.handleFlee).toHaveBeenCalledOnce();
    expect(combatHandlers.handleFlee).toHaveBeenCalledWith(ctx);
  });
});
