/** The DynamoDB-backed Store. Single table, on-demand, TTL on every item. */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  ConnectionRecord,
  GameRecord,
  LogEntry,
  PlayerRecord,
  Store,
} from './store.js';
import { ttlFrom } from './store.js';

const gamePk = (gameId: string) => `GAME#${gameId}`;
const connPk = (connectionId: string) => `CONN#${connectionId}`;
const logSk = (seq: number) => `LOG#${String(seq).padStart(9, '0')}`;

export class DynamoStore implements Store {
  private readonly doc: DynamoDBDocumentClient;

  constructor(
    private readonly table: string,
    client: DynamoDBClient = new DynamoDBClient({}),
  ) {
    this.doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  private gameItem(game: GameRecord): Record<string, unknown> {
    return {
      ...game,
      PK: gamePk(game.gameId),
      SK: 'META',
      GSI1PK: `CODE#${game.code}`,
      GSI1SK: gamePk(game.gameId),
      expiresAt: ttlFrom(game.updatedAt, game.status),
    };
  }

  async createGame(game: GameRecord, host: PlayerRecord): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.table,
        Item: this.gameItem(game),
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
    await this.addPlayer(host);
  }

  async getGame(gameId: string): Promise<GameRecord | null> {
    const result = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: { PK: gamePk(gameId), SK: 'META' } }),
    );
    return (result.Item as GameRecord | undefined) ?? null;
  }

  async findGameByCode(code: string): Promise<GameRecord | null> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.table,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': `CODE#${code}` },
        Limit: 1,
      }),
    );
    return (result.Items?.[0] as GameRecord | undefined) ?? null;
  }

  async saveGame(game: GameRecord, expectedVersion: number): Promise<boolean> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.table,
          Item: this.gameItem(game),
          ConditionExpression: 'version = :expected',
          ExpressionAttributeValues: { ':expected': expectedVersion },
        }),
      );
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return false;
      throw error;
    }
  }

  async addPlayer(player: PlayerRecord): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          ...player,
          PK: gamePk(player.gameId),
          SK: `PLAYER#${player.playerId}`,
          expiresAt: ttlFrom(Date.now(), 'playing'),
        },
      }),
    );
  }

  async listPlayers(gameId: string): Promise<PlayerRecord[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': gamePk(gameId), ':sk': 'PLAYER#' },
      }),
    );
    return ((result.Items ?? []) as PlayerRecord[]).sort((a, b) => a.seat - b.seat);
  }

  async setConnection(gameId: string, playerId: string, connectionId: string | null): Promise<void> {
    await this.doc.send(
      new UpdateCommand({
        TableName: this.table,
        Key: { PK: gamePk(gameId), SK: `PLAYER#${playerId}` },
        UpdateExpression: 'SET connectionId = :c',
        ExpressionAttributeValues: { ':c': connectionId },
      }),
    );
  }

  async putConnection(record: ConnectionRecord): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          ...record,
          PK: connPk(record.connectionId),
          SK: 'META',
          expiresAt: ttlFrom(Date.now(), 'playing'),
        },
      }),
    );
  }

  async getConnection(connectionId: string): Promise<ConnectionRecord | null> {
    const result = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: { PK: connPk(connectionId), SK: 'META' } }),
    );
    return (result.Item as ConnectionRecord | undefined) ?? null;
  }

  async deleteConnection(connectionId: string): Promise<void> {
    await this.doc.send(
      new DeleteCommand({ TableName: this.table, Key: { PK: connPk(connectionId), SK: 'META' } }),
    );
  }

  async appendLog(entry: LogEntry): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          ...entry,
          PK: gamePk(entry.gameId),
          SK: logSk(entry.seq),
          expiresAt: ttlFrom(entry.at, 'playing'),
        },
      }),
    );
  }

  async readLog(gameId: string): Promise<LogEntry[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': gamePk(gameId), ':sk': 'LOG#' },
      }),
    );
    return (result.Items ?? []) as LogEntry[];
  }
}
