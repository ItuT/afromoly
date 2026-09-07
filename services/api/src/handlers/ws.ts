/**
 * WebSocket handlers behind the API Gateway WebSocket API.
 *
 * $connect associates the socket with a seat, $default carries every intent,
 * and $disconnect frees the seat's connection.
 */

import type { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ApiGatewayBroadcaster, type Broadcaster } from '../broadcast.js';
import { DynamoStore } from '../dynamoStore.js';
import { PROTOCOL_VERSION, type ClientMessage } from '@afromoly/protocol';
import { handleClientMessage, handleDisconnect, pushTable } from '../service.js';
import type { Store } from '../store.js';

let cachedStore: Store | null = null;
let cachedBroadcaster: Broadcaster | null = null;

function store(): Store {
  if (!cachedStore) {
    const table = process.env.TABLE_NAME;
    if (!table) throw new Error('TABLE_NAME is not set');
    cachedStore = new DynamoStore(table);
  }
  return cachedStore;
}

function broadcaster(event: APIGatewayProxyWebsocketEventV2): Broadcaster {
  if (!cachedBroadcaster) {
    const ctx = event.requestContext;
    const endpoint = process.env.WS_ENDPOINT ?? `https://${ctx.domainName}/${ctx.stage}`;
    cachedBroadcaster = new ApiGatewayBroadcaster(endpoint);
  }
  return cachedBroadcaster;
}

export function setDependenciesForTesting(s: Store | null, b: Broadcaster | null): void {
  cachedStore = s;
  cachedBroadcaster = b;
}

const okResult: APIGatewayProxyResultV2 = { statusCode: 200, body: '' };

interface ConnectEvent extends APIGatewayProxyWebsocketEventV2 {
  queryStringParameters?: Record<string, string | undefined>;
}

export async function connect(event: ConnectEvent): Promise<APIGatewayProxyResultV2> {
  const gameId = event.queryStringParameters?.gameId;
  const playerId = event.queryStringParameters?.playerId;
  const connectionId = event.requestContext.connectionId;
  if (!gameId || !playerId) {
    return { statusCode: 400, body: 'gameId and playerId are required' };
  }
  try {
    const db = store();
    const seats = await db.listPlayers(gameId);
    if (!seats.some((s) => s.playerId === playerId)) {
      return { statusCode: 403, body: 'not seated at this table' };
    }
    await db.putConnection({ connectionId, gameId, playerId });
    await db.setConnection(gameId, playerId, connectionId);
    await pushTable(db, broadcaster(event), gameId);
    return okResult;
  } catch (error) {
    console.error('connect failed', error);
    return { statusCode: 500, body: 'connect failed' };
  }
}

export async function disconnect(
  event: APIGatewayProxyWebsocketEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    await handleDisconnect(store(), broadcaster(event), event.requestContext.connectionId);
  } catch (error) {
    console.error('disconnect failed', error);
  }
  return okResult;
}

export async function message(
  event: APIGatewayProxyWebsocketEventV2,
): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;
  const bus = broadcaster(event);
  let parsed: ClientMessage;
  try {
    parsed = JSON.parse(event.body ?? '{}') as ClientMessage;
  } catch {
    await bus.send(connectionId, {
      v: PROTOCOL_VERSION,
      type: 'error',
      code: 'BAD_MESSAGE',
      message: 'That was not valid JSON.',
    });
    return okResult;
  }

  try {
    const reply = await handleClientMessage(store(), bus, connectionId, parsed);
    if (reply) await bus.send(connectionId, reply);
  } catch (error) {
    console.error('message handler failed', error);
    await bus.send(connectionId, {
      v: PROTOCOL_VERSION,
      type: 'error',
      code: 'INTERNAL',
      message: 'Something went wrong at the rank.',
    });
  }
  return okResult;
}
