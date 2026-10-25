/**
 * What survives a refresh.
 *
 * An online seat is a game id, a player id and the secret that proves the seat
 * is ours; with those the socket can resubscribe. A hot-seat game is the whole
 * engine state plus the narrated log, since the engine is pure and needs
 * nothing else to carry on.
 *
 * Everything here tolerates a missing or blocked localStorage, because the
 * page must still work in a private window.
 */

import type { GameState, PlayerSetup } from '@afromoly/engine';
import type { Seat } from './api';
import type { HotSeatSnapshot } from './useGame';

const SEAT_KEY = 'afromoly.seat';
const HOTSEAT_KEY = 'afromoly.hotseat';

export interface HotSeatSave {
  seats: PlayerSetup[];
  seed: string;
  jackpot: boolean;
  snapshot: HotSeatSnapshot;
  savedAt: number;
}

function read<T>(key: string, valid: (value: unknown) => value is T): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the game still plays, it just will not resume.
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do.
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function isSeat(value: unknown): value is Seat {
  return (
    isRecord(value) &&
    typeof value.gameId === 'string' &&
    typeof value.code === 'string' &&
    typeof value.playerId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.secret === 'string' &&
    typeof value.wsUrl === 'string'
  );
}

function isHotSeatSave(value: unknown): value is HotSeatSave {
  if (!isRecord(value) || !Array.isArray(value.seats) || typeof value.seed !== 'string') return false;
  const snapshot = value.snapshot;
  if (!isRecord(snapshot) || !isRecord(snapshot.state) || !Array.isArray(snapshot.log)) return false;
  const state = snapshot.state as Partial<GameState>;
  return Array.isArray(state.players) && typeof state.phase === 'string' && Array.isArray(state.tiles);
}

export const saveSeat = (seat: Seat): void => write(SEAT_KEY, seat);
export const loadSeat = (): Seat | null => read(SEAT_KEY, isSeat);
export const clearSeat = (): void => remove(SEAT_KEY);

export const saveHotSeat = (save: Omit<HotSeatSave, 'savedAt'>): void =>
  write(HOTSEAT_KEY, { ...save, savedAt: Date.now() });
export const loadHotSeat = (): HotSeatSave | null => read(HOTSEAT_KEY, isHotSeatSave);
export const clearHotSeat = (): void => remove(HOTSEAT_KEY);
