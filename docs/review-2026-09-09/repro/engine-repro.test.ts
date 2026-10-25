import { describe, it, expect } from 'vitest';
import { createGame, reduce, nextInt, type GameState } from '/Users/tlali/afromoly/packages/engine/src/index.js';

const seats = [
  { id: 'p1', name: 'A', token: 'quantum' as const },
  { id: 'p2', name: 'B', token: 'coin' as const },
  { id: 'p3', name: 'C', token: 'robot' as const },
];

/** Find a seed whose first roll after setup is the wanted pair. */
function seedFor(want: [number, number]): GameState {
  for (let i = 0; i < 20000; i++) {
    const g = createGame(seats, `s${i}`);
    const d1 = nextInt(g.rng, 1, 6);
    const d2 = nextInt(d1.state, 1, 6);
    if (d1.value === want[0] && d2.value === want[1]) return g;
  }
  throw new Error('no seed');
}

describe('review reproductions', () => {
  it('doubles roll onto Go to Impound leaves the phase at awaitingRoll', () => {
    const g = seedFor([3, 3]);
    g.players[0]!.position = 24; // 24 + 6 = 30, Go to Impound
    const r = reduce(g, { kind: 'rollDice', playerId: 'p1' });
    console.log('phase after doubles into impound:', r.state.phase, 'inImpound:', r.state.players[0]!.inImpound, 'turnResume:', r.state.turnResumePhase);
    // Rulebook 7: being sent to impound ends the turn immediately.
    const again = reduce(r.state, { kind: 'rollDice', playerId: 'p1' });
    console.log('second roll accepted?', !again.events.some((e) => e.kind === 'illegalAction'), again.events.map((e) => e.kind));
    expect(r.state.phase).toBe('awaitingEndTurn');
  });

  it('accepting a trade that carries mortgage interest the recipient cannot pay loses the debt phase', () => {
    const g = createGame(seats, 'trade');
    g.tiles[39]!.ownerId = 'p1';
    g.tiles[39]!.mortgaged = true; // interest on transfer: R2,000
    g.players[1]!.cash = 500;
    const offer = { fromId: 'p1', toId: 'p2', fromCash: 0, toCash: 0, fromTiles: [39], toTiles: [], fromGetOutCards: 0, toGetOutCards: 0 };
    const a = reduce(g, { kind: 'proposeTrade', playerId: 'p1', offer });
    const b = reduce(a.state, { kind: 'acceptTrade', playerId: 'p2' });
    console.log('phase after accept:', b.state.phase, 'debts:', JSON.stringify(b.state.debts), 'p2 cash', b.state.players[1]!.cash, 'owner', b.state.tiles[39]!.ownerId);
    expect(b.state.debts.length === 0 || b.state.phase === 'debtSettlement').toBe(true);
  });

  it('bankruptcy to the bank discards held Get Out of Impound cards', () => {
    const g = createGame(seats, 'cards');
    g.players[0]!.getOutCards = [{ deck: 'kombi', cardId: 12 }];
    g.decks.kombi.order = g.decks.kombi.order.filter((id) => id !== 12);
    g.players[0]!.cash = 0;
    g.debts = [{ debtorId: 'p1', creditorId: null, amount: 20_000, source: 'tax', toPot: false }];
    g.phase = 'debtSettlement';
    const r = reduce(g, { kind: 'declareBankruptcy', playerId: 'p1' });
    const inDeck = r.state.decks.kombi.order.includes(12);
    const held = r.state.players.some((p) => p.getOutCards.some((c) => c.cardId === 12));
    console.log('card 12 back in deck?', inDeck, 'held by anyone?', held, 'p1 bankrupt', r.state.players[0]!.bankrupt);
    expect(inDeck || held).toBe(true);
  });

  it('a card sending a doubles-roller to impound also leaves awaitingRoll', () => {
    // Kombi Hustle tile 2; need first kombi card to be #6 (go to impound) and a roll of 1+1 from Go.
    for (let i = 0; i < 50000; i++) {
      const g = createGame(seats, `k${i}`);
      const d1 = nextInt(g.rng, 1, 6);
      const d2 = nextInt(d1.state, 1, 6);
      if (d1.value !== 1 || d2.value !== 1) continue;
      if (g.decks.kombi.order[0] !== 6) continue;
      const r = reduce(g, { kind: 'rollDice', playerId: 'p1' });
      console.log('card->impound on doubles: phase', r.state.phase, 'inImpound', r.state.players[0]!.inImpound);
      expect(r.state.phase).toBe('awaitingEndTurn');
      return;
    }
    throw new Error('no seed found');
  });

  it('a player in impound with a stuck depot cannot declare bankruptcy nor sell (van shortage)', () => {
    const g = createGame(seats, 'vans');
    // Put 32 vans on the board owned by p2, and give p1 a depot on brown.
    let placed = 0;
    for (const t of [6, 8, 9, 11, 13, 14, 16, 18, 19]) { g.tiles[t]!.ownerId = 'p2'; g.tiles[t]!.vans = 4; placed += 4; }
    console.log('vans placed', placed);
    g.tiles[1]!.ownerId = 'p1'; g.tiles[3]!.ownerId = 'p1';
    g.tiles[1]!.depot = true; g.tiles[3]!.depot = true;
    g.players[0]!.cash = 0;
    g.debts = [{ debtorId: 'p1', creditorId: null, amount: 10_000, source: 'tax', toPot: false }];
    g.phase = 'debtSettlement';
    const sell = reduce(g, { kind: 'sellBuilding', playerId: 'p1', tileIndex: 1 });
    const bank = reduce(g, { kind: 'declareBankruptcy', playerId: 'p1' });
    const mort = reduce(g, { kind: 'mortgage', playerId: 'p1', tileIndex: 1 });
    console.log('sell:', sell.events[0], '\nbankrupt:', bank.events[0], '\nmortgage:', mort.events[0]);
  });
});
