import type { ServerMessage } from '@mud/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { addSession, removeSession, type Session } from '../sessionRegistry.js';
import { handleSay, handleShout, handleWho } from './chat.js';
import type { CommandContext } from './context.js';

interface FakeSession {
  session: Session;
  sent: ServerMessage[];
}

function createFakeSession(characterName: string, roomId: number, characterId: number): FakeSession {
  const sent: ServerMessage[] = [];
  const ws = {
    send: (data: string) => sent.push(JSON.parse(data) as ServerMessage),
  } as unknown as Session['ws'];

  const session: Session = { ws, accountId: characterId, characterId, characterName, roomId };
  addSession(session);
  return { session, sent };
}

function textsOf(sent: ServerMessage[]): string[] {
  return sent.filter((m): m is Extract<ServerMessage, { type: 'text' }> => m.type === 'text').map((m) => m.text);
}

describe('chat commands', () => {
  let fakeSessions: FakeSession[] = [];

  afterEach(() => {
    for (const fake of fakeSessions) removeSession(fake.session.ws);
    fakeSessions = [];
  });

  it('say only reaches sessions in the same room', () => {
    const alice = createFakeSession('Alice', 1, 1);
    const bob = createFakeSession('Bob', 1, 2);
    const carol = createFakeSession('Carol', 2, 3);
    fakeSessions = [alice, bob, carol];

    const ctx: CommandContext = { session: alice.session, send: (m) => alice.sent.push(m) };
    handleSay(ctx, 'hello');

    expect(textsOf(alice.sent)).toContain('당신이 말했습니다: "hello"');
    expect(textsOf(bob.sent)).toContain('Alice님이 말했습니다: "hello"');
    expect(carol.sent).toHaveLength(0);
  });

  it('say with empty message sends an error and does not broadcast', () => {
    const alice = createFakeSession('Alice', 1, 1);
    const bob = createFakeSession('Bob', 1, 2);
    fakeSessions = [alice, bob];

    const ctx: CommandContext = { session: alice.session, send: (m) => alice.sent.push(m) };
    handleSay(ctx, '   ');

    expect(alice.sent).toEqual([{ type: 'error', text: '무엇을 말하시겠습니까? 사용법: say <메시지>' }]);
    expect(bob.sent).toHaveLength(0);
  });

  it('shout reaches everyone regardless of room, except the sender', () => {
    const alice = createFakeSession('Alice', 1, 1);
    const bob = createFakeSession('Bob', 1, 2);
    const carol = createFakeSession('Carol', 2, 3);
    fakeSessions = [alice, bob, carol];

    const ctx: CommandContext = { session: alice.session, send: (m) => alice.sent.push(m) };
    handleShout(ctx, 'hi everyone');

    expect(textsOf(alice.sent)).toContain('당신이 외쳤습니다: "hi everyone"');
    expect(textsOf(bob.sent)).toContain('Alice님이 외쳤습니다: "hi everyone"');
    expect(textsOf(carol.sent)).toContain('Alice님이 외쳤습니다: "hi everyone"');
  });

  it('who lists every connected character name', () => {
    const alice = createFakeSession('Alice', 1, 1);
    const bob = createFakeSession('Bob', 2, 2);
    fakeSessions = [alice, bob];

    const ctx: CommandContext = { session: alice.session, send: (m) => alice.sent.push(m) };
    handleWho(ctx);

    const [message] = alice.sent;
    expect(message.type).toBe('text');
    expect((message as Extract<ServerMessage, { type: 'text' }>).text).toContain('Alice');
    expect((message as Extract<ServerMessage, { type: 'text' }>).text).toContain('Bob');
  });
});
