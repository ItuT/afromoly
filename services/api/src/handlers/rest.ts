/**
 * REST handler behind the HTTP API: creating and joining tables.
 *
 * Auth for v1 is a display name plus a game code, as the brief specifies.
 * There are no accounts, so there is nothing here to leak.
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoStore } from '../dynamoStore.js';
import { createTable, joinTable } from '../lobby.js';
import { lobbyMessage } from '../service.js';
import type { Store } from '../store.js';

const CORS = {
  'access-control-allow-origin': process.env.ALLOWED_ORIGIN ?? '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'content-type': 'application/json',
};

const reply = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: CORS,
  body: JSON.stringify(body),
});

let cached: Store | null = null;
function store(): Store {
  if (!cached) {
    const table = process.env.TABLE_NAME;
    if (!table) throw new Error('TABLE_NAME is not set');
    cached = new DynamoStore(table);
  }
  return cached;
}

/** Injected by the tests so the routing can be exercised without AWS. */
export function setStoreForTesting(injected: Store | null): void {
  cached = injected;
}

function parse(body: string | undefined, isBase64: boolean): Record<string, unknown> {
  if (!body) return {};
  try {
    const text = isBase64 ? Buffer.from(body, 'base64').toString('utf8') : body;
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath.replace(/\/$/, '') || '/';
  if (method === 'OPTIONS') return reply(204, {});

  const body = parse(event.body, event.isBase64Encoded === true);
  const db = store();

  try {
    if (method === 'POST' && path === '/games') {
      const result = await createTable(db, {
        hostName: String(body.name ?? ''),
        jackpot: body.jackpot !== false,
      });
      if (!result.ok) return reply(500, { error: result.code, message: result.message });
      return reply(201, {
        gameId: result.value.game.gameId,
        code: result.value.game.code,
        playerId: result.value.player.playerId,
        name: result.value.player.name,
      });
    }

    if (method === 'POST' && path === '/games/join') {
      const result = await joinTable(db, String(body.code ?? ''), String(body.name ?? ''));
      if (!result.ok) {
        const status = result.code === 'UNKNOWN_GAME' ? 404 : 409;
        return reply(status, { error: result.code, message: result.message });
      }
      return reply(200, {
        gameId: result.value.game.gameId,
        code: result.value.game.code,
        playerId: result.value.player.playerId,
        name: result.value.player.name,
      });
    }

    const match = /^\/games\/([A-Za-z0-9-]+)$/.exec(path);
    if (method === 'GET' && match?.[1]) {
      const lobby = await lobbyMessage(db, match[1]);
      if (!lobby) return reply(404, { error: 'UNKNOWN_GAME', message: 'No such table.' });
      return reply(200, lobby);
    }

    return reply(404, { error: 'NOT_FOUND', message: 'No such route.' });
  } catch (error) {
    console.error('rest handler failed', error);
    return reply(500, { error: 'INTERNAL', message: 'Something went wrong at the rank.' });
  }
}
