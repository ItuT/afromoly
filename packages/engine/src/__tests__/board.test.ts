import { describe, expect, it } from 'vitest';
import { BOARD, BOARD_SIZE, HUB_INDEXES, UTILITY_INDEXES } from '../board.js';
import type { StreetTile } from '../types.js';

/**
 * Independently transcribed from the Readme's "Street Title Deeds & Rent
 * Progression" table. Deliberately re-keyed by name rather than by index so a
 * typo in board.ts fails here rather than agreeing with itself.
 *
 * [name, price, base, 1 van, 2 vans, 3 vans, 4 vans, depot, build cost, mortgage]
 */
const DEEDS: readonly [string, number, number, number, number, number, number, number, number, number][] = [
  ['Ferreirasdorp', 6_000, 200, 1_000, 3_000, 9_000, 16_000, 25_000, 5_000, 3_000],
  ['Marshalltown', 6_000, 400, 2_000, 6_000, 18_000, 32_000, 45_000, 5_000, 3_000],
  ['Diepkloof', 10_000, 600, 3_000, 9_000, 27_000, 40_000, 55_000, 5_000, 5_000],
  ['Orlando Towers', 10_000, 600, 3_000, 9_000, 27_000, 40_000, 55_000, 5_000, 5_000],
  ['Vilakazi Street', 12_000, 800, 4_000, 10_000, 30_000, 45_000, 60_000, 5_000, 6_000],
  ['Newtown Cultural Precinct', 14_000, 1_000, 5_000, 15_000, 45_000, 62_500, 75_000, 10_000, 7_000],
  ['Braamfontein (Juta St)', 14_000, 1_000, 5_000, 15_000, 45_000, 62_500, 75_000, 10_000, 7_000],
  ['Maboneng (Fox St)', 16_000, 1_200, 6_000, 18_000, 50_000, 70_000, 90_000, 10_000, 8_000],
  ['Yeoville (Rockey St)', 18_000, 1_400, 7_000, 20_000, 55_000, 75_000, 95_000, 10_000, 9_000],
  ['Hillbrow', 18_000, 1_400, 7_000, 20_000, 55_000, 75_000, 95_000, 10_000, 9_000],
  ['Jeppestown', 20_000, 1_600, 8_000, 22_000, 60_000, 80_000, 100_000, 10_000, 10_000],
  ['Melville (7th Street)', 22_000, 1_800, 9_000, 25_000, 70_000, 87_500, 105_000, 15_000, 11_000],
  ['Parkhurst (4th Avenue)', 22_000, 1_800, 9_000, 25_000, 70_000, 87_500, 105_000, 15_000, 11_000],
  ['Rosebank (Oxford Rd)', 24_000, 2_000, 10_000, 30_000, 75_000, 92_500, 110_000, 15_000, 12_000],
  ['Fourways (Winnie Mandela)', 26_000, 2_200, 11_000, 33_000, 80_000, 97_500, 115_000, 15_000, 13_000],
  ['Midrand (Allandale)', 26_000, 2_200, 11_000, 33_000, 80_000, 97_500, 115_000, 15_000, 13_000],
  ['Waterfall City', 28_000, 2_400, 12_000, 36_000, 85_000, 102_500, 120_000, 15_000, 14_000],
  ['Houghton Estate', 30_000, 2_600, 13_000, 39_000, 90_000, 110_000, 127_500, 20_000, 15_000],
  ['Saxonwold', 30_000, 2_600, 13_000, 39_000, 90_000, 110_000, 127_500, 20_000, 15_000],
  ['Hyde Park', 32_000, 2_800, 15_000, 45_000, 100_000, 120_000, 140_000, 20_000, 16_000],
  ['Alice Lane', 35_000, 3_500, 17_500, 50_000, 110_000, 130_000, 150_000, 20_000, 17_500],
  ['Sandton CBD (Rivonia Rd)', 40_000, 5_000, 20_000, 60_000, 140_000, 170_000, 200_000, 20_000, 20_000],
];

const streets = BOARD.filter((t): t is StreetTile => t.kind === 'street');

describe('board layout', () => {
  it('has forty tiles', () => {
    expect(BOARD_SIZE).toBe(40);
    BOARD.forEach((tile, i) => expect(tile.index).toBe(i));
  });

  it('holds twenty-eight title deeds: 22 streets, 4 hubs, 2 utilities', () => {
    expect(streets).toHaveLength(22);
    expect(BOARD.filter((t) => t.kind === 'hub')).toHaveLength(4);
    expect(BOARD.filter((t) => t.kind === 'utility')).toHaveLength(2);
  });

  it('places the corners, card spaces and taxes where the Readme puts them', () => {
    expect(BOARD[0]?.kind).toBe('go');
    expect(BOARD[10]?.kind).toBe('impound');
    expect(BOARD[20]?.kind).toBe('freerest');
    expect(BOARD[30]?.kind).toBe('gotoimpound');
    expect(BOARD.filter((t) => t.kind === 'card').map((t) => t.index)).toEqual([2, 7, 17, 22, 33, 36]);
    expect(BOARD.filter((t) => t.kind === 'tax').map((t) => t.index)).toEqual([4, 38]);
    expect(HUB_INDEXES).toEqual([5, 15, 25, 35]);
    expect(UTILITY_INDEXES).toEqual([12, 28]);
  });

  it('splits Kombi Hustle and City Watch across the correct spaces', () => {
    const kombi = BOARD.filter((t) => t.kind === 'card' && t.deck === 'kombi').map((t) => t.index);
    const watch = BOARD.filter((t) => t.kind === 'card' && t.deck === 'citywatch').map((t) => t.index);
    expect(kombi).toEqual([2, 17, 33]);
    expect(watch).toEqual([7, 22, 36]);
  });

  it('gives every colour group its Readme membership', () => {
    const counts = streets.reduce<Record<string, number>>((acc, s) => {
      acc[s.group] = (acc[s.group] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({
      brown: 2, lightblue: 3, pink: 3, orange: 3,
      red: 3, yellow: 3, green: 3, darkblue: 2,
    });
  });
});

describe('title deed figures', () => {
  it('matches the Readme rent table cell for cell', () => {
    expect(streets.map((s) => s.name)).toEqual(DEEDS.map((d) => d[0]));
    for (const [name, price, base, v1, v2, v3, v4, depot, build, mortgage] of DEEDS) {
      const tile = streets.find((s) => s.name === name);
      expect(tile, `missing street ${name}`).toBeDefined();
      if (!tile) continue;
      expect([tile.name, tile.price]).toEqual([name, price]);
      expect(tile.rent).toEqual([base, v1, v2, v3, v4, depot]);
      expect([name, tile.buildCost]).toEqual([name, build]);
      expect([name, tile.mortgage]).toEqual([name, mortgage]);
    }
  });

  it('prices every mortgage at half the purchase price', () => {
    for (const tile of BOARD) {
      if (tile.kind === 'street' || tile.kind === 'hub' || tile.kind === 'utility') {
        expect([tile.name, tile.mortgage]).toEqual([tile.name, tile.price / 2]);
      }
    }
  });

  it('prices hubs and utilities as the Readme does', () => {
    for (const i of HUB_INDEXES) {
      const tile = BOARD[i];
      expect(tile && 'price' in tile ? tile.price : 0).toBe(20_000);
    }
    for (const i of UTILITY_INDEXES) {
      const tile = BOARD[i];
      expect(tile && 'price' in tile ? tile.price : 0).toBe(15_000);
    }
  });
});
