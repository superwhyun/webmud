import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from './context';
vi.mock('./context', () => ({ appendLine: vi.fn() }));
import { disposeCommandBar, sendCommand } from './commandBar';

function context() {
  vi.stubGlobal('WebSocket', { OPEN: 1 });
  vi.stubGlobal('document', new EventTarget());
  return {
    socket: { readyState: 1, send: vi.fn() },
    commandInput: { value: '' },
    commandHistory: [],
  } as unknown as GameContext;
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('command chain lifecycle', () => {
  it('executes commands in order across wait directives', () => {
    vi.useFakeTimers();
    const ctx = context();
    sendCommand(ctx, 'say 첫째;wait 1;say 둘째');
    expect(ctx.socket.send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(ctx.socket.send).toHaveBeenLastCalledWith('{"type":"command","text":"say 둘째"}');
  });

  it('cancels delayed commands at logout so they cannot affect another login', () => {
    vi.useFakeTimers();
    const ctx = context();
    sendCommand(ctx, 'say 첫째;wait 1;say 둘째');
    disposeCommandBar(ctx.socket);
    vi.advanceTimersByTime(1000);
    expect(ctx.socket.send).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
