/**
 * Regression tests for the rule bugs found in the September 2026 review.
 * Each one failed against the engine as it stood; see GAME-REVIEW.md.
 */

import { describe, expect, it } from 'vitest';
import { apply, cashOf, eventsOf, give, newGame, playerOf, run, setCash, setPosition, withRoll } from './helpers.js';
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

describe('impound on a doubles roll', () => {
  it('ends the turn when doubles land on Go to Impound', () => {
    const state = withRoll(setPosition(newGame(), 'p1', 24), 3, 3);
    const { state: next, events } = run(state, { kind: 'rollDice', playerId: 'p1' });
    expect(eventsOf(events, 'sentToImpound')).toHaveLength(1);
    expect(playerOf(next, 'p1').inImpound).toBe(true);
    expect(next.phase).toBe('awaitingEndTurn');
    // No free escape attempt: the only thing left to do is hand over.
    const again = run(next, { kind: 'rollDice', playerId: 'p1' });
    expect(again.events[0]).toMatchObject({ kind: 'illegalAction' });
    const handed = apply(next, { kind: 'endTurn', playerId: 'p1' });
    expect(handed.currentPlayerIndex).toBe(1);
  });

  it('ends the turn when doubles draw a Go to Impound card', () => {
    let state = setPosition(newGame(), 'p1', 15); // 15 + 2 = 17, Kombi Hustle
    state = { ...state, decks: { ...state.decks, kombi: { order: [6, ...state.decks.kombi.order.filter((id) => id !== 6)] } } };
    const next = apply(withRoll(state, 1, 1), { kind: 'rollDice', playerId: 'p1' });
    expect(playerOf(next, 'p1').inImpound).toBe(true);
    expect(next.phase).toBe('awaitingEndTurn');
  });
});

describe('trades carrying mortgage interest', () => {
  it('refuses an offer whose recipient cannot pay the interest on a mortgaged deed', () => {
    let state = give(newGame(), 39, 'p1', { mortgaged: true }); // interest R2,000
    state = setCash(state, 'p2', 1_500);
    const { events } = run(state, { kind: 'proposeTrade', playerId: 'p1', offer: offer({ fromTiles: [39] }) });
    expect(events[0]).toMatchObject({ kind: 'illegalAction' });
  });

  it('counts the deal cash towards the interest', () => {
    let state = give(newGame(), 39, 'p1', { mortgaged: true });
    state = setCash(state, 'p2', 1_500);
    // p1 pays p2 R1,000 as part of the deal, which is enough to cover the R2,000 fee.
    state = apply(state, { kind: 'proposeTrade', playerId: 'p1', offer: offer({ fromTiles: [39], fromCash: 1_000 }) });
    expect(state.phase).toBe('tradeReview');
    state = apply(state, { kind: 'acceptTrade', playerId: 'p2' });
    expect(state.tiles[39]?.ownerId).toBe('p2');
    expect(cashOf(state, 'p2')).toBe(500);
    expect(state.debts).toHaveLength(0);
    expect(state.phase).toBe('awaitingRoll');
  });

  it('never leaves a debt behind after an accepted trade', () => {
    // Cash drops between proposal and acceptance cannot happen in play, but the
    // reducer must still not lose a debt if the interest cannot be met.
    let state = give(newGame(), 39, 'p1', { mortgaged: true });
    state = apply(state, { kind: 'proposeTrade', playerId: 'p1', offer: offer({ fromTiles: [39] }) });
    state = setCash(state, 'p2', 500);
    const { state: next, events } = run(state, { kind: 'acceptTrade', playerId: 'p2' });
    expect(events[0]).toMatchObject({ kind: 'illegalAction' });
    expect(next.debts).toHaveLength(0);
    expect(next.tiles[39]?.ownerId).toBe('p1');
  });
});

describe('bankruptcy to the bank', () => {
  it('returns held exit cards to their decks', () => {
    let state = newGame(3);
    state = structuredClone(state);
    playerOf(state, 'p1').getOutCards = [{ deck: 'kombi', cardId: 12 }];
    state.decks.kombi.order = state.decks.kombi.order.filter((id) => id !== 12);
    state = setCash(state, 'p1', 0);
    state.debts = [{ debtorId: 'p1', creditorId: null, amount: 20_000, source: 'tax', toPot: false }];
    state.phase = 'debtSettlement';
    const next = apply(state, { kind: 'declareBankruptcy', playerId: 'p1' });
    expect(playerOf(next, 'p1').bankrupt).toBe(true);
    expect(next.decks.kombi.order).toContain(12);
    expect(next.decks.kombi.order).toHaveLength(16);
  });
});

describe('selling a depot when the bank has no vans', () => {
  it('sells the whole development at once so the owner can still raise cash', () => {
    let state = newGame(3);
    // 32 vans out: eight streets with four vans each.
    for (const index of [6, 8, 9, 11, 13, 14, 16, 18]) state = give(state, index, 'p2', { vans: 4 });
    state = give(give(state, 1, 'p1', { depot: true }), 3, 'p1', { depot: true });
    state = setCash(state, 'p1', 0);
    state = structuredClone(state);
    state.debts = [{ debtorId: 'p1', creditorId: null, amount: 10_000, source: 'tax', toPot: false }];
    state.phase = 'debtSettlement';

    const { state: next, events } = run(state, { kind: 'sellBuilding', playerId: 'p1', tileIndex: 1 });
    expect(eventsOf(events, 'buildingSold')).toHaveLength(1);
    expect(next.tiles[1]).toMatchObject({ depot: false, vans: 0 });
    // Five half-price units: the depot plus the four vans it stood for.
    expect(cashOf(next, 'p1')).toBe(12_500);
    const settled = apply(next, { kind: 'settleDebt', playerId: 'p1' });
    expect(settled.debts).toHaveLength(0);
  });

  it('still hands back four vans when the bank has them', () => {
    const state = give(give(newGame(), 1, 'p1', { depot: true }), 3, 'p1', { depot: true });
    const next = apply(state, { kind: 'sellBuilding', playerId: 'p1', tileIndex: 1 });
    expect(next.tiles[1]).toMatchObject({ depot: false, vans: 4 });
    expect(cashOf(next, 'p1')).toBe(152_500);
  });
});
