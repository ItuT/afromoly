/**
 * The 40-tile board, transcribed from GAME-DESIGN.md.
 *
 * Every price, rent, build cost and mortgage value below is copied from the
 * "Street Title Deeds & Rent Progression" table. Where the Readme contradicts
 * itself the rulebook (section 4) wins; see PLAN.md section 1.
 */

import type { ColorGroup, Tile, StreetTile, HubTile, UtilityTile } from './types.js';

const street = (
  index: number,
  name: string,
  group: ColorGroup,
  price: number,
  rent: readonly [number, number, number, number, number, number],
  buildCost: number,
  mortgage: number,
): StreetTile => ({ index, kind: 'street', name, group, price, rent, buildCost, mortgage });

const hub = (index: number, name: string): HubTile => ({
  index,
  kind: 'hub',
  name,
  price: 20_000,
  mortgage: 10_000,
});

const utility = (index: number, name: string): UtilityTile => ({
  index,
  kind: 'utility',
  name,
  price: 15_000,
  mortgage: 7_500,
});

export const BOARD: readonly Tile[] = [
  { index: 0, kind: 'go', name: 'Month-End Payday' },
  street(1, 'Ferreirasdorp', 'brown', 6_000, [200, 1_000, 3_000, 9_000, 16_000, 25_000], 5_000, 3_000),
  { index: 2, kind: 'card', name: 'Kombi Hustle', deck: 'kombi' },
  street(3, 'Marshalltown', 'brown', 6_000, [400, 2_000, 6_000, 18_000, 32_000, 45_000], 5_000, 3_000),
  { index: 4, kind: 'tax', name: 'SARS Road Tax', amount: 20_000, allowPercent: true, toPot: false },
  hub(5, 'Bree Taxi Rank (Lilian Ngoyi)'),
  street(6, 'Diepkloof', 'lightblue', 10_000, [600, 3_000, 9_000, 27_000, 40_000, 55_000], 5_000, 5_000),
  { index: 7, kind: 'card', name: 'City Watch', deck: 'citywatch' },
  street(8, 'Orlando Towers', 'lightblue', 10_000, [600, 3_000, 9_000, 27_000, 40_000, 55_000], 5_000, 5_000),
  street(9, 'Vilakazi Street', 'lightblue', 12_000, [800, 4_000, 10_000, 30_000, 45_000, 60_000], 5_000, 6_000),
  { index: 10, kind: 'impound', name: 'JMPD Impound Lot' },
  street(11, 'Newtown Cultural Precinct', 'pink', 14_000, [1_000, 5_000, 15_000, 45_000, 62_500, 75_000], 10_000, 7_000),
  utility(12, 'City Power'),
  street(13, 'Braamfontein (Juta St)', 'pink', 14_000, [1_000, 5_000, 15_000, 45_000, 62_500, 75_000], 10_000, 7_000),
  street(14, 'Maboneng (Fox St)', 'pink', 16_000, [1_200, 6_000, 18_000, 50_000, 70_000, 90_000], 10_000, 8_000),
  hub(15, 'Park Station'),
  street(16, 'Yeoville (Rockey St)', 'orange', 18_000, [1_400, 7_000, 20_000, 55_000, 75_000, 95_000], 10_000, 9_000),
  { index: 17, kind: 'card', name: 'Kombi Hustle', deck: 'kombi' },
  street(18, 'Hillbrow', 'orange', 18_000, [1_400, 7_000, 20_000, 55_000, 75_000, 95_000], 10_000, 9_000),
  street(19, 'Jeppestown', 'orange', 20_000, [1_600, 8_000, 22_000, 60_000, 80_000, 100_000], 10_000, 10_000),
  { index: 20, kind: 'freerest', name: 'Taxi Rank Queue' },
  street(21, 'Melville (7th Street)', 'red', 22_000, [1_800, 9_000, 25_000, 70_000, 87_500, 105_000], 15_000, 11_000),
  { index: 22, kind: 'card', name: 'City Watch', deck: 'citywatch' },
  street(23, 'Parkhurst (4th Avenue)', 'red', 22_000, [1_800, 9_000, 25_000, 70_000, 87_500, 105_000], 15_000, 11_000),
  street(24, 'Rosebank (Oxford Rd)', 'red', 24_000, [2_000, 10_000, 30_000, 75_000, 92_500, 110_000], 15_000, 12_000),
  hub(25, 'Noord Taxi Rank (MTN Rank)'),
  street(26, 'Fourways (Winnie Mandela)', 'yellow', 26_000, [2_200, 11_000, 33_000, 80_000, 97_500, 115_000], 15_000, 13_000),
  street(27, 'Midrand (Allandale)', 'yellow', 26_000, [2_200, 11_000, 33_000, 80_000, 97_500, 115_000], 15_000, 13_000),
  utility(28, 'Joburg Water'),
  street(29, 'Waterfall City', 'yellow', 28_000, [2_400, 12_000, 36_000, 85_000, 102_500, 120_000], 15_000, 14_000),
  { index: 30, kind: 'gotoimpound', name: 'Go to Impound Lot' },
  street(31, 'Houghton Estate', 'green', 30_000, [2_600, 13_000, 39_000, 90_000, 110_000, 127_500], 20_000, 15_000),
  street(32, 'Saxonwold', 'green', 30_000, [2_600, 13_000, 39_000, 90_000, 110_000, 127_500], 20_000, 15_000),
  { index: 33, kind: 'card', name: 'Kombi Hustle', deck: 'kombi' },
  street(34, 'Hyde Park', 'green', 32_000, [2_800, 15_000, 45_000, 100_000, 120_000, 140_000], 20_000, 16_000),
  hub(35, 'Sandton Gautrain Station'),
  { index: 36, kind: 'card', name: 'City Watch', deck: 'citywatch' },
  street(37, 'Alice Lane', 'darkblue', 35_000, [3_500, 17_500, 50_000, 110_000, 130_000, 150_000], 20_000, 17_500),
  { index: 38, kind: 'tax', name: 'e-Toll / Gantry Clearance', amount: 10_000, allowPercent: false, toPot: true },
  street(39, 'Sandton CBD (Rivonia Rd)', 'darkblue', 40_000, [5_000, 20_000, 60_000, 140_000, 170_000, 200_000], 20_000, 20_000),
] as const;

