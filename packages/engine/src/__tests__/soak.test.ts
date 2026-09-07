import { describe, expect, it } from 'vitest';
import { createGame, reduce } from '../reduce.js';
import { legalActions } from '../legalActions.js';
import { depotsOwned, netWorth, ownedTiles, vansOwned } from '../selectors.js';
import { tileAt } from '../board.js';
import { SETUP, give, newGame } from './helpers.js';
import type { Action, ActionKind } from '../actions.js';
import type { GameState } from '../types.js';

/**
 * A fixed policy, so a playout depends only on the seed. While settling a debt
 * it liquidates before defaulting, which is the order the rulebook requires.
 */
function choose(state: GameState, actions: Action[]): Action | null {
  const by = (kind: ActionKind) => actions.find((a) => a.kind === kind);
  if (state.phase === 'debtSettlement') {
    return (
      by('settleDebt') ??
      by('sellBuilding') ??
      by('mortgage') ??
      by('declareBankruptcy') ??
      actions[0] ??
      null
    );
  }
  return (
    by('chooseTaxOption') ??
    by('buyProperty') ??
    by('declineAndAuction') ??
    by('passBid') ??
    by('declineTrade') ??
    by('payImpoundFine') ??
    by('useImpoundCard') ??
    by('rollDice') ??
    by('endTurn') ??
    actions[0] ??
    null
  );
}

function checkInvariants(state: GameState): void {
  expect(vansOwned(state)).toBeLessThanOrEqual(state.options.maxVans);
  expect(depotsOwned(state)).toBeLessThanOrEqual(state.options.maxDepots);
  expect(state.pot).toBeGreaterThanOrEqual(0);
  for (const player of state.players) {
    expect(player.cash).toBeGreaterThanOrEqual(0);
    expect(player.position).toBeGreaterThanOrEqual(0);
    expect(player.position).toBeLessThan(40);
    expect(player.impoundAttempts).toBeLessThanOrEqual(3);
  }
  state.tiles.forEach((tile, index) => {
    if (tile.ownerId !== null) {
      const owner = state.players.find((p) => p.id === tile.ownerId);
      expect(owner, `tile ${index} owned by a ghost`).toBeDefined();
      expect(owner?.bankrupt, `tile ${index} owned by a bankrupt operator`).toBe(false);
      expect(tileAt(index).kind).not.toBe('card');
    }
    expect(tile.vans).toBeLessThanOrEqual(4);
    if (tile.depot) expect(tile.vans).toBe(0);
  });
}

interface Playout {
  state: GameState;
  steps: number;
}

function playout(seed: string, playerCount: number, maxActions = 6_000): Playout {
  let state = createGame(SETUP.slice(0, playerCount), seed);
  let steps = 0;
  while (state.phase !== 'gameOver' && steps < maxActions) {
    let acted = false;
    for (const player of state.players) {
      if (player.bankrupt) continue;
      const pick = choose(state, legalActions(state, player.id));
      if (!pick) continue;
      const result = reduce(state, pick);
      if (result.events.some((e) => e.kind === 'illegalAction')) continue;
      state = result.state;
      steps += 1;
      acted = true;
      break;
    }
    if (!acted) break;
    checkInvariants(state);
  }
  return { state, steps };
}

describe('full-game soak', () => {
  it.each(['rank-one', 'noord-two', 'gillooly-three'])(
    'plays a clean three-hander from seed %s',
    (seed) => {
      const { state, steps } = playout(seed, 3);
      expect(steps).toBeGreaterThan(200);
      expect(state.revision).toBe(steps);
      const owned = state.tiles.filter((t) => t.ownerId).length;
      expect(owned).toBeGreaterThan(10);
      checkInvariants(state);
    },
  );

  it('seats six operators without breaking', () => {
    const six = [
      ...SETUP,
      { id: 'p4', name: 'Zanele', token: 'vest' as const },
      { id: 'p5', name: 'Kagiso', token: 'megaphone' as const },
      { id: 'p6', name: 'Lerato', token: 'sneaker' as const },
    ];
    let state = createGame(six, 'six-up');
    for (let i = 0; i < 1_500 && state.phase !== 'gameOver'; i++) {
      const player = state.players.find((p) => !p.bankrupt && choose(state, legalActions(state, p.id)));
      if (!player) break;
      const pick = choose(state, legalActions(state, player.id));
      if (!pick) break;
      state = reduce(state, pick).state;
    }
    checkInvariants(state);
    expect(state.players).toHaveLength(6);
  });
});

describe('determinism', () => {
  it('replays identically from the same seed', () => {
    const a = playout('same-seed', 3, 900);
    const b = playout('same-seed', 3, 900);
    expect(a.steps).toBe(b.steps);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });

  it('diverges on a different seed', () => {
    const a = playout('seed-alpha', 3, 400);
    const b = playout('seed-beta', 3, 400);
    expect(JSON.stringify(a.state)).not.toBe(JSON.stringify(b.state));
  });

  it('rejects a game with too few or too many operators', () => {
    expect(() => createGame(SETUP.slice(0, 1), 'x')).toThrow();
    expect(() =>
      createGame(
        [...SETUP, ...SETUP.map((p) => ({ ...p, id: `${p.id}b` }))].slice(0, 7),
        'x',
      ),
    ).toThrow();
  });

  it('rejects two operators sharing a token', () => {
    expect(() =>
      createGame(
        [
          { id: 'a', name: 'A', token: 'quantum' },
          { id: 'b', name: 'B', token: 'quantum' },
        ],
        'x',
      ),
    ).toThrow();
  });
});

describe('net worth', () => {
  it('counts cash, deeds at face value and every building at cost', () => {
    let state = give(newGame(), 39, 'p1', { vans: 3 });
    state = give(state, 37, 'p1', { mortgaged: true });
    // R150,000 cash + R40,000 deed + 3 vans at R20,000 + R17,500 mortgaged value.
    expect(netWorth(state, 'p1')).toBe(150_000 + 40_000 + 60_000 + 17_500);
    expect(ownedTiles(state, 'p1')).toEqual([37, 39]);
  });

  it('counts a depot as five build units', () => {
    const state = give(newGame(), 39, 'p1', { depot: true });
    expect(netWorth(state, 'p1')).toBe(150_000 + 40_000 + 100_000);
  });
});
