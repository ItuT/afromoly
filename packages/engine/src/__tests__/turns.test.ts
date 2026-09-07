import { describe, expect, it } from 'vitest';
import {
  apply, cashOf, detain, eventsOf, give, giveTurn, newGame, playerOf, run, setPosition, withRoll,
} from './helpers.js';

describe('movement and the Month-End Payday salary', () => {
  it('moves the token by the dice total', () => {
    const state = withRoll(newGame(), 3, 4);
    const { state: next, events } = run(state, { kind: 'rollDice', playerId: 'p1' });
    expect(eventsOf(events, 'diceRolled')[0]?.dice).toEqual([3, 4]);
    expect(playerOf(next, 'p1').position).toBe(7);
  });

  it('pays R20,000 for passing Start, per rulebook 4A', () => {
    const state = withRoll(setPosition(newGame(), 'p1', 37), 3, 4);
    const before = cashOf(state, 'p1');
    const next = apply(state, { kind: 'rollDice', playerId: 'p1' });
    expect(playerOf(next, 'p1').position).toBe(4);
    expect(cashOf(next, 'p1')).toBeGreaterThanOrEqual(before + 20_000);
  });

  it('pays the salary for landing exactly on Start', () => {
    const state = withRoll(setPosition(newGame(), 'p1', 33), 3, 4);
    const { state: next, events } = run(state, { kind: 'rollDice', playerId: 'p1' });
    expect(playerOf(next, 'p1').position).toBe(0);
    expect(eventsOf(events, 'salaryPaid')).toHaveLength(1);
  });

  it('does not pay the salary for moving backwards past Start', () => {
    // Stack "Short Left, After Robot!" on top, then land on Kombi Hustle at 2.
    const base = newGame();
    const stacked = {
      ...base,
      decks: { ...base.decks, kombi: { order: [5, ...base.decks.kombi.order.filter((id) => id !== 5)] } },
    };
    const { state: next, events } = run(withRoll(stacked, 1, 1), { kind: 'rollDice', playerId: 'p1' });
    expect(eventsOf(events, 'cardDrawn')[0]?.cardId).toBe(5);
    expect(playerOf(next, 'p1').position).toBe(39);
    expect(eventsOf(events, 'salaryPaid')).toHaveLength(0);
  });
});

describe('doubles', () => {
  it('hands the same operator another roll immediately', () => {
    const state = give(withRoll(newGame(), 3, 3), 6, 'p1');
    const next = apply(state, { kind: 'rollDice', playerId: 'p1' });
    expect(next.phase).toBe('awaitingRoll');
    expect(next.players[next.currentPlayerIndex]?.id).toBe('p1');
    expect(run(next, { kind: 'endTurn', playerId: 'p1' }).events[0]?.kind).toBe('illegalAction');
  });

  it('sends the driver to the impound lot on a third consecutive double', () => {
    let state = give(give(newGame(), 6, 'p1'), 12, 'p1');
    state = apply(withRoll(state, 3, 3), { kind: 'rollDice', playerId: 'p1' });
    expect(playerOf(state, 'p1').position).toBe(6);
    state = apply(withRoll(state, 3, 3), { kind: 'rollDice', playerId: 'p1' });
    expect(playerOf(state, 'p1').position).toBe(12);
    expect(state.doublesCount).toBe(2);
    const { state: next, events } = run(withRoll(state, 5, 5), { kind: 'rollDice', playerId: 'p1' });
    expect(eventsOf(events, 'sentToImpound')[0]?.reason).toBe('threeDoubles');
    expect(playerOf(next, 'p1').position).toBe(10);
    expect(eventsOf(events, 'moved')).toHaveLength(0);
    expect(playerOf(next, 'p1').inImpound).toBe(true);
  });

  it('passes play to the next operator on a plain roll', () => {
    let state = withRoll(newGame(), 2, 5);
    state = apply(state, { kind: 'rollDice', playerId: 'p1' });
    state = apply(state, { kind: 'endTurn', playerId: 'p1' });
    expect(state.players[state.currentPlayerIndex]?.id).toBe('p2');
    expect(state.phase).toBe('awaitingRoll');
  });
});

