import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from './app.js';

let server: Server;
let base: string;
let adminToken: string;
let playerToken: string;

async function request(path: string, method = 'GET', body?: unknown, token?: string) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}

beforeAll(async () => {
  server = createServer(createApplication());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test address');
  base = `http://127.0.0.1:${address.port}`;
  adminToken = (await request('/login', 'POST', { username: 'admin', password: process.env.DEFAULT_ADMIN_PASSWORD })).body.token;
  playerToken = (await request('/register', 'POST', { username: 'testplayer', password: process.env.DEFAULT_ADMIN_PASSWORD })).body.token;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe('HTTP feature composition', () => {
  it('retains health and authorization on every protected router', async () => {
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ ok: true });
    for (const path of ['/admin/items', '/builder/zones', '/suggestions']) expect((await request(path)).status).toBe(401);
    for (const path of ['/admin/items', '/builder/zones']) expect((await request(path, 'GET', undefined, playerToken)).status).toBe(403);
  });

  it('retains validation and character creation', async () => {
    expect((await request('/character', 'POST', {}, playerToken)).status).toBe(400);
    const result = await request('/character', 'POST', { name: '테스트용사', job: 'warrior', element: 'wood' }, playerToken);
    expect(result.status).toBe(201);
    expect((await request('/me', 'GET', undefined, playerToken)).body.character).toMatchObject({ name: '테스트용사', job: 'warrior' });
    expect((await request('/character', 'POST', { name: '다른용사', job: 'mage', element: 'fire' }, playerToken)).status).toBe(409);
  });

  it('registers independent apps without duplicating or dropping routes', async () => {
    createApplication();
    expect((await request('/admin/items', 'GET', undefined, adminToken)).body.items.length).toBeGreaterThan(0);
    expect((await request('/admin/mob-templates', 'GET', undefined, adminToken)).body.mobTemplates.length).toBeGreaterThan(0);
    expect((await request('/admin/npc-templates', 'GET', undefined, adminToken)).body.npcTemplates.length).toBeGreaterThan(0);
    expect((await request('/builder/zones', 'GET', undefined, adminToken)).body.zones.length).toBeGreaterThan(0);
    expect((await request('/suggestions', 'GET', undefined, playerToken)).status).toBe(200);
  });

  it('preserves admin item CRUD contracts across the route factory', async () => {
    const content = { name: '검증아이템', description: '설명', type: 'consumable', grade: 'low', healAmount: 5 };
    const created = await request('/admin/items', 'POST', content, adminToken);
    expect(created.status).toBe(201);
    const id = created.body.item.id;
    expect(created.body.item).toMatchObject({ slot: null, healAmount: 5, manaAmount: 0 });
    const updated = await request(`/admin/items/${id}`, 'PATCH', { ...content, healAmount: 9 }, adminToken);
    expect(updated.body.item.healAmount).toBe(9);
    expect((await request(`/admin/items/${id}`, 'DELETE', undefined, adminToken)).status).toBe(204);
    expect((await request(`/admin/items/${id}`, 'DELETE', undefined, adminToken)).status).toBe(404);
  });
});
