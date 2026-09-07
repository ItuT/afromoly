import { afterEach, describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { handler, setStoreForTesting } from '../handlers/rest.js';
import { MemoryStore } from '../memoryStore.js';

function request(
  method: string,
  path: string,
  body?: unknown,
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

const json = (result: unknown): Record<string, unknown> =>
  JSON.parse((result as APIGatewayProxyStructuredResultV2).body ?? '{}') as Record<string, unknown>;
const status = (result: unknown): number =>
  (result as APIGatewayProxyStructuredResultV2).statusCode ?? 0;

afterEach(() => setStoreForTesting(null));

describe('the REST routes', () => {
  it('creates a table and then lets someone join it by code', async () => {
    setStoreForTesting(new MemoryStore());

    const created = await handler(request('POST', '/games', { name: 'Thabo' }));
    expect(status(created)).toBe(201);
    const table = json(created);
    expect(table.playerId).toBe('p1');
    expect(String(table.code)).toHaveLength(6);

    const joined = await handler(request('POST', '/games/join', { code: table.code, name: 'Naledi' }));
    expect(status(joined)).toBe(200);
    expect(json(joined).playerId).toBe('p2');

    const lobby = await handler(request('GET', `/games/${String(table.gameId)}`));
    expect(status(lobby)).toBe(200);
    expect((json(lobby).players as unknown[]).length).toBe(2);
  });

  it('answers 404 for a code nobody is using', async () => {
    setStoreForTesting(new MemoryStore());
    const result = await handler(request('POST', '/games/join', { code: 'ZZZZZZ', name: 'X' }));
    expect(status(result)).toBe(404);
    expect(json(result).error).toBe('UNKNOWN_GAME');
  });

  it('answers 404 for an unknown route and 204 for a preflight', async () => {
    setStoreForTesting(new MemoryStore());
    expect(status(await handler(request('GET', '/nope')))).toBe(404);
    expect(status(await handler(request('OPTIONS', '/games')))).toBe(204);
  });

  it('survives a body that is not JSON', async () => {
    setStoreForTesting(new MemoryStore());
    const bad = request('POST', '/games');
    (bad as { body?: string }).body = 'not json at all';
    const result = await handler(bad);
    // A nameless host still gets a table, with a sensible default name.
    expect(status(result)).toBe(201);
    expect(json(result).name).toBe('Operator 1');
  });
});
