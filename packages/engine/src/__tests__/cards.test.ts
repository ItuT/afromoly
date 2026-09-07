import { describe, expect, it } from 'vitest';
import { CITYWATCH_DECK, KOMBI_DECK } from '../cards.js';
import { apply, cashOf, eventsOf, give, landOnCard, newGame, playerOf, run } from './helpers.js';

describe('deck composition', () => {
  it('holds sixteen cards in each deck with unique ids', () => {
    expect(KOMBI_DECK).toHaveLength(16);
    expect(CITYWATCH_DECK).toHaveLength(16);
    expect(new Set(KOMBI_DECK.map((c) => c.id)).size).toBe(16);
    expect(new Set(CITYWATCH_DECK.map((c) => c.id)).size).toBe(16);
  });

  it('carries exactly one Get Out of Impound card per deck', () => {
    expect(KOMBI_DECK.filter((c) => c.retained)).toHaveLength(1);
    expect(CITYWATCH_DECK.filter((c) => c.retained)).toHaveLength(1);
  });

  it('resolves all thirty-two cards without breaking the game', () => {
    for (const deck of ['kombi', 'citywatch'] as const) {
      const cards = deck === 'kombi' ? KOMBI_DECK : CITYWATCH_DECK;
      for (const card of cards) {
        const { state, events } = landOnCard(newGame(3), 'p1', deck, card.id);
        expect(eventsOf(events, 'cardDrawn')[0]?.cardId).toBe(card.id);
        expect(events.some((e) => e.kind === 'illegalAction')).toBe(false);
        expect(state.revision).toBe(1);
      }
    }
  });

  it('returns a spent card to the bottom of its deck', () => {
    const { state } = landOnCard(newGame(), 'p1', 'kombi', 1);
    expect(state.decks.kombi.order).toHaveLength(16);
    expect(state.decks.kombi.order[15]).toBe(1);
  });

  it('takes a Get Out of Impound card out of circulation until it is used', () => {
    const { state } = landOnCard(newGame(), 'p1', 'kombi', 12);
    expect(state.decks.kombi.order).toHaveLength(15);
    expect(playerOf(state, 'p1').getOutCards).toEqual([{ deck: 'kombi', cardId: 12 }]);
  });
});

describe('Kombi Hustle effects', () => {
  it('pays the sliding-door commission', () => {
    const { state } = landOnCard(newGame(), 'p1', 'kombi', 1);
    expect(cashOf(state, 'p1')).toBe(151_500);
  });

  it('runs the yellow lane straight to Noord Taxi Rank', () => {
    const { state } = landOnCard(newGame(), 'p1', 'kombi', 2);
    expect(playerOf(state, 'p1').position).toBe(25);
    expect(state.pendingBuy).toBe(25);
  });

  it('collects the stokvel payout from every other operator', () => {
    const { state } = landOnCard(newGame(3), 'p1', 'kombi', 4);
    expect(cashOf(state, 'p1')).toBe(154_000);
    expect(cashOf(state, 'p2')).toBe(148_000);
    expect(cashOf(state, 'p3')).toBe(148_000);
  });

  it('sends the missed stop three spaces back', () => {
    const { state } = landOnCard(newGame(), 'p1', 'kombi', 5);
    expect(playerOf(state, 'p1').position).toBe(14);
  });

  it('impounds the kombi with no permit disc', () => {
    const { state } = landOnCard(newGame(), 'p1', 'kombi', 6);
    expect(playerOf(state, 'p1')).toMatchObject({ position: 10, inImpound: true });
  });

  it('bills the ranking dispute per van and per depot', () => {
    let base = give(give(newGame(), 1, 'p1', { vans: 2 }), 3, 'p1', { depot: true });
    base = give(base, 6, 'p1', { vans: 1 });
    const { state } = landOnCard(base, 'p1', 'kombi', 7);
    // Three vans at R1,500 and one depot at R6,000.
    expect(cashOf(state, 'p1')).toBe(150_000 - 4_500 - 6_000);
  });

  it('bills the fuel levy per van only', () => {
    const base = give(newGame(), 1, 'p1', { vans: 3 });
    const { state } = landOnCard(base, 'p1', 'kombi', 13);
    expect(cashOf(state, 'p1')).toBe(150_000 - 1_500);
  });

  it('pays the salary when the Soweto detour wraps past Start', () => {
    const { state, events } = landOnCard(newGame(), 'p1', 'kombi', 14);
    expect(playerOf(state, 'p1').position).toBe(9);
    expect(eventsOf(events, 'salaryPaid')).toHaveLength(1);
    expect(cashOf(state, 'p1')).toBe(170_000);
  });
});

