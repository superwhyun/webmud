import { describe, expect, it } from 'vitest';
import { clientMessageSchema } from './schema.js';

describe('WebSocket protocol boundary', () => {
  it.each([null, [], { type: 'constructor' }, { type: 'auth' }, { type: 'command', text: 42 },
    { type: 'allocateStat', statKey: 'hp', amount: 1 }, { type: 'useItem', inventoryId: -1 },
    { type: 'reorderInventory', inventoryIds: '1,2' }, { type: 'chooseJob', job: 'unknown' },
  ])('rejects malformed payload %j before game code runs', (payload) => {
    expect(clientMessageSchema.safeParse(payload).success).toBe(false);
  });

  it('retains valid inventory and stat messages', () => {
    const payloads = [{ type: 'reorderInventory', inventoryIds: [3, 1, 2] }, { type: 'allocateStat', statKey: 'vit', amount: 3 }];
    for (const payload of payloads) expect(clientMessageSchema.parse(payload)).toEqual(payload);
  });
});
