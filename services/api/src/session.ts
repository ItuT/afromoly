/**
 * Applying a player's intent to a live game.
 *
 * The engine is the authority. This module only decides whether the message is
 * one this player is allowed to send, handles the optimistic lock, and writes
 * the result down.
 */

import { reduce, type Action, type GameEvent } from '@afromoly/engine';
import { fail, ok, type Result } from './result.js';
import type { GameRecord, Store } from './store.js';

export interface IntentInput {
  gameId: string;
  playerId: string;
  expectedVersion: number;
  nonce: string;
  intent: Action;
}

export interface IntentOutcome {
  game: GameRecord;
  events: GameEvent[];
  /** True when this was a replayed nonce and nothing new was applied. */
  replayed: boolean;
}

export async function applyIntent(
  store: Store,
  input: IntentInput,
): Promise<Result<IntentOutcome>> {
  const game = await store.getGame(input.gameId);
  if (!game) return fail('UNKNOWN_GAME', 'No such table.');
  if (game.status !== 'playing' || !game.state) {
    return fail('NOT_STARTED', 'That game has not started.');
  }

  // A retried send must not apply twice.
  if (game.lastNonce !== null && game.lastNonce === input.nonce) {
    return ok({ game, events: [], replayed: true });
  }

  if (input.expectedVersion !== game.version) {
    return fail('STALE_VERSION', 'Your view of the table is out of date. Resyncing.');
  }

  // A client may only ever act as itself. The engine also checks turn order.
  if (input.intent.playerId !== input.playerId) {
    return fail('ILLEGAL_ACTION', 'You cannot act for another operator.');
  }
  if (!game.state.players.some((p) => p.id === input.playerId)) {
    return fail('UNKNOWN_PLAYER', 'You are not seated at this table.');
  }

  const result = reduce(game.state, input.intent);
  const illegal = result.events.find((e) => e.kind === 'illegalAction');
  if (illegal) {
    return fail('ILLEGAL_ACTION', illegal.kind === 'illegalAction' ? illegal.reason : 'Not allowed.');
  }

  const now = Date.now();
  const next: GameRecord = {
    ...game,
    state: result.state,
    status: result.state.phase === 'gameOver' ? 'finished' : 'playing',
    version: game.version + 1,
    lastNonce: input.nonce,
    updatedAt: now,
  };

  const saved = await store.saveGame(next, game.version);
  if (!saved) {
    return fail('CONFLICT', 'Another move landed first. Resyncing.');
  }

  await store.appendLog({
    gameId: game.gameId,
    seq: next.version,
    playerId: input.playerId,
    action: input.intent,
    at: now,
  });

  return ok({ game: next, events: result.events, replayed: false });
}
