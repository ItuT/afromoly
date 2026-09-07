import { describe, expect, it } from 'vitest';
import { apply, cashOf, give, newGame, playerOf, run } from './helpers.js';
import type { TradeOffer } from '../types.js';

const offer = (over: Partial<TradeOffer> = {}): TradeOffer => ({
  fromId: 'p1',
  toId: 'p2',
  fromCash: 0,
  toCash: 0,
  fromTiles: [],
  toTiles: [],
  fromGetOutCards: 0,
  toGetOutCards: 0,
  ...over,
});

describe('trading', () => {
  it('swaps a deed for cash once the other side accepts', () => {
    let state = give(newGame(), 39, 'p1');
    state = apply(state, {
      kind: 'proposeTrade',
      playerId: 'p1',
      offer: offer({ fromTiles: [39], toCash: 50_000 }),
    });
    expect(state.phase).toBe('tradeReview');
    state = apply(state, { kind: 'acceptTrade', playerId: 'p2' });
    expect(state.tiles[39]?.ownerId).toBe('p2');
    expect(cashOf(state, 'p1')).toBe(200_000);
    expect(cashOf(state, 'p2')).toBe(100_000);
    expect(state.phase).toBe('awaitingRoll');
  });

  it('leaves everything alone when the offer is declined', () => {
    let state = give(newGame(), 39, 'p1');
    state = apply(state, {
      kind: 'proposeTrade',
      playerId: 'p1',
      offer: offer({ fromTiles: [39], toCash: 50_000 }),
    });
    state = apply(state, { kind: 'declineTrade', playerId: 'p2' });
    expect(state.tiles[39]?.ownerId).toBe('p1');
    expect(cashOf(state, 'p1')).toBe(150_000);
    expect(state.trade).toBeNull();
  });

  it('charges the receiving operator ten percent on a mortgaged deed', () => {
    let state = give(newGame(), 39, 'p1', { mortgaged: true });
    state = apply(state, { kind: 'proposeTrade', playerId: 'p1', offer: offer({ fromTiles: [39] }) });
    state = apply(state, { kind: 'acceptTrade', playerId: 'p2' });
    expect(state.tiles[39]?.ownerId).toBe('p2');
    expect(cashOf(state, 'p2')).toBe(148_000);
  });

  it('refuses to trade a set that still carries buildings', () => {
    let state = give(give(newGame(), 1, 'p1', { vans: 1 }), 3, 'p1');
    const { events } = run(state, { kind: 'proposeTrade', playerId: 'p1', offer: offer({ fromTiles: [3] }) });
    expect(events[0]).toMatchObject({ kind: 'illegalAction' });
    state = apply(state, { kind: 'sellBuilding', playerId: 'p1', tileIndex: 1 });
    const ok = run(state, { kind: 'proposeTrade', playerId: 'p1', offer: offer({ fromTiles: [3] }) });
    expect(ok.events[0]?.kind).toBe('tradeProposed');
  });

  it('refuses an offer of a deed the proposer does not own', () => {
    const state = give(newGame(), 39, 'p2');
    const { events } = run(state, { kind: 'proposeTrade', playerId: 'p1', offer: offer({ fromTiles: [39] }) });
    expect(events[0]).toMatchObject({ kind: 'illegalAction' });
  });

  it('refuses an offer of cash the proposer does not hold', () => {
    const { events } = run(newGame(), {
      kind: 'proposeTrade',
      playerId: 'p1',
      offer: offer({ fromCash: 999_999 }),
    });
    expect(events[0]).toMatchObject({ kind: 'illegalAction' });
  });

  it('only lets the operator whose turn it is open a deal', () => {
    const state = give(newGame(), 39, 'p2');
    const { events } = run(state, {
      kind: 'proposeTrade',
      playerId: 'p2',
      offer: offer({ fromId: 'p2', toId: 'p1', fromTiles: [39] }),
    });
    expect(events[0]).toMatchObject({ kind: 'illegalAction' });
  });

  it('moves a Get Out of Impound card between operators', () => {
    const state = structuredClone(newGame());
    state.players[0]?.getOutCards.push({ deck: 'kombi', cardId: 12 });
    let next = apply(state, {
      kind: 'proposeTrade',
      playerId: 'p1',
      offer: offer({ fromGetOutCards: 1, toCash: 10_000 }),
    });
    next = apply(next, { kind: 'acceptTrade', playerId: 'p2' });
    expect(playerOf(next, 'p1').getOutCards).toHaveLength(0);
    expect(playerOf(next, 'p2').getOutCards).toEqual([{ deck: 'kombi', cardId: 12 }]);
  });
});
