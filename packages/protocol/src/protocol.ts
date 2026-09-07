/**
 * The wire protocol between the browser and the game server.
 *
 * Every message carries a version so a deployed client and a newer backend can
 * disagree safely rather than silently misreading each other.
 */

import type { Action, GameState, GameEvent, TokenId } from '@afromoly/engine';

export const PROTOCOL_VERSION = 1;

/** What the client sends. */
export type ClientMessage =
  | {
      v: number;
      type: 'intent';
      gameId: string;
      playerId: string;
      /** The revision the client believed it was acting on. */
      expectedVersion: number;
      /** Idempotency key, so a retried send cannot double-apply. */
      nonce: string;
      intent: Action;
    }
  | { v: number; type: 'subscribe'; gameId: string; playerId: string }
  | { v: number; type: 'startGame'; gameId: string; playerId: string }
  | { v: number; type: 'ping' };

/** What the server sends back. */
export type ServerMessage =
  | { v: number; type: 'state'; gameId: string; version: number; you: string; state: PublicState }
  | { v: number; type: 'events'; gameId: string; events: GameEvent[] }
  | { v: number; type: 'lobby'; gameId: string; code: string; players: LobbyPlayer[]; hostId: string }
  | { v: number; type: 'error'; code: ServerErrorCode; message: string }
  | { v: number; type: 'pong' };

export type ServerErrorCode =
  | 'BAD_MESSAGE'
  | 'UNKNOWN_GAME'
  | 'UNKNOWN_PLAYER'
  | 'NOT_STARTED'
  | 'ALREADY_STARTED'
  | 'GAME_FULL'
  | 'ILLEGAL_ACTION'
  | 'STALE_VERSION'
  | 'CONFLICT'
  | 'INTERNAL';

export interface LobbyPlayer {
  id: string;
  name: string;
  token: TokenId;
  connected: boolean;
  seat: number;
}

/**
 * The game as a client is allowed to see it.
 *
 * Almost everything in Monopoly is public, including other players' cash and
 * their held exit cards. The deck order and the generator seed are not: they
 * would let a client see the next card and predict every roll.
 */
export type PublicState = Omit<GameState, 'rng' | 'decks'> & {
  decks: { kombi: { remaining: number }; citywatch: { remaining: number } };
};

export function redact(state: GameState): PublicState {
  const { rng: _rng, decks, ...rest } = state;
  void _rng;
  return {
    ...rest,
    decks: {
      kombi: { remaining: decks.kombi.order.length },
      citywatch: { remaining: decks.citywatch.order.length },
    },
  };
}

export const errorMessage = (code: ServerErrorCode, message: string): ServerMessage => ({
  v: PROTOCOL_VERSION,
  type: 'error',
  code,
  message,
});
