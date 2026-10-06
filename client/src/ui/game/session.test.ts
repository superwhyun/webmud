import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from './context';

const effects = vi.hoisted(() => ({ dispatch: vi.fn(), log: vi.fn(), cooldown: vi.fn(), buff: vi.fn() }));
vi.mock('./messages', () => ({ dispatchServerMessage: effects.dispatch }));
vi.mock('./context', () => ({ appendLine: effects.log }));
vi.mock('./state', () => ({ renderCooldownPanel: effects.cooldown, renderBuffPanel: effects.buff }));
import { bindGameSession } from './session';

class Socket extends EventTarget {
  send = vi.fn();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal('document', new EventTarget());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('game connection lifecycle', () => {
  it('uses the current view after a rebuild and removes all effects when disposed', () => {
    const socket = new Socket();
    let ctx = {} as GameContext;
    const dispose = bindGameSession(socket as unknown as WebSocket, 'token', () => ctx);
    socket.dispatchEvent(new Event('open'));
    expect(socket.send).toHaveBeenCalledWith('{"type":"auth","token":"token"}');
    ctx = { token: 'rebuilt' } as GameContext;
    socket.dispatchEvent(new MessageEvent('message', { data: '{"type":"combatEnd"}' }));
    expect(effects.dispatch).toHaveBeenCalledWith(ctx, { type: 'combatEnd' });
    vi.advanceTimersByTime(100);
    expect(effects.cooldown).toHaveBeenCalledOnce();
    dispose();
    dispose();
    socket.dispatchEvent(new Event('close'));
    socket.dispatchEvent(new MessageEvent('message', { data: '{"type":"combatEnd"}' }));
    vi.advanceTimersByTime(500);
    expect(effects.log).not.toHaveBeenCalled();
    expect(effects.dispatch).toHaveBeenCalledOnce();
    expect(effects.cooldown).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('logs malformed JSON without invoking a message handler', () => {
    const socket = new Socket();
    const ctx = {} as GameContext;
    const dispose = bindGameSession(socket as unknown as WebSocket, 'token', () => ctx);
    socket.dispatchEvent(new MessageEvent('message', { data: 'invalid' }));
    expect(effects.log).toHaveBeenCalledWith(ctx, '서버 응답을 처리하지 못했습니다.', 'error');
    expect(effects.dispatch).not.toHaveBeenCalled();
    dispose();
  });
});
