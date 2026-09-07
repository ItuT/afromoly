/** Creating, joining and starting a table. */

import { TOKENS, createGame as createEngineGame, type TokenId } from '@afromoly/engine';
import { makeCode, makeId, normaliseCode } from './codes.js';
import { fail, ok, type Result } from './result.js';
import type { GameRecord, PlayerRecord, Store } from './store.js';

export const MAX_SEATS = 6;
export const MIN_SEATS = 2;

export interface CreateInput {
  hostName: string;
  jackpot?: boolean;
  /** Pinned by tests so a table deals the same game every run. */
  seed?: string;
}

export interface Seatted {
  game: GameRecord;
  player: PlayerRecord;
}

function cleanName(raw: string, fallback: string): string {
  const trimmed = raw.trim().slice(0, 24);
  return trimmed.length > 0 ? trimmed : fallback;
}

export async function createTable(
  store: Store,
  input: CreateInput,
  now = Date.now(),
): Promise<Result<Seatted>> {
  // Retry a couple of times in the unlikely event of a code collision.
  let code = makeCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!(await store.findGameByCode(code))) break;
    code = makeCode();
  }
  if (await store.findGameByCode(code)) {
    return fail('INTERNAL', 'Could not allocate a free game code. Try again.');
  }

  const gameId = makeId();
  const hostId = 'p1';
  const game: GameRecord = {
    gameId,
    code,
    status: 'lobby',
    hostId,
    jackpot: input.jackpot !== false,
    seed: input.seed ?? `${gameId}:${now}`,
    state: null,
    version: 1,
    lastNonce: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: 0,
  };
  const host: PlayerRecord = {
    gameId,
    playerId: hostId,
    name: cleanName(input.hostName, 'Operator 1'),
    token: TOKENS[0] as TokenId,
    seat: 0,
    connectionId: null,
  };
  await store.createGame(game, host);
  return ok({ game, player: host });
}

export async function joinTable(
  store: Store,
  rawCode: string,
  rawName: string,
): Promise<Result<Seatted>> {
  const code = normaliseCode(rawCode);
  const game = await store.findGameByCode(code);
  if (!game) return fail('UNKNOWN_GAME', 'No table with that code.');
  if (game.status !== 'lobby') return fail('ALREADY_STARTED', 'That game is already under way.');

  const seats = await store.listPlayers(game.gameId);
  if (seats.length >= MAX_SEATS) return fail('GAME_FULL', 'That table already seats six operators.');

  const seat = seats.length;
  const player: PlayerRecord = {
    gameId: game.gameId,
    playerId: `p${seat + 1}`,
    name: cleanName(rawName, `Operator ${seat + 1}`),
    token: (TOKENS[seat] ?? TOKENS[0]) as TokenId,
    seat,
    connectionId: null,
  };
  await store.addPlayer(player);
  return ok({ game, player });
}

export async function startTable(
  store: Store,
  gameId: string,
  playerId: string,
): Promise<Result<GameRecord>> {
  const game = await store.getGame(gameId);
  if (!game) return fail('UNKNOWN_GAME', 'No such table.');
  if (game.hostId !== playerId) return fail('UNKNOWN_PLAYER', 'Only the host can start the game.');
  if (game.status !== 'lobby') return fail('ALREADY_STARTED', 'That game is already under way.');

  const seats = await store.listPlayers(gameId);
  if (seats.length < MIN_SEATS) {
    return fail('NOT_STARTED', 'Afromoly seats two to six operators. Wait for one more.');
  }

  const state = createEngineGame(
    seats.map((s) => ({ id: s.playerId, name: s.name, token: s.token })),
    game.seed,
    { jackpot: game.jackpot },
  );

  const next: GameRecord = {
    ...game,
    status: 'playing',
    state,
    version: game.version + 1,
    updatedAt: Date.now(),
  };
  const saved = await store.saveGame(next, game.version);
  if (!saved) return fail('CONFLICT', 'Someone else started the game. Reload.');
  return ok(next);
}
