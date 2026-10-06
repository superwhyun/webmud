import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { ServerMessage } from '@mud/shared';
import { createRuntime } from './runtime.js';
import { getAllSessions } from './game/sessionRegistry.js';

let runtime: ReturnType<typeof createRuntime>;
let base: string;
let socket: WebSocket;
let token: string;

function receive(predicate: (message: ServerMessage) => boolean, action: () => void): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', listener);
      reject(new Error('Timed out waiting for a WebSocket response'));
    }, 2000);
    function listener(raw: WebSocket.RawData): void {
      const message = JSON.parse(raw.toString()) as ServerMessage;
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off('message', listener);
      resolve(message);
    }
    socket.on('message', listener);
    action();
  });
}

beforeAll(async () => {
  runtime = createRuntime();
  await new Promise<void>((resolve) => runtime.httpServer.listen(0, '127.0.0.1', resolve));
  const address = runtime.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Missing address');
  base = `http://127.0.0.1:${address.port}`;
  token = (await (await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: process.env.DEFAULT_ADMIN_PASSWORD }),
  })).json()).token;
  await fetch(`${base}/api/character`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: '런타임용사', element: 'wood', job: 'warrior' }),
  });
  socket = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
});
afterAll(async () => { socket?.terminate(); await runtime?.close(); });

describe('runtime protocol and shutdown', () => {
  it('rejects malformed and unauthenticated messages without closing the connection', async () => {
    for (const payload of [null, { type: 'allocateStat', statKey: 'wrong', amount: 1 }]) {
      expect(await receive((message) => message.type === 'error', () => socket.send(JSON.stringify(payload)))).toMatchObject({ text: '잘못된 메시지 형식입니다.' });
    }
    expect(await receive((message) => message.type === 'error', () => socket.send('{"type":"command","text":"look"}'))).toMatchObject({ text: '인증이 필요합니다.' });
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });

  it('authenticates and preserves an established session on repeated auth', async () => {
    expect(await receive((message) => message.type === 'state', () => socket.send(JSON.stringify({ type: 'auth', token })))).toMatchObject({ character: { name: '런타임용사' } });
    expect(getAllSessions()).toHaveLength(1);
    expect(await receive((message) => message.type === 'error', () => socket.send(JSON.stringify({ type: 'auth', token })))).toMatchObject({ text: '이미 인증된 연결입니다.' });
    expect(await receive((message) => message.type === 'text' && message.text.includes('확인메시지'), () => socket.send('{"type":"command","text":"say 확인메시지"}'))).toMatchObject({ channel: 'say' });
  });

  it('closes active connections and clears sessions with an idempotent shutdown', async () => {
    const closing = runtime.close();
    expect(runtime.close()).toBe(closing);
    await closing;
    expect(runtime.httpServer.listening).toBe(false);
    expect(runtime.wss.clients.size).toBe(0);
    expect(getAllSessions()).toHaveLength(0);
  });
});
