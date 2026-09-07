import { describe, expect, it } from 'vitest';
import { BOARD, HUB_INDEXES, UTILITY_INDEXES, streetsInGroup } from '../board.js';
import { rentFor } from '../selectors.js';
import { give, newGame } from './helpers.js';
import type { StreetTile } from '../types.js';

const streets = BOARD.filter((t): t is StreetTile => t.kind === 'street');

describe('street rent', () => {
  it('charges the base site rent when the owner lacks the set', () => {
    for (const tile of streets) {
      const state = give(newGame(), tile.index, 'p2');
      expect([tile.name, rentFor(state, tile.index, 7).amount]).toEqual([tile.name, tile.rent[0]]);
    }
  });

  it('doubles the base rent on a complete undeveloped set', () => {
    for (const group of ['brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'darkblue'] as const) {
      let state = newGame();
      for (const s of streetsInGroup(group)) state = give(state, s.index, 'p2');
      for (const s of streetsInGroup(group)) {
        const r = rentFor(state, s.index, 7);
        expect([s.name, r.amount, r.doubled]).toEqual([s.name, s.rent[0] * 2, true]);
      }
    }
  });

  it('walks every van level and the depot for all twenty-two streets', () => {
    for (const tile of streets) {
      for (let vans = 1; vans <= 4; vans++) {
        const state = give(newGame(), tile.index, 'p2', { vans });
        expect([tile.name, vans, rentFor(state, tile.index, 7).amount])
          .toEqual([tile.name, vans, tile.rent[vans]]);
      }
      const withDepot = give(newGame(), tile.index, 'p2', { depot: true });
      expect([tile.name, rentFor(withDepot, tile.index, 7).amount])
        .toEqual([tile.name, tile.rent[5]]);
    }
  });

  it('collects nothing on a mortgaged street', () => {
    const state = give(newGame(), 39, 'p2', { mortgaged: true });
    expect(rentFor(state, 39, 7)).toEqual({ amount: 0, doubled: false, waived: 'mortgaged' });
  });

  it('doubles again for the City Watch summit card', () => {
    const state = give(newGame(), 39, 'p2');
    expect(rentFor(state, 39, 7, true).amount).toBe(10_000);
  });

  it('charges nothing on an unowned street', () => {
    expect(rentFor(newGame(), 39, 7).amount).toBe(0);
  });
});

describe('transit hub rent', () => {
  it.each([
    [1, 2_500],
    [2, 5_000],
    [3, 10_000],
    [4, 20_000],
  ])('pays R%i-hub docking of %i', (owned, expected) => {
    let state = newGame();
    for (let i = 0; i < owned; i++) {
      const index = HUB_INDEXES[i];
      if (index !== undefined) state = give(state, index, 'p2');
    }
    const landed = HUB_INDEXES[0];
    expect(rentFor(state, landed as number, 7).amount).toBe(expected);
  });

  it('waives rent on a mortgaged hub', () => {
    let state = give(newGame(), 5, 'p2', { mortgaged: true });
    state = give(state, 15, 'p2');
    expect(rentFor(state, 5, 7).waived).toBe('mortgaged');
    expect(rentFor(state, 15, 7).amount).toBe(5_000);
  });
});

describe('municipal utility rent', () => {
  it('charges four hundred times the roll with one utility', () => {
    const state = give(newGame(), 12, 'p2');
    expect(rentFor(state, 12, 8).amount).toBe(3_200);
  });

  it('charges a thousand times the roll with both', () => {
    let state = give(newGame(), 12, 'p2');
    state = give(state, 28, 'p2');
    expect(rentFor(state, 28, 8).amount).toBe(8_000);
    expect(rentFor(state, 12, 3).amount).toBe(3_000);
  });

  it('collects nothing while the substation is out', () => {
    const base = give(newGame(), 12, 'p2');
    const state = { ...base, utilitiesSuspendedUntilTurn: base.turnNumber + 2 };
    expect(rentFor(state, 12, 8).waived).toBe('utilitiesSuspended');
    const later = { ...state, turnNumber: base.turnNumber + 2 };
    expect(rentFor(later, 12, 8).amount).toBe(3_200);
  });

  it('leaves both utility tiles at the same price', () => {
    for (const i of UTILITY_INDEXES) {
      const tile = BOARD[i];
      expect(tile && 'price' in tile ? tile.price : 0).toBe(15_000);
    }
  });
});
