/** Pushing server messages back down open WebSocket connections. */

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import type { ServerMessage } from '@afromoly/protocol';
import type { Store } from './store.js';

export interface Broadcaster {
  /** Returns false when the connection is gone, so the caller can tidy up. */
  send(connectionId: string, message: ServerMessage): Promise<boolean>;
}

export class ApiGatewayBroadcaster implements Broadcaster {
  private readonly client: ApiGatewayManagementApiClient;

  constructor(endpoint: string) {
    this.client = new ApiGatewayManagementApiClient({ endpoint });
  }

  async send(connectionId: string, message: ServerMessage): Promise<boolean> {
    try {
      await this.client.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: Buffer.from(JSON.stringify(message)),
        }),
      );
      return true;
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'GoneException' || name === 'ForbiddenException') return false;
      throw error;
    }
  }
}

/** Collects messages instead of sending them. Used by the tests. */
export class MemoryBroadcaster implements Broadcaster {
  readonly sent: { connectionId: string; message: ServerMessage }[] = [];
  readonly dead = new Set<string>();

  async send(connectionId: string, message: ServerMessage): Promise<boolean> {
    if (this.dead.has(connectionId)) return false;
    this.sent.push({ connectionId, message });
    return true;
  }

  messagesFor(connectionId: string): ServerMessage[] {
    return this.sent.filter((s) => s.connectionId === connectionId).map((s) => s.message);
  }

  clear(): void {
    this.sent.length = 0;
  }
}

/**
 * Send one message to every seated player who is currently connected,
 * dropping the connection record for anyone who has since gone away.
 */
export async function broadcast(
  store: Store,
  broadcaster: Broadcaster,
  gameId: string,
  build: (playerId: string) => ServerMessage,
): Promise<void> {
  const seats = await store.listPlayers(gameId);
  await Promise.all(
    seats.map(async (seat) => {
      if (!seat.connectionId) return;
      const alive = await broadcaster.send(seat.connectionId, build(seat.playerId));
      if (!alive) {
        await store.setConnection(gameId, seat.playerId, null);
        await store.deleteConnection(seat.connectionId);
      }
    }),
  );
}
