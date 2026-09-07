import { describe, expect, it } from 'vitest';
import {
  apply, cashOf, eventsOf, giveTurn, landOnCard, newGame, run, setPosition, withRoll,
} from './helpers.js';

/** Land p1 on a chosen space with a plain roll of five. */
function landOn(space: number, count = 2, options = {}) {
  const state = setPosition(newGame(count, options), 'p1', (space - 5 + 40) % 40);
  return run(withRoll(state, 2, 3), { kind: 'rollDice', playerId: 'p1' });
}

describe('the Taxi Rank Queue jackpot', () => {
  it('feeds card penalties into the centre pot', () => {
    const { state, events } = landOnCard(newGame(), 'p1', 'kombi', 15);
    expect(eventsOf(events, 'potChanged')[0]).toMatchObject({ delta: 1_000, total: 1_000 });
    expect(state.pot).toBe(1_000);
  });

  it('feeds the e-toll gantry into the pot', () => {
    const { state } = landOn(38);
    expect(state.pot).toBe(10_000);
    expect(cashOf(state, 'p1')).toBe(140_000);
  });

  it('sends the SARS Road Tax to the bank, not the pot', () => {
    let state = landOn(4).state;
    expect(state.phase).toBe('awaitingTaxChoice');
    state = apply(state, { kind: 'chooseTaxOption', playerId: 'p1', option: 'flat' });
    expect(state.pot).toBe(0);
    // Reaching space 4 from space 39 passes Start, so the salary offsets the levy.
    expect(cashOf(state, 'p1')).toBe(150_000);
  });

  it('pays the accumulated pot to the first operator to rest at the rank', () => {
    let state = landOn(38).state;
    expect(state.pot).toBe(10_000);
    state = setPosition(giveTurn(state, 'p1'), 'p1', 15);
    const { state: next, events } = run(withRoll(state, 2, 3), { kind: 'rollDice', playerId: 'p1' });
    expect(eventsOf(events, 'potCollected')[0]).toMatchObject({ amount: 10_000, seeded: false });
    expect(next.pot).toBe(0);
    expect(cashOf(next, 'p1')).toBe(150_000);
  });

  it('has the bank seed an empty pot with R5,000', () => {
    const { state, events } = landOn(20);
    expect(eventsOf(events, 'potCollected')[0]).toMatchObject({ amount: 5_000, seeded: true });
    expect(cashOf(state, 'p1')).toBe(155_000);
    expect(state.pot).toBe(0);
  });

  it('leaves the rank quiet when the house rule is switched off', () => {
    const tolled = landOn(38, 2, { jackpot: false });
    expect(tolled.state.pot).toBe(0);
    expect(cashOf(tolled.state, 'p1')).toBe(140_000);
    const rested = landOn(20, 2, { jackpot: false });
    expect(eventsOf(rested.events, 'potCollected')).toHaveLength(0);
    expect(cashOf(rested.state, 'p1')).toBe(150_000);
  });
});