describe('the JMPD Impound Lot', () => {
  const detained = () => detain(newGame(), 'p1');

  it('treats space 10 reached by an ordinary roll as just visiting', () => {
    const state = withRoll(setPosition(newGame(), 'p1', 3), 3, 4);
    const next = apply(state, { kind: 'rollDice', playerId: 'p1' });
    expect(playerOf(next, 'p1').position).toBe(10);
    expect(playerOf(next, 'p1').inImpound).toBe(false);
  });

  it('detains the driver who lands on Go to Impound Lot and ends their turn', () => {
    const state = withRoll(setPosition(newGame(), 'p1', 24), 2, 4);
    const next = apply(state, { kind: 'rollDice', playerId: 'p1' });
    expect(playerOf(next, 'p1').position).toBe(10);
    expect(playerOf(next, 'p1').inImpound).toBe(true);
    expect(next.phase).toBe('awaitingEndTurn');
    expect(next.turnResumePhase).toBe('awaitingEndTurn');
  });

  it('releases on a paid spot fine of R5,000', () => {
    const state = detained();
    const before = cashOf(state, 'p1');
    const { state: next, events } = run(state, { kind: 'payImpoundFine', playerId: 'p1' });
    expect(eventsOf(events, 'impoundExit')[0]?.via).toBe('fine');
    expect(cashOf(next, 'p1')).toBe(before - 5_000);
    expect(playerOf(next, 'p1').inImpound).toBe(false);
  });

  it('releases on a Get Out of Impound card and returns it to its deck', () => {
    const state = structuredClone(detained());
    const p1 = state.players.find((p) => p.id === 'p1');
    p1?.getOutCards.push({ deck: 'kombi', cardId: 12 });
    const before = state.decks.kombi.order.length;
    const { state: next, events } = run(state, { kind: 'useImpoundCard', playerId: 'p1' });
    expect(eventsOf(events, 'impoundExit')[0]?.via).toBe('card');
    expect(playerOf(next, 'p1').inImpound).toBe(false);
    expect(next.decks.kombi.order.length).toBe(before + 1);
    expect(playerOf(next, 'p1').getOutCards).toHaveLength(0);
  });

  it('releases on doubles and moves the rolled distance without a bonus turn', () => {
    const state = withRoll(detained(), 4, 4);
    const { state: next, events } = run(state, { kind: 'rollDice', playerId: 'p1' });
    expect(eventsOf(events, 'impoundExit')[0]?.via).toBe('doubles');
    expect(playerOf(next, 'p1').position).toBe(18);
    expect(next.turnResumePhase).toBe('awaitingEndTurn');
  });

  it('counts three failed attempts then charges the fine and moves', () => {
    // Yeoville is handed to the driver so the landing tile resolves to nothing.
    let state = give(detained(), 16, 'p1');
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = run(withRoll(state, 2, 5), { kind: 'rollDice', playerId: 'p1' });
      state = result.state;
      expect(eventsOf(result.events, 'impoundAttemptFailed')[0]?.attempts).toBe(attempt);
      expect(playerOf(state, 'p1').position).toBe(10);
      expect(state.phase).toBe('awaitingEndTurn');
      state = giveTurn(state, 'p1');
    }
    const before = cashOf(state, 'p1');
    const { state: next, events } = run(withRoll(state, 2, 4), { kind: 'rollDice', playerId: 'p1' });
    expect(eventsOf(events, 'impoundExit')[0]?.via).toBe('forcedFine');
    expect(cashOf(next, 'p1')).toBe(before - 5_000);
    expect(playerOf(next, 'p1').position).toBe(16);
    expect(playerOf(next, 'p1').inImpound).toBe(false);
  });

  it('lets a detained operator still collect rent', () => {
    let state = give(detained(), 6, 'p1');
    state = apply(withRoll(state, 2, 5), { kind: 'rollDice', playerId: 'p1' });
    state = apply(state, { kind: 'endTurn', playerId: 'p1' });
    const before = cashOf(state, 'p1');
    state = apply(withRoll(setPosition(state, 'p2', 0), 3, 3), { kind: 'rollDice', playerId: 'p2' });
    expect(cashOf(state, 'p1')).toBe(before + 600);
  });
});
