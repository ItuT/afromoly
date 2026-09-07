import { describe, expect, it } from 'vitest';
import { apply, cashOf, eventsOf, give, newGame, run, setCash, setPosition, withRoll } from './helpers.js';
import type { GameState } from '../types.js';

/** Bring p1 to Diepkloof (space 6, R10,000) with the purchase on offer. */
function offered(count = 2): GameState {
  const state = withRoll(setPosition(newGame(count), 'p1', 0), 2, 4);
  return apply(state, { kind: 'rollDice', playerId: 'p1' });
}

describe('the public auction rule', () => {
  it('offers the tile at its printed price first', () => {
    const state = offered();
    expect(state.phase).toBe('awaitingBuyDecision');
    expect(state.pendingBuy).toBe(6);
    const bought = apply(state, { kind: 'buyProperty', playerId: 'p1' });
    expect(bought.tiles[6]?.ownerId).toBe('p1');
    expect(cashOf(bought, 'p1')).toBe(140_000);
  });

  it('opens an auction the moment the price is declined', () => {
    const { state, events } = run(offered(), { kind: 'declineAndAuction', playerId: 'p1' });
    expect(eventsOf(events, 'auctionStarted')[0]).toMatchObject({ tileIndex: 6, reason: 'declined' });
    expect(state.phase).toBe('auction');
    expect(state.auction?.activeIds).toEqual(['p1', 'p2']);
  });

  it('holds bidding to a R500 floor', () => {
    const state = apply(offered(), { kind: 'declineAndAuction', playerId: 'p1' });
    const low = run(state, { kind: 'placeBid', playerId: 'p1', amount: 400 });
    expect(low.events[0]).toMatchObject({ kind: 'illegalAction' });
    const ok = apply(state, { kind: 'placeBid', playerId: 'p1', amount: 500 });
    expect(ok.auction?.currentBid).toBe(500);
    expect(ok.auction?.highBidderId).toBe('p1');
  });

  it('lets the operator who declined still win the lot', () => {
    let state = apply(offered(), { kind: 'declineAndAuction', playerId: 'p1' });
    state = apply(state, { kind: 'placeBid', playerId: 'p1', amount: 500 });
    const { state: next, events } = run(state, { kind: 'passBid', playerId: 'p2' });
    expect(eventsOf(events, 'auctionWon')[0]).toMatchObject({ playerId: 'p1', tileIndex: 6, amount: 500 });
    expect(next.tiles[6]?.ownerId).toBe('p1');
    expect(cashOf(next, 'p1')).toBe(149_500);
    expect(next.phase).toBe('awaitingEndTurn');
  });

  it('awards the lot to the highest cash bidder', () => {
    let state = apply(offered(), { kind: 'declineAndAuction', playerId: 'p1' });
    state = apply(state, { kind: 'placeBid', playerId: 'p1', amount: 500 });
    state = apply(state, { kind: 'placeBid', playerId: 'p2', amount: 3_000 });
    const { state: next, events } = run(state, { kind: 'passBid', playerId: 'p1' });
    expect(eventsOf(events, 'auctionWon')[0]).toMatchObject({ playerId: 'p2', amount: 3_000 });
    expect(next.tiles[6]?.ownerId).toBe('p2');
    expect(cashOf(next, 'p2')).toBe(147_000);
  });

  it('leaves the tile with the bank when every operator passes', () => {
    let state = apply(offered(), { kind: 'declineAndAuction', playerId: 'p1' });
    state = apply(state, { kind: 'passBid', playerId: 'p1' });
    const { state: next, events } = run(state, { kind: 'passBid', playerId: 'p2' });
    expect(eventsOf(events, 'auctionUnsold')[0]?.tileIndex).toBe(6);
    expect(next.tiles[6]?.ownerId).toBeNull();
    expect(next.phase).toBe('awaitingEndTurn');
  });

  it('refuses a bid larger than the bidder holds', () => {
    const state = setCash(apply(offered(), { kind: 'declineAndAuction', playerId: 'p1' }), 'p1', 600);
    const { events } = run(state, { kind: 'placeBid', playerId: 'p1', amount: 5_000 });
    expect(events[0]).toMatchObject({ kind: 'illegalAction' });
  });

  it('refuses a bid out of turn', () => {
    const state = apply(offered(), { kind: 'declineAndAuction', playerId: 'p1' });
    const { events } = run(state, { kind: 'placeBid', playerId: 'p2', amount: 500 });
    expect(events[0]).toMatchObject({ kind: 'illegalAction', reason: 'Not your bid' });
  });

  it('sends a declined purchase to auction even when the buyer could afford it', () => {
    const state = give(offered(), 9, 'p1');
    expect(state.pendingBuy).toBe(6);
    const next = apply(state, { kind: 'declineAndAuction', playerId: 'p1' });
    expect(next.auction?.tileIndex).toBe(6);
  });
});
