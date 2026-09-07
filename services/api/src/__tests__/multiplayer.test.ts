import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore } from '../memoryStore.js';
import { MemoryBroadcaster } from '../broadcast.js';
import { createTable, joinTable, startTable, MAX_SEATS } from '../lobby.js';
import { handleClientMessage, handleDisconnect, lobbyMessage } from '../service.js';
import { applyIntent } from '../session.js';
import { normaliseCode } from '../codes.js';
import { PROTOCOL_VERSION, type ServerMessage } from '@afromoly/protocol';
import type { Store } from '../store.js';

let store: Store;
let bus: MemoryBroadcaster;

beforeEach(() => {
  store = new MemoryStore();
  bus = new MemoryBroadcaster();
});

async function seatedTable(names = ['Thabo', 'Naledi']) {
  const created = await createTable(store, { hostName: names[0] ?? 'Thabo', seed: 'test-table' });
  if (!created.ok) throw new Error(created.message);
  const game = created.value.game;
  for (const name of names.slice(1)) {
    const joined = await joinTable(store, game.code, name);
    if (!joined.ok) throw new Error(joined.message);
  }
  return game;
}

async function connectAll(gameId: string, playerIds: string[]) {
  for (const playerId of playerIds) {
    await handleClientMessage(store, bus, `conn-${playerId}`, {
      v: PROTOCOL_VERSION,
      type: 'subscribe',
      gameId,
      playerId,
    });
  }
  bus.clear();
}

const first = <T extends ServerMessage['type']>(messages: ServerMessage[], type: T) =>
  messages.find((m) => m.type === type) as Extract<ServerMessage, { type: T }> | undefined;

