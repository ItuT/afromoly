import { describe, expect, it } from 'vitest';
import { MemoryStore } from '/Users/tlali/afromoly/services/api/src/memoryStore.js';
import { MemoryBroadcaster } from '/Users/tlali/afromoly/services/api/src/broadcast.js';
import { createTable, joinTable, startTable } from '/Users/tlali/afromoly/services/api/src/lobby.js';
import { handleClientMessage } from '/Users/tlali/afromoly/services/api/src/service.js';
import { PROTOCOL_VERSION } from '@afromoly/protocol';

describe('server review reproductions', () => {
  it('a socket subscribed as p2 can roll for p1 and can even re-subscribe as p1', async () => {
    const store = new MemoryStore();
    const bus = new MemoryBroadcaster();
    const created = await createTable(store, { hostName: 'Thabo', seed: 'sec' });
    if (!created.ok) throw new Error(created.message);
    const game = created.value.game;
    await joinTable(store, game.code, 'Naledi');
    await startTable(store, game.gameId, 'p1');

    // Both connect honestly first.
    for (const p of ['p1', 'p2']) {
      await handleClientMessage(store, bus, `conn-${p}`, { v: PROTOCOL_VERSION, type: 'subscribe', gameId: game.gameId, playerId: p });
    }
    bus.clear();

    // p2's socket sends an intent claiming to be p1, on p1's turn.
    const before = (await store.getGame(game.gameId))!;
    const reply = await handleClientMessage(store, bus, 'conn-p2', {
      v: PROTOCOL_VERSION,
      type: 'intent',
      gameId: game.gameId,
      playerId: 'p1',
      expectedVersion: before.version,
      nonce: 'n1',
      intent: { kind: 'rollDice', playerId: 'p1' },
    });
    const after = (await store.getGame(game.gameId))!;
    console.log('reply:', reply, 'version', before.version, '->', after.version, 'p1 position', after.state!.players[0]!.position);
    expect(after.version).toBe(before.version); // should have been rejected

    // p2's socket takes over p1's seat entirely.
    await handleClientMessage(store, bus, 'conn-p2', { v: PROTOCOL_VERSION, type: 'subscribe', gameId: game.gameId, playerId: 'p1' });
    const seats = await store.listPlayers(game.gameId);
    console.log('seat connections after hijack:', seats.map((s) => `${s.playerId}=${s.connectionId}`));
  });

  it('two simultaneous joins collide on the same seat id', async () => {
    const store = new MemoryStore();
    const created = await createTable(store, { hostName: 'Thabo', seed: 'race' });
    if (!created.ok) throw new Error(created.message);
    const code = created.value.game.code;
    const [a, b] = await Promise.all([joinTable(store, code, 'Naledi'), joinTable(store, code, 'Sipho')]);
    const seats = await store.listPlayers(created.value.game.gameId);
    console.log('join results:', a.ok && a.value.player.playerId, b.ok && b.value.player.playerId, 'seats now:', seats.map((s) => `${s.playerId}:${s.name}`));
    expect(new Set(seats.map((s) => s.playerId)).size).toBe(3);
  });
});
