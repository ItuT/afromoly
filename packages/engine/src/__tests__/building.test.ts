import { describe, expect, it } from 'vitest';
import { apply, cashOf, give, newGame, run, setCash } from './helpers.js';
import { depotsOwned, vansOwned } from '../selectors.js';
import type { GameState } from '../types.js';

const BROWN = [1, 3];
const BUILD = 5_000;

function withBrownSet(options = {}): GameState {
  let state = newGame(2, options);
  for (const i of BROWN) state = give(state, i, 'p1');
  return state;
}

function build(state: GameState, tileIndex: number): GameState {
  return apply(state, { kind: 'buyBuilding', playerId: 'p1', tileIndex });
}

describe('fleet development', () => {
  it('refuses to build without the whole colour set', () => {
    const state = give(newGame(), 1, 'p1');
    const { events } = run(state, { kind: 'buyBuilding', playerId: 'p1', tileIndex: 1 });
    expect(events[0]).toMatchObject({ kind: 'illegalAction' });
  });

  it('charges the deed build cost per Quantum van', () => {
    const state = withBrownSet();
    const before = cashOf(state, 'p1');
    const next = build(state, 1);
    expect(next.tiles[1]?.vans).toBe(1);
    expect(cashOf(next, 'p1')).toBe(before - BUILD);
  });

  it('enforces the even-build rule going up', () => {
    let state = build(withBrownSet(), 1);
    const { events } = run(state, { kind: 'buyBuilding', playerId: 'p1', tileIndex: 1 });
    expect(events[0]).toMatchObject({ kind: 'illegalAction' });
    state = build(state, 3);
    expect(state.tiles.map((t) => t.vans).filter(Boolean)).toEqual([1, 1]);
    state = build(state, 1);
    expect(state.tiles[1]?.vans).toBe(2);
  });

  it('enforces the even-build rule going down', () => {
    let state = withBrownSet();
    state = build(build(state, 1), 3);
    state = build(state, 1);
    const bad = run(state, { kind: 'sellBuilding', playerId: 'p1', tileIndex: 3 });
    expect(bad.events[0]).toMatchObject({ kind: 'illegalAction' });
    const good = apply(state, { kind: 'sellBuilding', playerId: 'p1', tileIndex: 1 });
    expect(good.tiles[1]?.vans).toBe(1);
  });

  it('trades four vans for a Terminal Depot at the same unit price', () => {
    let state = withBrownSet();
    for (let round = 0; round < 4; round++) for (const i of BROWN) state = build(state, i);
    expect(vansOwned(state)).toBe(8);
    const before = cashOf(state, 'p1');
    state = build(state, 1);
    expect(state.tiles[1]).toMatchObject({ depot: true, vans: 0 });
    expect(cashOf(state, 'p1')).toBe(before - BUILD);
    expect(vansOwned(state)).toBe(4);
    expect(depotsOwned(state)).toBe(1);
  });

  it('sells a van back to the bank at half price', () => {
    const state = build(withBrownSet(), 1);
    const before = cashOf(state, 'p1');
    const next = apply(state, { kind: 'sellBuilding', playerId: 'p1', tileIndex: 1 });
    expect(cashOf(next, 'p1')).toBe(before + BUILD / 2);
    expect(next.tiles[1]?.vans).toBe(0);
  });

  it('sells a depot back as four vans plus half the depot fee', () => {
    let state = withBrownSet();
    for (let round = 0; round < 4; round++) for (const i of BROWN) state = build(state, i);
    state = build(state, 1);
    const before = cashOf(state, 'p1');
    const next = apply(state, { kind: 'sellBuilding', playerId: 'p1', tileIndex: 1 });
    expect(next.tiles[1]).toMatchObject({ depot: false, vans: 4 });
    expect(cashOf(next, 'p1')).toBe(before + BUILD / 2);
  });

  it('stops when the bank runs out of Quantum vans', () => {
    let state = withBrownSet({ maxVans: 2 });
    state = build(build(state, 1), 3);
    const { events } = run(state, { kind: 'buyBuilding', playerId: 'p1', tileIndex: 1 });
    expect(events[0]).toMatchObject({ kind: 'illegalAction', reason: expect.stringContaining('vans') });
  });

  it('stops when the bank runs out of Terminal Depots', () => {
    let state = withBrownSet({ maxDepots: 0 });
    for (let round = 0; round < 4; round++) for (const i of BROWN) state = build(state, i);
    const { events } = run(state, { kind: 'buyBuilding', playerId: 'p1', tileIndex: 1 });
    expect(events[0]).toMatchObject({ kind: 'illegalAction', reason: expect.stringContaining('Depot') });
  });

  it('refuses to build while any street in the set is mortgaged', () => {
    let state = withBrownSet();
    state = apply(state, { kind: 'mortgage', playerId: 'p1', tileIndex: 3 });
    const { events } = run(state, { kind: 'buyBuilding', playerId: 'p1', tileIndex: 1 });
    expect(events[0]).toMatchObject({ kind: 'illegalAction' });
  });

  it('refuses to build without the cash', () => {
    const state = setCash(withBrownSet(), 'p1', 100);
    const { events } = run(state, { kind: 'buyBuilding', playerId: 'p1', tileIndex: 1 });
    expect(events[0]).toMatchObject({ kind: 'illegalAction', reason: 'Not enough cash' });
  });
});

describe('mortgages', () => {
  it('pays half the purchase price and stops the rent', () => {
    const state = give(newGame(), 39, 'p1');
    const before = cashOf(state, 'p1');
    const next = apply(state, { kind: 'mortgage', playerId: 'p1', tileIndex: 39 });
    expect(cashOf(next, 'p1')).toBe(before + 20_000);
    expect(next.tiles[39]?.mortgaged).toBe(true);
  });

  it('charges the mortgage plus ten percent to lift it', () => {
    let state = give(newGame(), 39, 'p1');
    state = apply(state, { kind: 'mortgage', playerId: 'p1', tileIndex: 39 });
    const before = cashOf(state, 'p1');
    const next = apply(state, { kind: 'unmortgage', playerId: 'p1', tileIndex: 39 });
    expect(cashOf(next, 'p1')).toBe(before - 22_000);
    expect(next.tiles[39]?.mortgaged).toBe(false);
  });

  it('rounds the ten percent surcharge up on an odd mortgage value', () => {
    // Alice Lane mortgages for R17,500, so the fee is R1,750 exactly.
    let state = give(newGame(), 37, 'p1');
    state = apply(state, { kind: 'mortgage', playerId: 'p1', tileIndex: 37 });
    const before = cashOf(state, 'p1');
    const next = apply(state, { kind: 'unmortgage', playerId: 'p1', tileIndex: 37 });
    expect(cashOf(next, 'p1')).toBe(before - 19_250);
  });

  it('refuses to mortgage a developed street', () => {
    let state = give(give(newGame(), 1, 'p1'), 3, 'p1');
    state = build(state, 1);
    const { events } = run(state, { kind: 'mortgage', playerId: 'p1', tileIndex: 1 });
    expect(events[0]).toMatchObject({ kind: 'illegalAction' });
  });
});