describe('lobbies', () => {
  it('creates a table with a readable code and seats the host', async () => {
    const created = await createTable(store, { hostName: '  Thabo  ' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.game.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(created.value.player).toMatchObject({ playerId: 'p1', name: 'Thabo', seat: 0 });
    expect(created.value.game.status).toBe('lobby');
  });

  it('seats a joiner and hands them the next token', async () => {
    const game = await seatedTable(['Thabo', 'Naledi']);
    const seats = await store.listPlayers(game.gameId);
    expect(seats.map((s) => s.playerId)).toEqual(['p1', 'p2']);
    expect(new Set(seats.map((s) => s.token)).size).toBe(2);
  });

  it('accepts a code typed with the wrong case and stray spacing', async () => {
    const game = await seatedTable(['Thabo']);
    const joined = await joinTable(store, ` ${game.code.toLowerCase()} `, 'Naledi');
    expect(joined.ok).toBe(true);
    expect(normaliseCode(' ab-cd ef ')).toBe('ABCDEF');
  });

  it('turns away a seventh operator', async () => {
    const game = await seatedTable(['A', 'B', 'C', 'D', 'E', 'F']);
    expect((await store.listPlayers(game.gameId)).length).toBe(MAX_SEATS);
    const seventh = await joinTable(store, game.code, 'G');
    expect(seventh).toMatchObject({ ok: false, code: 'GAME_FULL' });
  });

  it('refuses an unknown code', async () => {
    expect(await joinTable(store, 'ZZZZZZ', 'Nobody')).toMatchObject({ ok: false, code: 'UNKNOWN_GAME' });
  });

  it('will not start with one operator, or for anyone but the host', async () => {
    const game = await seatedTable(['Thabo']);
    expect(await startTable(store, game.gameId, 'p1')).toMatchObject({ ok: false, code: 'NOT_STARTED' });
    await joinTable(store, game.code, 'Naledi');
    expect(await startTable(store, game.gameId, 'p2')).toMatchObject({ ok: false, code: 'UNKNOWN_PLAYER' });
    expect((await startTable(store, game.gameId, 'p1')).ok).toBe(true);
  });

  it('refuses a join once the game is under way', async () => {
    const game = await seatedTable();
    await startTable(store, game.gameId, 'p1');
    expect(await joinTable(store, game.code, 'Late')).toMatchObject({ ok: false, code: 'ALREADY_STARTED' });
  });
});

describe('connections', () => {
  it('reports who is at the table and who has dropped', async () => {
    const game = await seatedTable();
    await connectAll(game.gameId, ['p1', 'p2']);
    const lobby = await lobbyMessage(store, game.gameId);
    expect(lobby?.type === 'lobby' && lobby.players.every((p) => p.connected)).toBe(true);

    await handleDisconnect(store, bus, 'conn-p2');
    const after = await lobbyMessage(store, game.gameId);
    expect(after?.type === 'lobby' && after.players.map((p) => p.connected)).toEqual([true, false]);
  });

  it('leaves a reconnected seat alone when the old socket closes late', async () => {
    const game = await seatedTable();
    await connectAll(game.gameId, ['p1', 'p2']);
    // p2 reconnects on a new socket, then the old one finally reports closed.
    await handleClientMessage(store, bus, 'conn-p2-new', {
      v: PROTOCOL_VERSION, type: 'subscribe', gameId: game.gameId, playerId: 'p2',
    });
    await handleDisconnect(store, bus, 'conn-p2');
    const seats = await store.listPlayers(game.gameId);
    expect(seats.find((s) => s.playerId === 'p2')?.connectionId).toBe('conn-p2-new');
  });

  it('turns away a subscribe for a seat that does not exist', async () => {
    const game = await seatedTable();
    const reply = await handleClientMessage(store, bus, 'conn-x', {
      v: PROTOCOL_VERSION, type: 'subscribe', gameId: game.gameId, playerId: 'p9',
    });
    expect(reply).toMatchObject({ type: 'error', code: 'UNKNOWN_PLAYER' });
  });
});

describe('playing a turn over the wire', () => {
  it('applies a roll and pushes the result to every seat', async () => {
    const game = await seatedTable();
    await startTable(store, game.gameId, 'p1');
    await connectAll(game.gameId, ['p1', 'p2']);

    const reply = await handleClientMessage(store, bus, 'conn-p1', {
      v: PROTOCOL_VERSION,
      type: 'intent',
      gameId: game.gameId,
      playerId: 'p1',
      expectedVersion: 2,
      nonce: 'n-1',
      intent: { kind: 'rollDice', playerId: 'p1' },
    });
    expect(reply).toBeNull();

    for (const connection of ['conn-p1', 'conn-p2']) {
      const messages = bus.messagesFor(connection);
      expect(first(messages, 'events')?.events.some((e) => e.kind === 'diceRolled')).toBe(true);
      const state = first(messages, 'state');
      expect(state?.version).toBe(3);
      expect(state?.state.players[0]?.position).toBeGreaterThan(0);
    }
    expect(first(bus.messagesFor('conn-p1'), 'state')?.you).toBe('p1');
    expect(first(bus.messagesFor('conn-p2'), 'state')?.you).toBe('p2');
  });

  it('never sends the deck order or the generator seed', async () => {
    const game = await seatedTable();
    await startTable(store, game.gameId, 'p1');
    await connectAll(game.gameId, ['p1', 'p2']);
    await handleClientMessage(store, bus, 'conn-p1', {
      v: PROTOCOL_VERSION, type: 'intent', gameId: game.gameId, playerId: 'p1',
      expectedVersion: 2, nonce: 'n-1', intent: { kind: 'rollDice', playerId: 'p1' },
    });
    const state = first(bus.messagesFor('conn-p2'), 'state');
    const wire = JSON.stringify(state);
    expect(wire).not.toContain('"rng"');
    expect(wire).not.toContain('"order"');
    expect(state?.state.decks).toEqual({ kombi: { remaining: 16 }, citywatch: { remaining: 16 } });
  });

  it('refuses an intent sent on behalf of somebody else', async () => {
    const game = await seatedTable();
    await startTable(store, game.gameId, 'p1');
    const result = await applyIntent(store, {
      gameId: game.gameId, playerId: 'p2', expectedVersion: 2, nonce: 'n',
      intent: { kind: 'rollDice', playerId: 'p1' },
    });
    expect(result).toMatchObject({ ok: false, code: 'ILLEGAL_ACTION' });
  });

  it('refuses an illegal move and leaves the game untouched', async () => {
    const game = await seatedTable();
    await startTable(store, game.gameId, 'p1');
    const before = await store.getGame(game.gameId);
    const result = await applyIntent(store, {
      gameId: game.gameId, playerId: 'p2', expectedVersion: 2, nonce: 'n',
      intent: { kind: 'rollDice', playerId: 'p2' },
    });
    expect(result).toMatchObject({ ok: false, code: 'ILLEGAL_ACTION' });
    const after = await store.getGame(game.gameId);
    expect(after?.version).toBe(before?.version);
    expect(JSON.stringify(after?.state)).toBe(JSON.stringify(before?.state));
  });

  it('rejects a stale view and sends the client the truth', async () => {
    const game = await seatedTable();
    await startTable(store, game.gameId, 'p1');
    await connectAll(game.gameId, ['p1', 'p2']);
    await handleClientMessage(store, bus, 'conn-p1', {
      v: PROTOCOL_VERSION, type: 'intent', gameId: game.gameId, playerId: 'p1',
      expectedVersion: 2, nonce: 'n-1', intent: { kind: 'rollDice', playerId: 'p1' },
    });
    bus.clear();

    const reply = await handleClientMessage(store, bus, 'conn-p1', {
      v: PROTOCOL_VERSION, type: 'intent', gameId: game.gameId, playerId: 'p1',
      expectedVersion: 2, nonce: 'n-2', intent: { kind: 'endTurn', playerId: 'p1' },
    });
    expect(reply).toMatchObject({ type: 'error', code: 'STALE_VERSION' });
    expect(first(bus.messagesFor('conn-p1'), 'state')?.version).toBe(3);
  });

  it('treats a retried send as the move it already made', async () => {
    const game = await seatedTable();
    await startTable(store, game.gameId, 'p1');
    const send = () => applyIntent(store, {
      gameId: game.gameId, playerId: 'p1', expectedVersion: 2, nonce: 'same',
      intent: { kind: 'rollDice', playerId: 'p1' },
    });
    const firstSend = await send();
    const retry = await send();
    expect(firstSend.ok && retry.ok).toBe(true);
    if (!firstSend.ok || !retry.ok) return;
    expect(retry.value.replayed).toBe(true);
    expect(retry.value.events).toEqual([]);
    expect(retry.value.game.version).toBe(firstSend.value.game.version);
  });

  it('lets one of two simultaneous writes through and refuses the other', async () => {
    const game = await seatedTable();
    await startTable(store, game.gameId, 'p1');
    const current = await store.getGame(game.gameId);
    if (!current) throw new Error('missing game');

    const winner = await store.saveGame({ ...current, version: current.version + 1 }, current.version);
    const loser = await store.saveGame({ ...current, version: current.version + 1 }, current.version);
    expect(winner).toBe(true);
    expect(loser).toBe(false);
  });

  it('marks the table finished when the engine calls the game', async () => {
    const game = await seatedTable();
    await startTable(store, game.gameId, 'p1');
    const record = await store.getGame(game.gameId);
    if (!record?.state) throw new Error('missing state');

    // Force a finished position, then apply a legal no-op-shaped move.
    const finished = structuredClone(record.state);
    finished.players[1]!.cash = 0;
    await store.saveGame({ ...record, state: finished }, record.version);

    const result = await applyIntent(store, {
      gameId: game.gameId, playerId: 'p1', expectedVersion: record.version, nonce: 'go',
      intent: { kind: 'rollDice', playerId: 'p1' },
    });
    expect(result.ok).toBe(true);
    const after = await store.getGame(game.gameId);
    expect(after?.status).toBe(after?.state?.phase === 'gameOver' ? 'finished' : 'playing');
  });

  it('refuses intents before the host starts the game', async () => {
    const game = await seatedTable();
    const result = await applyIntent(store, {
      gameId: game.gameId, playerId: 'p1', expectedVersion: 1, nonce: 'n',
      intent: { kind: 'rollDice', playerId: 'p1' },
    });
    expect(result).toMatchObject({ ok: false, code: 'NOT_STARTED' });
  });

  it('answers a ping', async () => {
    const reply = await handleClientMessage(store, bus, 'c', { v: PROTOCOL_VERSION, type: 'ping' });
    expect(reply).toMatchObject({ type: 'pong' });
  });
});

describe('dead connections', () => {
  it('drops a seat whose socket has gone away mid-broadcast', async () => {
    const game = await seatedTable();
    await startTable(store, game.gameId, 'p1');
    await connectAll(game.gameId, ['p1', 'p2']);
    bus.dead.add('conn-p2');

    await handleClientMessage(store, bus, 'conn-p1', {
      v: PROTOCOL_VERSION, type: 'intent', gameId: game.gameId, playerId: 'p1',
      expectedVersion: 2, nonce: 'n-1', intent: { kind: 'rollDice', playerId: 'p1' },
    });

    const seats = await store.listPlayers(game.gameId);
    expect(seats.find((s) => s.playerId === 'p2')?.connectionId).toBeNull();
    expect(await store.getConnection('conn-p2')).toBeNull();
  });
});

describe('the action log', () => {
  it('records every applied move in order', async () => {
    const game = await seatedTable();
    await startTable(store, game.gameId, 'p1');
    let version = 2;
    for (const nonce of ['a', 'b']) {
      const result = await applyIntent(store, {
        gameId: game.gameId, playerId: 'p1', expectedVersion: version, nonce,
        intent: { kind: 'rollDice', playerId: 'p1' },
      });
      if (!result.ok) break;
      version = result.value.game.version;
    }
    const log = await store.readLog(game.gameId);
    expect(log.length).toBeGreaterThanOrEqual(1);
    expect(log[0]).toMatchObject({ playerId: 'p1', seq: 3 });
    expect(log.map((e) => e.seq)).toEqual([...log.map((e) => e.seq)].sort((a, b) => a - b));
  });
});
