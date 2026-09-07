/**
 * A local game server for development.
 *
 * It speaks exactly the same REST and WebSocket protocol as the deployed
 * Lambdas and runs the same service module, but keeps everything in memory. It
 * exists so multiplayer can be built and played without an AWS account.
 *
 *   pnpm --filter @afromoly/api dev
 *
 * Nothing here is deployed. The Lambda handlers are the production path.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { MemoryStore } from './memoryStore.js';
import { createTable, joinTable } from './lobby.js';
import { handleClientMessage, handleDisconnect, lobbyMessage, pushTable } from './service.js';
import type { Broadcaster } from './broadcast.js';
import type { ClientMessage, ServerMessage } from '@afromoly/protocol';

const PORT = Number.parseInt(process.env.PORT ?? '4000', 10);
const store = new MemoryStore();
const sockets = new Map<string, WebSocket>();

const bus: Broadcaster = {
  async send(connectionId, message: ServerMessage) {
    const socket = sockets.get(connectionId);
    if (!socket || socket.readyState !== socket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  },
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'content-type': 'application/json',
};

const send = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, CORS);
  res.end(JSON.stringify(body));
};

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const path = url.pathname.replace(/\/$/, '') || '/';

    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return;
    }

    if (req.method === 'POST' && path === '/games') {
      const body = await readBody(req);
      const result = await createTable(store, {
        hostName: String(body.name ?? ''),
        jackpot: body.jackpot !== false,
      });
      if (!result.ok) return send(res, 500, { error: result.code, message: result.message });
      return send(res, 201, {
        gameId: result.value.game.gameId,
        code: result.value.game.code,
        playerId: result.value.player.playerId,
        name: result.value.player.name,
      });
    }

    if (req.method === 'POST' && path === '/games/join') {
      const body = await readBody(req);
      const result = await joinTable(store, String(body.code ?? ''), String(body.name ?? ''));
      if (!result.ok) {
        return send(res, result.code === 'UNKNOWN_GAME' ? 404 : 409, {
          error: result.code,
          message: result.message,
        });
      }
      return send(res, 200, {
        gameId: result.value.game.gameId,
        code: result.value.game.code,
        playerId: result.value.player.playerId,
        name: result.value.player.name,
      });
    }

    const match = /^\/games\/([A-Za-z0-9-]+)$/.exec(path);
    if (req.method === 'GET' && match?.[1]) {
      const lobby = await lobbyMessage(store, match[1]);
      if (!lobby) return send(res, 404, { error: 'UNKNOWN_GAME', message: 'No such table.' });
      return send(res, 200, lobby);
    }

    if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true });
    return send(res, 404, { error: 'NOT_FOUND', message: 'No such route.' });
  })();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (socket, req) => {
  void (async () => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const gameId = url.searchParams.get('gameId');
    const playerId = url.searchParams.get('playerId');
    const connectionId = randomUUID();
    sockets.set(connectionId, socket);

    if (gameId && playerId) {
      const seats = await store.listPlayers(gameId);
      if (!seats.some((s) => s.playerId === playerId)) {
        socket.close(4003, 'not seated at this table');
        sockets.delete(connectionId);
        return;
      }
      await store.putConnection({ connectionId, gameId, playerId });
      await store.setConnection(gameId, playerId, connectionId);
      await pushTable(store, bus, gameId);
    }

    socket.on('message', (raw) => {
      void (async () => {
        let parsed: ClientMessage;
        try {
          parsed = JSON.parse(String(raw)) as ClientMessage;
        } catch {
          socket.send(JSON.stringify({ v: 1, type: 'error', code: 'BAD_MESSAGE', message: 'Not valid JSON.' }));
          return;
        }
        const reply = await handleClientMessage(store, bus, connectionId, parsed);
        if (reply) socket.send(JSON.stringify(reply));
      })();
    });

    socket.on('close', () => {
      sockets.delete(connectionId);
      void handleDisconnect(store, bus, connectionId);
    });
  })();
});

server.listen(PORT, () => {
  console.log(`Afromoly local rank listening on http://localhost:${PORT}`);
  console.log(`Point the client at NEXT_PUBLIC_API_URL=http://localhost:${PORT} and NEXT_PUBLIC_WS_URL=ws://localhost:${PORT}`);
});
