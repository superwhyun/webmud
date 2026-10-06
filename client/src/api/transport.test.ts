import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, authenticatedRequest } from './transport';
import { createBuilderRoom } from './world';
import { removeBuilderRoomItem } from './placements';

const fetchMock = vi.fn<typeof fetch>();
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function reply(body: string, status = 200): void {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(new Response(body || null, { status }));
}

describe('shared API transport', () => {
  it('keeps bearer auth, methods, and JSON payloads for feature endpoints', async () => {
    reply('{"room":{"id":4}}');
    await createBuilderRoom('test-token', '방', '설명', 1, 2, 3);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/builder/rooms');
    const options = fetchMock.mock.calls[0][1]!;
    expect(options.method).toBe('POST');
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer test-token');
    expect(JSON.parse(options.body as string)).toEqual({ name: '방', description: '설명', x: 1, y: 2, zoneId: 3 });
  });

  it('preserves DELETE request bodies and accepts empty 204 responses', async () => {
    reply('', 204);
    await expect(removeBuilderRoomItem('token', 12)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE', body: '{"roomItemId":12}' });
  });

  it('supports Headers instances without dropping supplied headers', async () => {
    reply('{}');
    await apiRequest('/test', { headers: new Headers({ Authorization: 'Bearer supplied', 'Content-Type': 'custom/type' }) });
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('Authorization')).toBe('Bearer supplied');
    expect(headers.get('Content-Type')).toBe('custom/type');
  });

  it('surfaces server validation errors and invalid JSON', async () => {
    reply('{"error":"사용 중입니다."}', 409);
    await expect(authenticatedRequest('token', '/test')).rejects.toThrow('사용 중입니다.');
    reply('<html>proxy error</html>', 502);
    await expect(apiRequest('/test')).rejects.toThrow('502');
    reply('invalid');
    await expect(apiRequest('/test')).rejects.toThrow('서버 응답을 처리하지 못했습니다.');
  });
});