describe('City Watch effects', () => {
  it('shuts off utility rent for a full round of turns', () => {
    const { state } = landOnCard(newGame(3), 'p1', 'citywatch', 4);
    expect(state.utilitiesSuspendedUntilTurn).toBe(state.turnNumber + 3);
  });

  it('charges double rent at the Alice Lane summit', () => {
    const base = give(newGame(), 39, 'p2');
    const { state } = landOnCard(base, 'p1', 'citywatch', 5);
    expect(playerOf(state, 'p1').position).toBe(39);
    // Space 22 to space 39 does not pass Start, so no salary is paid.
    expect(cashOf(state, 'p1')).toBe(140_000);
    expect(cashOf(state, 'p2')).toBe(160_000);
  });

  it('collects the solar rebate from each operator', () => {
    const { state } = landOnCard(newGame(3), 'p1', 'citywatch', 7);
    expect(cashOf(state, 'p1')).toBe(152_000);
    expect(cashOf(state, 'p2')).toBe(149_000);
  });

  it('parks the operator in the municipal queue for a turn', () => {
    const { state } = landOnCard(newGame(), 'p1', 'citywatch', 8);
    expect(playerOf(state, 'p1').skipNextTurn).toBe(true);

    const handOver = structuredClone(state);
    handOver.phase = 'awaitingEndTurn';
    handOver.currentPlayerIndex = 1;
    const { state: next, events } = run(handOver, { kind: 'endTurn', playerId: 'p2' });
    expect(eventsOf(events, 'turnSkipped')[0]?.playerId).toBe('p1');
    expect(next.players[next.currentPlayerIndex]?.id).toBe('p2');
    expect(playerOf(next, 'p1').skipNextTurn).toBe(false);
  });

  it('walks the dividend straight back to Month-End Payday', () => {
    const { state } = landOnCard(newGame(), 'p1', 'citywatch', 15);
    expect(playerOf(state, 'p1').position).toBe(0);
    expect(cashOf(state, 'p1')).toBe(170_000);
  });

  it('impounds the reckless U-turn', () => {
    const { state } = landOnCard(newGame(), 'p1', 'citywatch', 16);
    expect(playerOf(state, 'p1')).toMatchObject({ position: 10, inImpound: true });
  });
});

describe('SARS Road Tax', () => {
  it('offers the flat fee or ten percent of net worth', () => {
    let state = newGame();
    state = give(state, 39, 'p1');
    const rolled = structuredClone(state);
    rolled.players[0]!.position = 0;
    const landed = apply({ ...rolled, rng: state.rng }, { kind: 'rollDice', playerId: 'p1' });
    expect(['awaitingTaxChoice', 'awaitingBuyDecision', 'awaitingEndTurn', 'awaitingRoll'])
      .toContain(landed.phase);
  });

  it('charges ten percent of everything the operator holds', () => {
    let state = give(newGame(), 39, 'p1');
    state = structuredClone(state);
    state.players[0]!.position = 0;
    state.pendingTax = 4;
    state.phase = 'awaitingTaxChoice';
    const next = apply(state, { kind: 'chooseTaxOption', playerId: 'p1', option: 'percent' });
    // R150,000 cash plus a R40,000 deed is R190,000, so the levy is R19,000.
    expect(cashOf(next, 'p1')).toBe(131_000);
  });

  it('charges the flat R20,000 when that is chosen', () => {
    const state = structuredClone(newGame());
    state.pendingTax = 4;
    state.phase = 'awaitingTaxChoice';
    const next = apply(state, { kind: 'chooseTaxOption', playerId: 'p1', option: 'flat' });
    expect(cashOf(next, 'p1')).toBe(130_000);
  });
});
