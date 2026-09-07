import { describe, expect, it } from 'vitest';
import { apply, cashOf, eventsOf, give, newGame, playerOf, run, setCash, setPosition, withRoll } from './helpers.js';

describe('debt settlement', () => {
  it('holds play while a debtor raises the money', () => {
    let state = give(newGame(), 39, 'p2', { depot: true });
    state = setCash(setPosition(state, 'p1', 33), 'p1', 1_000);
    state = give(state, 1, 'p1');
    const { state: next, events } = run(withRoll(state, 2, 4), { kind: 'rollDice', playerId: 'p1' });
    expect(eventsOf(events, 'debtRaised')[0]).toMatchObject({ debtorId: 'p1', creditorId: 'p2', amount: 200_000 });
    expect(next.phase).toBe('debtSettlement');
    expect(next.debts).toHaveLength(1);
  });

  it('settles once the debtor holds enough cash', () => {
    let state = give(newGame(), 6, 'p2');
    state = setCash(setPosition(state, 'p1', 0), 'p1', 100);
    state = apply(withRoll(state, 2, 4), { kind: 'rollDice', playerId: 'p1' });
    expect(state.phase).toBe('debtSettlement');
    state = setCash(state, 'p1', 5_000);
    const { state: next, events } = run(state, { kind: 'settleDebt', playerId: 'p1' });
    expect(eventsOf(events, 'debtSettled')[0]?.amount).toBe(600);
    expect(cashOf(next, 'p1')).toBe(4_400);
    expect(cashOf(next, 'p2')).toBe(150_600);
    expect(next.phase).toBe('awaitingEndTurn');
  });

  it('refuses a bankruptcy the debtor could still trade out of', () => {
    let state = give(newGame(), 6, 'p2');
    state = setCash(setPosition(state, 'p1', 0), 'p1', 100);
    state = give(state, 39, 'p1');
    state = apply(withRoll(state, 2, 4), { kind: 'rollDice', playerId: 'p1' });
    const { events } = run(state, { kind: 'declareBankruptcy', playerId: 'p1' });
    expect(events[0]).toMatchObject({ kind: 'illegalAction' });
  });
});

describe('bankruptcy owed to another operator', () => {
  it('hands the estate to the creditor and ends a two-hander', () => {
    let state = give(newGame(), 39, 'p2', { depot: true });
    state = setCash(setPosition(state, 'p1', 33), 'p1', 1_000);
    state = apply(withRoll(state, 2, 4), { kind: 'rollDice', playerId: 'p1' });
    const creditorBefore = cashOf(state, 'p2');
    const { state: next, events } = run(state, { kind: 'declareBankruptcy', playerId: 'p1' });
    expect(eventsOf(events, 'bankrupt')[0]).toMatchObject({ playerId: 'p1', creditorId: 'p2' });
    expect(cashOf(next, 'p2')).toBe(creditorBefore + 1_000);
    expect(playerOf(next, 'p1').bankrupt).toBe(true);
    expect(next.phase).toBe('gameOver');
    expect(next.winnerId).toBe('p2');
  });

  it('transfers deeds and charges the creditor ten percent on mortgaged ones', () => {
    let state = newGame(3);
    state = give(state, 39, 'p2', { depot: true });
    state = give(state, 1, 'p1', { mortgaged: true });
    state = setCash(setPosition(state, 'p1', 33), 'p1', 0);
    state = apply(withRoll(state, 2, 4), { kind: 'rollDice', playerId: 'p1' });
    const creditorBefore = cashOf(state, 'p2');
    const next = apply(state, { kind: 'declareBankruptcy', playerId: 'p1' });
    expect(next.tiles[1]?.ownerId).toBe('p2');
    expect(next.tiles[1]?.mortgaged).toBe(true);
    // Ferreirasdorp mortgages for R3,000, so the transfer fee is R300.
    expect(cashOf(next, 'p2')).toBe(creditorBefore - 300);
    expect(next.phase).not.toBe('gameOver');
  });

  it('sells the estate buildings back at half and passes the proceeds on', () => {
    let state = newGame(3);
    state = give(state, 39, 'p2', { depot: true });
    state = give(state, 1, 'p1', { vans: 1 });
    state = give(state, 3, 'p1');
    state = setCash(setPosition(state, 'p1', 33), 'p1', 0);
    state = apply(withRoll(state, 2, 4), { kind: 'rollDice', playerId: 'p1' });
    const creditorBefore = cashOf(state, 'p2');
    const next = apply(state, { kind: 'declareBankruptcy', playerId: 'p1' });
    expect(next.tiles[1]?.vans).toBe(0);
    expect(cashOf(next, 'p2')).toBe(creditorBefore + 2_500);
  });
});

describe('bankruptcy owed to the bank', () => {
  it('auctions every deed to the operators still standing', () => {
    let state = newGame(3);
    state = give(state, 1, 'p1');
    state = setCash(setPosition(state, 'p1', 0), 'p1', 500);
    state = apply(withRoll(state, 1, 3), { kind: 'rollDice', playerId: 'p1' });
    expect(state.phase).toBe('awaitingTaxChoice');
    state = apply(state, { kind: 'chooseTaxOption', playerId: 'p1', option: 'flat' });
    expect(state.debts[0]).toMatchObject({ creditorId: null, amount: 20_000 });

    const { state: next, events } = run(state, { kind: 'declareBankruptcy', playerId: 'p1' });
    expect(eventsOf(events, 'bankrupt')[0]?.creditorId).toBeNull();
    expect(eventsOf(events, 'auctionStarted')[0]).toMatchObject({ tileIndex: 1, reason: 'bankruptcy' });
    expect(next.phase).toBe('auction');
    expect(next.auction?.activeIds).toEqual(['p2', 'p3']);
    expect(next.tiles[1]?.ownerId).toBeNull();

    let after = apply(next, { kind: 'placeBid', playerId: 'p2', amount: 500 });
    after = apply(after, { kind: 'passBid', playerId: 'p3' });
    expect(after.tiles[1]?.ownerId).toBe('p2');
    expect(after.phase).toBe('awaitingRoll');
    expect(after.players[after.currentPlayerIndex]?.id).toBe('p2');
  });

  it('absorbs the estate cash into the bank', () => {
    let state = newGame(3);
    state = setCash(setPosition(state, 'p1', 0), 'p1', 500);
    state = apply(withRoll(state, 1, 3), { kind: 'rollDice', playerId: 'p1' });
    state = apply(state, { kind: 'chooseTaxOption', playerId: 'p1', option: 'flat' });
    const next = apply(state, { kind: 'declareBankruptcy', playerId: 'p1' });
    expect(cashOf(next, 'p1')).toBe(0);
    expect(cashOf(next, 'p2')).toBe(150_000);
    expect(cashOf(next, 'p3')).toBe(150_000);
  });
});
