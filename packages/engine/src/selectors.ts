/** Derived values. Pure reads over GameState, no mutation. */

import {
  BOARD,
  BOARD_SIZE,
  HUB_INDEXES,
  HUB_RENT,
  UTILITY_INDEXES,
  UTILITY_MULTIPLIER,
  streetsInGroup,
  tileAt,
} from './board.js';
import type { ObservableState, Player, PlayerId, StreetTile, TileIndex, TileState } from './types.js';

export function playerById(state: ObservableState, id: PlayerId): Player | undefined {
  return state.players.find((p) => p.id === id);
}

export function requirePlayer(state: ObservableState, id: PlayerId): Player {
  const p = playerById(state, id);
  if (!p) throw new Error(`Unknown player ${id}`);
  return p;
}

export function currentPlayer(state: ObservableState): Player {
  const p = state.players[state.currentPlayerIndex];
  if (!p) throw new Error('No current player');
  return p;
}

export function tileState(state: ObservableState, index: TileIndex): TileState {
  const ts = state.tiles[index];
  if (!ts) throw new Error(`No tile state at ${index}`);
  return ts;
}

export function activePlayers(state: ObservableState): Player[] {
  return state.players.filter((p) => !p.bankrupt);
}

/** Tile indexes owned by a player, in board order. */
export function ownedTiles(state: ObservableState, id: PlayerId): TileIndex[] {
  const out: TileIndex[] = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (state.tiles[i]?.ownerId === id) out.push(i);
  }
  return out;
}

/** True when the player owns every street in the group. */
export function ownsWholeGroup(state: ObservableState, id: PlayerId, group: StreetTile['group']): boolean {
  const streets = streetsInGroup(group);
  return streets.every((s) => state.tiles[s.index]?.ownerId === id);
}

export function vansOwned(state: ObservableState): number {
  return state.tiles.reduce((n, t) => n + t.vans, 0);
}

export function depotsOwned(state: ObservableState): number {
  return state.tiles.reduce((n, t) => n + (t.depot ? 1 : 0), 0);
}

export function buildingsFor(state: ObservableState, id: PlayerId): { vans: number; depots: number } {
  let vans = 0;
  let depots = 0;
  for (const index of ownedTiles(state, id)) {
    const ts = tileState(state, index);
    vans += ts.vans;
    if (ts.depot) depots += 1;
  }
  return { vans, depots };
}

/**
 * Rent owed for landing on a tile.
 *
 * `roll` is the dice total that brought the tenant here, needed for utilities.
 * `forceDouble` covers City Watch 5, which charges double rent on Sandton CBD.
 */
export function rentFor(
  state: ObservableState,
  index: TileIndex,
  roll: number,
  forceDouble = false,
): { amount: number; doubled: boolean; waived: 'mortgaged' | 'utilitiesSuspended' | null } {
  const tile = tileAt(index);
  const ts = tileState(state, index);
  if (!ts.ownerId) return { amount: 0, doubled: false, waived: null };
  if (ts.mortgaged) return { amount: 0, doubled: false, waived: 'mortgaged' };

  if (tile.kind === 'street') {
    let amount: number;
    let doubled = false;
    if (ts.depot) {
      amount = tile.rent[5];
    } else if (ts.vans > 0) {
      amount = tile.rent[ts.vans] ?? tile.rent[0];
    } else if (ownsWholeGroup(state, ts.ownerId, tile.group)) {
      amount = tile.rent[0] * 2;
      doubled = true;
    } else {
      amount = tile.rent[0];
    }
    if (forceDouble) {
      amount *= 2;
      doubled = true;
    }
    return { amount, doubled, waived: null };
  }

  if (tile.kind === 'hub') {
    const owned = HUB_INDEXES.filter((i) => state.tiles[i]?.ownerId === ts.ownerId).length;
    let amount = HUB_RENT[owned] ?? 0;
    let doubled = false;
    if (forceDouble) {
      amount *= 2;
      doubled = true;
    }
    return { amount, doubled, waived: null };
  }

  // Utility
  if (state.utilitiesSuspendedUntilTurn !== null && state.turnNumber < state.utilitiesSuspendedUntilTurn) {
    return { amount: 0, doubled: false, waived: 'utilitiesSuspended' };
  }
  const owned = UTILITY_INDEXES.filter((i) => state.tiles[i]?.ownerId === ts.ownerId).length;
  const multiplier = UTILITY_MULTIPLIER[owned] ?? 0;
  let amount = multiplier * roll;
  let doubled = false;
  if (forceDouble) {
    amount *= 2;
    doubled = true;
  }
  return { amount, doubled, waived: null };
}

/**
 * Net worth as the rulebook defines it for the Rush-Hour variant and the
 * SARS Road Tax percentage option: cash, plus face value of unmortgaged
 * holdings, plus half value of mortgaged ones, plus the full purchase price of
 * every van and depot.
 */
export function netWorth(state: ObservableState, id: PlayerId): number {
  const player = requirePlayer(state, id);
  let total = player.cash;
  for (const index of ownedTiles(state, id)) {
    const tile = tileAt(index);
    const ts = tileState(state, index);
    if (tile.kind !== 'street' && tile.kind !== 'hub' && tile.kind !== 'utility') continue;
    total += ts.mortgaged ? tile.mortgage : tile.price;
    if (tile.kind === 'street') {
      total += ts.vans * tile.buildCost;
      if (ts.depot) total += tile.buildCost * 5;
    }
  }
  return total;
}

/**
 * Cash a player could raise right now by selling every building at half price
 * and mortgaging every unimproved holding, on top of the cash they hold.
 * Used to decide whether a debt is survivable.
 */
export function maxRaisable(state: ObservableState, id: PlayerId): number {
  const player = requirePlayer(state, id);
  let total = player.cash;
  for (const index of ownedTiles(state, id)) {
    const tile = tileAt(index);
    const ts = tileState(state, index);
    if (tile.kind === 'street') {
      total += ts.vans * Math.floor(tile.buildCost / 2);
      if (ts.depot) total += Math.floor((tile.buildCost * 5) / 2);
    }
    if (!ts.mortgaged && (tile.kind === 'street' || tile.kind === 'hub' || tile.kind === 'utility')) {
      total += tile.mortgage;
    }
  }
  return total;
}

/** Streets in the group ordered for the even-build rule. */
export function groupStreets(group: StreetTile['group']): StreetTile[] {
  return streetsInGroup(group);
}

/** Building level used by the even-build rule: 0-4 vans, 5 for a depot. */
export function buildLevel(ts: TileState): number {
  return ts.depot ? 5 : ts.vans;
}

export function boardTiles() {
  return BOARD;
}