export const BOARD_SIZE = BOARD.length;

export const GO = 0;
export const IMPOUND = 10;
export const FREE_REST = 20;
export const GO_TO_IMPOUND = 30;

export const GROUP_NAMES: Record<ColorGroup, string> = {
  brown: 'Old Mining Core',
  lightblue: 'Soweto Triangle',
  pink: 'Creative Corridors',
  orange: 'Inner East & Ridge',
  red: 'Vibrant Strips',
  yellow: 'Northern Sprawl',
  green: 'The Leafy Mansions',
  darkblue: 'Financial Capital',
};

/** Hub rent by number of hubs the owner holds, index 1 to 4. */
export const HUB_RENT: readonly number[] = [0, 2_500, 5_000, 10_000, 20_000];

/** Utility rent multipliers by number of utilities the owner holds (rulebook 4E). */
export const UTILITY_MULTIPLIER: readonly number[] = [0, 400, 1_000];

export const HUB_INDEXES: readonly number[] = [5, 15, 25, 35];
export const UTILITY_INDEXES: readonly number[] = [12, 28];

export function tileAt(index: TileIndexLike): Tile {
  const tile = BOARD[((index % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE];
  if (!tile) throw new Error(`No tile at index ${index}`);
  return tile;
}
type TileIndexLike = number;

export function isOwnable(tile: Tile): tile is StreetTile | HubTile | UtilityTile {
  return tile.kind === 'street' || tile.kind === 'hub' || tile.kind === 'utility';
}

export function streetsInGroup(group: ColorGroup): StreetTile[] {
  return BOARD.filter((t): t is StreetTile => t.kind === 'street' && t.group === group);
}

export const DEFAULT_OPTIONS = {
  jackpot: true,
  timedMinutes: null,
  startingCash: 150_000,
  paydaySalary: 20_000,
  impoundFine: 5_000,
  auctionFloor: 500,
  maxVans: 32,
  maxDepots: 12,
} as const;
