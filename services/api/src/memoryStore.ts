/**
 * An in-memory Store.
 *
 * Used by the test suite and by local development, so the whole server path
 * can be exercised without an AWS account. It reproduces the one behaviour
 * that actually matters for correctness: the conditional write.
 */

import type {
  ConnectionRecord,
  GameRecord,
  LogEntry,
  PlayerRecord,
  Store,
} from './store.js';

export class MemoryStore implements Store {
  private games = new Map<string, GameRecord>();
  private byCode = new Map<string, string>();
  private players = new Map<string, PlayerRecord[]>();
  private connections = new Map<string, ConnectionRecord>();
  private logs = new Map<string, LogEntry[]>();

  async createGame(game: GameRecord, host: PlayerRecord): Promise<void> {
    this.games.set(game.gameId, structuredClone(game));
    this.byCode.set(game.code, game.gameId);
    this.players.set(game.gameId, [structuredClone(host)]);
    this.logs.set(game.gameId, []);
  }

  async getGame(gameId: string): Promise<GameRecord | null> {
    const found = this.games.get(gameId);
    return found ? structuredClone(found) : null;
  }

  async findGameByCode(code: string): Promise<GameRecord | null> {
    const id = this.byCode.get(code);
    return id ? this.getGame(id) : null;
  }

  async saveGame(game: GameRecord, expectedVersion: number): Promise<boolean> {
    const current = this.games.get(game.gameId);
    if (!current || current.version !== expectedVersion) return false;
    this.games.set(game.gameId, structuredClone(game));
    return true;
  }

  async addPlayer(player: PlayerRecord): Promise<void> {
    const seats = this.players.get(player.gameId) ?? [];
    seats.push(structuredClone(player));
    this.players.set(player.gameId, seats);
  }

  async listPlayers(gameId: string): Promise<PlayerRecord[]> {
    return structuredClone(this.players.get(gameId) ?? []).sort((a, b) => a.seat - b.seat);
  }

  async setConnection(gameId: string, playerId: string, connectionId: string | null): Promise<void> {
    const seats = this.players.get(gameId) ?? [];
    const seat = seats.find((p) => p.playerId === playerId);
    if (seat) seat.connectionId = connectionId;
  }

  async putConnection(record: ConnectionRecord): Promise<void> {
    this.connections.set(record.connectionId, structuredClone(record));
  }

  async getConnection(connectionId: string): Promise<ConnectionRecord | null> {
    const found = this.connections.get(connectionId);
    return found ? structuredClone(found) : null;
  }

  async deleteConnection(connectionId: string): Promise<void> {
    this.connections.delete(connectionId);
  }

  async appendLog(entry: LogEntry): Promise<void> {
    const log = this.logs.get(entry.gameId) ?? [];
    log.push(structuredClone(entry));
    this.logs.set(entry.gameId, log);
  }

  async readLog(gameId: string): Promise<LogEntry[]> {
    return structuredClone(this.logs.get(gameId) ?? []);
  }
}
