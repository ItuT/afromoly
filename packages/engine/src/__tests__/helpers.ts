import { createGame, reduce } from '../reduce.js';
import { nextInt, type RngState } from '../rng.js';
import type { Action } from '../actions.js';
import type { GameEvent } from '../events.js';
import type { GameState, PlayerSetup, TileIndex } from '../types.js';

export const SETUP: PlayerSetup[] = [
  { id: 'p1', name: 'Thabo', token: 'quantum' },
  { id: 'p2', name: 'Naledi', token: 'coin' },
  { id: 'p3', name: 'Sipho', token: 'robot' },
];

export function newGame(count = 2, options = {}): GameState {
  return createGame(SETUP.slice(0, count), 'test-seed', options);
}

const rngCache = new Map<string, RngState>();

/** Find a generator state that produces exactly this pair of dice next. */
export function rngFor(d1: number, d2: number): RngState {
  const key = `${d1}-${d2}`;
  const hit = rngCache.get(key);
  if (hit) return hit;
  for (let s = 1; s < 5_000_000; s++) {
    const a = nextInt({ s }, 1, 6);
    if (a.value !== d1) continue;
    const b = nextInt(a.state, 1, 6);
    if (b.value === d2) {
      const found = { s };
      rngCache.set(key, found);
      return found;
    }
  }
  throw new Error(`No generator state yields ${d1},${d2}`);
}

/** Queue a specific roll for the next rollDice call. */
export function withRoll(state: GameState, d1: number, d2: number): GameState {
  return { ...state, rng: rngFor(d1, d2) };
}

export function apply(state: GameState, action: Action): GameState {
  return reduce(state, action).state;
}

export function run(state: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  return reduce(state, action);
}

export function events(state: GameState, action: Action): GameEvent[] {
  return reduce(state, action).events;
}

export function eventsOf<K extends GameEvent['kind']>(
  list: GameEvent[],
  kind: K,
): Extract<GameEvent, { kind: K }>[] {
  return list.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);
}

/** Hand a tile to a player, optionally developed or mortgaged. */
export function give(
  state: GameState,
  index: TileIndex,
  playerId: string,
  opts: { vans?: number; depot?: boolean; mortgaged?: boolean } = {},
): GameState {
  const next = structuredClone(state);
  const ts = next.tiles[index];
  if (!ts) throw new Error(`no tile ${index}`);
  ts.ownerId = playerId;
  ts.vans = opts.vans ?? 0;
  ts.depot = opts.depot ?? false;
  ts.mortgaged = opts.mortgaged ?? false;
  return next;
}

export function setCash(state: GameState, playerId: string, cash: number): GameState {
  const next = structuredClone(state);
  const p = next.players.find((x) => x.id === playerId);
  if (!p) throw new Error(`no player ${playerId}`);
  p.cash = cash;
  return next;
}

export function setPosition(state: GameState, playerId: string, position: number): GameState {
  const next = structuredClone(state);
  const p = next.players.find((x) => x.id === playerId);
  if (!p) throw new Error(`no player ${playerId}`);
  p.position = position;
  return next;
}

export function cashOf(state: GameState, playerId: string): number {
  return state.players.find((p) => p.id === playerId)?.cash ?? 0;
}

export function playerOf(state: GameState, playerId: string) {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) throw new Error(`no player ${playerId}`);
  return p;
}

/**
 * Put a player in the impound bay at the start of their own turn, which is the
 * point at which the three exit routes become available.
 */
export function detain(state: GameState, playerId: string): GameState {
  const next = structuredClone(state);
  const index = next.players.findIndex((p) => p.id === playerId);
  const player = next.players[index];
  if (!player) throw new Error(`no player ${playerId}`);
  player.position = 10;
  player.inImpound = true;
  player.impoundAttempts = 0;
  next.currentPlayerIndex = index;
  next.phase = 'awaitingRoll';
  next.turnResumePhase = 'awaitingEndTurn';
  next.doublesCount = 0;
  return next;
}

/** Hand the turn back to a player without simulating everyone else's moves. */
export function giveTurn(state: GameState, playerId: string): GameState {
  const next = structuredClone(state);
  const index = next.players.findIndex((p) => p.id === playerId);
  if (index === -1) throw new Error(`no player ${playerId}`);
  next.currentPlayerIndex = index;
  next.phase = 'awaitingRoll';
  next.turnResumePhase = 'awaitingEndTurn';
  next.doublesCount = 0;
  next.turnNumber += 1;
  return next;
}

/**
 * Stack a named card on top of its deck and land the player on the matching
 * card space, so the card resolves through the real reducer.
 */
export function landOnCard(
  state: GameState,
  playerId: string,
  deck: 'kombi' | 'citywatch',
  cardId: number,
) {
  const target = deck === 'kombi' ? 17 : 22;
  const next = structuredClone(state);
  const index = next.players.findIndex((p) => p.id === playerId);
  const player = next.players[index];
  if (!player) throw new Error(`no player ${playerId}`);
  next.currentPlayerIndex = index;
  next.phase = 'awaitingRoll';
  next.turnResumePhase = 'awaitingEndTurn';
  next.doublesCount = 0;
  player.position = target - 5;
  next.decks[deck].order = [cardId, ...next.decks[deck].order.filter((id) => id !== cardId)];
  return run(withRoll(next, 2, 3), { kind: 'rollDice', playerId });
}
