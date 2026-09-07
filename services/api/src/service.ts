/**
 * The transport-free game service.
 *
 * Handlers below this line know about Lambda events; this module knows about
 * games. Keeping them apart is what lets the whole server path be tested
 * without AWS.
 */

import { PROTOCOL_VERSION, redact, type ClientMessage, type LobbyPlayer, type ServerMessage } from '@afromoly/protocol';
import { broadcast, type Broadcaster } from './broadcast.js';
import { applyIntent } from './session.js';
import { startTable } from './lobby.js';
import type { Store } from './store.js';

export async function lobbyMessage(store: Store, gameId: string): Promise<ServerMessage | null> {
  const game = await store.getGame(gameId);
  if (!game) return null;
  const seats = await store.listPlayers(gameId);
  const players: LobbyPlayer[] = seats.map((s) => ({
    id: s.playerId,
    name: s.name,
    token: s.token,
    connected: s.connectionId !== null,
    seat: s.seat,
  }));
  return { v: PROTOCOL_VERSION, type: 'lobby', gameId, code: game.code, players, hostId: game.hostId };
}

export async function stateMessage(
  store: Store,
  gameId: string,
  playerId: string,
): Promise<ServerMessage | null> {
  const game = await store.getGame(gameId);
  if (!game?.state) return null;
  return {
    v: PROTOCOL_VERSION,
    type: 'state',
    gameId,
    version: game.version,
    you: playerId,
    state: redact(game.state),
  };
}

/** Push the current table to everyone: the lobby before the off, the board after. */
export async function pushTable(
  store: Store,
  broadcaster: Broadcaster,
  gameId: string,
): Promise<void> {
  const game = await store.getGame(gameId);
  if (!game) return;
  if (game.status === 'lobby' || !game.state) {
    const message = await lobbyMessage(store, gameId);
    if (message) await broadcast(store, broadcaster, gameId, () => message);
    return;
  }
  const state = game.state;
  await broadcast(store, broadcaster, gameId, (playerId) => ({
    v: PROTOCOL_VERSION,
    type: 'state',
    gameId,
    version: game.version,
    you: playerId,
    state: redact(state),
  }));
}

/**
 * Handle one client message on an open connection.
 *
 * Returns the message to send straight back to the sender, if any. Anything
 * everyone needs to see goes out through the broadcaster.
 */
export async function handleClientMessage(
  store: Store,
  broadcaster: Broadcaster,
  connectionId: string,
  message: ClientMessage,
): Promise<ServerMessage | null> {
  if (message.type === 'ping') return { v: PROTOCOL_VERSION, type: 'pong' };

  if (message.type === 'subscribe') {
    const seats = await store.listPlayers(message.gameId);
    const seat = seats.find((s) => s.playerId === message.playerId);
    if (!seat) return { v: PROTOCOL_VERSION, type: 'error', code: 'UNKNOWN_PLAYER', message: 'You are not seated at this table.' };
    await store.setConnection(message.gameId, message.playerId, connectionId);
    await store.putConnection({ connectionId, gameId: message.gameId, playerId: message.playerId });
    await pushTable(store, broadcaster, message.gameId);
    return null;
  }

  if (message.type === 'startGame') {
    const result = await startTable(store, message.gameId, message.playerId);
    if (!result.ok) return { v: PROTOCOL_VERSION, type: 'error', code: result.code, message: result.message };
    await pushTable(store, broadcaster, message.gameId);
    return null;
  }

  if (message.type === 'intent') {
    const result = await applyIntent(store, {
      gameId: message.gameId,
      playerId: message.playerId,
      expectedVersion: message.expectedVersion,
      nonce: message.nonce,
      intent: message.intent,
    });

    if (!result.ok) {
      // A stale or conflicting client needs the truth, not just an error.
      if (result.code === 'STALE_VERSION' || result.code === 'CONFLICT') {
        const state = await stateMessage(store, message.gameId, message.playerId);
        if (state) await broadcaster.send(connectionId, state);
      }
      return { v: PROTOCOL_VERSION, type: 'error', code: result.code, message: result.message };
    }

    if (!result.value.replayed && result.value.events.length > 0) {
      await broadcast(store, broadcaster, message.gameId, () => ({
        v: PROTOCOL_VERSION,
        type: 'events',
        gameId: message.gameId,
        events: result.value.events,
      }));
    }
    await pushTable(store, broadcaster, message.gameId);
    return null;
  }

  return { v: PROTOCOL_VERSION, type: 'error', code: 'BAD_MESSAGE', message: 'Unrecognised message.' };
}

/** Mark a connection gone and tell the table. */
export async function handleDisconnect(
  store: Store,
  broadcaster: Broadcaster,
  connectionId: string,
): Promise<void> {
  const record = await store.getConnection(connectionId);
  await store.deleteConnection(connectionId);
  if (!record) return;
  const seats = await store.listPlayers(record.gameId);
  const seat = seats.find((s) => s.playerId === record.playerId);
  // Only clear the seat if this is still the connection it is holding.
  if (seat?.connectionId === connectionId) {
    await store.setConnection(record.gameId, record.playerId, null);
  }
  const lobby = await lobbyMessage(store, record.gameId);
  if (lobby) await broadcast(store, broadcaster, record.gameId, () => lobby);
}
