/**
 * Persistence for games, seats, connections and the action log.
 *
 * One DynamoDB table holds all four, keyed as documented in PLAN.md:
 *
 *   GAME#<id>  META            the game state and its version
 *   GAME#<id>  PLAYER#<id>     a seat
 *   GAME#<id>  LOG#<seq>       one applied action, append only
 *   CONN#<id>  META            reverse lookup for disconnect handling
 *
 * GSI1 maps CODE#<code> to the game, so joining by code is one query.
 */

import type { Action, GameState, TokenId } from '@afromoly/engine';

export type GameStatus = 'lobby' | 'playing' | 'finished';

export interface GameRecord {
  gameId: string;
  code: string;
  status: GameStatus;
  hostId: string;
  jackpot: boolean;
  seed: string;
  /** Null until the host starts the game. */
  state: GameState | null;
  /** Bumped on every accepted write. Used for optimistic locking. */
  version: number;
  /** The last applied idempotency key, so a retried send cannot double-apply. */
  lastNonce: string | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface PlayerRecord {
  gameId: string;
  playerId: string;
  name: string;
  token: TokenId;
  seat: number;
  /**
   * Proves ownership of the seat. Issued once, returned only to the client
   * that created or joined the seat, and never broadcast.
   */
  secret: string;
  connectionId: string | null;
}

export interface ConnectionRecord {
  connectionId: string;
  gameId: string;
  playerId: string;
}

export interface LogEntry {
  gameId: string;
  seq: number;
  playerId: string;
  action: Action;
  at: number;
}

export interface Store {
  createGame(game: GameRecord, host: PlayerRecord): Promise<void>;
  getGame(gameId: string): Promise<GameRecord | null>;
  findGameByCode(code: string): Promise<GameRecord | null>;
  /**
   * Write the game back only if its version is still `expectedVersion`.
   * Returns false when someone else got there first, which is the signal to
   * reload and tell the client to resync.
   */
  saveGame(game: GameRecord, expectedVersion: number): Promise<boolean>;
  /** Seat a player. Returns false when that seat id is already taken. */
  addPlayer(player: PlayerRecord): Promise<boolean>;
  listPlayers(gameId: string): Promise<PlayerRecord[]>;
  setConnection(gameId: string, playerId: string, connectionId: string | null): Promise<void>;
  putConnection(record: ConnectionRecord): Promise<void>;
  getConnection(connectionId: string): Promise<ConnectionRecord | null>;
  deleteConnection(connectionId: string): Promise<void>;
  appendLog(entry: LogEntry): Promise<void>;
  readLog(gameId: string): Promise<LogEntry[]>;
}

/** Six hours for a lobby nobody starts, a day after the last move otherwise. */
export const LOBBY_TTL_SECONDS = 6 * 60 * 60;
export const GAME_TTL_SECONDS = 24 * 60 * 60;

/** Seats are written once, so they outlive any game that is still being played. */
export const SEAT_TTL_SECONDS = 7 * 24 * 60 * 60;

export function ttlFrom(now: number, status: GameStatus | 'seat'): number {
  const seconds =
    status === 'lobby' ? LOBBY_TTL_SECONDS : status === 'seat' ? SEAT_TTL_SECONDS : GAME_TTL_SECONDS;
  return Math.floor(now / 1000) + seconds;
}
